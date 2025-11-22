@echo off
echo ============================================
echo Infinite Canvas - Installation Helper
echo ============================================
echo.
echo Checking for Node.js installation...
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is NOT installed on your system.
    echo.
    echo Please install Node.js first:
    echo 1. Download from: https://nodejs.org/
    echo 2. Choose the LTS version
    echo 3. Run the installer with default settings
    echo 4. Restart this script after installation
    echo.
    echo Press any key to open the Node.js download page...
    pause >nul
    start https://nodejs.org/
    exit
)

echo Node.js is installed!
node --version
npm --version
echo.

echo Installing dependencies...
npm install

if %errorlevel% neq 0 (
    echo Failed to install dependencies
    pause
    exit
)

echo.
echo ============================================
echo Installation complete!
echo ============================================
echo.
echo Starting the Infinite Canvas server...
echo Server will run on: http://localhost:8080
echo.
echo Press Ctrl+C to stop the server
echo ============================================
echo.

npm start
