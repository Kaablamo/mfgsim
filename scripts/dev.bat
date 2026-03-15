@echo off
setlocal

set "ROOT=%~dp0.."

where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm was not found on PATH.
    exit /b 1
)

where py >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_CMD=py -3"
) else (
    where python >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Python was not found on PATH.
        exit /b 1
    )
    set "PYTHON_CMD=python"
)

echo Starting backend (FastAPI on :8765)...
start "MfgSim Backend" cmd /k "cd /d ""%ROOT%\backend"" && %PYTHON_CMD% -m uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload"

timeout /t 2 /nobreak >nul

echo Starting frontend (Vite dev on :5173)...
start "MfgSim Frontend" cmd /k "cd /d ""%ROOT%\frontend"" && npm run dev"

echo.
echo Backend: http://localhost:8765
echo Frontend: http://localhost:5173
echo.
echo Close both windows to stop.
