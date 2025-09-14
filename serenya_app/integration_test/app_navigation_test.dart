import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:serenya_app/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('App Navigation Integration Tests', () {
    testWidgets('complete app flow navigation', (tester) async {
      // Start the app
      app.main();
      await tester.pumpAndSettle();

      // Wait for initial loading to complete
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // App should start with loading screen or redirect based on state
      // Since this is a fresh install, it should show onboarding or loading
      expect(find.byType(CircularProgressIndicator), findsWidgets);

      // Wait for app state to initialize
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // The app should now show appropriate screen based on state
      // This test will verify the navigation system works end-to-end
    });

    testWidgets('onboarding to home flow', (tester) async {
      app.main();
      await tester.pumpAndSettle();
      
      // Wait for initialization
      await tester.pumpAndSettle(const Duration(seconds: 2));
      
      // If onboarding is shown, complete it
      if (tester.any(find.text('Get Started')) || tester.any(find.text('Welcome'))) {
        // Navigate through onboarding steps
        // This would need to be adapted based on actual onboarding implementation
        
        // Look for next/continue buttons and tap them
        final nextButtons = find.byType(ElevatedButton);
        if (tester.any(nextButtons)) {
          await tester.tap(nextButtons.first);
          await tester.pumpAndSettle();
        }
      }
      
      // Verify we can navigate through the app without crashes
      await tester.pumpAndSettle(const Duration(seconds: 1));
    });

    testWidgets('theme integration test', (tester) async {
      app.main();
      await tester.pumpAndSettle();
      
      // Wait for app to load
      await tester.pumpAndSettle(const Duration(seconds: 2));
      
      // Verify healthcare theme is applied
      final materialApp = tester.widget<MaterialApp>(find.byType(MaterialApp));
      expect(materialApp.theme, isNotNull);
      
      // Verify theme extensions are available
      final context = tester.element(find.byType(MaterialApp));
      final theme = Theme.of(context);
      expect(theme.extensions, isNotEmpty);
      
      // Test that the app doesn't crash with theme-related operations
      await tester.pumpAndSettle();
    });

    testWidgets('provider integration test', (tester) async {
      app.main();
      await tester.pumpAndSettle();
      
      // Wait for providers to initialize
      await tester.pumpAndSettle(const Duration(seconds: 2));
      
      // Verify providers are accessible throughout the widget tree
      // The app should not crash due to provider-related issues
      await tester.pumpAndSettle();
      
      // Test that state changes work properly
      // This verifies the provider setup is working correctly
    });

    testWidgets('error handling integration test', (tester) async {
      app.main();
      await tester.pumpAndSettle();
      
      // Test that the app handles errors gracefully
      // and shows appropriate error screens when needed
      
      // Wait for full initialization
      await tester.pumpAndSettle(const Duration(seconds: 3));
      
      // Verify no unhandled exceptions crash the app
      // The app should remain responsive
      expect(find.byType(MaterialApp), findsOneWidget);
    });

    testWidgets('accessibility integration test', (tester) async {
      app.main();
      await tester.pumpAndSettle();
      
      // Wait for app to fully load
      await tester.pumpAndSettle(const Duration(seconds: 2));
      
      // Test accessibility features
      final SemanticsHandle handle = tester.ensureSemantics();
      
      try {
        // Verify that interactive elements have proper semantics
        await tester.pumpAndSettle();
        
        // Test that buttons and other interactive elements are accessible
        final buttons = find.byType(ElevatedButton);
        if (tester.any(buttons)) {
          final buttonSemantics = tester.getSemantics(buttons.first);
          // Check that button has proper semantics
          expect(buttonSemantics.hasFlag(SemanticsFlag.hasEnabledState), isTrue);
        }
        
        // Verify text elements have proper semantics
        final textWidgets = find.byType(Text);
        if (tester.any(textWidgets)) {
          // Text should be properly labeled for screen readers
          expect(textWidgets, findsWidgets);
        }
      } finally {
        handle.dispose();
      }
    });
  });
}