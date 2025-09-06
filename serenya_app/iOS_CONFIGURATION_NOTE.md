# iOS Configuration Note - Task 06

## Required iOS Info.plist Configuration

When iOS platform files are generated (during first iOS build), add the following to `ios/Runner/Info.plist`:

```xml
<key>NSFaceIDUsageDescription</key>
<string>Access your secure medical data using Face ID</string>
```

This enables biometric authentication (Face ID) on iOS devices for secure access to encrypted medical data.

## Status
- ✅ Android biometric permissions added to AndroidManifest.xml
- ⏳ iOS configuration pending platform file generation
- ✅ Field-level encryption integration completed