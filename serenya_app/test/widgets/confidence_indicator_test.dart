import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenya_app/widgets/confidence_indicator.dart';
import 'package:serenya_app/core/theme/healthcare_theme.dart';

void main() {
  group('ConfidenceIndicator', () {
    Widget createTestWidget(Widget child) {
      return MaterialApp(
        theme: HealthcareTheme.lightTheme.copyWith(
          extensions: <ThemeExtension<dynamic>>[
            HealthcareThemeExtensions.confidenceTheme,
          ],
        ),
        home: Scaffold(body: child),
      );
    }

    testWidgets('should display low confidence with warning icon', (tester) async {
      await tester.pumpWidget(
        createTestWidget(
          const ConfidenceIndicator(confidenceScore: 2.0),
        ),
      );

      expect(find.byIcon(Icons.warning), findsOneWidget);
      expect(find.text('Low Confidence'), findsOneWidget);
      expect(find.text('(2.0/10)'), findsOneWidget);
    });

    testWidgets('should display moderate confidence with info icon', (tester) async {
      await tester.pumpWidget(
        createTestWidget(
          const ConfidenceIndicator(confidenceScore: 5.0),
        ),
      );

      expect(find.byIcon(Icons.info), findsOneWidget);
      expect(find.text('Moderate Confidence'), findsOneWidget);
      expect(find.text('(5.0/10)'), findsOneWidget);
    });

    testWidgets('should display high confidence with check icon', (tester) async {
      await tester.pumpWidget(
        createTestWidget(
          const ConfidenceIndicator(confidenceScore: 8.0),
        ),
      );

      expect(find.byIcon(Icons.check_circle), findsOneWidget);
      expect(find.text('High Confidence'), findsOneWidget);
      expect(find.text('(8.0/10)'), findsOneWidget);
    });

    testWidgets('should hide details when showDetails is false', (tester) async {
      await tester.pumpWidget(
        createTestWidget(
          const ConfidenceIndicator(
            confidenceScore: 5.0,
            showDetails: false,
          ),
        ),
      );

      expect(find.byIcon(Icons.info), findsOneWidget);
      expect(find.text('Moderate Confidence'), findsNothing);
      expect(find.text('(5.0/10)'), findsNothing);
    });
  });

  group('ConfidenceCard', () {
    Widget createTestWidget(Widget child) {
      return MaterialApp(
        theme: HealthcareTheme.lightTheme.copyWith(
          extensions: <ThemeExtension<dynamic>>[
            HealthcareThemeExtensions.confidenceTheme,
            HealthcareThemeExtensions.medicalSafetyTheme,
          ],
        ),
        home: Scaffold(body: child),
      );
    }

    testWidgets('should display AI confidence title and message', (tester) async {
      await tester.pumpWidget(
        createTestWidget(
          const ConfidenceCard(
            confidenceScore: 7.0,
            message: 'Test analysis message',
          ),
        ),
      );

      expect(find.text('AI Confidence'), findsOneWidget);
      expect(find.text('Test analysis message'), findsOneWidget);
      expect(find.byType(ConfidenceIndicator), findsOneWidget);
    });

    testWidgets('should show consultation recommendation for low confidence', (tester) async {
      await tester.pumpWidget(
        createTestWidget(
          const ConfidenceCard(
            confidenceScore: 2.0,
            message: 'Low confidence analysis',
          ),
        ),
      );

      expect(find.text('Consider consulting your healthcare provider for these results.'), findsOneWidget);
      expect(find.byIcon(Icons.medical_services), findsAtLeastNWidgets(1));
    });

    testWidgets('should show consultation recommendation for abnormal results', (tester) async {
      await tester.pumpWidget(
        createTestWidget(
          const ConfidenceCard(
            confidenceScore: 8.0,
            message: 'Results show abnormal patterns',
          ),
        ),
      );

      expect(find.text('Consider consulting your healthcare provider for these results.'), findsOneWidget);
    });

    testWidgets('should show consultation recommendation for concerning results', (tester) async {
      await tester.pumpWidget(
        createTestWidget(
          const ConfidenceCard(
            confidenceScore: 8.0,
            message: 'These results are concerning',
          ),
        ),
      );

      expect(find.text('Consider consulting your healthcare provider for these results.'), findsOneWidget);
    });

    testWidgets('should show find healthcare provider button when callback provided', (tester) async {
      bool callbackCalled = false;
      
      await tester.pumpWidget(
        createTestWidget(
          ConfidenceCard(
            confidenceScore: 2.0,
            message: 'Low confidence analysis',
            onConsultDoctor: () => callbackCalled = true,
          ),
        ),
      );

      expect(find.text('Find Healthcare Provider'), findsOneWidget);
      
      await tester.tap(find.text('Find Healthcare Provider'));
      await tester.pump();
      
      expect(callbackCalled, isTrue);
    });

    testWidgets('should not show consultation UI for high confidence normal results', (tester) async {
      await tester.pumpWidget(
        createTestWidget(
          const ConfidenceCard(
            confidenceScore: 8.0,
            message: 'Results look normal and healthy',
          ),
        ),
      );

      expect(find.text('Consider consulting your healthcare provider for these results.'), findsNothing);
      expect(find.text('Find Healthcare Provider'), findsNothing);
    });
  });
}