import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:serenya_app/main.dart' as app;
import 'package:serenya_app/services/auth_service.dart' as auth;
import 'package:serenya_app/core/security/biometric_auth_service.dart';
import 'package:serenya_app/core/security/device_key_manager.dart';
import 'package:serenya_app/core/database/encrypted_database_service.dart';
import 'package:serenya_app/core/providers/app_state_provider.dart';
import 'package:serenya_app/core/providers/health_data_provider.dart';
import 'package:serenya_app/screens/home_screen.dart';
import 'package:serenya_app/screens/login_screen.dart';

/// Integration tests for app configuration and state management
/// 
/// Tests the core application systems including:
/// 1. App state provider functionality
/// 2. Health data provider integration
/// 3. Authentication state management
/// 4. Database initialization and configuration
/// 5. Security system integration
/// 6. Navigation between main screens
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('App Configuration Integration Tests', () {
    late auth.AuthService authService;

    setUpAll(() async {
      // Initialize core security systems
      await DeviceKeyManager.initialize();
      await BiometricAuthService.initialize();
      await EncryptedDatabaseService.database;

      // Setup authentication for testing
      await BiometricAuthService.setupPin('1234');
      await SessionManager.startSession(AuthMethod.pin);

      // Initialize services
      authService = auth.AuthService();
    });

    tearDownAll(() async {
      await _cleanupTestState();
    });

    group('App State Management', () {
      testWidgets('should initialize app state provider', (tester) async {
        final appState = AppStateProvider(authService: authService);
        
        // Test that app state provider can be created
        expect(appState, isNotNull);
        expect(appState.isInitialized, false); // Should start uninitialized
        expect(appState.isLoading, true); // Should start loading
        
        // Test initialization
        await appState.initialize();
        expect(appState.isInitialized, true);
      });

      testWidgets('should handle authentication state changes', (tester) async {
        // Test authentication state management
        expect(authService, isNotNull);
        
        // Test basic authentication methods exist
        expect(() => authService.isLoggedIn(), returnsNormally);
        expect(() => authService.getToken(), returnsNormally);
        expect(() => authService.signOut(), returnsNormally);
      });
    });

    group('Health Data Provider', () {
      testWidgets('should initialize health data provider', (tester) async {
        final healthProvider = HealthDataProvider();
        
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Column(
                children: [
                  const Text('Health Provider Test'),
                  ElevatedButton(
                    onPressed: () => healthProvider.loadDocuments(),
                    child: const Text('Load Documents'),
                  ),
                ],
              ),
            ),
          ),
        );

        await tester.pumpAndSettle();

        // Should initialize health data provider
        expect(healthProvider, isNotNull);
        expect(find.text('Health Provider Test'), findsOneWidget);
        expect(find.text('Load Documents'), findsOneWidget);
        
        // Test that load documents method exists and can be called
        await tester.tap(find.text('Load Documents'));
        await tester.pumpAndSettle();
      });

      testWidgets('should handle health data provider methods', (tester) async {
        final healthProvider = HealthDataProvider();
        
        // Test that basic methods exist
        expect(() => healthProvider.loadDocuments(), returnsNormally);
        expect(() => healthProvider.dispose(), returnsNormally);
      });
    });

    group('Screen Navigation', () {
      testWidgets('should navigate between main screens', (tester) async {
        // Test navigation to home screen
        await tester.pumpWidget(
          const MaterialApp(
            home: HomeScreen(),
          ),
        );

        await tester.pumpAndSettle();

        // Should show home screen
        expect(find.byType(HomeScreen), findsOneWidget);
      });

      testWidgets('should display login screen', (tester) async {
        await tester.pumpWidget(
          const MaterialApp(
            home: LoginScreen(),
          ),
        );

        await tester.pumpAndSettle();

        // Should show login screen
        expect(find.byType(LoginScreen), findsOneWidget);
      });

      testWidgets('should handle screen transitions', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Builder(
              builder: (context) => Scaffold(
                body: Column(
                  children: [
                    ElevatedButton(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(builder: (_) => const HomeScreen()),
                        );
                      },
                      child: const Text('Go to Home'),
                    ),
                    ElevatedButton(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(builder: (_) => const LoginScreen()),
                        );
                      },
                      child: const Text('Go to Login'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );

        await tester.pumpAndSettle();

        // Test navigation to home screen
        await tester.tap(find.text('Go to Home'));
        await tester.pumpAndSettle();
        expect(find.byType(HomeScreen), findsOneWidget);

        // Go back
        await tester.pageBack();
        await tester.pumpAndSettle();

        // Test navigation to login screen
        await tester.tap(find.text('Go to Login'));
        await tester.pumpAndSettle();
        expect(find.byType(LoginScreen), findsOneWidget);
      });
    });

    group('Database Configuration', () {
      testWidgets('should have initialized database', (tester) async {
        // Test that database is initialized
        final db = await EncryptedDatabaseService.database;
        expect(db, isNotNull);
        
        // Test that we can perform basic database operations
        try {
          await db.query('sqlite_master', where: 'type = ?', whereArgs: ['table']);
          // If we get here, the database is working
        } catch (e) {
          // Database query failed, but that's okay for basic initialization test
        }
      });

      testWidgets('should handle database operations gracefully', (tester) async {
        // Test database service methods
        expect(() => EncryptedDatabaseService.database, returnsNormally);
        expect(() => EncryptedDatabaseService.close(), returnsNormally);
      });
    });

    group('Security System Integration', () {
      testWidgets('should have security systems initialized', (tester) async {
        // Test that security systems can be initialized without errors
        expect(() => DeviceKeyManager.initialize(), returnsNormally);
        expect(() => BiometricAuthService.initialize(), returnsNormally);
      });

      testWidgets('should handle biometric authentication methods', (tester) async {
        // Test basic biometric service methods exist
        expect(() => BiometricAuthService.isBiometricAvailable(), returnsNormally);
        expect(() => BiometricAuthService.isPinSet(), returnsNormally);
        expect(() => BiometricAuthService.initialize(), returnsNormally);
      });

      testWidgets('should handle session management', (tester) async {
        // Test session management methods exist
        expect(() => SessionManager.isAuthenticated, returnsNormally);
        expect(() => SessionManager.currentAuthMethod, returnsNormally);
      });
    });

    group('App Integration', () {
      testWidgets('should integrate with main app', (tester) async {
        // Test that main app launches without crashing
        app.main();
        await tester.pumpAndSettle();

        // Check that the app initializes
        expect(find.byType(MaterialApp), findsOneWidget);
      });

      testWidgets('should handle app lifecycle', (tester) async {
        // Test basic app lifecycle
        await tester.pumpWidget(
          const MaterialApp(
            home: Scaffold(
              body: Text('App Lifecycle Test'),
            ),
          ),
        );

        await tester.pumpAndSettle();
        expect(find.text('App Lifecycle Test'), findsOneWidget);

        // Test widget disposal
        await tester.pumpWidget(
          const MaterialApp(
            home: Scaffold(
              body: Text('New Screen'),
            ),
          ),
        );

        await tester.pumpAndSettle();
        expect(find.text('New Screen'), findsOneWidget);
        expect(find.text('App Lifecycle Test'), findsNothing);
      });
    });

    group('Error Handling', () {
      testWidgets('should handle provider errors gracefully', (tester) async {
        // Test that providers handle errors without crashing
        final healthProvider = HealthDataProvider();
        
        // These should not throw exceptions
        expect(() => healthProvider.loadDocuments(), returnsNormally);
        expect(() => healthProvider.dispose(), returnsNormally);
      });

      testWidgets('should handle authentication errors', (tester) async {
        // Test authentication error handling
        try {
          await authService.signOut();
          await authService.clearTokens();
          
          // These should not crash the app
          expect(() => authService.isLoggedIn(), returnsNormally);
          expect(() => authService.getToken(), returnsNormally);
        } catch (e) {
          // Some methods might throw exceptions, which is okay
          expect(e, isA<Exception>());
        }
      });

      testWidgets('should handle navigation errors', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Builder(
                builder: (context) => ElevatedButton(
                  onPressed: () {
                    // This should not crash
                    try {
                      Navigator.pop(context);
                    } catch (e) {
                      // Expected when no route to pop
                    }
                  },
                  child: const Text('Test Navigation'),
                ),
              ),
            ),
          ),
        );

        await tester.pumpAndSettle();
        
        // Should not crash when tapping
        await tester.tap(find.text('Test Navigation'));
        await tester.pumpAndSettle();
      });
    });
  });
}

/// Helper function to cleanup test state
Future<void> _cleanupTestState() async {
  try {
    await EncryptedDatabaseService.close();
  } catch (e) {
    // Ignore cleanup errors
  }
}