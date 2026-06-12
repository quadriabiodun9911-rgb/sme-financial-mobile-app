# Quick Start: Deploy to Web + Android in 20 Minutes

Copy-paste these commands. That's it.

---

## 🌐 Deploy to Web (5 minutes)

### Step 1: Build
```bash
npx expo export --platform web
```

### Step 2: Deploy (Choose one)

**Vercel (Easiest):**
```bash
npm install -g vercel
vercel --prod
# Opens browser, follow prompts
# You get: https://financebook-xxxx.vercel.app
```

**Or Netlify:**
```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
# You get: https://financebook-xxxx.netlify.app
```

**That's it for web.** Live in 2 minutes. Share the URL.

---

## 📱 Build for Android (5 minutes)

### Step 1: Login (First time only)
```bash
npm install -g eas-cli
eas login
# Create free Expo account
```

### Step 2: Build
```bash
eas build --platform android --local
# Wait 3-5 minutes
# Download link appears in terminal
```

**That's it.** You now have an APK to install on phones.

---

## 🤖 Or Automate Both (10 minutes)

**macOS/Linux:**
```bash
bash scripts/deploy.sh
# Builds web + Android automatically
```

**Windows:**
```bash
scripts\deploy.bat
# Builds web + Android automatically
```

---

## 📊 Testing Both Versions

### Share with Testers:

```
📱 WEB (No install, test right now):
   https://financebook-xxxx.vercel.app
   → Open in phone browser

📲 ANDROID (Native app, works offline):
   → Send them the APK file
   → Instructions: Download, open, tap Install
```

---

## 🎯 What You Have After 20 Minutes

✅ **Web version**
- Live at public URL
- Works on phone, tablet, desktop
- No installation needed
- Instant testing

✅ **Android APK**
- Ready to install on any Android phone
- Works offline
- Native performance
- Ready for Google Play Store

✅ **Both versions**
- Same codebase
- Same data (uses AsyncStorage)
- Can A/B test features

---

## 📋 Checklist

- [ ] Built web: `npx expo export --platform web`
- [ ] Deployed web: `vercel --prod` or `netlify deploy --prod --dir=dist`
- [ ] Got web URL
- [ ] Logged in to Expo: `eas login`
- [ ] Built APK: `eas build --platform android --local`
- [ ] Downloaded APK
- [ ] Tested both versions locally
- [ ] Shared both links/APK with first batch of testers

---

## 🔄 Update Cycle (After First Deployment)

### To Update Web Version:
```bash
# Make code changes
git add .
git commit -m "Feature: add..."
git push

# Redeploy (if using Vercel with git):
# Automatic! Just wait 30 seconds

# Or manual:
npx expo export --platform web
vercel --prod
```

### To Update Android:
```bash
# Make code changes
eas build --platform android --local
# Wait 3-5 minutes
# Download and test APK
```

---

## 🎬 Full Timeline

```
5 min  - Web build + deploy
5 min  - Android APK build
5 min  - Test both locally
5 min  - Share with first batch of testers

= 20 minutes total
```

**You can have both versions tested by real users in under 30 minutes.**

---

## 🆘 Common Issues & Fixes

### "eas command not found"
```bash
npm install -g eas-cli
```

### "Not logged in"
```bash
eas login
```

### "Port already in use"
```bash
npx expo export --platform web  # Don't need port for export
```

### "APK won't install"
```bash
adb uninstall com.sme.financialreporting
adb install -r app-release.apk
```

### "Where's my APK?"
Check terminal output. Vercel and Netlify show download links clearly.

---

## 🚀 Next: Gather Feedback

After deploying:

1. **Send URL/APK to 10 founders**
2. **Ask them to test for 10 minutes**
3. **Collect NPS at Day 30:**
   ```
   "How likely are you to recommend this? (0-10)"
   ```
4. **Iterate based on feedback**
5. **Redeploy to both platforms**

---

## 📞 Full Documentation

- **Detailed web guide:** See `BUILD_WEB_AND_APK.md`
- **Detailed APK guide:** See `BUILD_APK.md`
- **Problem-solution map:** See `PROBLEM_SOLUTIONS_MAP.md`
- **Testing strategy:** See the section in `BUILD_WEB_AND_APK.md`

---

## TL;DR

```bash
# Web
npx expo export --platform web && vercel --prod

# Android
eas login && eas build --platform android --local

# Both (automatic)
bash scripts/deploy.sh  # macOS/Linux
# or
scripts\deploy.bat     # Windows
```

**Share both links with testers. Done.**
