/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs';
import net from 'net';
import path from 'path';

import * as playwright from 'playwright';
// @ts-ignore
import { registryDirectory } from 'playwright-core/lib/server/registry/index';
// @ts-ignore
import { startTraceViewerServer } from 'playwright-core/lib/server';
import { logUnhandledError, testDebug } from './utils/log.js';
import { createHash } from './utils/guid.js';
import { outputFile  } from './config.js';

import type { FullConfig } from './config.js';

export function contextFactory(config: FullConfig): BrowserContextFactory {
  if (config.browser.remoteEndpoint)
    return new RemoteContextFactory(config);
  if (config.browser.cdpEndpoint)
    return new CdpContextFactory(config);
  if (config.browser.isolated)
    return new IsolatedContextFactory(config);
  return new PersistentContextFactory(config);
}

export type ClientInfo = { name?: string, version?: string, rootPath?: string };

export interface BrowserContextFactory {
  createContext(clientInfo: ClientInfo, abortSignal: AbortSignal): Promise<{ browserContext: playwright.BrowserContext, close: () => Promise<void> }>;
}

class BaseContextFactory implements BrowserContextFactory {
  readonly config: FullConfig;
  private _logName: string;
  protected _browserPromise: Promise<playwright.Browser> | undefined;

  constructor(name: string, config: FullConfig) {
    this._logName = name;
    this.config = config;
  }

  protected async _obtainBrowser(clientInfo: ClientInfo): Promise<playwright.Browser> {
    if (this._browserPromise)
      return this._browserPromise;
    testDebug(`obtain browser (${this._logName})`);
    this._browserPromise = this._doObtainBrowser(clientInfo);
    void this._browserPromise.then(browser => {
      browser.on('disconnected', () => {
        this._browserPromise = undefined;
      });
    }).catch(() => {
      this._browserPromise = undefined;
    });
    return this._browserPromise;
  }

  protected async _doObtainBrowser(clientInfo: ClientInfo): Promise<playwright.Browser> {
    throw new Error('Not implemented');
  }

  async createContext(clientInfo: ClientInfo): Promise<{ browserContext: playwright.BrowserContext, close: () => Promise<void> }> {
    testDebug(`create browser context (${this._logName})`);
    const browser = await this._obtainBrowser(clientInfo);
    const browserContext = await this._doCreateContext(browser);
    return { browserContext, close: () => this._closeBrowserContext(browserContext, browser) };
  }

  protected async _doCreateContext(browser: playwright.Browser): Promise<playwright.BrowserContext> {
    throw new Error('Not implemented');
  }

  private async _closeBrowserContext(browserContext: playwright.BrowserContext, browser: playwright.Browser) {
    testDebug(`close browser context (${this._logName})`);
    if (browser.contexts().length === 1)
      this._browserPromise = undefined;
    await browserContext.close().catch(logUnhandledError);
    if (browser.contexts().length === 0) {
      testDebug(`close browser (${this._logName})`);
      await browser.close().catch(logUnhandledError);
    }
  }
}

class IsolatedContextFactory extends BaseContextFactory {
  constructor(config: FullConfig) {
    super('isolated', config);
  }

  protected override async _doObtainBrowser(clientInfo: ClientInfo): Promise<playwright.Browser> {
    await injectCdpPort(this.config.browser);
    const browserType = playwright[this.config.browser.browserName];
    return browserType.launch({
      tracesDir: await startTraceServer(this.config, clientInfo.rootPath),
      ...this.config.browser.launchOptions,
      handleSIGINT: false,
      handleSIGTERM: false,
    }).catch(error => {
      if (error.message.includes('Executable doesn\'t exist'))
        throw new Error(`Browser specified in your config is not installed. Either install it (likely) or change the config.`);
      throw error;
    });
  }

  protected override async _doCreateContext(browser: playwright.Browser): Promise<playwright.BrowserContext> {
    return browser.newContext(this.config.browser.contextOptions);
  }
}

class CdpContextFactory extends BaseContextFactory {
  constructor(config: FullConfig) {
    super('cdp', config);
  }

  protected override async _doObtainBrowser(): Promise<playwright.Browser> {
    return playwright.chromium.connectOverCDP(this.config.browser.cdpEndpoint!);
  }

  protected override async _doCreateContext(browser: playwright.Browser): Promise<playwright.BrowserContext> {
    return this.config.browser.isolated ? await browser.newContext() : browser.contexts()[0];
  }
}

class RemoteContextFactory extends BaseContextFactory {
  constructor(config: FullConfig) {
    super('remote', config);
  }

  protected override async _doObtainBrowser(): Promise<playwright.Browser> {
    const url = new URL(this.config.browser.remoteEndpoint!);
    url.searchParams.set('browser', this.config.browser.browserName);
    if (this.config.browser.launchOptions)
      url.searchParams.set('launch-options', JSON.stringify(this.config.browser.launchOptions));
    return playwright[this.config.browser.browserName].connect(String(url));
  }

  protected override async _doCreateContext(browser: playwright.Browser): Promise<playwright.BrowserContext> {
    return browser.newContext();
  }
}

class PersistentContextFactory implements BrowserContextFactory {
  readonly config: FullConfig;
  readonly name = 'persistent';
  readonly description = 'Create a new persistent browser context';

  private _userDataDirs = new Set<string>();
  private _browserInstance: playwright.BrowserContext | undefined;
  private _userDataDir: string | undefined;
  private _createContextPromise: Promise<{ browserContext: playwright.BrowserContext, close: () => Promise<void> }> | undefined;

  constructor(config: FullConfig) {
    this.config = config;
  }

  async createContext(clientInfo: ClientInfo): Promise<{ browserContext: playwright.BrowserContext, close: () => Promise<void> }> {
    // 防止并发创建
    if (this._createContextPromise) {
      testDebug('reusing pending browser context creation (persistent)');
      return this._createContextPromise;
    }

    // 如果已有浏览器实例且未关闭，直接返回
    if (this._browserInstance && await this._isBrowserContextValid(this._browserInstance)) {
      testDebug('reusing existing browser context (persistent)');
      return {
        browserContext: this._browserInstance,
        close: () => this._softCloseBrowserContext()
      };
    }

    // 创建新的浏览器实例
    this._createContextPromise = this._doCreateContext(clientInfo);

    try {
      const result = await this._createContextPromise;
      return result;
    } finally {
      this._createContextPromise = undefined;
    }
  }

  private async _doCreateContext(clientInfo: ClientInfo): Promise<{ browserContext: playwright.BrowserContext, close: () => Promise<void> }> {
    await injectCdpPort(this.config.browser);
    testDebug('create new browser context (persistent)');

    const userDataDir = this.config.browser.userDataDir ?? await this._createUserDataDir(clientInfo.rootPath);
    const tracesDir = await startTraceServer(this.config, clientInfo.rootPath);
    this._userDataDir = userDataDir;

    this._userDataDirs.add(userDataDir);
    testDebug('lock user data dir', userDataDir);

    const browserType = playwright[this.config.browser.browserName];

    // 如果检测到目录已被占用，尝试等待和重试
    for (let i = 0; i < 3; i++) {
      try {
        this._browserInstance = await browserType.launchPersistentContext(userDataDir, {
          tracesDir,
          ...this.config.browser.launchOptions,
          ...this.config.browser.contextOptions,
          handleSIGINT: false,
          handleSIGTERM: false,
        });

        // 设置关闭监听器
        this._setupBrowserEventListeners(this._browserInstance);

        const close = () => this._hardCloseBrowserContext();
        return { browserContext: this._browserInstance, close };

      } catch (error: any) {
        if (error.message.includes('Executable doesn\'t exist'))
          throw new Error(`Browser specified in your config is not installed. Either install it (likely) or change the config.`);

        if (error.message.includes('ProcessSingleton') || error.message.includes('Invalid URL')) {
          if (i < 2) {
            testDebug(`Browser directory in use, attempt ${i + 1}/3, waiting...`);
            await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
            continue;
          } else {
            throw new Error(`Browser is already running with the same profile. Please close the existing browser instance or wait for it to fully shut down.`);
          }
        }
        throw error;
      }
    }

    throw new Error(`Failed to create browser context after 3 attempts`);
  }

  private async _isBrowserContextValid(browserContext: playwright.BrowserContext): Promise<boolean> {
    try {
      // 检查浏览器上下文是否仍然有效
      if (browserContext.pages().length === 0) {
        return true; // 空上下文是有效的
      }

      // 尝试获取第一个页面的标题来测试连接
      const pages = browserContext.pages();
      if (pages.length > 0) {
        await Promise.race([
          pages[0].title(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000))
        ]);
      }

      return true;
    } catch (error) {
      testDebug('Browser context validation failed:', error);
      return false;
    }
  }

  private _setupBrowserEventListeners(browserContext: playwright.BrowserContext) {
    // 监听浏览器关闭事件
    browserContext.on('close', () => {
      testDebug('browser context closed event fired');
      this._browserInstance = undefined;
      if (this._userDataDir) {
        this._userDataDirs.delete(this._userDataDir);
        this._userDataDir = undefined;
      }
    });

    // 监听页面创建和关闭，用于调试
    browserContext.on('page', (page) => {
      testDebug('new page created in persistent context');
      page.on('close', () => {
        testDebug('page closed in persistent context');
      });
    });
  }

  private async _softCloseBrowserContext(): Promise<void> {
    // 软关闭：不实际关闭浏览器，保持登录状态
    testDebug('soft close browser context (persistent) - keeping browser alive');
    // 不做任何操作，让浏览器继续运行
  }

  private async _hardCloseBrowserContext(): Promise<void> {
    // 硬关闭：完全关闭浏览器
    testDebug('hard close browser context (persistent)');

    if (this._browserInstance && !this._browserInstance.pages().every(p => p.isClosed())) {
      try {
        await this._browserInstance.close();
      } catch (error) {
        testDebug('Error closing browser context:', error);
      }
    }

    this._browserInstance = undefined;

    if (this._userDataDir) {
      this._userDataDirs.delete(this._userDataDir);
      this._userDataDir = undefined;
    }

    testDebug('hard close browser context complete (persistent)');
  }

  // 保留旧方法以兼容
  private async _closeBrowserContext(browserContext: playwright.BrowserContext, userDataDir: string) {
    testDebug('close browser context (persistent)');
    testDebug('release user data dir', userDataDir);
    await browserContext.close().catch(() => {});
    this._userDataDirs.delete(userDataDir);
    testDebug('close browser context complete (persistent)');
  }

  private async _createUserDataDir(rootPath: string | undefined) {
    const dir = process.env.PWMCP_PROFILES_DIR_FOR_TEST ?? registryDirectory;
    const browserToken = this.config.browser.launchOptions?.channel ?? this.config.browser?.browserName;
    // Hesitant putting hundreds of files into the user's workspace, so using it for hashing instead.
    const rootPathToken = rootPath ? `-${createHash(rootPath)}` : '';
    const result = path.join(dir, `mcp-${browserToken}${rootPathToken}`);
    await fs.promises.mkdir(result, { recursive: true });
    return result;
  }

  // 公共方法：强制重置浏览器实例
  async resetBrowserInstance(): Promise<void> {
    testDebug('forcing browser instance reset');
    await this._hardCloseBrowserContext();
    this._createContextPromise = undefined;
  }

  // 公共方法：检查浏览器状态
  getBrowserStatus(): { hasInstance: boolean, userDataDir?: string, isValid?: boolean } {
    return {
      hasInstance: !!this._browserInstance,
      userDataDir: this._userDataDir,
      isValid: this._browserInstance ? !this._browserInstance.pages().every(p => p.isClosed()) : undefined
    };
  }
}

async function injectCdpPort(browserConfig: FullConfig['browser']) {
  if (browserConfig.browserName === 'chromium')
    (browserConfig.launchOptions as any).cdpPort = await findFreePort();
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function startTraceServer(config: FullConfig, rootPath: string | undefined): Promise<string | undefined> {
  if (!config.saveTrace)
    return undefined;

  const tracesDir = await outputFile(config, rootPath, `traces-${Date.now()}`);
  const server = await startTraceViewerServer();
  const urlPrefix = server.urlPrefix('human-readable');
  const url = urlPrefix + '/trace/index.html?trace=' + tracesDir + '/trace.json';
  // eslint-disable-next-line no-console
  console.error('\nTrace viewer listening on ' + url);
  return tracesDir;
}
