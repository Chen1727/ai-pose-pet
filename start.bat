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

if not exist "node_modules\express\package.json" goto :install_deps
if not exist "node_modules\rolldown\package.json" goto :install_deps

:after_deps
if not exist ".env" (
  if not exist ".env.example" goto :missing_env_example
  copy /y ".env.example" ".env" >nul
  echo.
  echo A .env file was created. Edit it before starting the API:
  echo   ADMIN_PASSWORD=your-admin-password
  echo   SESSION_SECRET=at-least-32-random-characters
  echo.
  notepad ".env"
)

findstr /B /C:"ADMIN_PASSWORD=replace-with-a-long-random-password" ".env" >nul
if not errorlevel 1 goto :config_incomplete
findstr /B /C:"SESSION_SECRET=replace-with-at-least-32-random-characters" ".env" >nul
if not errorlevel 1 goto :config_incomplete

echo Starting API on port 3000...
start "Paw Archive API" /D "%~dp0" "%ComSpec%" /k "call pnpm api"

echo Starting web app on port 5173...
start "Paw Archive Web" /D "%~dp0" "%ComSpec%" /k "call pnpm dev"

timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"
echo.
echo Web app: http://localhost:5173
echo Keep the two new command windows open.
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

:config_incomplete
echo ERROR: Edit .env and replace the example password and secret, then run start.bat again.
pause
exit /b 1

:install_failed
echo ERROR: dependency installation failed.
pause
exit /b 1

:missing_env_example
echo ERROR: .env.example was not found.
pause
exit /b 1
