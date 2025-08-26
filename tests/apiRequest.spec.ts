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

import { test, expect } from './fixtures.js';

test.describe('API Request Tool - Working Tests', () => {
// Skip these API tests on all browsers except API config as these are API tests
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name !== 'api')
      test.skip(true, 'API tests should only run on API config');
  });
  test('single API request with validation', async ({ startClient, server }) => {
    const { client } = await startClient({
      config: {
        capabilities: ['api_request']
      }
    });

    // Set up mock endpoint
    server.setContent('/api/test', JSON.stringify({
      message: 'Hello World',
      status: 'success'
    }), 'application/json');

    const result = await client.callTool({
      name: 'api_request',
      arguments: {
        method: 'GET',
        url: `${server.PREFIX}api/test`,
        expect: {
          status: 200,
          contentType: 'application/json'
        }
      }
    });

    const response = JSON.parse((result as any).content[0].text);
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.validation.status).toBe(true);
    expect(response.body.message).toBe('Hello World');
  });

  test('API request chain with variable passing', async ({ startClient, server }) => {
    const { client } = await startClient({
      config: {
        capabilities: ['api_request']
      }
    });

    // Set up mock endpoints
    server.setContent('/api/user/1', JSON.stringify({
      id: 1,
      name: 'John Doe',
      token: 'abc123'
    }), 'application/json');

    server.route('/api/profile', (req, res) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        const parsed = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          received: parsed,
          message: `Profile for ${parsed.name}`
        }));
      });
    });

    const result = await client.callTool({
      name: 'api_request',
      arguments: {
        chain: [
          {
            name: 'getUser',
            method: 'GET',
            url: `${server.PREFIX}api/user/1`,
            expect: { status: 200 },
            extract: { userName: 'name', userToken: 'token' }
          },
          {
            name: 'updateProfile',
            method: 'POST',
            url: `${server.PREFIX}api/profile`,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ name: '{{userName}}', auth: '{{userToken}}' }),
            expect: { status: 200 }
          }
        ]
      }
    });

    const response = JSON.parse((result as any).content[0].text);
    expect(response.sessionId).toBeDefined();
    expect(response.results).toHaveLength(2);

    // Check first step
    expect(response.results[0].body.name).toBe('John Doe');

    // Check second step (template rendered)
    expect(response.results[1].body.received.name).toBe('John Doe');
    expect(response.results[1].body.received.auth).toBe('abc123');
  });
});
