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
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from './fixtures.js';

test.describe('API Session Report Tool Tests', () => {
  // Skip these API tests on all browsers except Chrome and API config
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name !== 'chrome' && testInfo.project.name !== 'api')
      test.skip(true, 'API tests should only run on Chrome and API projects');
  });

  test('handles session not found for non-existent session', async ({ startClient }) => {
    const { client } = await startClient({
      config: {
        capabilities: ['api_session_report']
      }
    });

    const result = await client.callTool({
      name: 'api_session_report',
      arguments: {
        sessionId: 'non-existent-session-id'
      }
    });

    expect((result as any).content[0].text).toBe(
        'Session not found: non-existent-session-id'
    );
  });

  test('generates HTML report for session with single request', async ({ startClient, server }) => {
    // Set up mock endpoint
    server.setContent('/api/test', JSON.stringify({
      message: 'Hello World',
      status: 'success'
    }), 'application/json');

    const { client } = await startClient({
      config: {
        capabilities: ['api_request', 'api_session_report']
      }
    });

    const sessionId = 'test-session-single';

    // First create a session by making an API request
    await client.callTool({
      name: 'api_request',
      arguments: {
        sessionId,
        request: {
          method: 'GET',
          url: `${server.PREFIX}api/test`,
          headers: { 'Content-Type': 'application/json' }
        },
        validation: {
          statusCode: 200,
          contentType: 'application/json'
        }
      }
    });

    // Now generate the report
    const result = await client.callTool({
      name: 'api_session_report',
      arguments: {
        sessionId
      }
    });

    const resultText = (result as any).content[0].text;
    expect(resultText).toContain('HTML report generated:');
    expect(resultText).toContain(`session-${sessionId}.html`);

    // Verify the HTML file was created
    const reportsDir = path.resolve(process.cwd(), 'reports');
    const reportPath = path.join(reportsDir, `session-${sessionId}.html`);
    const htmlContent = await fs.readFile(reportPath, 'utf8');
    
    expect(htmlContent).toContain(`API Test Session Report: ${sessionId}`);
    expect(htmlContent).toContain(`<b>Session ID:</b> ${sessionId}`);
    expect(htmlContent).toContain('<b>Status:</b> running');
    expect(htmlContent).toContain('<b>Log Entries:</b> 0');

    // Cleanup
    await fs.unlink(reportPath).catch(() => {});
  });

  test('validates tool schema and configuration', async ({ startClient }) => {
    const { client } = await startClient({
      config: {
        capabilities: ['api_session_report']
      }
    });

    // Test that the tool is properly registered
    const tools = await client.listTools();
    const reportTool = tools.tools.find(tool => tool.name === 'api_session_report');
    
    expect(reportTool).toBeDefined();
    expect(reportTool?.name).toBe('api_session_report');
    expect(reportTool?.description).toContain('Generate and retrieve an HTML report');
    expect(reportTool?.inputSchema?.properties?.sessionId).toBeDefined();
  });
});
