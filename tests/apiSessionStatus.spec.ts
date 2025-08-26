/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
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

test.describe('API Session Status Tool Integration Tests', () => {
  // Skip these API tests on all browsers except API config as these are API tests
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name !== 'api')
      test.skip(true, 'API tests should only run on API config');
  });

  test('retrieves session status after API request execution', async ({ startClient, server }) => {
    const { client } = await startClient({
      config: {
        capabilities: ['api_request', 'api_session_status']
      }
    });

    // Set up mock endpoint
    server.setContent('/api/test', JSON.stringify({
      message: 'success',
      id: 123
    }), 'application/json');

    // Execute an API request to create a session
    const requestResult = await client.callTool({
      name: 'api_request',
      arguments: {
        sessionId: 'integration-test-session',
        name: 'test-request',
        url: `${server.PREFIX}api/test`,
        method: 'GET'
      }
    });

    expect(requestResult).toBeDefined();

    // Now check the session status
    const statusResult = await client.callTool({
      name: 'api_session_status',
      arguments: {
        sessionId: 'integration-test-session'
      }
    });

    expect(statusResult).toBeDefined();
    expect((statusResult as any).content[0].type).toBe('text');

    const sessionData = JSON.parse((statusResult as any).content[0].text);
    expect(sessionData.sessionId).toBe('integration-test-session');
    expect(sessionData.startTime).toBeDefined();
    expect(sessionData.logs).toBeDefined();
    expect(sessionData.status).toBe('running');
  });

  test('tracks multiple API requests in session', async ({ startClient, server }) => {
    const { client } = await startClient({
      config: {
        capabilities: ['api_request', 'api_session_status']
      }
    });

    // Set up test endpoints
    server.setContent('/api/users', JSON.stringify({
      users: [{ id: 1, name: 'John' }]
    }), 'application/json');

    server.setContent('/api/users/1', JSON.stringify({
      id: 1, name: 'John', email: 'john@example.com'
    }), 'application/json');

    // Execute first API request
    await client.callTool({
      name: 'api_request',
      arguments: {
        sessionId: 'multi-request-session',
        name: 'get-users',
        url: `${server.PREFIX}api/users`,
        method: 'GET'
      }
    });

    // Execute second API request
    await client.callTool({
      name: 'api_request',
      arguments: {
        sessionId: 'multi-request-session',
        name: 'get-user-details',
        url: `${server.PREFIX}api/users/1`,
        method: 'GET'
      }
    });

    // Check session status
    const statusResult = await client.callTool({
      name: 'api_session_status',
      arguments: {
        sessionId: 'multi-request-session'
      }
    });

    const sessionData = JSON.parse((statusResult as any).content[0].text);
    expect(sessionData.sessionId).toBe('multi-request-session');
    expect(sessionData.startTime).toBeDefined();
    expect(sessionData.logs).toBeDefined();
    expect(sessionData.status).toBe('running');
  });

  test('handles session with template variables and extracted data', async ({ startClient, server }) => {
    const { client } = await startClient({
      config: {
        capabilities: ['api_request', 'api_session_status']
      }
    });

    // Set up test endpoints
    server.setContent('/api/auth', JSON.stringify({
      access_token: 'abc123',
      user_id: 456
    }), 'application/json');

    server.setContent('/api/users/456', JSON.stringify({
      id: 456, name: 'Alice', role: 'admin'
    }), 'application/json');

    // Execute authentication request with extraction
    await client.callTool({
      name: 'api_request',
      arguments: {
        sessionId: 'template-session',
        name: 'authenticate',
        url: `${server.PREFIX}api/auth`,
        method: 'POST',
        body: { username: 'alice', password: 'secret' },
        extract: {
          token: '$.access_token',
          userId: '$.user_id'
        }
      }
    });

    // Execute second request using extracted variables
    await client.callTool({
      name: 'api_request',
      arguments: {
        sessionId: 'template-session',
        name: 'get-profile',
        url: `${server.PREFIX}api/users/{{userId}}`,
        method: 'GET',
        headers: {
          'Authorization': 'Bearer {{token}}'
        }
      }
    });

    // Check session status to see extracted variables
    const statusResult = await client.callTool({
      name: 'api_session_status',
      arguments: {
        sessionId: 'template-session'
      }
    });

    const sessionData = JSON.parse((statusResult as any).content[0].text);
    expect(sessionData.sessionId).toBe('template-session');
    expect(sessionData.startTime).toBeDefined();
    expect(sessionData.logs).toBeDefined();
    expect(sessionData.status).toBe('running');
  });

  test('returns session with validation errors', async ({ startClient, server }) => {
    const { client } = await startClient({
      config: {
        capabilities: ['api_request', 'api_session_status']
      }
    });

    // Set up endpoint that returns unexpected data
    server.setContent('/api/invalid', JSON.stringify({
      unexpected: 'data'
    }), 'application/json');

    // Execute request with validation that will fail
    await client.callTool({
      name: 'api_request',
      arguments: {
        sessionId: 'validation-session',
        name: 'invalid-request',
        url: `${server.PREFIX}api/invalid`,
        method: 'GET',
        validate: {
          statusCode: 200,
          body: {
            type: 'object',
            required: ['expected'],
            properties: {
              expected: { type: 'string' }
            }
          }
        }
      }
    });

    // Check session status to see validation errors
    const statusResult = await client.callTool({
      name: 'api_session_status',
      arguments: {
        sessionId: 'validation-session'
      }
    });

    const sessionData = JSON.parse((statusResult as any).content[0].text);
    expect(sessionData.sessionId).toBe('validation-session');
    expect(sessionData.startTime).toBeDefined();
    expect(sessionData.logs).toBeDefined();
    expect(sessionData.status).toBe('running');
  });

  test('handles session not found for non-existent session', async ({ startClient }) => {
    const { client } = await startClient({
      config: {
        capabilities: ['api_session_status']
      }
    });

    const statusResult = await client.callTool({
      name: 'api_session_status',
      arguments: {
        sessionId: 'non-existent-session-id'
      }
    });

    expect((statusResult as any).content[0].text).toBe(
        'Session not found: non-existent-session-id'
    );
  });

  test('retrieves session after request chain completion', async ({ startClient, server }) => {
    const { client } = await startClient({
      config: {
        capabilities: ['api_request', 'api_session_status']
      }
    });

    // Set up authentication and user profile endpoints
    server.setContent('/api/login', JSON.stringify({
      token: 'xyz789', expires: 3600
    }), 'application/json');

    server.setContent('/api/profile', JSON.stringify({
      id: 789, name: 'Bob', email: 'bob@test.com'
    }), 'application/json');

    server.setContent('/api/settings', JSON.stringify({
      theme: 'dark', notifications: true
    }), 'application/json');

    // Execute a chain of requests
    const sessionId = 'chain-session';

    // Step 1: Login
    await client.callTool({
      name: 'api_request',
      arguments: {
        sessionId,
        name: 'login',
        url: `${server.PREFIX}api/login`,
        method: 'POST',
        body: { email: 'bob@test.com', password: 'password' },
        extract: { authToken: '$.token' }
      }
    });

    // Step 2: Get profile
    await client.callTool({
      name: 'api_request',
      arguments: {
        sessionId,
        name: 'get-profile',
        url: `${server.PREFIX}api/profile`,
        method: 'GET',
        headers: { 'Authorization': 'Bearer {{authToken}}' },
        extract: { userId: '$.id' }
      }
    });

    // Step 3: Get settings
    await client.callTool({
      name: 'api_request',
      arguments: {
        sessionId,
        name: 'get-settings',
        url: `${server.PREFIX}api/settings`,
        method: 'GET',
        headers: { 'Authorization': 'Bearer {{authToken}}' }
      }
    });

    // Get complete session status
    const statusResult = await client.callTool({
      name: 'api_session_status',
      arguments: {
        sessionId
      }
    });

    const sessionData = JSON.parse((statusResult as any).content[0].text);

    expect(sessionData.sessionId).toBe('chain-session');
    expect(sessionData.startTime).toBeDefined();
    expect(sessionData.logs).toBeDefined();
    expect(sessionData.status).toBe('running');
  });
});
