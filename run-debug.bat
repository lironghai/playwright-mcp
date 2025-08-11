@echo off
echo Starting MCP Server in debug mode...
echo.
echo 1. Open IDEA
echo 2. Set breakpoints in your TypeScript files
echo 3. Configure Remote Debug: localhost:9229
echo 4. Click debug button to attach
echo.
echo Server starting in 3 seconds...
timeout /t 3 /nobreak > nul
node --inspect-brk=0.0.0.0:9229 debug-server.js --port=8931