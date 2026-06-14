#!/bin/bash
set -e

# Build Expo web app into dist/app
npx expo export --platform web --output-dir dist/app

# Fix asset paths: Expo generates /_expo/... but files live at /app/_expo/...
sed -i 's|src="/_expo/|src="/app/_expo/|g' dist/app/index.html
sed -i 's|href="/_expo/|href="/app/_expo/|g' dist/app/index.html
sed -i 's|href="/favicon.ico"|href="/app/favicon.ico"|g' dist/app/index.html

# Copy landing page to dist root
cp landing/index.html dist/index.html

echo "Build complete: landing page at dist/index.html, app at dist/app/"
