#!/bin/bash
set -e

# Build Expo web app into dist/ (root — keeps all asset paths correct)
npx expo export --platform web --output-dir dist

# Copy landing and legal pages
cp landing/index.html dist/landing.html
cp landing/privacy.html dist/privacy.html

echo "Build complete: app at /, landing at /landing, privacy at /privacy"
