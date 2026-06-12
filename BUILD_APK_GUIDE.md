# Building FinanceBook Android APK - Complete Guide

## Overview
This guide provides step-by-step instructions for building a FinanceBook Android APK from source code.

---

## Option 1: Using EAS Build (Recommended - Easiest)

### Prerequisites
- Expo Account (free at https://expo.dev)
- EAS CLI installed (`npm install -g eas-cli`)
- Git configured

### Steps

1. **Login to EAS**
   ```bash
   eas login
   ```
   - Use your Expo account credentials
   - Authorize the CLI access

2. **Build Android APK**
   ```bash
   eas build -p android -e preview
   ```
   - `-p android` = build for Android platform
   - `-e preview` = use preview build profile (APK format)
   - This uploads code to Expo servers and builds remotely

3. **Wait for Build**
   - Build typically completes in 10-30 minutes
   - You'll receive a link to the APK

4. **Download APK**
   - Open the build link
   - Download the APK file
   - Install on Android device via `adb install filename.apk`

### Advantages
- ✅ No local setup required
- ✅ Builds on Expo servers
- ✅ Consistent, reliable builds
- ✅ Works on any computer

### Disadvantages
- ❌ Requires Expo account
- ❌ Build time can be slow
- ⚠️ Requires internet connection

---

## Option 2: Local Build with Gradle & Android SDK

### Prerequisites
1. **Android Studio** (https://developer.android.com/studio)
   - Install Android SDK (API 31+)
   - Install Android SDK Build Tools
   - Install NDK (Native Development Kit)

2. **Java Development Kit (JDK)**
   - JDK 11 or newer
   - Set JAVA_HOME environment variable

3. **Expo Prebuild Tools**
   ```bash
   npm install -g expo-cli
   ```

### Steps

1. **Generate Native Android Project**
   ```bash
   cd /home/user/sme-financial-mobile-app
   expo prebuild --clean
   ```
   - This generates the `android/` directory
   - Converts React Native code to native Android code

2. **Build APK with Gradle**
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
   - Takes 5-15 minutes depending on machine
   - Creates APK in `app/build/outputs/apk/release/app-release.apk`

3. **Sign APK (Required for Production)**
   ```bash
   jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 \
     -keystore my-release-key.keystore \
     app/build/outputs/apk/release/app-release.apk \
     alias_name
   ```

4. **Install on Device**
   ```bash
   adb install -r app/build/outputs/apk/release/app-release.apk
   ```

### Advantages
- ✅ Full control over build process
- ✅ No cloud service needed
- ✅ Builds locally on your machine
- ✅ Can customize build process

### Disadvantages
- ❌ Requires Android SDK setup
- ❌ Takes significant disk space (5-10GB)
- ❌ Build time slower on first build (30-60 min)
- ⚠️ Complex to troubleshoot

---

## Option 3: Using Turtle CLI (Offline Option)

### Prerequisites
- Turtle CLI installed
- Android SDK configured
- Java 11+

### Steps

1. **Install Turtle CLI**
   ```bash
   npm install -g turtle-cli
   ```

2. **Build Offline**
   ```bash
   turtle build:android \
     --username YOUR_EXPO_USERNAME \
     --password YOUR_EXPO_PASSWORD \
     --mode release
   ```
   - Works without EAS servers
   - Useful for CI/CD environments

### Note
- This is an older approach
- EAS Build (Option 1) is now recommended

---

## Option 4: Docker Build (Consistent Environment)

### Prerequisites
- Docker installed
- Sufficient disk space (10GB+)

### Steps

1. **Create Dockerfile**
   ```dockerfile
   FROM ubuntu:22.04

   # Install dependencies
   RUN apt-get update && apt-get install -y \
       openjdk-11-jdk \
       android-sdk \
       nodejs npm \
       git

   # Set Android SDK path
   ENV ANDROID_SDK_ROOT=/opt/android-sdk
   ENV ANDROID_HOME=$ANDROID_SDK_ROOT
   ENV PATH=$PATH:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin

   WORKDIR /app
   COPY . .

   # Build
   RUN npm install
   RUN expo prebuild --clean
   RUN cd android && ./gradlew assembleRelease
   ```

2. **Build Docker Image**
   ```bash
   docker build -t financebook-android-build .
   ```

3. **Run Build in Container**
   ```bash
   docker run -v $(pwd):/app financebook-android-build
   ```

4. **Extract APK**
   ```bash
   # APK will be in app/build/outputs/apk/release/
   ```

### Advantages
- ✅ Consistent build environment
- ✅ Reproducible across machines
- ✅ Clean isolation

### Disadvantages
- ❌ Docker knowledge required
- ❌ Large image size
- ❌ Initial setup complexity

---

## APK Installation Methods

### Method 1: Android Debug Bridge (ADB)

**Prerequisites:**
- ADB installed (comes with Android Studio)
- Android device with USB debugging enabled

**Steps:**
```bash
# List connected devices
adb devices

# Install APK
adb install -r path/to/app.apk

# Launch app
adb shell am start -n com.financebook.sme/.MainActivity
```

### Method 2: Direct File Transfer

1. Connect Android device via USB
2. Mount as file storage
3. Copy APK to device
4. Use file manager app to tap APK
5. Tap "Install" in the system dialog

### Method 3: Android Emulator

```bash
# List emulators
emulator -list-avds

# Start emulator
emulator -avd <emulator_name>

# Install APK
adb install -r app.apk
```

### Method 4: Google Play Store (Production)

1. Sign APK with production key
2. Upload to Google Play Console
3. Deploy to beta/production track
4. Users download from Play Store

---

## Troubleshooting

### Build Fails with "Gradle not found"
```bash
# Solution: Use gradle wrapper
cd android
chmod +x gradlew
./gradlew assembleRelease
```

### Build Fails with "Android SDK not found"
```bash
# Solution: Set ANDROID_SDK_ROOT
export ANDROID_SDK_ROOT=~/Android/Sdk
export ANDROID_HOME=$ANDROID_SDK_ROOT
```

### APK Installation Fails
```bash
# Clear previous installation
adb uninstall com.financebook.sme

# Install fresh
adb install -r app.apk
```

### App Crashes on Launch
```bash
# Check logs
adb logcat | grep FinanceBook

# Clear app data
adb shell pm clear com.financebook.sme
```

---

## Build Profiles Explained

### Development Profile
- **Format:** APK (installable)
- **Optimization:** Debug symbols included
- **Size:** Larger (~50-80MB)
- **Use:** Development, testing
- **Signing:** Auto-signed by Expo
- **Command:** `eas build -p android -e development`

### Preview Profile
- **Format:** APK (installable)
- **Optimization:** Release optimizations
- **Size:** Medium (~30-50MB)
- **Use:** Internal testing, beta
- **Signing:** Auto-signed by Expo
- **Command:** `eas build -p android -e preview`

### Production Profile
- **Format:** App Bundle (for Google Play)
- **Optimization:** Full release
- **Size:** Smaller, optimized per device
- **Use:** Google Play Store distribution
- **Signing:** Must be signed with your key
- **Command:** `eas build -p android -e production`

---

## APK vs App Bundle

### APK (Android Package)
- **Format:** .apk file
- **Installation:** Direct via ADB or file
- **Use:** Testing, beta distribution
- **Size:** Larger (contains all resources)
- **Compatibility:** Single APK for all devices

### App Bundle
- **Format:** .aab file
- **Installation:** Only via Google Play
- **Use:** Google Play Store
- **Size:** Smaller (Google optimizes per device)
- **Compatibility:** Different APKs for different devices

---

## File Locations After Build

### After `eas build -p android -e preview`
```
~/Downloads/
├── FinanceBook-preview.apk
└── (build logs)
```

### After Local Gradle Build
```
./android/app/build/outputs/apk/
├── release/
│   └── app-release.apk
└── debug/
    └── app-debug.apk
```

---

## Next Steps After APK Build

1. **Install on Device**
   ```bash
   adb install -r FinanceBook-preview.apk
   ```

2. **Test on Android**
   - See APK_TESTING_GUIDE.md for full testing scenarios
   - Test registration, dashboard, Growth Intelligence
   - Verify all features work

3. **Distribute for Testing**
   - Share APK link with testers
   - Collect feedback via APK_TESTING_GUIDE.md
   - Document issues

4. **Deploy to Google Play**
   - Create Google Play Developer account
   - Upload production app bundle
   - Configure store listing
   - Submit for review

---

## Security Considerations

### APK Security
- ⚠️ Always sign APKs before distribution
- ⚠️ Keep signing key secure and backed up
- ⚠️ Use different keys for dev/prod
- ⚠️ Never commit signing keys to git

### Production Release
1. Generate secure signing key:
   ```bash
   keytool -genkey -v -keystore financebook-release.keystore \
     -keyalg RSA -keysize 2048 -validity 10000 \
     -alias release
   ```

2. Store key safely:
   - Backup to secure location
   - Never share publicly
   - Add to `.gitignore`

3. Sign release APK:
   ```bash
   jarsigner -verbose -sigalg SHA256withRSA \
     -digestalg SHA256 \
     -keystore financebook-release.keystore \
     app.apk release
   ```

---

## Performance Optimization

### Reduce APK Size
```bash
# In android/app/build.gradle
android {
    bundle {
        density.enableSplit = true
        abi.enableSplit = true
        language.enableSplit = true
    }
}
```

### Faster Builds (Development)
```bash
# Use debug build instead of release
./gradlew assembleDebug

# Smaller, faster, unoptimized (good for testing)
```

---

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Build APK

on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: eas build -p android --non-interactive
```

---

## Support & Resources

- **Expo Docs:** https://docs.expo.dev/
- **EAS Build Docs:** https://docs.expo.dev/build/setup/
- **React Native Android:** https://reactnative.dev/docs/android-setup
- **Gradle Docs:** https://gradle.org/
- **Android Studio Docs:** https://developer.android.com/studio/

---

## Summary Table

| Method | Ease | Speed | Control | Cost | Recommended |
|--------|------|-------|---------|------|-------------|
| EAS Build | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | Free | ✅ YES |
| Local Gradle | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Free | For advanced |
| Turtle CLI | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | Free | Legacy |
| Docker | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | Free | For CI/CD |

**Recommendation:** Use **EAS Build** for easiest setup and most reliable results.

---

Ready to build! Choose your method above and follow the steps. 🚀
