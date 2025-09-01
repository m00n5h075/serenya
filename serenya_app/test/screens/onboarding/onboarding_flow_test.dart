import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenya_app/screens/onboarding/onboarding_flow.dart';
import 'package:serenya_app/screens/onboarding/widgets/progress_dots.dart';
import 'package:serenya_app/screens/onboarding/widgets/onboarding_button.dart';

void main() {
  group('OnboardingFlow', () {
    testWidgets('displays progress dots and first slide', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: OnboardingFlow(),
        ),
      );

      // Verify progress dots are present
      expect(find.byType(ProgressDots), findsOneWidget);
      
      // Verify first slide content is present
      expect(find.text('Welcome to Serenya'), findsOneWidget);
      expect(find.text('Your AI Health Agent'), findsOneWidget);
      expect(find.text('Get Started'), findsOneWidget);
    });

    testWidgets('navigates through all slides', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: OnboardingFlow(),
        ),
      );

      // Verify we're on slide 1
      expect(find.text('Welcome to Serenya'), findsOneWidget);

      // Tap "Get Started" to go to slide 2
      await tester.tap(find.text('Get Started'));
      await tester.pumpAndSettle();

      // Verify we're on slide 2
      expect(find.text('Your Privacy Comes First'), findsOneWidget);

      // Tap "Continue" to go to slide 3
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();

      // Verify we're on slide 3
      expect(find.text('Important Things to Know'), findsOneWidget);

      // Tap "I Understand - Continue" to go to slide 4
      await tester.tap(find.text('I Understand - Continue'));
      await tester.pumpAndSettle();

      // Verify we're on slide 4
      expect(find.text('Ready to Get Started?'), findsOneWidget);
    });

    testWidgets('swipe navigation works', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: OnboardingFlow(),
        ),
      );

      // Verify we're on slide 1
      expect(find.text('Welcome to Serenya'), findsOneWidget);

      // Swipe left to go to slide 2
      await tester.drag(
        find.text('Welcome to Serenya'),
        Offset(-400, 0),
      );
      await tester.pumpAndSettle();

      // Verify we're on slide 2
      expect(find.text('Your Privacy Comes First'), findsOneWidget);
    });

    testWidgets('accessibility semantics are present', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: OnboardingFlow(),
        ),
      );

      // Check for accessibility semantics
      expect(find.bySemanticsLabel('Onboarding slides'), findsOneWidget);
      expect(find.bySemanticsLabel('Page 1 of 4'), findsOneWidget);
    });
  });

  group('ProgressDots', () {
    testWidgets('displays correct number of dots', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ProgressDots(
              currentIndex: 0,
              totalCount: 4,
            ),
          ),
        ),
      );

      // Should have 4 dots
      expect(
        find.byWidgetPredicate((widget) => 
          widget is Container && widget.decoration is BoxDecoration),
        findsNWidgets(4),
      );
    });

    testWidgets('highlights current dot', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ProgressDots(
              currentIndex: 1,
              totalCount: 4,
            ),
          ),
        ),
      );

      // Check accessibility label
      expect(find.bySemanticsLabel('Page 2 of 4'), findsOneWidget);
    });
  });

  group('OnboardingButton', () {
    testWidgets('displays text correctly', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: OnboardingButton(
              text: 'Test Button',
              onPressed: () {},
            ),
          ),
        ),
      );

      expect(find.text('Test Button'), findsOneWidget);
    });

    testWidgets('shows loading state', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: OnboardingButton(
              text: 'Test Button',
              isLoading: true,
              onPressed: () {},
            ),
          ),
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('calls onPressed when tapped', (tester) async {
      bool wasPressed = false;
      
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: OnboardingButton(
              text: 'Test Button',
              onPressed: () {
                wasPressed = true;
              },
            ),
          ),
        ),
      );

      await tester.tap(find.text('Test Button'));
      expect(wasPressed, isTrue);
    });

    testWidgets('is disabled when onPressed is null', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: OnboardingButton(
              text: 'Test Button',
              onPressed: null,
            ),
          ),
        ),
      );

      final button = tester.widget<ElevatedButton>(find.byType(ElevatedButton));
      expect(button.onPressed, isNull);
    });
  });
}