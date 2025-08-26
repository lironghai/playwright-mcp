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

test.describe('API Session Report Integration Tests', () => {
  // Skip these API tests on all browsers except API config as these are API tests
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name !== 'api')
      test.skip(true, 'API tests should only run on API config');
  });

  test('generates report for complete API workflow session', async ({ startClient, server }) => {
    // Set up mock endpoints
    server.setContent('/api/users', JSON.stringify({
      users: [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]
    }), 'application/json');

    server.setContent('/api/login', JSON.stringify({
      token: 'auth-token-123'
    }), 'application/json');

    const { client } = await startClient({
      config: {
        capabilities: ['api_request', 'api_session_report']
      }
    });

    const sessionId = 'integration-test-session';

    // Create API session with chain requests (login -> users)
    await client.callTool({
      name: 'api_request',
      arguments: {
        sessionId,
        chain: [
          {
            name: 'login',
            method: 'POST',
            url: `${server.PREFIX}api/login`,
            headers: { 'Content-Type': 'application/json' },
            data: { username: 'test', password: 'pass' },
            extract: { token: 'token' }
          },
          {
            name: 'users',
            method: 'GET',
            url: `${server.PREFIX}api/users`,
            headers: { 'Authorization': 'Bearer auth-token-123' }
          }
        ],
        expect: {
          status: 200,
          contentType: 'application/json'
        }
      }
    });

    // Step 3: Generate HTML report
    const reportResult = await client.callTool({
      name: 'api_session_report',
      arguments: {
        sessionId
      }
    });

    const resultText = (reportResult as any).content[0].text;
    expect(resultText).toContain('HTML report generated:');
    expect(resultText).toContain(`session-${sessionId}.html`);

    // Verify the generated HTML file
    const reportsDir = path.resolve(process.cwd(), 'reports');
    const reportPath = path.join(reportsDir, `session-${sessionId}.html`);
    const htmlContent = await fs.readFile(reportPath, 'utf8');

    // Verify HTML structure and content
    expect(htmlContent).toContain('<!DOCTYPE html>');
    expect(htmlContent).toContain(`API Test Session Report: ${sessionId}`);
    expect(htmlContent).toContain(`<b>Session ID:</b> ${sessionId}`);
    expect(htmlContent).toContain('/api/login');
    expect(htmlContent).toContain('/api/users');
    expect(htmlContent).toContain('POST');
    expect(htmlContent).toContain('GET');
    expect(htmlContent).toContain('Bearer auth-token-123');

    // Verify CSS is included
    expect(htmlContent).toContain('font-family: Arial, sans-serif');
    expect(htmlContent).toContain('.pass { color: green; }');
    expect(htmlContent).toContain('.fail { color: red; }');

    // Cleanup
    await fs.unlink(reportPath).catch(() => {});
  });

  test('generates report for API chain request workflow', async ({ startClient, server }) => {
    // Set up mock endpoints
    server.setContent('/api/auth', JSON.stringify({
      accessToken: 'access-123', refreshToken: 'refresh-456'
    }), 'application/json');

    server.route('/api/profile', (req, res) => {
      const auth = req.headers.authorization;
      if (auth === 'Bearer access-123')
        res.writeHead(200, { 'Content-Type': 'application/json' });
      else
        res.writeHead(401, { 'Content-Type': 'application/json' });

      const content = auth === 'Bearer access-123'
        ? JSON.stringify({ id: 1, name: 'Test User', email: 'test@example.com' })
        : JSON.stringify({ error: 'Unauthorized' });
      res.end(content);
    });

    const { client } = await startClient({
      config: {
        capabilities: ['api_request', 'api_session_report']
      }
    });

    const sessionId = 'chain-workflow-session';

    // Create a chain request workflow
    await client.callTool({
      name: 'api_request',
      arguments: {
        sessionId,
        chain: [
          {
            name: 'auth',
            method: 'POST',
            url: `${server.PREFIX}api/auth`,
            headers: { 'Content-Type': 'application/json' },
            data: { username: 'test', password: 'secret' },
            extract: { accessToken: 'accessToken' }
          },
          {
            name: 'profile',
            method: 'GET',
            url: `${server.PREFIX}api/profile`,
            headers: { 'Authorization': 'Bearer {{auth.accessToken}}' }
          }
        ],
        expect: {
          status: 200,
          contentType: 'application/json'
        }
      }
    });

    // Generate HTML report
    const reportResult = await client.callTool({
      name: 'api_session_report',
      arguments: {
        sessionId
      }
    });

    expect((reportResult as any).content[0].text).toContain('HTML report generated:');

    // Verify chain workflow in HTML
    const reportsDir = path.resolve(process.cwd(), 'reports');
    const reportPath = path.join(reportsDir, `session-${sessionId}.html`);
    const htmlContent = await fs.readFile(reportPath, 'utf8');

    expect(htmlContent).toContain('/api/auth');
    expect(htmlContent).toContain('/api/profile');
    expect(htmlContent).toContain('POST'); // First request method
    expect(htmlContent).toContain('GET'); // Second request method
    expect(htmlContent).toContain('Bearer access-123'); // Variable substitution

    // Cleanup
    await fs.unlink(reportPath).catch(() => {});
  });

  test('generates report for session with validation failures', async ({ startClient, server }) => {
    // Set up mock endpoints for error scenarios
    server.route('/api/error', (req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    });

    server.route('/api/wrong-content', (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Plain text response');
    });

    const { client } = await startClient({
      config: {
        capabilities: ['api_request', 'api_session_report']
      }
    });

    const sessionId = 'failure-test-session';

    // Create chain request with validation failures
    await client.callTool({
      name: 'api_request',
      arguments: {
        sessionId,
        chain: [
          {
            name: 'error-request',
            method: 'GET',
            url: `${server.PREFIX}api/error`,
            expect: {
              status: 200, // Expecting 200 but will get 500
              contentType: 'application/json'
            }
          },
          {
            name: 'wrong-content-request',
            method: 'GET',
            url: `${server.PREFIX}api/wrong-content`,
            expect: {
              status: 200,
              contentType: 'application/json' // Expecting JSON but will get text/plain
            }
          }
        ]
      }
    });

    // Generate HTML report
    const reportResult = await client.callTool({
      name: 'api_session_report',
      arguments: {
        sessionId
      }
    });

    expect((reportResult as any).content[0].text).toContain('HTML report generated:');

    // Verify validation failures in HTML
    const reportsDir = path.resolve(process.cwd(), 'reports');
    const reportPath = path.join(reportsDir, `session-${sessionId}.html`);
    const htmlContent = await fs.readFile(reportPath, 'utf8');

    expect(htmlContent).toContain('class=\'fail\'>FAIL');
    expect(htmlContent).toContain('/api/error');
    expect(htmlContent).toContain('/api/wrong-content');
    expect(htmlContent).toContain('500'); // Error status code
    expect(htmlContent).toContain('200'); // Success status code

    // Cleanup
    await fs.unlink(reportPath).catch(() => {});
  });
});
