@echo off
setlocal

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: node was not found on PATH.
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm was not found on PATH.
    exit /b 1
)

cd /d "%~dp0..\frontend"
echo Node version:
node --version
echo npm version:
npm --version
echo Installing dependencies...
call npm install
echo Exit code: %errorlevel%
