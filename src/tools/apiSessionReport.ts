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
import { z } from 'zod';
import { defineTool } from './tool.js';

// Use the same global session store as apiRequest
const sessionStore: Map<string, any> = (globalThis as any).__API_SESSION_STORE__ || new Map();
(globalThis as any).__API_SESSION_STORE__ = sessionStore;

const reportsDir = path.resolve(process.cwd(), 'reports');

async function ensureReportsDir() {
  try {
    await fs.mkdir(reportsDir, { recursive: true });
  } catch {}
}

/**
 * Generate structured report data from session
 */
function generateReportData(session: any, includeRequestData: boolean, includeResponseData: boolean, includeTiming: boolean): any {
  const logs = session.logs || [];

  // Generate summary
  const summary = generateSummary(logs);

  // Process logs for display
  const processedLogs = logs.map((log: any) => processLogForReport(
      log,
      includeRequestData,
      includeResponseData
  ));

  // Generate timing data if requested
  const timingData = includeTiming ? generateTimingData(logs, session) : null;

  return {
    session: {
      sessionId: session.sessionId,
      status: session.status,
      startTime: session.startTime,
      endTime: session.endTime,
      executionTime: session.executionTime,
      error: session.error
    },
    summary,
    logs: processedLogs,
    timing: timingData,
    metadata: {
      generatedAt: new Date().toISOString(),
      includeRequestData,
      includeResponseData,
      includeTiming
    }
  };
}

/**
 * Generate summary statistics
 */
function generateSummary(logs: any[]): any {
  let totalRequests = 0;
  let successfulRequests = 0;
  let failedRequests = 0;
  let validationsPassed = 0;
  let validationsFailed = 0;
  let chainStepCount = 0;
  let singleRequestCount = 0;

  // Process chain steps and single requests separately
  const chainSteps = logs
      .filter(log => log.type === 'chain' && log.steps)
      .flatMap(log => log.steps || []);
  const singleRequests = logs.filter(
      log => (log.type === 'single' || log.type === 'request') &&
          log.request && log.response
  );

  // Process chain steps
  for (const step of chainSteps) {
    if (step.request && step.response) {
      totalRequests++;
      chainStepCount++;

      const isValid = step.validation &&
          step.bodyValidation &&
          step.validation.status &&
          step.validation.contentType &&
          step.bodyValidation.matched;

      if (isValid) {
        successfulRequests++;
        validationsPassed++;
      } else {
        failedRequests++;
        validationsFailed++;
      }
    }
  }

  // Process single requests
  for (const request of singleRequests) {
    totalRequests++;
    singleRequestCount++;
    const isValid = request.validation &&
        request.bodyValidation &&
        request.validation.status &&
        request.validation.contentType &&
        request.bodyValidation.matched;

    if (isValid) {
      successfulRequests++;
      validationsPassed++;
    } else {
      failedRequests++;
      validationsFailed++;
    }
  }

  return {
    totalRequests,
    successfulRequests,
    failedRequests,
    successRate: totalRequests > 0 ? Math.round((successfulRequests / totalRequests) * 100) / 100 : 0,
    validationsPassed,
    validationsFailed,
    validationRate: (validationsPassed + validationsFailed) > 0
      ? Math.round((validationsPassed / (validationsPassed + validationsFailed)) * 100) / 100
      : 0,
    logEntries: logs.length,
    chainSteps: chainStepCount,
    singleRequests: singleRequestCount
  };
}

/**
 * Process individual log entry for report display
 */
function processLogForReport(log: any, includeRequestData: boolean, includeResponseData: boolean): any {
  const processed: any = {
    type: log.type,
    timestamp: log.timestamp,
    formattedTime: new Date(log.timestamp).toLocaleString()
  };

  // Process request data with better error handling
  if (log.request && includeRequestData) {
    processed.request = {
      method: log.request.method || 'UNKNOWN',
      url: log.request.url || 'UNKNOWN',
      headers: log.request.headers || {},
      data: log.request.data || null
    };
  } else if (log.request) {
    processed.request = {
      method: log.request.method || 'UNKNOWN',
      url: log.request.url || 'UNKNOWN',
      hasHeaders: !!(log.request.headers && Object.keys(log.request.headers).length > 0),
      hasData: !!log.request.data
    };
  }

  // Process response data with better error handling
  if (log.response && includeResponseData) {
    processed.response = {
      status: log.response.status || 0,
      statusText: log.response.statusText || 'UNKNOWN',
      contentType: log.response.contentType || 'UNKNOWN',
      headers: log.response.headers || {},
      body: log.response.body || null
    };
  } else if (log.response) {
    processed.response = {
      status: log.response.status || 0,
      statusText: log.response.statusText || 'UNKNOWN',
      contentType: log.response.contentType || 'UNKNOWN',
      hasHeaders: !!(log.response.headers && Object.keys(log.response.headers).length > 0),
      bodySize: log.response.body ? log.response.body.length : 0
    };
  }

  // Process chain steps with better data handling
  if (log.steps) {
    processed.steps = log.steps.map((step: any) => ({
      method: step.method || 'UNKNOWN',
      url: step.url || 'UNKNOWN',
      status: step.status || 0,
      timestamp: step.timestamp || log.timestamp,
      data: step.data || null,
      headers: step.headers || {},
      validation: step.validation || {},
      bodyValidation: step.bodyValidation || {}
    }));
  }

  // Copy validation info
  processed.validation = log.validation || {};
  processed.bodyValidation = log.bodyValidation || {};
  processed.expectations = log.expectations || {}; // Copy expectations

  return processed;
}

/**
 * Generate timing analysis data
 */
function generateTimingData(logs: any[], session: any): any {
  // Process chain steps and single requests separately
  const chainSteps = logs
      .filter(log => log.type === 'chain' && log.steps)
      .flatMap(log => log.steps || [])
      .filter(step => step.timestamp && step.method && step.url && step.status);

  const singleRequests = logs
      .filter(log => (log.type === 'single' || log.type === 'request') &&
          log.request && log.response)
      .map(req => ({
        timestamp: req.timestamp,
        method: req.request.method,
        url: req.request.url,
        status: req.response.status
      }));

  const allRequests = [...chainSteps, ...singleRequests];

  if (allRequests.length === 0)
    return null;

  // Sort requests by timestamp to ensure correct timing
  allRequests.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const sessionStart = new Date(session.startTime).getTime();
  const timings = allRequests.map((req, i) => {
    const requestTime = new Date(req.timestamp).getTime();
    const relativeTime = requestTime - sessionStart;

    return {
      index: i,
      timestamp: req.timestamp,
      relativeTimeMs: relativeTime,
      method: req.method || 'UNKNOWN',
      url: req.url || 'UNKNOWN',
      status: req.status || 0
    };
  });

  // Calculate actual intervals between requests
  const intervals = timings.map((t, i) => i === 0 ? 0 : t.relativeTimeMs - timings[i - 1].relativeTimeMs);
  const averageInterval = intervals.length > 1 ? Math.round(intervals.reduce((a, b) => a + b) / (intervals.length - 1)) : 0;

  // Calculate session duration using first and last request timestamps
  const firstRequest = allRequests[0];
  const lastRequest = allRequests[allRequests.length - 1];
  const sessionDuration = lastRequest
    ? (new Date(lastRequest.timestamp).getTime() - new Date(firstRequest.timestamp).getTime())
    : 0;

  return {
    sessionDurationMs: sessionDuration,
    requestCount: allRequests.length,
    averageIntervalMs: averageInterval,
    timings
  };
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: any): string {
  if (typeof text !== 'string')
    return String(text);
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Generate CSS styles for the report
 */
function generateCSS(theme: string): string {
  return `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f5f5f5;
        }

        .theme-dark {
            color: #e0e0e0;
            background-color: #1a1a1a;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .theme-dark .header {
            background: #2d2d2d;
        }

        .header h1 {
            color: #2c3e50;
            font-size: 2em;
        }

        .theme-dark .header h1 {
            color: #ecf0f1;
        }

        .session-info {
            display: flex;
            gap: 15px;
            align-items: center;
        }

        .session-id {
            font-family: monospace;
            background: #f8f9fa;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 0.9em;
        }

        .theme-dark .session-id {
            background: #3a3a3a;
        }

        .status {
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: bold;
            text-transform: uppercase;
        }

        .status-completed {
            background: #d4edda;
            color: #155724;
        }

        .status-running {
            background: #fff3cd;
            color: #856404;
        }

        .status-failed {
            background: #f8d7da;
            color: #721c24;
        }

        .summary {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }

        .theme-dark .summary {
            background: #2d2d2d;
        }

        .summary h2 {
            margin-bottom: 20px;
            color: #2c3e50;
        }

        .theme-dark .summary h2 {
            color: #ecf0f1;
        }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 20px;
        }

        .summary-card {
            text-align: center;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
            border-left: 4px solid #6c757d;
        }

        .theme-dark .summary-card {
            background: #3a3a3a;
        }

        .summary-card.success {
            border-left-color: #28a745;
        }

        .summary-card.failure {
            border-left-color: #dc3545;
        }

        .summary-value {
            font-size: 2em;
            font-weight: bold;
            color: #2c3e50;
        }

        .theme-dark .summary-value {
            color: #ecf0f1;
        }

        .summary-label {
            font-size: 0.9em;
            color: #6c757d;
            margin-top: 5px;
        }

        .logs {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }

        .theme-dark .logs {
            background: #2d2d2d;
        }

        .logs h2 {
            margin-bottom: 20px;
            color: #2c3e50;
        }

        .theme-dark .logs h2 {
            color: #ecf0f1;
        }

        .log-entry {
            border: 1px solid #e9ecef;
            border-radius: 8px;
            margin-bottom: 15px;
            overflow: hidden;
        }

        .theme-dark .log-entry {
            border-color: #4a4a4a;
        }

        .log-header {
            background: #f8f9fa;
            padding: 15px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .theme-dark .log-header {
            background: #3a3a3a;
        }

        .log-header:hover {
            background: #e9ecef;
        }

        .theme-dark .log-header:hover {
            background: #4a4a4a;
        }

        .log-title {
            font-weight: bold;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .method {
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 0.8em;
            font-weight: bold;
        }

        .method-get { background: #28a745; color: white; }
        .method-post { background: #007bff; color: white; }
        .method-put { background: #ffc107; color: black; }
        .method-delete { background: #dc3545; color: white; }
        .method-patch { background: #6f42c1; color: white; }

        .status-code {
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 0.8em;
            font-weight: bold;
        }

        .status-2xx { background: #28a745; color: white; }
        .status-3xx { background: #ffc107; color: black; }
        .status-4xx { background: #fd7e14; color: white; }
        .status-5xx { background: #dc3545; color: white; }

        .log-body {
            padding: 20px;
            background: white;
            display: none;
        }

        .theme-dark .log-body {
            background: #2d2d2d;
        }

        .log-body.expanded {
            display: block;
        }

        .request-response-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }

        .request-section, .response-section {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
        }

        .theme-dark .request-section,
        .theme-dark .response-section {
            background: #3a3a3a;
        }

        .section-title {
            font-weight: bold;
            margin-bottom: 10px;
            color: #2c3e50;
        }

        .theme-dark .section-title {
            color: #ecf0f1;
        }

        .code-block {
            background: #2d3748;
            color: #e2e8f0;
            padding: 15px;
            border-radius: 6px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: break-all;
        }

        .validation-results {
            margin-top: 15px;
            padding: 15px;
            border-radius: 6px;
        }

        .validation-passed {
            background: #d4edda;
            border-left: 4px solid #28a745;
        }

        .validation-failed {
            background: #f8d7da;
            border-left: 4px solid #dc3545;
        }

        .validation-comparison {
            margin-top: 10px;
        }

        .validation-item {
            margin-bottom: 15px;
            padding: 10px;
            background: rgba(255,255,255,0.5);
            border-radius: 4px;
        }

        .theme-dark .validation-item {
            background: rgba(0,0,0,0.2);
        }

        .comparison-details {
            margin-top: 8px;
            display: flex;
            flex-direction: column;
            gap: 5px;
        }

        .expected, .actual {
            padding: 4px 8px;
            border-radius: 3px;
            font-family: monospace;
            font-size: 0.9em;
        }

        .expected {
            background: #e3f2fd;
            color: #1565c0;
            border-left: 3px solid #2196f3;
        }

        .actual {
            background: #f3e5f5;
            color: #7b1fa2;
            border-left: 3px solid #9c27b0;
        }

        .theme-dark .expected {
            background: #1a237e;
            color: #bbdefb;
        }

        .theme-dark .actual {
            background: #4a148c;
            color: #e1bee7;
        }

        .expected-section, .actual-section, .regex-section {
            margin-top: 8px;
        }

        .code-block.small {
            font-size: 0.8em;
            max-height: 200px;
            overflow-y: auto;
        }

        .validation-reason {
            margin-top: 10px;
            padding: 8px;
            background: rgba(255,193,7,0.1);
            border-left: 3px solid #ffc107;
            border-radius: 3px;
        }

        .timing-section {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }

        .theme-dark .timing-section {
            background: #2d2d2d;
        }

        .timing-chart {
            margin-top: 20px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 6px;
        }

        .theme-dark .timing-chart {
            background: #3a3a3a;
        }

        .footer {
            text-align: center;
            padding: 20px;
            color: #6c757d;
            font-size: 0.9em;
        }

        @media (max-width: 768px) {
            .header {
                flex-direction: column;
                gap: 15px;
                text-align: center;
            }

            .request-response-grid {
                grid-template-columns: 1fr;
            }

            .summary-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
        `;
}

/**
 * Generate JavaScript for interactivity
 */
function generateJavaScript(): string {
  return `
        document.addEventListener('DOMContentLoaded', function() {
            // Toggle log entry expansion
            const logHeaders = document.querySelectorAll('.log-header');
            logHeaders.forEach(header => {
                header.addEventListener('click', function() {
                    const logBody = this.nextElementSibling;
                    logBody.classList.toggle('expanded');
                    
                    const arrow = this.querySelector('.arrow');
                    if (arrow) {
                        arrow.textContent = logBody.classList.contains('expanded') ? '▼' : '▶';
                    }
                });
            });

            // Pretty print JSON in code blocks
            const codeBlocks = document.querySelectorAll('.code-block');
            codeBlocks.forEach(block => {
                try {
                    const content = block.textContent;
                    const parsed = JSON.parse(content);
                    block.textContent = JSON.stringify(parsed, null, 2);
                } catch (e) {
                    // Not JSON, leave as is
                }
            });
        });
        `;
}

/**
 * Generate timing section HTML
 */
function generateTimingSection(timing: any): string {
  return `
        <section class="timing-section">
            <h2>Timing Analysis</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="summary-value">${timing.sessionDurationMs}ms</div>
                    <div class="summary-label">Total Duration</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${timing.requestCount}</div>
                    <div class="summary-label">Requests</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${timing.averageIntervalMs}ms</div>
                    <div class="summary-label">Avg Interval</div>
                </div>
            </div>
            <div class="timing-chart">
                <h3>Request Timeline</h3>
                ${timing.timings.map((t: any) => `
                    <div style="margin: 5px 0; padding: 5px; background: rgba(0,123,255,0.1); border-radius: 3px;">
                        <strong>${t.method} ${escapeHtml(t.url)}</strong> 
                        - ${t.relativeTimeMs}ms 
                        <span class="status-code status-${Math.floor(t.status / 100)}xx">${t.status}</span>
                    </div>
                `).join('')}
            </div>
        </section>
        `;
}

/**
 * Generate individual log entry HTML
 */
function generateLogEntry(log: any, index: number): string {
  // Skip chain type logs entirely
  if (log.type === 'chain')
    return '';

  const hasValidation = log.validation && log.bodyValidation;
  const isValidationPassed = hasValidation &&
      log.validation.status &&
      log.validation.contentType &&
      log.bodyValidation.matched;

  let method = 'UNKNOWN';
  let url = 'UNKNOWN';
  let statusCode = 0;
  let statusText = '';

  if (log.request) {
    method = log.request.method || 'UNKNOWN';
    url = log.request.url || 'UNKNOWN';
  }

  if (log.response) {
    statusCode = log.response.status || 0;
    statusText = log.response.statusText || '';
  }

  const statusClass = statusCode > 0 ? `status-${Math.floor(statusCode / 100)}xx` : '';

  return `
        <div class="log-entry">
            <div class="log-header">
                <div class="log-title">
                    <span class="arrow">▶</span>
                    <span class="method method-${method.toLowerCase()}">${method}</span>
                    <span>${escapeHtml(url)}</span>
                    ${statusCode > 0 ? `<span class="status-code ${statusClass}">${statusCode} ${statusText}</span>` : ''}
                    ${hasValidation
    ? `<span class="validation-badge ${isValidationPassed ? 'passed' : 'failed'}">
                            ${isValidationPassed ? '✓' : '✗'} Validation
                        </span>`
    : ''}
                </div>
                <div class="log-time">${log.formattedTime || ''}</div>
            </div>
            <div class="log-body">
                ${generateRequestResponseHtml(log)}
                ${hasValidation ? generateValidationHtml(log.validation, log.bodyValidation, log.expectations, log.response) : ''}
            </div>
        </div>
        `;
}

/**
 * Generate request/response HTML
 */
function generateRequestResponseHtml(log: any): string {
  // Skip if no request or response data
  if (!log.request && !log.response)
    return '<p>No request/response data available</p>';

  return `
        <div class="request-response-grid">
            <div class="request-section">
                <div class="section-title">Request</div>
                ${log.request ? `
                    <p><strong>Method:</strong> ${log.request.method || 'UNKNOWN'}</p>
                    <p><strong>URL:</strong> ${escapeHtml(log.request.url || 'UNKNOWN')}</p>
                    ${Object.keys(log.request.headers || {}).length > 0 ? `
                        <p><strong>Headers:</strong></p>
                        <div class="code-block">${escapeHtml(JSON.stringify(log.request.headers, null, 2))}</div>
                    ` : ''}
                    ${log.request.data ? `
                        <p><strong>Body:</strong></p>
                        <div class="code-block">${escapeHtml(JSON.stringify(log.request.data, null, 2))}</div>
                    ` : ''}
                ` : '<p>No request data available</p>'}
            </div>
            <div class="response-section">
                <div class="section-title">Response</div>
                ${log.response ? `
                    <p><strong>Status:</strong> ${log.response.status || 'UNKNOWN'} ${log.response.statusText ? `- ${log.response.statusText}` : ''}</p>
                    ${log.response.contentType ? `<p><strong>Content Type:</strong> ${log.response.contentType}</p>` : ''}
                    ${Object.keys(log.response.headers || {}).length > 0 ? `
                        <p><strong>Headers:</strong></p>
                        <div class="code-block">${escapeHtml(JSON.stringify(log.response.headers, null, 2))}</div>
                    ` : ''}
                    ${log.response.body !== undefined ? `
                        <p><strong>Body:</strong></p>
                        <div class="code-block">${typeof log.response.body === 'string'
    ? escapeHtml(log.response.body)
    : escapeHtml(JSON.stringify(log.response.body, null, 2))}</div>
                    ` : ''}
                ` : '<p>No response data available</p>'}
            </div>
        </div>
        `;
}

/**
 * Generate validation results HTML
 */
function generateValidationHtml(validation: any, bodyValidation: any, expectations: any = {}, response: any = {}): string {
  const isPassed = validation.status && validation.contentType && bodyValidation.matched;

  return `
        <div class="validation-results ${isPassed ? 'validation-passed' : 'validation-failed'}">
            <h4>Validation Results</h4>
            
            <div class="validation-comparison">
                <div class="validation-section">
                    <h5>Expected vs Actual</h5>
                    
                    <div class="validation-item">
                        <strong>Status Code:</strong> ${validation.status ? '✓ Passed' : '✗ Failed'}
                        <div class="comparison-details">
                            <span class="expected">Expected: ${expectations.status !== undefined ? expectations.status : 'Any'}</span>
                            <span class="actual">Actual: ${response.status || 'Unknown'}</span>
                        </div>
                    </div>
                    
                    <div class="validation-item">
                        <strong>Content Type:</strong> ${validation.contentType ? '✓ Passed' : '✗ Failed'}
                        <div class="comparison-details">
                            <span class="expected">Expected: ${expectations.contentType || 'Any'}</span>
                            <span class="actual">Actual: ${response.contentType || 'Unknown'}</span>
                        </div>
                    </div>
                    
                    <div class="validation-item">
                        <strong>Body Validation:</strong> ${bodyValidation.matched ? '✓ Passed' : '✗ Failed'}
                        <div class="comparison-details">
                            ${expectations.body !== undefined ? `
                                <div class="expected-section">
                                    <strong>Expected Body:</strong>
                                    <div class="code-block small">${escapeHtml(typeof expectations.body === 'string' ? expectations.body : JSON.stringify(expectations.body, null, 2))}</div>
                                </div>
                                <div class="actual-section">
                                    <strong>Actual Body:</strong>
                                    <div class="code-block small">${escapeHtml(typeof response.body === 'string' ? response.body : JSON.stringify(response.body, null, 2))}</div>
                                </div>
                            ` : ''}
                            ${expectations.bodyRegex ? `
                                <div class="regex-section">
                                    <strong>Expected Regex Pattern:</strong>
                                    <div class="code-block small">${escapeHtml(expectations.bodyRegex)}</div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    ${bodyValidation.reason ? `
                        <div class="validation-reason">
                            <strong>Validation Reason:</strong> ${escapeHtml(bodyValidation.reason)}
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
        `;
}

function renderHtmlReport(session: any): string {
  const reportData = generateReportData(session, true, true, true);
  const title = 'API Test Session Report';
  const theme = 'light';
  const css = generateCSS(theme);
  const jsCode = generateJavaScript();

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <style>${css}</style>
</head>
<body class="theme-${theme}">
    <div class="container">
        <header class="header">
            <h1>${escapeHtml(title)}</h1>
            <div class="session-info">
                <span class="session-id">Session: ${escapeHtml(reportData.session.sessionId)}</span>
                <span class="status status-${reportData.session.status}">${reportData.session.status}</span>
            </div>
        </header>

        <section class="summary">
            <h2>Summary</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="summary-value">${reportData.summary.totalRequests}</div>
                    <div class="summary-label">Total Requests</div>
                </div>
                <div class="summary-card success">
                    <div class="summary-value">${reportData.summary.successfulRequests}</div>
                    <div class="summary-label">Successful</div>
                </div>
                <div class="summary-card failure">
                    <div class="summary-value">${reportData.summary.failedRequests}</div>
                    <div class="summary-label">Failed</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${Math.round(reportData.summary.successRate * 100)}%</div>
                    <div class="summary-label">Success Rate</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${reportData.session.executionTime || 0}ms</div>
                    <div class="summary-label">Duration</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${Math.round(reportData.summary.validationRate * 100)}%</div>
                    <div class="summary-label">Validation Rate</div>
                </div>
            </div>
        </section>

        ${reportData.timing ? generateTimingSection(reportData.timing) : ''}

        <section class="logs">
            <h2>Request Logs</h2>
            <div class="logs-container">
                ${reportData.logs.map((log: any, index: number) => generateLogEntry(log, index)).join('')}
            </div>
        </section>

        <footer class="footer">
            <p>Report generated at ${new Date(reportData.metadata.generatedAt).toLocaleString()}</p>
        </footer>
    </div>

    <script>${jsCode}</script>
</body>
</html>`;
}

const apiSessionReportTool = defineTool({
  capability: 'api_session_report',
  schema: {
    name: 'api_session_report',
    title: 'API Session HTML Report',
    description: 'Generate and retrieve an HTML report for an API test session by sessionId.',
    inputSchema: z.object({
      sessionId: z.string()
    }),
    type: 'readOnly'
  },
  async handle(ctx: any, input: { sessionId: string }, response: any) {
    const session = sessionStore.get(input.sessionId);
    if (!session) {
      response.resultOverride = { content: [{ type: 'text', text: `Session not found: ${input.sessionId}` }] };
      response.code = [];
      response.captureSnapshot = false;
      response.waitForNetwork = false;
      return;
    }
    await ensureReportsDir();
    const html = renderHtmlReport(session);
    const reportPath = path.join(reportsDir, `session-${input.sessionId}.html`);
    await fs.writeFile(reportPath, html, 'utf8');
    response.resultOverride = { content: [{ type: 'text', text: `HTML report generated: ${reportPath}` }] };
    response.code = [];
    response.captureSnapshot = false;
    response.waitForNetwork = false;
    return;
  }
});

export default apiSessionReportTool;
export const apiSessionReportTools = [apiSessionReportTool];
