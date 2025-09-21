import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenya_app/widgets/serenya_spinner.dart';
import 'package:serenya_app/core/constants/design_tokens.dart';

void main() {
  group('SerenyaSpinner', () {
    testWidgets('should render with default properties', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SerenyaSpinner(),
          ),
        ),
      );

      expect(find.byType(SerenyaSpinner), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('should apply custom size and stroke width', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SerenyaSpinner(
              size: 32.0,
              strokeWidth: 3.0,
            ),
          ),
        ),
      );

      final sizedBox = tester.widget<SizedBox>(find.byType(SizedBox).first);
      expect(sizedBox.width, equals(32.0));
      expect(sizedBox.height, equals(32.0));

      final progressIndicator = tester.widget<CircularProgressIndicator>(
        find.byType(CircularProgressIndicator),
      );
      expect(progressIndicator.strokeWidth, equals(3.0));
    });

    testWidgets('should animate scale and color', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SerenyaSpinner(
              enableColorTransition: true,
            ),
          ),
        ),
      );

      // Should have SerenyaSpinner and CircularProgressIndicator
      expect(find.byType(SerenyaSpinner), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      
      // Advance animation
      await tester.pump(const Duration(milliseconds: 600));
      
      // Should still be present after animation
      expect(find.byType(SerenyaSpinner), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('should disable color transition when specified', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SerenyaSpinner(
              enableColorTransition: false,
            ),
          ),
        ),
      );

      final progressIndicator = tester.widget<CircularProgressIndicator>(
        find.byType(CircularProgressIndicator),
      );
      
      final valueColor = progressIndicator.valueColor as AlwaysStoppedAnimation<Color>;
      expect(valueColor.value, equals(HealthcareColors.serenyaBluePrimary));
    });
  });

  group('SerenyaSpinnerSmall', () {
    testWidgets('should render with small size properties', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SerenyaSpinnerSmall(),
          ),
        ),
      );

      final sizedBox = tester.widget<SizedBox>(find.byType(SizedBox).first);
      expect(sizedBox.width, equals(16.0));
      expect(sizedBox.height, equals(16.0));

      final progressIndicator = tester.widget<CircularProgressIndicator>(
        find.byType(CircularProgressIndicator),
      );
      expect(progressIndicator.strokeWidth, equals(1.5));
    });
  });

  group('SerenyaSpinnerMedium', () {
    testWidgets('should render with medium size properties', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SerenyaSpinnerMedium(),
          ),
        ),
      );

      final sizedBox = tester.widget<SizedBox>(find.byType(SizedBox).first);
      expect(sizedBox.width, equals(24.0));
      expect(sizedBox.height, equals(24.0));

      final progressIndicator = tester.widget<CircularProgressIndicator>(
        find.byType(CircularProgressIndicator),
      );
      expect(progressIndicator.strokeWidth, equals(2.0));
    });
  });

  group('SerenyaSpinnerLarge', () {
    testWidgets('should render with large size properties', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SerenyaSpinnerLarge(),
          ),
        ),
      );

      final sizedBox = tester.widget<SizedBox>(find.byType(SizedBox).first);
      expect(sizedBox.width, equals(32.0));
      expect(sizedBox.height, equals(32.0));

      final progressIndicator = tester.widget<CircularProgressIndicator>(
        find.byType(CircularProgressIndicator),
      );
      expect(progressIndicator.strokeWidth, equals(3.0));
    });
  });

  group('SerenyaSpinnerStatic', () {
    testWidgets('should render without animation', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SerenyaSpinnerStatic(),
          ),
        ),
      );

      expect(find.byType(SerenyaSpinnerStatic), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      // Static spinner should not have the custom transform from SerenyaSpinner
      expect(find.byType(SerenyaSpinner), findsNothing);
    });

    testWidgets('should apply custom color', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SerenyaSpinnerStatic(
              color: HealthcareColors.serenyaGreenPrimary,
            ),
          ),
        ),
      );

      final progressIndicator = tester.widget<CircularProgressIndicator>(
        find.byType(CircularProgressIndicator),
      );
      
      final valueColor = progressIndicator.valueColor as AlwaysStoppedAnimation<Color>;
      expect(valueColor.value, equals(HealthcareColors.serenyaGreenPrimary));
    });

    testWidgets('should use default blue color when no color specified', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SerenyaSpinnerStatic(),
          ),
        ),
      );

      final progressIndicator = tester.widget<CircularProgressIndicator>(
        find.byType(CircularProgressIndicator),
      );
      
      final valueColor = progressIndicator.valueColor as AlwaysStoppedAnimation<Color>;
      expect(valueColor.value, equals(HealthcareColors.serenyaBluePrimary));
    });
  });

  group('CircularProgressIndicatorReplacement extension', () {
    testWidgets('should create serenya spinner with extension', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CircularProgressIndicatorReplacement.serenya(
              size: 20.0,
              strokeWidth: 2.5,
              enableColorTransition: false,
            ),
          ),
        ),
      );

      expect(find.byType(SerenyaSpinner), findsOneWidget);
      
      final sizedBox = tester.widget<SizedBox>(find.byType(SizedBox).first);
      expect(sizedBox.width, equals(20.0));
      expect(sizedBox.height, equals(20.0));
    });
  });
}