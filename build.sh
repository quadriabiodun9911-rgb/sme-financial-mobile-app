#!/bin/bash
set -e

# Build Expo web app into dist/ (root — keeps all asset paths correct)
npx expo export --platform web --output-dir dist

# Copy landing page as a separate file
cp landing/index.html dist/landing.html

echo "Build complete: app at /, landing page at /landing"
