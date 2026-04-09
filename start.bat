@echo off
echo Starting Attendance Register...
echo.

:: Check PostgreSQL is running
sc query postgresql-x64-18 | findstr "RUNNING" >nul 2>&1
if errorlevel 1 (
  echo Starting PostgreSQL...
  net start postgresql-x64-18 >nul 2>&1
  timeout /t 3 /nobreak >nul
)
echo PostgreSQL: Ready

:: Kill anything already on port 3001
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

:: Start backend
start "Attendance Server" cmd /k "cd /d "%~dp0" && node server/index.js"

:: Wait for server to boot
timeout /t 3 /nobreak >nul

:: Start React frontend
start "Attendance Client" cmd /k "cd /d "%~dp0client" && npm start"

echo Both windows are starting up.
echo The app will open at http://localhost:3000 in your browser.
echo.
echo To stop the app, close both black windows.
pause
