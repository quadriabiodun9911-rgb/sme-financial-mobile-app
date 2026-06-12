@echo off
REM FinanceBook Deployment Script for Windows
REM Builds both web and Android versions with one command

setlocal enabledelayedexpansion

echo.
echo 🚀 FinanceBook Multi-Platform Build Script
echo ==========================================
echo.

REM Check if package.json exists
if not exist "package.json" (
    echo ❌ Error: package.json not found. Run this from the app root directory.
    exit /b 1
)

REM Parse arguments
set BUILD_WEB=yes
set BUILD_APK=yes
set DEPLOY_VERCEL=no

if not "%1"=="" set BUILD_WEB=%1
if not "%2"=="" set BUILD_APK=%2
if not "%3"=="" set DEPLOY_VERCEL=%3

echo Configuration:
echo   Build Web: %BUILD_WEB%
echo   Build APK: %BUILD_APK%
echo   Deploy to Vercel: %DEPLOY_VERCEL%
echo.

REM ==================== WEB BUILD ====================
if "%BUILD_WEB%"=="yes" (
    echo [1/4] Building Web Version...

    echo   📦 Exporting for web...
    call npx expo export --platform web

    if exist "dist\" (
        echo   ✅ Web build successful!
        echo   📁 Output: dist\
        set WEB_BUILD_SUCCESS=1
    ) else (
        echo   ⚠️  Web build directory not found
        set WEB_BUILD_SUCCESS=0
    )
    echo.
)

REM ==================== VERCEL DEPLOY ====================
if "%DEPLOY_VERCEL%"=="yes" if "%WEB_BUILD_SUCCESS%"=="1" (
    echo [2/4] Deploying to Vercel...

    echo   🌐 Uploading to Vercel...
    call vercel --prod

    echo   ✅ Vercel deployment complete!
    echo   🔗 Visit https://vercel.com/dashboard to see your deployment
    echo.
)

REM ==================== ANDROID BUILD ====================
if "%BUILD_APK%"=="yes" (
    echo [3/4] Building Android APK...

    echo   🔐 Checking Expo login...
    call eas whoami >nul 2>&1
    if errorlevel 1 (
        echo   ⚠️  Not logged in to Expo. Logging in...
        call eas login
    )

    echo   📱 Building APK (this takes 3-5 minutes)...
    call eas build --platform android --local

    echo   ✅ APK build complete!
    echo   📥 Check your Downloads folder for app-*.apk
    echo.
)

REM ==================== SUMMARY ====================
echo.
echo ✅ Build Complete!
echo.

if "%WEB_BUILD_SUCCESS%"=="1" (
    echo 📱 Web Version:
    echo    Local test: npm run web
    if "%DEPLOY_VERCEL%"=="yes" (
        echo    Live URL: Check Vercel dashboard
    )
    echo.
)

if "%BUILD_APK%"=="yes" (
    echo 📲 Android APK:
    echo    Find APK in: Downloads or check terminal output
    echo    Install: adb install -r app-*.apk
    echo.
)

echo 📋 Next Steps:
echo    1. Test both versions locally
echo    2. Share URLs/APK with beta testers
echo    3. Collect feedback
echo    4. Iterate and redeploy
echo.

echo Need help? See BUILD_WEB_AND_APK.md for detailed instructions.
echo.

endlocal
