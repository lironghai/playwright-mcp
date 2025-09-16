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
import { z } from 'zod';
import { defineTool } from './tool.js';

// Input schema for the API request tool
const chainStepSchema = z.object({
  name: z.string(),
  method: z.string().optional().default('GET'),
  url: z.string(),
  headers: z.record(z.string()).optional(),
  data: z.any().optional(),
  expect: z.object({
    status: z.number().optional(),
    contentType: z.string().optional(),
    body: z.any().optional(),
    bodyRegex: z.string().optional()
  }).optional(),
  extract: z.record(z.string()).optional() // { varName: 'field' }
});

const apiRequestInputSchema = z.object({
  sessionId: z.string().optional(), // New: session management
  // Single-request legacy mode
  method: z.string().optional().default('GET'),
  url: z.string().optional(),
  headers: z.record(z.string()).optional(),
  data: z.any().optional(),
  expect: z.object({
    status: z.number().optional(),
    contentType: z.string().optional(),
    body: z.any().optional(),
    bodyRegex: z.string().optional()
  }).optional(),
  // Chaining mode
  chain: z.array(chainStepSchema).optional()
});

// --- In-memory session store ---
const sessionStore: Map<string, any> = (globalThis as any).__API_SESSION_STORE__ || new Map();
(globalThis as any).__API_SESSION_STORE__ = sessionStore;

const apiRequestTool = defineTool({
  capability: 'api_request',
  schema: {
    name: 'api_request',
    title: 'API Request',
    description: 'Perform an HTTP API request and validate the response.',
    inputSchema: apiRequestInputSchema,
    type: 'readOnly'
  },
  async handle(ctx: any, input: any, response: any) {
    // --- Session Management ---
    const uuid = () => {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        return crypto.randomUUID();
      // Simple pseudo-unique fallback: not cryptographically secure, but fine for session IDs
      return 'session-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    };
    const sessionId = input.sessionId || uuid();
    if (!sessionStore.has(sessionId)) {
      sessionStore.set(sessionId, {
        sessionId,
        startTime: new Date().toISOString(),
        logs: [],
        status: 'running'
      });
    }
    const session = sessionStore.get(sessionId);
    // --- API CHAINING SUPPORT ---
    function renderTemplate(str: string, vars: Record<string, any>) {
      return str.replace(/{{\s*([\w.]+)\s*}}/g, (_, path) => {
        const [step, ...rest] = path.split('.');
        let val = vars[step];
        for (const p of rest)
          val = val?.[p];
        return val !== undefined ? String(val) : '';
      });
    }
    function extractFields(obj: any, extract: Record<string, string>) {
      const result: Record<string, any> = {};
      for (const [k, path] of Object.entries(extract || {})) {
        const parts = path.split('.');
        let val = obj;
        for (const p of parts)
          val = val?.[p];
        result[k] = val;
      }
      return result;
    }
    // If 'chain' is present, execute steps sequentially
    if (Array.isArray(input.chain)) {
      const { request } = await import('playwright');
      const context = await request.newContext();
      const stepVars: Record<string, any> = {};
      const results: any[] = [];
      for (const step of input.chain) {
        // Render templates in url, headers, data
        const url = renderTemplate(step.url, stepVars);
        const headers: Record<string, string> = {};
        for (const k in (step.headers || {}))
          headers[k] = renderTemplate(step.headers[k], stepVars);
        let data = step.data;
        if (typeof data === 'string')
          data = renderTemplate(data, stepVars);
        // Execute request
        const stepResponse = await context.fetch(url, {
          method: step.method || 'GET',
          headers,
          data
        });

        const status = stepResponse.status();
        const statusText = stepResponse.statusText();
        const contentType = stepResponse.headers()['content-type'] || '';
        let responseBody;
        if (contentType.includes('application/json'))
          responseBody = await stepResponse.json();
        else
          responseBody = await stepResponse.text();
        // Validation
        const expect = step.expect || {};
        const validation = {
          status: expect.status ? status === expect.status : true,
          contentType: expect.contentType ? contentType.includes(expect.contentType) : true
        };
        let bodyValidation = { matched: true, reason: 'No body expectation set.' };
        if (expect.body !== undefined) {
          if (typeof responseBody === 'object' && responseBody !== null && typeof expect.body === 'object') {
            bodyValidation.matched = Object.entries(expect.body).every(
                ([k, v]) => JSON.stringify(responseBody[k]) === JSON.stringify(v)
            );
            bodyValidation.reason = bodyValidation.matched
              ? 'Partial/exact body match succeeded.'
              : 'Partial/exact body match failed.';
          } else if (typeof expect.body === 'string') {
            bodyValidation.matched = JSON.stringify(responseBody) === expect.body || responseBody === expect.body;
            bodyValidation.reason = bodyValidation.matched
              ? 'Exact string match succeeded.'
              : 'Exact string match failed.';
          } else {
            bodyValidation.matched = false;
            bodyValidation.reason = 'Body type mismatch.';
          }
        }
        if (expect.bodyRegex) {
          const pattern = new RegExp(expect.bodyRegex);
          const target = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody);
          const regexMatch = pattern.test(target);
          bodyValidation = {
            matched: regexMatch,
            reason: regexMatch ? 'Regex match succeeded.' : 'Regex match failed.'
          };
        }
        // Extract variables
        const extracted = step.extract ? extractFields(responseBody, step.extract) : {};
        // Add extracted variables directly to stepVars for template rendering
        Object.assign(stepVars, extracted);
        // Also store step results for reference
        stepVars[step.name] = { ...extracted, body: responseBody, status, statusText, contentType };
        // Record step result
        results.push({
          name: step.name,
          status,
          statusText,
          contentType,
          body: responseBody,
          validation,
          bodyValidation,
          extracted
        });
        // Log to session
        session.logs.push({
          type: 'request',
          request: {
            method: step.method || 'GET',
            url,
            headers,
            data
          },
          response: {
            status,
            statusText,
            contentType,
            body: responseBody
          },
          expectations: expect, // Store the expectations
          validation,
          bodyValidation,
          timestamp: new Date().toISOString()
        });
      }
      await context.dispose();
      // Log to session
      session.logs.push({
        type: 'chain',
        steps: results,
        timestamp: new Date().toISOString()
      });
      session.status = 'completed';
      response.resultOverride = {
        content: [{
          type: 'text',
          text: JSON.stringify({ sessionId, results }, null, 2)
        }]
      };
      response.code = [];
      response.captureSnapshot = false;
      response.waitForNetwork = false;
      return;
    }
    // --- SINGLE REQUEST MODE (legacy) ---
    const { method, url, headers, data, expect } = input;

    // Validate required parameters for single request mode
    if (!url)
      throw new Error('URL is required for single request mode');

    const { request } = await import('playwright');
    const context = await request.newContext();
    const fetchResponse = await context.fetch(url, {
      method: method || 'GET',
      headers,
      data
    });

    const status = fetchResponse.status();
    const statusText = fetchResponse.statusText();
    const contentType = fetchResponse.headers()['content-type'] || '';
    let responseBody;
    if (contentType.includes('application/json'))
      responseBody = await fetchResponse.json();
    else
      responseBody = await fetchResponse.text();

    // Basic validation
    const validation = {
      status: expect?.status ? status === expect.status : true,
      contentType: expect?.contentType ? contentType.includes(expect?.contentType) : true
    };

    // --- Enhanced Response Body Validation ---
    let bodyValidation = { matched: true, reason: 'No body expectation set.' };
    if (expect?.body !== undefined) {
      if (typeof responseBody === 'object' && responseBody !== null && typeof expect.body === 'object') {
        // Partial match: all keys/values in expect.body must be present in responseBody
        bodyValidation.matched = Object.entries(expect.body).every(
            ([k, v]) => JSON.stringify(responseBody[k]) === JSON.stringify(v)
        );
        bodyValidation.reason = bodyValidation.matched
          ? 'Partial/exact body match succeeded.'
          : 'Partial/exact body match failed.';
      } else if (typeof expect.body === 'string') {
        bodyValidation.matched = JSON.stringify(responseBody) === expect.body || responseBody === expect.body;
        bodyValidation.reason = bodyValidation.matched
          ? 'Exact string match succeeded.'
          : 'Exact string match failed.';
      } else {
        bodyValidation.matched = false;
        bodyValidation.reason = 'Body type mismatch.';
      }
    }
    if (expect?.bodyRegex) {
      const pattern = new RegExp(expect.bodyRegex);
      const target = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody);
      const regexMatch = pattern.test(target);
      bodyValidation = {
        matched: regexMatch,
        reason: regexMatch ? 'Regex match succeeded.' : 'Regex match failed.'
      };
    }
    // --- End Enhanced Validation ---

    // Log to session
    if (session && session.logs) {
      session.logs.push({
        type: 'single',
        request: {
          method: method || 'GET',
          url,
          headers,
          data
        },
        response: {
          status,
          statusText,
          contentType,
          body: responseBody
        },
        expectations: expect, // Store the expectations
        validation,
        bodyValidation,
        timestamp: new Date().toISOString()
      });
    }

    await context.dispose();
    response.resultOverride = {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: validation.status && validation.contentType && bodyValidation.matched,
          status,
          statusText,
          contentType,
          body: responseBody,
          validation,
          bodyValidation
        }, null, 2)
      }]
    };
    response.code = [];
    response.captureSnapshot = false;
    response.waitForNetwork = false;
    return;
  }
});
export default [
  apiRequestTool
];
