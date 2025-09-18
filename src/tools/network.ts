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
import { defineTabTool } from './tool.js';
import { logUnhandledError } from '../utils/log.js';

import type * as playwright from 'playwright';

const requests = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_network_requests',
    title: 'List network requests',
    description: 'Returns all network requests since loading the page',
    inputSchema: z.object({
      filter: z.string().optional().describe('Comma-separated list of strings to filter requests by URL'),
      includeResponseBody: z.boolean().optional().default(false).describe('Whether to include response body in the result, defaults to false; Need to cooperate with the filter parameter, the number of requests cannot exceed 5'),
    }),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    const requests = tab.requests();
    const filters = params.filter ? params.filter.split(',').map(f => f.trim()).filter(f => f) : [];
    const filterRequest = [...requests.entries()].filter(([req, res]) => !params.filter || filters.some(filter => req.url().includes(filter)));
    if (filterRequest) {
      const isResponse = params.includeResponseBody && filterRequest.length <= 5;
      const results = await Promise.all(
          filterRequest.map(async ([req, res]) => await renderRequest(req, res, isResponse))
      );
      response.addResult(JSON.stringify(results, null, 2));
    } else {
      response.addResult(JSON.stringify([], null, 2));
    }
  },
});

async function renderRequest(request: playwright.Request, response: playwright.Response | null, isResponse: boolean = false) {
  const result: string[] = [];
  const resultObj: any = {};
  resultObj.method = request.method().toUpperCase();
  resultObj.url = request.url();
  result.push(`[${request.method().toUpperCase()}] ${request.url()}`);

  const requestObj: any = {};
  const responseObj: any = {};

  resultObj.request = requestObj;
  resultObj.response = responseObj;

  requestObj.headers = request.headers();
  if (response) {
    responseObj.headers = response.headers();
    const contentType = response.headers()['content-type'];
    responseObj.contentType = contentType;
    if (isResponse) {
      try {
        if (contentType && contentType.includes('application/json'))
          responseObj.body = await response.json();
        // result.push(`(\nresponse: ${response.json()})`);
        else if (contentType && contentType.includes('text/html'))
          responseObj.body = await response.text();
        // result.push(`(\nresponse: ${response.text()})`);
        // else
          // responseObj.body = response.text();
        // result.push(`(\nresponse: ${response.text()})`);

        // result.push(` Content-Type: ${contentType} `);
      } catch (error) {
        // Handle the case where response body is not available
        logUnhandledError(error);
      }
    }

    resultObj.status = response.status();
    // result.push(`=> [${response.status()}] ${response.statusText()}`);

    const timing = request.timing();
    const startTime = timing.startTime.toFixed(2);
    const totalTime = timing.responseEnd.toFixed(2);
    resultObj.startTime = startTime;
    resultObj.totalTime = totalTime;
    // result.push(`(StartTime: ${startTime}ms ,Total: ${totalTime}ms)`);
  }

  // return result.join(' ');
  return resultObj;
}

export default [
  requests,
];
