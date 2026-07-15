#!/bin/bash

# ============================================================================
# Quad360 Production Deployment Script
# ============================================================================
# This script automates the deployment process for iOS, Android, and Web
# Run: ./deploy.sh [ios|android|web|all]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Quad360 SME Financial - Production Deployment       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo -e "${RED}❌ Error: .env.local not found!${NC}"
    echo "Please create .env.local with production environment variables"
    echo "Copy from .env.example: cp .env.example .env.local"
    exit 1
fi

echo -e "${GREEN}✓ Environment variables loaded${NC}"

# Get deployment target
TARGET=${1:-all}

# Function to deploy iOS
deploy_ios() {
    echo -e "\n${YELLOW}📱 Building iOS app...${NC}"
    
    # Check EAS CLI
    if ! command -v eas &> /dev/null; then
        echo -e "${RED}EAS CLI not found. Installing...${NC}"
        npm install -g eas-cli
    fi
    
    # Build
    echo -e "${YELLOW}Building iOS for production...${NC}"
    eas build --platform ios --type release --non-interactive
    
    echo -e "${GREEN}✓ iOS build complete${NC}"
    echo -e "${YELLOW}Next step: Submit to App Store${NC}"
    echo "Run: eas submit --platform ios --latest"
}

# Function to deploy Android
deploy_android() {
    echo -e "\n${YELLOW}🤖 Building Android app...${NC}"
    
    # Check if google-play-key.json exists
    if [ ! -f google-play-key.json ]; then
        echo -e "${RED}⚠️  google-play-key.json not found${NC}"
        echo "Download from Google Play Console and save as google-play-key.json"
    fi
    
    # Build
    echo -e "${YELLOW}Building Android for production...${NC}"
    eas build --platform android --type release --non-interactive
    
    echo -e "${GREEN}✓ Android build complete${NC}"
    echo -e "${YELLOW}Next step: Submit to Google Play${NC}"
    echo "Run: eas submit --platform android --latest"
}

# Function to deploy Web
deploy_web() {
    echo -e "\n${YELLOW}🌐 Building web version...${NC}"
    
    # Check Vercel CLI
    if ! command -v vercel &> /dev/null; then
        echo -e "${YELLOW}Installing Vercel CLI...${NC}"
        npm install -g vercel
    fi
    
    # Build web
    echo -e "${YELLOW}Creating web build...${NC}"
    expo export --platform web
    
    echo -e "${GREEN}✓ Web build complete${NC}"
    echo -e "${YELLOW}Next step: Deploy to Vercel${NC}"
    echo "Run: vercel --prod"
}

# Main deployment logic
case $TARGET in
    ios)
        deploy_ios
        ;;
    android)
        deploy_android
        ;;
    web)
        deploy_web
        ;;
    all)
        deploy_ios &
        PID_IOS=$!
        
        deploy_android &
        PID_ANDROID=$!
        
        deploy_web &
        PID_WEB=$!
        
        wait $PID_IOS $PID_ANDROID $PID_WEB
        
        echo -e "\n${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║        All builds complete! Ready for submission         ║${NC}"
        echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
        echo -e "\n${YELLOW}Next steps:${NC}"
        echo "1. iOS:     eas submit --platform ios --latest"
        echo "2. Android: eas submit --platform android --latest"
        echo "3. Web:     vercel --prod"
        ;;
    *)
        echo -e "${RED}Unknown target: $TARGET${NC}"
        echo "Usage: ./deploy.sh [ios|android|web|all]"
        exit 1
        ;;
esac

echo -e "\n${GREEN}✓ Deployment script complete${NC}"
