@echo off
setlocal

echo =========================================
echo  MfgSim Build Script
echo =========================================

set ROOT=%~dp0..
set FRONTEND=%ROOT%\frontend
set BACKEND=%ROOT%\backend
set STATIC=%BACKEND%\app\static
set DIST=%ROOT%\dist

:: --- Step 1: Build React frontend ---
echo.
echo [1/3] Building React frontend...
cd /d "%FRONTEND%"
call npm run build
if errorlevel 1 (
    echo ERROR: Frontend build failed.
    exit /b 1
)

:: --- Step 2: Copy static files into backend ---
echo.
echo [2/3] Copying static files to backend...
if exist "%STATIC%" rmdir /s /q "%STATIC%"
xcopy /E /I /Y "%FRONTEND%\dist" "%STATIC%"
if errorlevel 1 (
    echo ERROR: Failed to copy static files.
    exit /b 1
)

:: --- Step 3: Package with PyInstaller ---
echo.
echo [3/3] Packaging with PyInstaller...
cd /d "%BACKEND%"
python -m PyInstaller mfg_sim.spec ^
    --distpath "%DIST%" ^
    --workpath "%ROOT%\build\pyinstaller_work" ^
    --noconfirm
if errorlevel 1 (
    echo ERROR: PyInstaller failed.
    exit /b 1
)

echo.
echo =========================================
echo  Build complete!
echo  Executable: %DIST%\MfgSim.exe
echo =========================================
