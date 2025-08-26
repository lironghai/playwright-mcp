---

## Playwright MCP API Tool Usage in 

This guide shows how to use the API testing tool you added to the Playwright MCP server from , with real-world API endpoints and prompt examples for all HTTP methods and advanced validation.

---

## 1. Tool Overview
- **Tool Name:** `api_request`
- **Description:** Perform an HTTP API request (GET, POST, PUT, PATCH, DELETE, etc.) and validate the response.
- **Config Requirement:** `"api_request"` must be present in your MCP config `capabilities`.

---

## 2. General Prompt Pattern

> **Prompt:**
> "Call the `api_request` tool to make a [METHOD] request to `[URL]` with [optional headers/data]."

You can specify method, headers, data, and expected status/content-type/body.

---

## 3. Basic Example Prompts and Payloads

### A. GET Request (Public API)
**Prompt:**
```
Call the `api_request` tool to make a GET request to `https://jsonplaceholder.typicode.com/posts/1`.
```
**Payload:**
```json
{
  "method": "GET",
  "url": "https://jsonplaceholder.typicode.com/posts/1"
}
```

### B. POST Request (JSON)
**Prompt:**
```
Call the `api_request` tool to make a POST request to `https://jsonplaceholder.typicode.com/posts` with JSON body `{ "title": "foo", "body": "bar", "userId": 1 }`.
```
**Payload:**
```json
{
  "method": "POST",
  "url": "https://jsonplaceholder.typicode.com/posts",
  "headers": { "Content-Type": "application/json" },
  "data": { "title": "foo", "body": "bar", "userId": 1 }
}
```

### C. PUT Request
**Prompt:**
```
Call the `api_request` tool to make a PUT request to `https://jsonplaceholder.typicode.com/posts/1` with JSON body `{ "id": 1, "title": "updated", "body": "baz", "userId": 1 }`.
```
**Payload:**
```json
{
  "method": "PUT",
  "url": "https://jsonplaceholder.typicode.com/posts/1",
  "headers": { "Content-Type": "application/json" },
  "data": { "id": 1, "title": "updated", "body": "baz", "userId": 1 }
}
```

### D. PATCH Request
**Prompt:**
```
Call the `api_request` tool to make a PATCH request to `https://jsonplaceholder.typicode.com/posts/1` with JSON `{ "title": "patched" }`.
```
**Payload:**
```json
{
  "method": "PATCH",
  "url": "https://jsonplaceholder.typicode.com/posts/1",
  "headers": { "Content-Type": "application/json" },
  "data": { "title": "patched" }
}
```

### E. DELETE Request
**Prompt:**
```
Call the `api_request` tool to make a DELETE request to `https://jsonplaceholder.typicode.com/posts/1`.
```
**Payload:**
```json
{
  "method": "DELETE",
  "url": "https://jsonplaceholder.typicode.com/posts/1"
}
```

---

## 4. Advanced: Adding Expectations
You can add `expect` for status, content-type, and advanced body validation:
```json
{
  "method": "GET",
  "url": "https://jsonplaceholder.typicode.com/posts/1",
  "expect": {
    "status": 200,
    "contentType": "application/json"
  }
}
```

---

## 5. Response Body Validation: Example Scenarios

### A. Partial/Exact JSON Body Match
**Prompt:**
```
Call the `api_request` tool to make a GET request to `https://jsonplaceholder.typicode.com/posts/1` and validate that the response contains `"userId": 1` and `"id": 1`.
```
**Payload:**
```json
{
  "method": "GET",
  "url": "https://jsonplaceholder.typicode.com/posts/1",
  "expect": {
    "body": { "userId": 1, "id": 1 }
  }
}
```

### B. Regex Body Match
**Prompt:**
```
Call the `api_request` tool to make a GET request to `https://jsonplaceholder.typicode.com/posts/1` and check if the response contains the word `"sunt"`.
```
**Payload:**
```json
{
  "method": "GET",
  "url": "https://jsonplaceholder.typicode.com/posts/1",
  "expect": {
    "bodyRegex": "sunt"
  }
}
```

### C. Failing Case Example
**Prompt:**
```
Call the `api_request` tool to make a GET request to `https://jsonplaceholder.typicode.com/posts/1` and validate that the response contains `"userId": 999`.
```
**Payload:**
```json
{
  "method": "GET",
  "url": "https://jsonplaceholder.typicode.com/posts/1",
  "expect": {
    "body": { "userId": 999 }
  }
}
```
**Expected:**
- The validation should fail, and the output will include a `bodyValidation` object with `matched: false` and a reason.

---

## 6. Real-World API Examples: Custom Headers & Authentication

### Example 1: Using Custom Headers
**Scenario:** Send a GET request to the [httpbin.org/headers](https://httpbin.org/headers) endpoint with a custom header.

**Prompt:**
```
Call the `api_request` tool to make a GET request to `https://httpbin.org/headers` with custom header `X-Custom-Header: Test`.
```
**Payload:**
```json
{
  "method": "GET",
  "url": "https://httpbin.org/headers",
  "headers": {
    "X-Custom-Header": "Test"
  }
}
```
- **What to expect:** The response will echo your custom header in the response body.

---

### Example 2: Authentication (Bearer Token)
**Scenario:** Access a protected endpoint using Bearer token authentication. We'll use [reqres.in](https://reqres.in/) which simulates a real login and protected resource.

**Step 1: Obtain a Token**

**Prompt:**
```
Call the `api_request` tool to make a POST request to `https://reqres.in/api/login` with JSON `{ "email": "eve.holt@reqres.in", "password": "cityslicka" }`.
```
**Payload:**
```json
{
  "method": "POST",
  "url": "https://reqres.in/api/login",
  "headers": { "Content-Type": "application/json" },
  "data": {
    "email": "eve.holt@reqres.in",
    "password": "cityslicka"
  }
}
```
- **The response will include a `token`.**

**Step 2: Use the Token in an Authenticated Request**

**Prompt:**
```
Call the `api_request` tool to make a GET request to `https://reqres.in/api/users/2` with Bearer token authentication.
```
**Payload:**
```
{
  "method": "GET",
  "url": "https://reqres.in/api/users/2",
  "headers": {
    "Authorization": "Bearer YOUR_TOKEN_HERE"
  }
}
```
- **Replace `YOUR_TOKEN_HERE` with the token received from the login step.**

---

These examples can be copied directly into  prompts or used as templates for your own API testing scenarios.

---

## 7. Using sessionId for API Test Sessions

You can explicitly set a session ID for your API test workflow, or let the tool auto-generate one. This helps you group related API calls for reporting and debugging.

### Example 1: Provide a Custom sessionId

** Prompt Example:**
```
Call the `api_request` tool to make a POST request to `https://jsonplaceholder.typicode.com/posts` with session ID `demo-session-1`.
```
**Payload:**
```json
{
  "sessionId": "demo-session-1",
  "method": "POST",
  "url": "https://jsonplaceholder.typicode.com/posts",
  "headers": { "Content-Type": "application/json" },
  "data": { "title": "foo", "body": "bar", "userId": 1 }
}
```

### Example 2: Use sessionId in Chaining

** Prompt Example:**
```
Call the `api_request` tool to chain a login and authenticated GET using session ID `login-chain-demo`.
```
**Payload:**
```json
{
  "sessionId": "login-chain-demo",
  "chain": [
    {
      "name": "login",
      "method": "POST",
      "url": "https://reqres.in/api/login",
      "headers": { "Content-Type": "application/json" },
      "data": { "email": "eve.holt@reqres.in", "password": "cityslicka" },
      "extract": { "token": "token" }
    },
    {
      "name": "getUser",
      "method": "GET",
      "url": "https://reqres.in/api/users/2",
      "headers": { "Authorization": "Bearer {{login.token}}" }
    }
  ]
}
```

### Example 3: Omit sessionId for Auto-Generated Sessions

** Prompt Example:**
```
Call the `api_request` tool to make a GET request to `https://jsonplaceholder.typicode.com/posts/1` and let the tool auto-generate the session ID.
```
**Payload:**
```json
{
  "method": "GET",
  "url": "https://jsonplaceholder.typicode.com/posts/1"
}
```

The tool result will always include the sessionId used, so you can reference it for later queries or reporting.

---

## 8. Querying API Session Status

You can retrieve the status, logs, and results for any API test session using the `api_session_status` tool and a sessionId.

### Example 1: Query a Known Session

** Prompt Example:**
```
Call the `api_session_status` tool to show the logs and results for session ID `login-chain-demo`.
```
**Payload:**
```json
{
  "sessionId": "login-chain-demo"
}
```

### Example 2: Query an Auto-Generated Session

If you did not provide a sessionId, copy the sessionId from the previous API tool result and use it here.

** Prompt Example:**
```
Call the `api_session_status` tool to show the results for session ID `session-abc123xyz`.
```
**Payload:**
```json
{
  "sessionId": "session-abc123xyz"
}
```

The output will include all requests, responses, validation results, and timestamps for the session.

---

## 9. Generating an HTML Report for a Session

You can generate and retrieve a detailed HTML report for any API test session using the `api_session_report` tool and a sessionId.

### Example 1: Generate a Report for a Known Session

** Prompt Example:**
```
Call the `api_session_report` tool to generate an HTML report for session ID `login-chain-demo`.
```
**Payload:**
```json
{
  "sessionId": "login-chain-demo"
}
```

### Example 2: Generate a Report for an Auto-Generated Session

If you did not provide a sessionId, copy the sessionId from the previous API tool result and use it here.

** Prompt Example:**
```
Call the `api_session_report` tool to generate an HTML report for session ID `session-abc123xyz`.
```
**Payload:**
```json
{
  "sessionId": "session-abc123xyz"
}
```

The output will show the file path to the generated HTML report (e.g., `reports/session-login-chain-demo.html`). Open this file in your browser to view the full report.

---

## 10. API Chaining: Multi-Step Requests & Variable Passing

You can execute a sequence of API requests where outputs from one step can be used in subsequent steps. This enables scenarios like login and token usage, resource creation and retrieval, etc.

### Input Schema for Chaining

** Prompt Example:**
```
Call the `api_request` tool to execute a chain of two API requests. First, POST to `https://api.example.com/login` with username and password, extract the token, then GET `https://api.example.com/data` using `Bearer {{step1.token}}` in the Authorization header.
```
```json
{
  "chain": [
    {
      "name": "step1",
      "method": "POST",
      "url": "https://api.example.com/login",
      "headers": { "Content-Type": "application/json" },
      "data": { "username": "user", "password": "pass" },
      "extract": { "token": "token" }
    },
    {
      "name": "step2",
      "method": "GET",
      "url": "https://api.example.com/data",
      "headers": { "Authorization": "Bearer {{step1.token}}" }
    }
  ]
}
```
- Each step must have a unique `name`.
- Use `extract` to pull fields from the response JSON (dot notation supported).
- Use `{{stepName.field}}` in later steps to reference extracted values.

---

### Real-World Example: Login and Authenticated Request (reqres.in)

** Prompt Example:**
```
Call the `api_request` tool to chain a login to `https://reqres.in/api/login` (extract the token) and then GET `https://reqres.in/api/users/2` with Bearer token from the login step.
```
**Payload:**
```json
{
  "chain": [
    {
      "name": "login",
      "method": "POST",
      "url": "https://reqres.in/api/login",
      "headers": { "Content-Type": "application/json" },
      "data": { "email": "eve.holt@reqres.in", "password": "cityslicka" },
      "extract": { "token": "token" }
    },
    {
      "name": "getUser",
      "method": "GET",
      "url": "https://reqres.in/api/users/2",
      "headers": { "Authorization": "Bearer {{login.token}}" }
    }
  ]
}
```
- The first step logs in and extracts the `token`.
- The second step uses `{{login.token}}` in the Authorization header.
- The tool output will include results for both steps, including extracted variables and validation.

---

### Chaining with Validation

** Prompt Example:**
```
Call the `api_request` tool to chain a login to `https://reqres.in/api/login` (extract the token, expect status 200) and then GET `https://reqres.in/api/users/2` with Bearer token from the login step, expecting status 200 and user id 2 in the body.
```
```json
{
  "chain": [
    {
      "name": "login",
      "method": "POST",
      "url": "https://reqres.in/api/login",
      "headers": { "Content-Type": "application/json" },
      "data": { "email": "eve.holt@reqres.in", "password": "cityslicka" },
      "extract": { "token": "token" },
      "expect": { "status": 200 }
    },
    {
      "name": "getUser",
      "method": "GET",
      "url": "https://reqres.in/api/users/2",
      "headers": { "Authorization": "Bearer {{login.token}}" },
      "expect": { "status": 200, "body": { "data": { "id": 2 } } }
    }
  ]
}
```

---
