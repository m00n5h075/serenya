# Serenya Flutter App

Basic Flutter app with Google OAuth2 authentication and blank home screen.

## Features

- Google Sign-In authentication
- Secure token storage
- Blank home screen after login
- Privacy-first messaging

## Setup Required

### 1. Flutter SDK Installation
```bash
# Install Flutter SDK
flutter doctor
```

### 2. Google OAuth2 Configuration
1. Create project in Google Cloud Console
2. Enable Google Sign-In API
3. Add OAuth2 credentials
4. Download `google-services.json` to `android/app/`
5. Update `GoogleService-Info.plist` for iOS

### 3. API Backend
Update `lib/services/auth_service.dart`:
```dart
static const String _baseUrl = 'YOUR_API_URL_HERE';
```

### 4. Android Configuration
The app includes basic Android configuration. For production:
- Add proper app signing
- Configure ProGuard
- Add release build configuration

## Project Structure

```
lib/
├── main.dart              # App entry point
├── screens/
│   ├── login_screen.dart  # Google OAuth login
│   └── home_screen.dart   # Blank screen after login
├── services/
│   └── auth_service.dart  # Authentication logic
└── models/
    └── user.dart          # User data model
```

## Dependencies

- `google_sign_in`: Google OAuth2 authentication
- `flutter_secure_storage`: Secure JWT token storage
- `http`: API communication

## Development

```bash
# Get dependencies
flutter pub get

# Run on device/simulator
flutter run

# Build for production
flutter build apk --release
```

## Next Steps

1. Set up Google OAuth2 credentials
2. Implement backend API endpoints
3. Add health document processing features
4. Implement SQLite encryption for local storage
5. Add timeline navigation and AI interpretation display