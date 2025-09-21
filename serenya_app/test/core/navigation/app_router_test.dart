import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:serenya_app/core/navigation/app_router.dart';
import 'package:serenya_app/core/providers/app_state_provider.dart';
import 'package:serenya_app/core/providers/health_data_provider.dart';
import 'package:mockito/mockito.dart';

class MockAppStateProvider extends Mock implements AppStateProvider {
  final bool _isLoading = false;
  String? _error;
  final bool _isOnboardingComplete = false;
  final bool _isLoggedIn = false;

  @override
  bool get isLoading => super.noSuchMethod(
    Invocation.getter(#isLoading),
    returnValue: _isLoading,
    returnValueForMissingStub: _isLoading,
  );

  @override
  String? get error => super.noSuchMethod(
    Invocation.getter(#error),
    returnValue: _error,
    returnValueForMissingStub: _error,
  );

  @override
  bool get isOnboardingComplete => super.noSuchMethod(
    Invocation.getter(#isOnboardingComplete),
    returnValue: _isOnboardingComplete,
    returnValueForMissingStub: _isOnboardingComplete,
  );

  @override
  bool get isLoggedIn => super.noSuchMethod(
    Invocation.getter(#isLoggedIn),
    returnValue: _isLoggedIn,
    returnValueForMissingStub: _isLoggedIn,
  );

  @override
  Future<void> initialize() => super.noSuchMethod(
    Invocation.method(#initialize, []),
    returnValue: Future<void>.value(),
    returnValueForMissingStub: Future<void>.value(),
  );
}

void main() {
  group('AppRouter', () {
    late MockAppStateProvider mockAppStateProvider;
    
    setUp(() {
      mockAppStateProvider = MockAppStateProvider();
      // Set up default return values to avoid null issues
      when(mockAppStateProvider.isLoading).thenReturn(false);
      when(mockAppStateProvider.error).thenReturn(null);
      when(mockAppStateProvider.isOnboardingComplete).thenReturn(false);
      when(mockAppStateProvider.isLoggedIn).thenReturn(false);
      when(mockAppStateProvider.initialize()).thenAnswer((_) async {});
    });

    Widget createTestWidget() {
      return MultiProvider(
        providers: [
          ChangeNotifierProvider<AppStateProvider>.value(
            value: mockAppStateProvider,
          ),
          ChangeNotifierProvider(create: (_) => HealthDataProvider()),
        ],
        child: MaterialApp.router(
          routerConfig: AppRouter.router,
        ),
      );
    }

    testWidgets('should redirect to loading when app is loading', (tester) async {
      when(mockAppStateProvider.isLoading).thenReturn(true);
      when(mockAppStateProvider.error).thenReturn(null);
      when(mockAppStateProvider.isOnboardingComplete).thenReturn(true);
      when(mockAppStateProvider.isLoggedIn).thenReturn(true);
      when(mockAppStateProvider.initialize()).thenAnswer((_) async {});

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle(const Duration(seconds: 2));

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('should redirect to error when app has error', (tester) async {
      when(mockAppStateProvider.isLoading).thenReturn(false);
      when(mockAppStateProvider.error).thenReturn('Test error');
      when(mockAppStateProvider.isOnboardingComplete).thenReturn(true);
      when(mockAppStateProvider.isLoggedIn).thenReturn(true);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle(const Duration(seconds: 2));

      expect(find.text('Error: Test error'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('should redirect to onboarding when not completed', (tester) async {
      when(mockAppStateProvider.isLoading).thenReturn(false);
      when(mockAppStateProvider.error).thenReturn(null);
      when(mockAppStateProvider.isOnboardingComplete).thenReturn(false);
      when(mockAppStateProvider.isLoggedIn).thenReturn(false);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // Onboarding flow should be displayed - look for onboarding UI elements
      expect(find.text('Welcome to Serenya'), findsWidgets);
    });

    testWidgets('should redirect to login when not logged in', (tester) async {
      when(mockAppStateProvider.isLoading).thenReturn(false);
      when(mockAppStateProvider.error).thenReturn(null);
      when(mockAppStateProvider.isOnboardingComplete).thenReturn(true);
      when(mockAppStateProvider.isLoggedIn).thenReturn(false);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // Login screen should be displayed - look for login UI elements
      expect(find.text('Sign in with Google'), findsWidgets);
    });

    testWidgets('should show home when logged in', (tester) async {
      when(mockAppStateProvider.isLoading).thenReturn(false);
      when(mockAppStateProvider.error).thenReturn(null);
      when(mockAppStateProvider.isOnboardingComplete).thenReturn(true);
      when(mockAppStateProvider.isLoggedIn).thenReturn(true);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // Home screen should be displayed - look for home UI elements
      expect(find.text('Serenya'), findsWidgets);
    });
  });

  group('LoadingScreen', () {
    testWidgets('should display loading indicator', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: ChangeNotifierProvider(
            create: (_) => AppStateProvider(),
            child: const LoadingScreen(),
          ),
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });

  group('ErrorScreen', () {
    testWidgets('should display error message and retry button', (tester) async {
      final mockProvider = MockAppStateProvider();
      when(mockProvider.error).thenReturn('Test error message');

      await tester.pumpWidget(
        MaterialApp(
          home: ChangeNotifierProvider<AppStateProvider>.value(
            value: mockProvider,
            child: const ErrorScreen(),
          ),
        ),
      );

      expect(find.text('Error: Test error message'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });
  });
}