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

// Use the same global session store as apiRequest
const sessionStore: Map<string, any> = (globalThis as any).__API_SESSION_STORE__ || new Map();
(globalThis as any).__API_SESSION_STORE__ = sessionStore;

const apiSessionStatusTool = defineTool({
  capability: 'api_session_status',
  schema: {
    name: 'api_session_status',
    title: 'API Session Status',
    description: 'Query API test session status, logs, and results by sessionId.',
    inputSchema: z.object({
      sessionId: z.string()
    }),
    type: 'readOnly'
  },
  async handle(ctx: any, input: { sessionId: string }, response: any) {
    const session = sessionStore.get(input.sessionId);
    if (!session) {
      response.resultOverride = {
        content: [{ type: 'text', text: `Session not found: ${input.sessionId}` }]
      };
      response.code = [];
      response.captureSnapshot = false;
      response.waitForNetwork = false;
      return;
    }
    response.resultOverride = {
      content: [{ type: 'text', text: JSON.stringify(session, null, 2) }]
    };
    response.code = [];
    response.captureSnapshot = false;
    response.waitForNetwork = false;
    return;
  }
});

export default apiSessionStatusTool;
export const apiSessionStatusTools = [apiSessionStatusTool];
