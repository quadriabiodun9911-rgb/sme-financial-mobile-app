#!/bin/bash
set -e

# Build Expo web app into dist/app
npx expo export --platform web --output-dir dist/app

# Copy landing page to dist root
cp landing/index.html dist/index.html

echo "Build complete: landing page at dist/index.html, app at dist/app/"
