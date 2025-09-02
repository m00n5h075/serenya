import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenya_app/screens/onboarding/slides/consent_slide.dart';

void main() {
  group('ConsentSlide', () {
    testWidgets('displays all required content', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: ConsentSlide(
            onAgree: (terms, disclaimer, authSuccess) {},
          ),
        ),
      );

      expect(find.text('Ready to Get Started?'), findsOneWidget);
      expect(find.text('Join thousands who use Serenya to:'), findsOneWidget);
      expect(find.text('By continuing, I acknowledge that:'), findsOneWidget);
      expect(find.text('I Agree - Create My Account'), findsOneWidget);
    });

    testWidgets('checkboxes start unchecked', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: ConsentSlide(
            onAgree: (terms, disclaimer, authSuccess) {},
          ),
        ),
      );

      final checkboxes = tester.widgetList<Checkbox>(find.byType(Checkbox));
      expect(checkboxes.length, 2);
      expect(checkboxes.first.value, isFalse);
      expect(checkboxes.last.value, isFalse);
    });

    testWidgets('button is disabled when checkboxes are unchecked', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: ConsentSlide(
            onAgree: (terms, disclaimer, authSuccess) {},
          ),
        ),
      );

      final button = tester.widget<ElevatedButton>(
        find.widgetWithText(ElevatedButton, 'I Agree - Create My Account'),
      );
      expect(button.onPressed, isNull);
      
      // Should show validation message
      expect(
        find.text('Please check both boxes above to continue'),
        findsOneWidget,
      );
    });

    testWidgets('checkboxes can be toggled', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: ConsentSlide(
            onAgree: (terms, disclaimer, authSuccess) {},
          ),
        ),
      );

      // Find and tap first checkbox
      final firstCheckbox = find.byType(Checkbox).first;
      await tester.tap(firstCheckbox);
      await tester.pump();

      // Verify first checkbox is now checked
      final checkboxWidget = tester.widget<Checkbox>(firstCheckbox);
      expect(checkboxWidget.value, isTrue);
    });

    testWidgets('button is enabled when both checkboxes are checked', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: ConsentSlide(
            onAgree: (terms, disclaimer, authSuccess) {},
          ),
        ),
      );

      // Check both checkboxes
      final checkboxes = find.byType(Checkbox);
      await tester.tap(checkboxes.first);
      await tester.pump();
      await tester.tap(checkboxes.last);
      await tester.pump();

      // Button should now be enabled
      final button = tester.widget<ElevatedButton>(
        find.widgetWithText(ElevatedButton, 'I Agree - Create My Account'),
      );
      expect(button.onPressed, isNotNull);

      // Validation message should be gone
      expect(
        find.text('Please check both boxes above to continue'),
        findsNothing,
      );
    });

    testWidgets('calls onAgree with correct values when button is tapped', (tester) async {
      bool? agreedToTerms;
      bool? understoodDisclaimer;

      await tester.pumpWidget(
        MaterialApp(
          home: ConsentSlide(
            onAgree: (terms, disclaimer, authSuccess) {
              agreedToTerms = terms;
              understoodDisclaimer = disclaimer;
            },
          ),
        ),
      );

      // Check both checkboxes
      final checkboxes = find.byType(Checkbox);
      await tester.tap(checkboxes.first);
      await tester.pump();
      await tester.tap(checkboxes.last);
      await tester.pump();

      // Tap the agree button
      await tester.tap(find.text('I Agree - Create My Account'));
      await tester.pump();

      // Wait for loading delay
      await tester.pump(Duration(milliseconds: 600));

      expect(agreedToTerms, isTrue);
      expect(understoodDisclaimer, isTrue);
    });

    testWidgets('shows loading state when button is pressed', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: ConsentSlide(
            onAgree: (terms, disclaimer, authSuccess) async {
              // Simulate async operation
              await Future.delayed(Duration(seconds: 1));
            },
          ),
        ),
      );

      // Check both checkboxes
      final checkboxes = find.byType(Checkbox);
      await tester.tap(checkboxes.first);
      await tester.pump();
      await tester.tap(checkboxes.last);
      await tester.pump();

      // Tap the agree button
      await tester.tap(find.text('I Agree - Create My Account'));
      await tester.pump();

      // Should show loading indicator
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('has proper accessibility semantics', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: ConsentSlide(
            onAgree: (terms, disclaimer, authSuccess) {},
          ),
        ),
      );

      // Check for semantic labels on checkboxes
      expect(
        find.bySemanticsLabel(RegExp(r'Unchecked checkbox.*medical interpretation')),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(RegExp(r'Unchecked checkbox.*Terms of Service')),
        findsOneWidget,
      );
    });
  });
}