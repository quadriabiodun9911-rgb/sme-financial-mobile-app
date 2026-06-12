#!/bin/bash

# FinanceBook Deployment Script
# Builds both web and Android versions with one command

set -e  # Exit on error

echo "🚀 FinanceBook Multi-Platform Build Script"
echo "=========================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running from correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Run this from the app root directory."
    exit 1
fi

# Parse arguments
BUILD_WEB=${1:-"yes"}
BUILD_APK=${2:-"yes"}
DEPLOY_VERCEL=${3:-"no"}

echo ""
echo -e "${BLUE}Configuration:${NC}"
echo "  Build Web: $BUILD_WEB"
echo "  Build APK: $BUILD_APK"
echo "  Deploy to Vercel: $DEPLOY_VERCEL"
echo ""

# ==================== WEB BUILD ====================
if [ "$BUILD_WEB" = "yes" ]; then
    echo -e "${BLUE}[1/4] Building Web Version...${NC}"

    # Check if Expo CLI is installed
    if ! command -v expo &> /dev/null; then
        echo "  📦 Installing Expo CLI..."
        npm install -g expo-cli
    fi

    echo "  📦 Exporting for web..."
    npx expo export --platform web

    if [ -d "dist" ]; then
        echo -e "${GREEN}  ✅ Web build successful!${NC}"
        echo "  📁 Output: dist/"
        WEB_BUILD_SUCCESS=1
    else
        echo -e "${YELLOW}  ⚠️  Web build directory not found${NC}"
        WEB_BUILD_SUCCESS=0
    fi
    echo ""
fi

# ==================== VERCEL DEPLOY ====================
if [ "$DEPLOY_VERCEL" = "yes" ] && [ "$WEB_BUILD_SUCCESS" = "1" ]; then
    echo -e "${BLUE}[2/4] Deploying to Vercel...${NC}"

    if ! command -v vercel &> /dev/null; then
        echo "  📦 Installing Vercel CLI..."
        npm install -g vercel
    fi

    echo "  🌐 Uploading to Vercel..."
    vercel --prod

    echo -e "${GREEN}  ✅ Vercel deployment complete!${NC}"
    echo "  🔗 Visit https://vercel.com/dashboard to see your deployment"
    echo ""
fi

# ==================== ANDROID BUILD ====================
if [ "$BUILD_APK" = "yes" ]; then
    echo -e "${BLUE}[3/4] Building Android APK...${NC}"

    # Check if eas-cli is installed
    if ! command -v eas &> /dev/null; then
        echo "  📦 Installing EAS CLI..."
        npm install -g eas-cli
    fi

    # Check if logged in
    echo "  🔐 Checking Expo login..."
    if ! eas whoami &> /dev/null 2>&1; then
        echo "  ⚠️  Not logged in to Expo. Logging in..."
        eas login
    fi

    echo "  📱 Building APK (this takes 3-5 minutes)..."
    eas build --platform android --local

    echo -e "${GREEN}  ✅ APK build complete!${NC}"
    echo "  📥 Check your Downloads folder for app-*.apk"
    echo ""
fi

# ==================== SUMMARY ====================
echo -e "${GREEN}=========================================="
echo "✅ Build Complete!"
echo "==========================================${NC}"
echo ""

if [ "$WEB_BUILD_SUCCESS" = "1" ]; then
    echo -e "${GREEN}📱 Web Version:${NC}"
    echo "   Local test: npm run web"
    if [ "$DEPLOY_VERCEL" = "yes" ]; then
        echo "   Live URL: Check Vercel dashboard"
    fi
    echo ""
fi

if [ "$BUILD_APK" = "yes" ]; then
    echo -e "${GREEN}📲 Android APK:${NC}"
    echo "   Find APK in: dist/ or check terminal output"
    echo "   Install: adb install -r app-*.apk"
    echo ""
fi

echo -e "${YELLOW}📋 Next Steps:${NC}"
echo "   1. Test both versions locally"
echo "   2. Share URLs/APK with beta testers"
echo "   3. Collect feedback"
echo "   4. Iterate and redeploy"
echo ""

echo "Need help? See BUILD_WEB_AND_APK.md for detailed instructions."
