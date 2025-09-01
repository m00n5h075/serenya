# Flutter Development Guidelines for Serenya

## Philosophy

### Core Flutter Beliefs
- **Widget composition over complexity** - Small, reusable widgets
- **State management clarity** - Explicit state handling with clear data flow
- **Platform conventions** - Follow Material Design and iOS Human Interface Guidelines
- **Performance first** - Optimize for 60fps, minimize rebuilds
- **Accessibility by default** - Screen reader support, proper semantics

### Mobile-First Principles
- **Touch-friendly design** - 44px minimum touch targets
- **Responsive layouts** - 320px to 1024px width support
- **Battery efficiency** - Minimize background processing
- **Offline capability** - Graceful degradation without network

## Flutter Standards

### 1. Widget Architecture

**Widget Hierarchy:**
```dart
// Good - Clear composition
class WelcomeSlide extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.all(24.0),
          child: Column(
            children: [
              _buildHeader(),
              _buildContent(),
              _buildActions(),
            ],
          ),
        ),
      ),
    );
  }
}
```

**Widget Rules:**
- Single responsibility per widget
- Extract reusable components to separate files
- Use composition over inheritance
- Prefer StatelessWidget when possible
- Keep build methods under 50 lines

### 2. State Management

**Local State (StatefulWidget):**
```dart
// Use for simple, widget-specific state
class LoginScreen extends StatefulWidget {
  @override
  _LoginScreenState createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _isLoading = false;
  // Widget-specific state only
}
```

**App State (Provider/Bloc):**
- User authentication state
- App-wide settings
- Navigation state
- API data caching

### 3. File Organization

**Mandatory Structure:**
```
lib/
├── main.dart                    # App entry point
├── screens/                     # Full-screen widgets
│   ├── onboarding/
│   ├── auth/
│   └── home/
├── widgets/                     # Reusable components
│   ├── buttons/
│   ├── forms/
│   └── common/
├── services/                    # API, auth, storage
├── models/                      # Data models
├── utils/                       # Constants, helpers
└── theme/                       # Colors, typography, styles
```

### 4. Naming Conventions

**Files:** `snake_case.dart`
**Classes:** `PascalCase`
**Variables/Methods:** `camelCase`
**Constants:** `kConstantName` or `SCREAMING_SNAKE_CASE`

**Examples:**
```dart
// Good
class OnboardingFlow extends StatefulWidget
final AuthService _authService
const kPrimaryColor = Colors.blue
static const String API_BASE_URL = 'https://api.serenya.com'
```

### 5. Code Quality Standards

**Every commit must:**
- Pass `flutter analyze` with zero issues
- Pass `flutter test` with all tests green
- Follow `dart format` formatting
- Include meaningful commit message
- Maintain consistent indentation (2 spaces)

**Before committing:**
```bash
flutter analyze
flutter test
dart format .
```

### 6. UI/UX Implementation Rules

**Design System Consistency:**
- Use theme colors and typography consistently
- Follow 8px spacing grid system
- Implement proper loading states and error handling
- Include accessibility semantics

**Responsive Design:**
```dart
// Good - Responsive layout
Widget _buildContent() {
  return LayoutBuilder(
    builder: (context, constraints) {
      if (constraints.maxWidth > 600) {
        return _buildTabletLayout();
      }
      return _buildMobileLayout();
    },
  );
}
```

## Security & Privacy Implementation

### 1. Data Handling

**Local Storage:**
```dart
// Good - Secure storage for sensitive data
final _secureStorage = FlutterSecureStorage();
await _secureStorage.write(key: 'jwt_token', value: token);
```

**API Calls:**
```dart
// Good - Always use HTTPS, include headers
final response = await http.post(
  Uri.parse('$baseUrl/auth/google'),
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer $token',
  },
  body: jsonEncode(data),
);
```

### 2. Privacy Requirements

**Consent Tracking:**
- Log each onboarding slide view with timestamp
- Track user interactions for compliance
- Implement proper consent withdrawal

**Data Minimization:**
- Only store essential user data locally
- Clear temporary files immediately
- Implement proper logout cleanup

## Testing Standards

### 1. Test Structure

**Required Test Categories:**
```dart
// Unit tests - services, models, utilities
test('AuthService should validate JWT token', () async {
  // Arrange, Act, Assert
});

// Widget tests - UI components
testWidgets('LoginScreen shows error on failed login', (tester) async {
  // Widget testing logic
});

// Integration tests - full user flows
testWidgets('Complete onboarding flow works', (tester) async {
  // End-to-end flow testing
});
```

### 2. Test Coverage

**Minimum Requirements:**
- 80% code coverage for services and models
- All critical user flows covered by integration tests
- Error scenarios tested (network failures, validation errors)
- Accessibility testing with semantics

## Error Handling

### 1. User-Facing Errors

```dart
// Good - User-friendly error handling
try {
  await _authService.signIn();
} catch (e) {
  _showErrorSnackBar(
    'Sign in failed. Please check your connection and try again.'
  );
}
```

### 2. Development Errors

```dart
// Good - Debug information for development
assert(user != null, 'User should not be null at this point');
debugPrint('API Response: ${response.body}');
```

## Performance Guidelines

### 1. Widget Performance

**Optimize Rebuilds:**
```dart
// Good - Use const constructors
const Text('Welcome to Serenya')

// Good - Extract expensive widgets
class ExpensiveWidget extends StatelessWidget {
  const ExpensiveWidget({Key? key}) : super(key: key);
  // Implementation
}
```

### 2. Image and Assets

**Image Optimization:**
- Use appropriate image formats (WebP when possible)
- Implement proper image caching
- Provide multiple resolutions for different densities

## Implementation Process

### 1. Before Starting Any Feature

1. **Review existing patterns** - Study similar screens/widgets
2. **Check mockups** - Understand design requirements
3. **Plan widget hierarchy** - Sketch component breakdown
4. **Identify reusable components** - Don't recreate existing widgets

### 2. Development Flow

1. **Create widget structure** - Start with StatelessWidget
2. **Implement static UI** - Match mockup exactly
3. **Add state management** - Convert to StatefulWidget if needed
4. **Implement interactions** - Button presses, form validation
5. **Add error handling** - Loading states, network errors
6. **Write tests** - Unit and widget tests
7. **Test on devices** - iOS and Android verification

### 3. Code Review Checklist

- [ ] Follows widget composition principles
- [ ] Proper error handling implemented
- [ ] Accessibility semantics included
- [ ] Responsive design tested
- [ ] No hardcoded strings (use localization)
- [ ] Performance optimizations applied
- [ ] Tests written and passing

## Serenya-Specific Guidelines

### 1. Privacy Implementation

**Device-Only Storage:**
- Use SQLite with encryption for health data
- Implement proper data cleanup on logout
- Never log sensitive health information

### 2. Medical Disclaimer Integration

**Consistent Messaging:**
- Use approved disclaimer text exactly
- Implement proper consent tracking
- Include disclaimers in appropriate screens

### 3. Brand Consistency

**UI Elements:**
- Use Serenya blue color scheme
- Implement consistent button styles
- Follow typography hierarchy from mockups

## When Stuck (After 3 Attempts)

1. **Check Flutter documentation** - Official docs and samples
2. **Review existing codebase** - Similar implementations
3. **Search pub.dev** - Community packages and examples
4. **Simplify approach** - Remove complexity, use basic widgets
5. **Ask for guidance** - Document specific blocker and alternatives tried

## Quality Gates

### Definition of Done for Flutter Features

- [ ] UI matches mockups pixel-perfect
- [ ] Responsive design works 320px-1024px
- [ ] Accessibility semantics implemented
- [ ] Loading and error states handled
- [ ] Tests written and passing (widget + unit)
- [ ] Flutter analyze passes with zero issues
- [ ] Tested on iOS and Android devices
- [ ] Code reviewed and approved
- [ ] Performance tested (no jank, smooth scrolling)

## Important Flutter Reminders

**NEVER:**
- Use `print()` in production code (use `debugPrint()`)
- Ignore platform differences (iOS vs Android)
- Skip accessibility implementation
- Hardcode screen dimensions
- Disable or skip tests

**ALWAYS:**
- Use `SafeArea` for screen boundaries
- Implement proper keyboard handling
- Test on both platforms
- Follow Material Design and iOS guidelines
- Consider offline scenarios
- Optimize for battery usage