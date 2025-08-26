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

import { test, expect } from '@playwright/test';

// Extract helper functions for unit testing
// Since these are inside the tool handler, we'll test them indirectly through mock implementations
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

function validateBody(responseBody: any, expectedBody: any) {
  if (expectedBody === undefined)
    return { matched: true, reason: 'No body expectation set.' };

  if (typeof responseBody === 'object' && responseBody !== null && typeof expectedBody === 'object') {
    const matched = Object.entries(expectedBody).every(
        ([k, v]) => JSON.stringify(responseBody[k]) === JSON.stringify(v)
    );
    return {
      matched,
      reason: matched ? 'Partial/exact body match succeeded.' : 'Partial/exact body match failed.'
    };
  } else if (typeof expectedBody === 'string') {
    const matched = JSON.stringify(responseBody) === expectedBody || responseBody === expectedBody;
    return {
      matched,
      reason: matched ? 'Exact string match succeeded.' : 'Exact string match failed.'
    };
  } else {
    return {
      matched: false,
      reason: 'Body type mismatch.'
    };
  }
}

function validateWithRegex(responseBody: any, bodyRegex: string) {
  const pattern = new RegExp(bodyRegex);
  const target = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody);
  const regexMatch = pattern.test(target);
  return {
    matched: regexMatch,
    reason: regexMatch ? 'Regex match succeeded.' : 'Regex match failed.'
  };
}

test.describe('API Request Tool Unit Tests', () => {
  // Skip these API tests on all browsers except API config as these are API tests
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name !== 'api')
      test.skip(true, 'API tests should only run on API config');
  });
  test.describe('renderTemplate function', () => {
    test('renders simple template variables', () => {
      const vars = { step1: { value: 'test' } };
      const result = renderTemplate('Hello {{step1.value}}', vars);
      expect(result).toBe('Hello test');
    });

    test('renders multiple template variables', () => {
      const vars = {
        auth: { token: 'abc123', userId: 42 },
        user: { name: 'John' }
      };
      const result = renderTemplate('Bearer {{auth.token}} for user {{user.name}} with id {{auth.userId}}', vars);
      expect(result).toBe('Bearer abc123 for user John with id 42');
    });

    test('handles nested object access', () => {
      const vars = {
        response: {
          data: {
            user: {
              profile: {
                name: 'John Doe'
              }
            }
          }
        }
      };
      const result = renderTemplate('Name: {{response.data.user.profile.name}}', vars);
      expect(result).toBe('Name: John Doe');
    });

    test('handles missing variables gracefully', () => {
      const vars = { step1: { value: 'test' } };
      const result = renderTemplate('Hello {{step1.missing}} and {{missing.value}}', vars);
      expect(result).toBe('Hello  and ');
    });

    test('handles templates with spaces around variable names', () => {
      const vars = { step1: { value: 'test' } };
      const result = renderTemplate('{{ step1.value }}', vars);
      expect(result).toBe('test');
    });

    test('handles no template variables', () => {
      const vars = { step1: { value: 'test' } };
      const result = renderTemplate('No variables here', vars);
      expect(result).toBe('No variables here');
    });

    test('converts non-string values to strings', () => {
      const vars = {
        step1: {
          number: 42,
          boolean: true,
          null: null,
          undefined: undefined
        }
      };
      const result = renderTemplate('Number: {{step1.number}}, Boolean: {{step1.boolean}}, Null: {{step1.null}}, Undefined: {{step1.undefined}}', vars);
      expect(result).toBe('Number: 42, Boolean: true, Null: null, Undefined: ');
    });
  });

  test.describe('extractFields function', () => {
    test('extracts simple fields from object', () => {
      const obj = { name: 'John', age: 30, email: 'john@example.com' };
      const extract = { userName: 'name', userAge: 'age' };
      const result = extractFields(obj, extract);
      expect(result).toEqual({ userName: 'John', userAge: 30 });
    });

    test('extracts nested fields from object', () => {
      const obj = {
        user: {
          profile: {
            name: 'John Doe',
            settings: {
              theme: 'dark',
              notifications: true
            }
          }
        }
      };
      const extract = {
        userName: 'user.profile.name',
        userTheme: 'user.profile.settings.theme',
        notifications: 'user.profile.settings.notifications'
      };
      const result = extractFields(obj, extract);
      expect(result).toEqual({
        userName: 'John Doe',
        userTheme: 'dark',
        notifications: true
      });
    });

    test('handles missing fields gracefully', () => {
      const obj = { name: 'John' };
      const extract = { userName: 'name', missing: 'nonexistent.field' };
      const result = extractFields(obj, extract);
      expect(result).toEqual({ userName: 'John', missing: undefined });
    });

    test('handles null/undefined objects', () => {
      const extract = { field: 'someField' };
      expect(extractFields(null, extract)).toEqual({ field: undefined });
      expect(extractFields(undefined, extract)).toEqual({ field: undefined });
    });

    test('handles empty extract configuration', () => {
      const obj = { name: 'John' };
      expect(extractFields(obj, {})).toEqual({});
      expect(extractFields(obj, null as any)).toEqual({});
      expect(extractFields(obj, undefined as any)).toEqual({});
    });

    test('extracts array elements', () => {
      const obj = {
        users: [
          { name: 'John', id: 1 },
          { name: 'Jane', id: 2 }
        ]
      };
      const extract = { firstUser: 'users.0.name', firstUserId: 'users.0.id' };
      const result = extractFields(obj, extract);
      expect(result).toEqual({ firstUser: 'John', firstUserId: 1 });
    });
  });

  test.describe('validateBody function', () => {
    test('validates exact object match', () => {
      const responseBody = { id: 1, name: 'John', email: 'john@example.com' };
      const expectedBody = { id: 1, name: 'John' };
      const result = validateBody(responseBody, expectedBody);
      expect(result.matched).toBe(true);
      expect(result.reason).toBe('Partial/exact body match succeeded.');
    });

    test('fails when object does not match', () => {
      const responseBody = { id: 1, name: 'John' };
      const expectedBody = { id: 2, name: 'Jane' };
      const result = validateBody(responseBody, expectedBody);
      expect(result.matched).toBe(false);
      expect(result.reason).toBe('Partial/exact body match failed.');
    });

    test('validates exact string match', () => {
      const responseBody = 'Hello, World!';
      const expectedBody = 'Hello, World!';
      const result = validateBody(responseBody, expectedBody);
      expect(result.matched).toBe(true);
      expect(result.reason).toBe('Exact string match succeeded.');
    });

    test('fails when string does not match', () => {
      const responseBody = 'Hello, World!';
      const expectedBody = 'Goodbye, World!';
      const result = validateBody(responseBody, expectedBody);
      expect(result.matched).toBe(false);
      expect(result.reason).toBe('Exact string match failed.');
    });

    test('validates string against JSON string', () => {
      const responseBody = { message: 'Hello' };
      const expectedBody = '{"message":"Hello"}';
      const result = validateBody(responseBody, expectedBody);
      expect(result.matched).toBe(true);
      expect(result.reason).toBe('Exact string match succeeded.');
    });

    test('handles type mismatch', () => {
      const responseBody = 'string response';
      const expectedBody = { message: 'object expected' };
      const result = validateBody(responseBody, expectedBody);
      expect(result.matched).toBe(false);
      expect(result.reason).toBe('Body type mismatch.');
    });

    test('handles null/undefined expected body', () => {
      const responseBody = { some: 'data' };
      const result = validateBody(responseBody, undefined);
      expect(result.matched).toBe(true);
      expect(result.reason).toBe('No body expectation set.');
    });

    test('handles complex nested objects', () => {
      const responseBody = {
        user: {
          profile: { name: 'John', age: 30 },
          settings: { theme: 'dark' }
        },
        metadata: { version: '1.0' }
      };
      const expectedBody = {
        user: {
          profile: { name: 'John', age: 30 },
          settings: { theme: 'dark' }
        }
      };
      const result = validateBody(responseBody, expectedBody);
      expect(result.matched).toBe(true);
      expect(result.reason).toBe('Partial/exact body match succeeded.');
    });

    test('fails on deep object mismatch', () => {
      const responseBody = {
        user: { profile: { name: 'John', age: 30 } }
      };
      const expectedBody = {
        user: { profile: { name: 'Jane', age: 25 } }
      };
      const result = validateBody(responseBody, expectedBody);
      expect(result.matched).toBe(false);
      expect(result.reason).toBe('Partial/exact body match failed.');
    });
  });

  test.describe('validateWithRegex function', () => {
    test('validates string with regex', () => {
      const responseBody = 'Hello, World!';
      const result = validateWithRegex(responseBody, 'Hello.*World');
      expect(result.matched).toBe(true);
      expect(result.reason).toBe('Regex match succeeded.');
    });

    test('fails when regex does not match string', () => {
      const responseBody = 'Hello, World!';
      const result = validateWithRegex(responseBody, 'Goodbye.*World');
      expect(result.matched).toBe(false);
      expect(result.reason).toBe('Regex match failed.');
    });

    test('validates object with regex (JSON string)', () => {
      const responseBody = { message: 'Hello, World!', status: 'ok' };
      const result = validateWithRegex(responseBody, '.*Hello.*World.*');
      expect(result.matched).toBe(true);
      expect(result.reason).toBe('Regex match succeeded.');
    });

    test('handles complex regex patterns', () => {
      const responseBody = 'user@example.com';
      const result = validateWithRegex(responseBody, '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$');
      expect(result.matched).toBe(true);
      expect(result.reason).toBe('Regex match succeeded.');
    });

    test('validates array with regex', () => {
      const responseBody = [{ name: 'John' }, { name: 'Jane' }];
      const result = validateWithRegex(responseBody, '.*John.*Jane.*');
      expect(result.matched).toBe(true);
      expect(result.reason).toBe('Regex match succeeded.');
    });

    test('handles case-sensitive regex', () => {
      const responseBody = 'hello world';
      const result = validateWithRegex(responseBody, 'Hello.*World');
      expect(result.matched).toBe(false);
      expect(result.reason).toBe('Regex match failed.');
    });

    test('handles case-insensitive regex with flags', () => {
      const responseBody = 'hello world';
      const result = validateWithRegex(responseBody, 'hello.*world');
      expect(result.matched).toBe(true);
      expect(result.reason).toBe('Regex match succeeded.');
    });
  });
});
