#!/usr/bin/env node
/**
 * Debug server entry point for IDEA debugging
 */

// Enable debug logging
process.env.DEBUG = 'pw:mcp:*';

console.log('🚀 Starting MCP server in debug mode...');
console.log('📍 You can now set breakpoints in IDEA');

// Import the main CLI program
import('./lib/program.js');