import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:serenya_app/core/navigation/app_router.dart';
import 'package:serenya_app/core/providers/app_state_provider.dart';
import 'package:serenya_app/core/providers/health_data_provider.dart';
import 'package:mockito/mockito.dart';

class MockAppStateProvider extends Mock implements AppStateProvider {
  @override
  bool get isLoading => false;
  
  @override
  String? get error => null;
  
  @override
  bool get isOnboardingComplete => true;
  
  @override
  bool get isLoggedIn => true;
}

void main() {
  group('AppRouter', () {
    late MockAppStateProvider mockAppStateProvider;
    
    setUp(() {
      mockAppStateProvider = MockAppStateProvider();
    });

    Widget createTestWidget({required Widget child}) {
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

      await tester.pumpWidget(createTestWidget(child: Container()));
      await tester.pumpAndSettle();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('should redirect to error when app has error', (tester) async {
      when(mockAppStateProvider.isLoading).thenReturn(false);
      when(mockAppStateProvider.error).thenReturn('Test error');
      when(mockAppStateProvider.isOnboardingComplete).thenReturn(true);
      when(mockAppStateProvider.isLoggedIn).thenReturn(true);

      await tester.pumpWidget(createTestWidget(child: Container()));
      await tester.pumpAndSettle();

      expect(find.text('Error: Test error'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('should redirect to onboarding when not completed', (tester) async {
      when(mockAppStateProvider.isLoading).thenReturn(false);
      when(mockAppStateProvider.error).thenReturn(null);
      when(mockAppStateProvider.isOnboardingComplete).thenReturn(false);
      when(mockAppStateProvider.isLoggedIn).thenReturn(false);

      await tester.pumpWidget(createTestWidget(child: Container()));
      await tester.pumpAndSettle();

      // Onboarding flow should be displayed
      expect(GoRouter.of(tester.element(find.byType(MaterialApp))).location, equals('/onboarding'));
    });

    testWidgets('should redirect to login when not logged in', (tester) async {
      when(mockAppStateProvider.isLoading).thenReturn(false);
      when(mockAppStateProvider.error).thenReturn(null);
      when(mockAppStateProvider.isOnboardingComplete).thenReturn(true);
      when(mockAppStateProvider.isLoggedIn).thenReturn(false);

      await tester.pumpWidget(createTestWidget(child: Container()));
      await tester.pumpAndSettle();

      expect(GoRouter.of(tester.element(find.byType(MaterialApp))).location, equals('/login'));
    });

    testWidgets('should show home when logged in', (tester) async {
      when(mockAppStateProvider.isLoading).thenReturn(false);
      when(mockAppStateProvider.error).thenReturn(null);
      when(mockAppStateProvider.isOnboardingComplete).thenReturn(true);
      when(mockAppStateProvider.isLoggedIn).thenReturn(true);

      await tester.pumpWidget(createTestWidget(child: Container()));
      await tester.pumpAndSettle();

      expect(GoRouter.of(tester.element(find.byType(MaterialApp))).location, equals('/home'));
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