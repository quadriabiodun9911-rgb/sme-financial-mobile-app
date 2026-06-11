# Building an Android APK for FinanceBook

This guide covers building a production-ready Android APK for testing and distribution.

---

## 🚀 Quick Start: Build APK in 5 Minutes (EAS Build)

**Best for:** Fastest, no local setup, works on any machine

### Step 1: Log in to Expo (First time only)
```bash
eas login
```
Create a free [Expo account](https://expo.dev) if you don't have one.

### Step 2: Build the APK
```bash
cd /path/to/sme-financial-mobile-app
eas build --platform android --local
```

This builds locally and takes ~3-5 minutes. The APK downloads automatically.

### Step 3: Install on Device
```bash
# Transfer APK to your Android phone, or:
adb install -r app-*.apk
```

---

## 🔧 Complete Build Options

### Option A: EAS Build (Cloud, Recommended for Testing)

**Advantages:**
- ✅ No local Android SDK needed
- ✅ Works on Mac/Windows/Linux
- ✅ Automatic code signing
- ✅ 3-5 minute build time

**Steps:**

1. **Install EAS CLI** (if not already installed):
```bash
npm install -g eas-cli
```

2. **Log in**:
```bash
eas login
# Creates free account automatically
```

3. **Build preview APK** (for testing):
```bash
eas build --platform android --local
# Or without --local for cloud build:
eas build --platform android
```

4. **Find your APK**:
```bash
# Look in the console output for download link
# Or check: ~/.eas/cache/builds/
```

---

### Option B: Local Build with Android Studio (Fastest for Development)

**Advantages:**
- ✅ Instant feedback
- ✅ No cloud dependency
- ✅ Full control over build

**Prerequisites:**

1. **Install Android Studio**: https://developer.android.com/studio
   - Includes Android SDK, emulator, and build tools

2. **Verify Java/JDK**:
```bash
java -version
# Should show Java 11+
```

3. **Set ANDROID_HOME** (macOS/Linux):
```bash
# Add to ~/.zshrc or ~/.bash_profile
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

4. **Verify Android SDK**:
```bash
sdkmanager --list
# Should show available SDKs
```

**Build Steps:**

1. **Start Android Emulator** (or connect physical phone):
```bash
# Via Android Studio: Device Manager → Start emulator
# Or via CLI:
emulator -avd Pixel_6_API_33 &
```

2. **Build and run**:
```bash
npm run android
# Or build release APK:
cd android && ./gradlew assembleRelease && cd ..
```

3. **Find your APK**:
```bash
ls android/app/build/outputs/apk/release/app-release.apk
```

---

### Option C: Expo Go (Quickest Testing, No APK)

**Advantages:**
- ✅ No build needed, instant testing
- ✅ Live reload

**Steps:**

1. **Install Expo Go app** on Android phone from Google Play Store

2. **Start dev server**:
```bash
npm start
```

3. **Scan QR code** in terminal with phone camera

**Note:** This is for development only. For distribution, you need a real APK (Option A or B).

---

## 📱 Testing the APK

### On Android Emulator:
```bash
# Start emulator first
adb install -r app-release.apk
# App will install and show in emulator
```

### On Physical Phone (USB):
```bash
# Enable Developer Mode: Settings → About Phone → tap Build Number 7x
# Connect phone to computer
adb devices  # Should show your phone
adb install -r app-release.apk
```

### Via Google Play Store (Coming Later):
```bash
# After successful testing, you can upload to Play Store with:
eas submit --platform android
# (Requires Play Store account and service credentials)
```

---

## 🔍 Troubleshooting

### "eas command not found"
```bash
npm install -g eas-cli
```

### "Not logged in to Expo"
```bash
eas login
```

### "No simulator running" (local build)
- Open Android Studio → Device Manager → Create/Start virtual device
- Or connect physical Android phone via USB

### "Build failed" (local build)
```bash
# Clear cache and rebuild
cd android
./gradlew clean
./gradlew assembleRelease
cd ..
```

### "APK won't install on phone"
- **Reason:** Different architecture (app built for ARM, phone uses x86)
- **Solution:** Use EAS Build (auto-detects) or rebuild locally for your device

### "App crashes on open"
- Check logcat: `adb logcat | grep FinanceBook`
- Verify AsyncStorage permissions in AndroidManifest.xml
- Check that app has Internet permission if using Supabase sync

---

## 📊 APK Build Configuration

Current `eas.json` settings:

```json
"preview": {
  "android": {
    "buildType": "apk"          // Single APK (recommended for testing)
  }
},
"production": {
  "android": {
    "buildType": "app-bundle"   // App Bundle (required for Play Store)
  }
}
```

**For testing:** Use `preview` build (faster)
**For Play Store distribution:** Use `production` build (app-bundle)

---

## 📦 Distribution Options

### 1. **Direct APK Distribution**
```bash
# Share APK file with testers
eas build --platform android --local
# Send the downloaded APK file
```
- ✅ Simple, no account needed
- ❌ Can't auto-update users

### 2. **Google Play Store**
```bash
# Requires Play Developer account ($25 one-time)
eas submit --platform android
```
- ✅ Official, auto-updates, 2.7B users
- ❌ Review process (can take 24 hours)
- ❌ Subscription required

### 3. **Internal Testing Track (Google Play)**
```bash
# Faster review, internal testers only
eas build --platform android --profile production
eas submit --platform android --profile production
```
- ✅ 2-4 hour review, unlimited testers
- ❌ Still requires Play Developer account

### 4. **Expo Updates (Over-the-Air Updates)**
```bash
# Push updates without rebuilding APK
eas update --branch production
```
- ✅ Instant updates to live users
- ❌ Can't update native code/modules

---

## ✅ Testing Checklist

Before releasing to users:

- [ ] App opens without crashing
- [ ] Dashboard loads transactions correctly
- [ ] Quick-add FAB works
- [ ] All tabs navigate properly (Dashboard, Reports, Growth, Invoices, Ledger)
- [ ] Data persists after app close/reopen
- [ ] Forms validate properly (PIN entry, amounts, etc.)
- [ ] Error states show clear messages
- [ ] No TypeScript errors (optional on device, but check)
- [ ] Performance is acceptable (no jank on scroll)
- [ ] Orientation changes work (landscape/portrait)
- [ ] Permissions prompts appear correctly

---

## 🚀 Next Steps

1. **For quick testing:** Use Option A (EAS Build)
2. **For development:** Use Option B (Local Build with Android Studio)
3. **For distribution:** Use Option A + Google Play Store submission
4. **For beta testers:** Build APK, share via TestFlight or direct link

---

## 📞 Support

**Common issues solved:**
- Missing Android SDK: Install Android Studio
- Expo login problems: Run `eas logout` then `eas login`
- Build timeout: Try `eas build --platform android --local` (builds on your machine, not cloud)
- Device not recognized: Enable Developer Mode → USB Debugging on phone

**Useful commands:**
```bash
# Check build status
eas build:list

# Download specific build
eas build:download

# View recent builds
eas build:view --latest
```

---

## Summary

| Task | Command | Time | Notes |
|------|---------|------|-------|
| First build | `eas build --platform android --local` | 5 min | Requires Expo login |
| Rebuild after code change | Same command | 5 min | Re-uploads code only |
| Local dev build | `npm run android` | 3 min | Requires Android Studio + emulator |
| Release APK | `eas build --platform android --profile production` | 5 min | Use for Play Store |
| Test on device | `adb install -r app-release.apk` | 30 sec | After building |
| Over-the-air update | `eas update --branch production` | 1 min | JS/Expo only, no native changes |

**Recommended for first build:** `eas build --platform android --local`
