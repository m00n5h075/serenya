# 🚀 Serenya App Store Deployment Guide

## 📋 Current Status: **READY FOR SETUP**

The technical foundation is now in place. Follow these steps to deploy to app stores.

---

## **STEP 1: Developer Account Setup**

### **Google Play Store** (Required - Do This First)
```bash
# 1. Go to: https://play.google.com/console
# 2. Sign up for Google Play Developer account ($25 one-time fee)
# 3. Complete identity verification (1-3 days processing)
# 4. Accept Developer Distribution Agreement
```

### **Apple App Store** (Required - Do This First) 
```bash
# 1. Go to: https://developer.apple.com/programs/
# 2. Enroll in Apple Developer Program ($99/year)
# 3. Complete enrollment verification (1-2 days processing)
# 4. Accept Apple Developer Program License Agreement
```

---

## **STEP 2: Generate Android Release Keystore**

```bash
# Navigate to the serenya_app directory
cd /Users/m00n5h075ai/development/serenya/serenya_app

# Run the keystore generation script
./scripts/generate-android-keystore.sh

# Follow the prompts to create your keystore
# REMEMBER: Save the passwords you choose - you'll need them!
```

### **Configure Signing**
```bash
# 1. Copy the template
cp android/key.properties.template android/key.properties

# 2. Edit android/key.properties with your actual passwords:
# storePassword=YOUR_ACTUAL_KEYSTORE_PASSWORD
# keyPassword=YOUR_ACTUAL_KEY_PASSWORD
# keyAlias=serenya-release-key
# storeFile=../keystore/serenya-release-keystore.jks
```

---

## **STEP 3: Build Release Versions**

### **Android Release Build (APK/AAB)**
```bash
# Build App Bundle (recommended for Google Play)
flutter build appbundle --release

# Or build APK (alternative)
flutter build apk --release

# Files will be created in:
# build/app/outputs/bundle/release/app-release.aab
# build/app/outputs/flutter-apk/app-release.apk
```

### **iOS Release Build** 
```bash
# Build iOS release (requires macOS and Xcode)
flutter build ios --release

# Then in Xcode:
# 1. Open ios/Runner.xcworkspace
# 2. Archive the app (Product > Archive)
# 3. Distribute to App Store Connect
```

---

## **STEP 4: Prepare App Store Assets**

### **Required Assets Checklist:**

#### **App Icon (Required for Both Stores)**
- [ ] **1024x1024 PNG** - High resolution app icon
- [ ] **No alpha channel, no transparency**
- [ ] Clean, recognizable at small sizes

#### **Screenshots (5-8 required per platform)**
- [ ] **iPhone Screenshots:** 1290x2796 (iPhone 14 Pro)
- [ ] **Android Screenshots:** 1080x1920 or 1080x2340
- [ ] Show key features: onboarding, document upload, AI insights, chat, settings

#### **App Store Copy**
- [ ] **App Name:** Serenya - AI Health Assistant
- [ ] **Subtitle/Short Description:** AI-powered health document analysis
- [ ] **Long Description:** (See app-store-preparation.md)
- [ ] **Keywords:** health, AI, medical, HIPAA, privacy, healthcare

---

## **STEP 5: Legal Requirements**

### **Privacy Policy & Terms (CRITICAL)**
```bash
# These must be hosted at public URLs before submission:
# - Privacy Policy URL: https://serenya.com/privacy-policy
# - Terms of Service URL: https://serenya.com/terms-of-service

# The app already integrates these in settings screens ✅
```

### **Medical App Compliance**
- [ ] **HIPAA Compliance Statement** ready
- [ ] **FDA Medical Device Disclaimer** included
- [ ] **No medical advice claims** in app description
- [ ] **Age rating 17+** (Medical content)

---

## **STEP 6: Submit to App Stores**

### **Google Play Store Submission**
```bash
# 1. Upload your app-release.aab to Google Play Console
# 2. Complete store listing information
# 3. Fill out content rating questionnaire
# 4. Set pricing (Free) and distribution (Worldwide)
# 5. Submit for review (typically 1-3 days)
```

### **Apple App Store Submission**
```bash
# 1. Upload build via Xcode or Application Loader
# 2. Complete App Store Connect listing
# 3. Submit for App Store review (typically 1-7 days)
# 4. Respond to any review feedback
```

---

## **STEP 7: Launch Preparation**

### **Pre-Launch Testing**
```bash
# Test release builds on real devices
flutter drive --target=test_driver/app.dart --driver=test_driver/app_test.dart

# Test app store listing preview
# Verify all screenshots and descriptions display correctly
```

### **Launch Day Checklist**
- [ ] **Social Media Announcements** prepared
- [ ] **Website Landing Page** updated
- [ ] **Press Kit** available for download
- [ ] **Customer Support** ready for user questions
- [ ] **Analytics Tracking** configured

---

## **🎯 Timeline Estimate**

| Task | Duration | Dependencies |
|------|----------|--------------|
| Developer Account Setup | 1-3 days | Payment processing |
| Keystore Generation | 30 minutes | - |
| Release Builds | 1-2 hours | Keystore ready |
| Asset Creation | 2-3 days | Design resources |
| Legal Documents | 1-2 days | Legal review |
| App Store Submission | 1 day | All assets ready |
| **Review Process** | **1-7 days** | **Store review teams** |

**Total Time to Launch:** 1-2 weeks from start to app store approval

---

## **🆘 Need Help?**

### **Common Issues & Solutions**

**"Build failed" during release:**
- Check that `key.properties` file exists and has correct passwords
- Verify keystore file path is correct
- Ensure Flutter and Android SDK are up to date

**"App store rejection":**
- Review app store guidelines carefully
- Common issues: missing privacy policy, medical content claims, UI/UX problems
- Respond to reviewer feedback and resubmit

**"Signing certificate issues":**
- Keep keystore file backed up securely
- Never share keystore passwords
- Use same keystore for all future app updates

### **Resources**
- [Flutter Deployment Documentation](https://docs.flutter.dev/deployment)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [App Store Connect Help](https://developer.apple.com/help/app-store-connect)

---

## **🎉 Next Steps**

1. **Set up developer accounts** (starts the verification process)
2. **Generate keystore** (enables Android release builds)
3. **Create app store assets** (icons, screenshots, descriptions)
4. **Build release versions** (test on real devices)
5. **Submit for review** (final step!)

**You're ready to launch Serenya! 🚀**