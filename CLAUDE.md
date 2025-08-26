# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Playwright MCP (Model Context Protocol) server - a TypeScript/Node.js project that provides browser automation capabilities through structured accessibility snapshots. It enables LLMs to interact with web pages without requiring screenshots or vision models.

## Development Commands

**Build:**
- `npm run build` - Build TypeScript to JavaScript in `lib/` directory
- `npm run watch` - Watch mode for main build

**Testing:**
- `npm test` - Run all Playwright tests
- `npm run ctest` - Run Chrome-specific tests only
- `npm run ftest` - Run Firefox-specific tests only  
- `npm run wtest` - Run WebKit-specific tests only

**Linting & Quality:**
- `npm run lint` - Run linter and type checking (includes README update)
- `npm run lint-fix` - Auto-fix linting issues
- `npm run update-readme` - Update README with generated tool documentation

**Development:**
- `npm run clean` - Remove built files from `lib/`

## Architecture

**Core Components:**
- `src/index.ts` - Main entry point providing `createConnection()` API
- `src/server.ts` - MCP server implementation with connection management
- `src/connection.ts` - Creates MCP server with tool handlers and request processing
- `src/tools.ts` - Aggregates all available tools from `src/tools/` directory
- `src/context.ts` - Browser context management and state handling
- `src/browserContextFactory.ts` - Factory for creating browser contexts with different configurations

**Tool System:**
- All browser automation tools are in `src/tools/` directory
- Each tool file exports an array of tool definitions
- Tools are categorized by capability: `core`, `tabs`, `install`, `pdf`, `vision`
- Tool capabilities are filtered based on config to enable/disable features

**Browser Management:**
- Supports multiple browsers: Chrome, Firefox, WebKit, Edge
- Two modes: persistent profile (default) or isolated contexts
- Browser contexts are created through factory pattern for flexibility
- CDP (Chrome DevTools Protocol) support for remote browser connections

**Configuration:**
- `src/config.ts` - Configuration resolution and validation
- Supports both CLI arguments and JSON config files
- Browser launch options, context options, network settings, capabilities

**Transport:**
- Supports both STDIO and HTTP/SSE transports
- STDIO for direct MCP client connections
- HTTP mode for standalone server operation

## Key Files

- `cli.js` - CLI entry point (imports `lib/program.js`)
- `src/program.ts` - Command-line argument parsing and server setup
- `playwright.config.ts` - Test configuration for multiple browser projects
- `tests/fixtures.ts` - Custom Playwright test fixtures for MCP testing

## Extension

The `extension/` directory contains a browser extension for CDP relay functionality, built separately with its own TypeScript config.