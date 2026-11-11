@echo off
setlocal
title Paw Archive - Start

cd /d "%~dp0"

set "CODEX_RUNTIME=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies"
if exist "%CODEX_RUNTIME%\node\bin\node.exe" set "PATH=%CODEX_RUNTIME%\node\bin;%PATH%"
if exist "%CODEX_RUNTIME%\bin\fallback\pnpm.cmd" set "PATH=%CODEX_RUNTIME%\bin\fallback;%PATH%"

where pnpm >nul 2>nul
if errorlevel 1 goto :missing_pnpm
where node >nul 2>nul
if errorlevel 1 goto :missing_node

if not exist "node_modules\rolldown\package.json" goto :install_deps

:after_deps
echo Starting web app on port 5173...
start "Paw Archive Web" /D "%~dp0" "%ComSpec%" /k "call pnpm dev"

timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"
echo.
echo Web app: http://localhost:5173
echo Keep the new command window open.
pause
exit /b 0

:missing_pnpm
echo ERROR: pnpm was not found. Install Node.js and pnpm first.
pause
exit /b 1
:install_deps
echo Installing dependencies...
call pnpm install --force --config.node-linker=hoisted
if errorlevel 1 goto :install_failed
goto :after_deps

:missing_node
echo ERROR: Node.js was not found. Install a current Node.js version first.
pause
exit /b 1

:install_failed
echo ERROR: dependency installation failed.
pause
exit /b 1
