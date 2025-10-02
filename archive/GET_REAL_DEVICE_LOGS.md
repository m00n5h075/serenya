# How to Get Real Device Logs

The enhanced auth logging in `auth_service.dart` has been added. The build is failing due to unrelated dependency issues, but we can still get the critical debugging information.

## Method 1: ADB Logcat (Recommended)

1. **Enable Developer Options** on the real Android device:
   - Go to Settings > About Phone
   - Tap "Build Number" 7 times
   - Go back to Settings > Developer Options
   - Enable "USB Debugging"

2. **Connect device via USB** and run:
```bash
adb devices
# Should show your device

# Get logs filtered for Flutter/auth
adb logcat | grep -E "(AUTH_DEBUG|DioException|flutter)"

# Or save to file
adb logcat > device_logs.txt
```

3. **Have user attempt sign-up** with `apvpitatest@gmail.com`

4. **Look for these patterns in logs:**

**Success (like emulator):**
```
AUTH_DEBUG: Starting Google authentication...
AUTH_DEBUG: Google authentication completed for user: apvpitatest@gmail.com  
AUTH_DEBUG: About to make network request to https://qsyo1tsjrb...
AUTH_DEBUG: Got response with status: 200
```

**Failure (what we expect to see):**
```
AUTH_DEBUG: Starting Google authentication...
AUTH_DEBUG: Google authentication completed for user: apvpitatest@gmail.com
AUTH_DEBUG: About to make network request to https://qsyo1tsjrb...
DioException caught: [CONNECTION_ERROR/CERTIFICATE_ERROR/TIMEOUT/etc]
```

## Method 2: Build Fix (If you want to fix the build)

The build is failing due to missing Flutter Material imports in multiple files. To fix:

1. Add `import 'package:flutter/material.dart';` to files with Color/FontWeight errors
2. Run `flutter clean && flutter pub get`
3. Try build again

## What We Need

Just run ADB logcat while the user tries to sign up. The auth service already has the detailed logging we need to see exactly where the network request fails on real devices.

The key question: **Does the POST request to `/auth/oauth-onboarding` even get made on the real device?**