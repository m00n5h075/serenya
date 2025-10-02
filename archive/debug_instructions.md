# Real Device Debug Instructions

## Option 1: In-App Debug Panel (Easiest)
1. Install the updated APK on the real device
2. When the user gets stuck in onboarding (can't sign up), look for the 🐛 bug icon in the top-right corner
3. Tap the bug icon to open Debug Panel
4. Tap "Share All Logs" or "Share Recent" 
5. Send logs via email/messaging

## Option 2: ADB Logcat (If USB debugging available)
```bash
# Connect device via USB, enable Developer Options + USB Debugging
adb devices

# Filter for relevant logs
adb logcat | grep -E "(AUTH|NETWORK|ERROR|flutter)"

# Or save to file
adb logcat > device_logs.txt
```

## Option 3: Flutter Debug Mode (If build tools available)
```bash
# Get device ID
flutter devices

# Run in debug mode on real device
flutter run -d <device-id> --verbose
```

## What to Look For in Logs:

**Success Pattern (like emulator):**
- `AUTH: Starting Google authentication...`
- `AUTH: Google OAuth completed for user: apvpitatest@gmail.com`
- `NETWORK: Making POST request to: https://qsyo1tsjrb...`
- `NETWORK: SUCCESS: Got response with status: 200`

**Failure Patterns:**
- `ERROR: NETWORK FAILURE: DioException [type]`
- Missing network request logs (request never starts)
- SSL/Certificate errors
- Timeout errors

The logs will show exactly where the authentication fails on the real device.