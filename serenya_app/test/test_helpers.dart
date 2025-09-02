import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:serenya_app/core/providers/app_state_provider.dart';
import 'package:serenya_app/core/providers/health_data_provider.dart';
import 'package:serenya_app/core/theme/healthcare_theme.dart';
import 'package:mockito/mockito.dart';

/// Mock providers for testing
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

class MockHealthDataProvider extends Mock implements HealthDataProvider {}

/// Test helper to create a widget with healthcare theme and providers
Widget createTestApp({
  required Widget home,
  AppStateProvider? appStateProvider,
  HealthDataProvider? healthDataProvider,
  ThemeData? theme,
}) {
  return MultiProvider(
    providers: [
      ChangeNotifierProvider<AppStateProvider>.value(
        value: appStateProvider ?? MockAppStateProvider(),
      ),
      ChangeNotifierProvider<HealthDataProvider>.value(
        value: healthDataProvider ?? MockHealthDataProvider(),
      ),
    ],
    child: MaterialApp(
      theme: theme ?? HealthcareTheme.lightTheme.copyWith(
        extensions: <ThemeExtension<dynamic>>[
          HealthcareThemeExtensions.confidenceTheme,
          HealthcareThemeExtensions.medicalSafetyTheme,
        ],
      ),
      home: home,
    ),
  );
}

/// Test helper to create a simple widget with healthcare theme
Widget createThemedTestWidget(Widget child) {
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

/// Common test expectations for healthcare UI components
class HealthcareTestMatchers {
  static Finder confidenceLowColor() => find.byWidgetPredicate(
    (widget) => widget is Container && 
    widget.decoration is BoxDecoration &&
    (widget.decoration as BoxDecoration).color?.value == 0xFFFF5252,
  );
  
  static Finder confidenceModerateColor() => find.byWidgetPredicate(
    (widget) => widget is Container && 
    widget.decoration is BoxDecoration &&
    (widget.decoration as BoxDecoration).color?.value == 0xFFFF9800,
  );
  
  static Finder confidenceHighColor() => find.byWidgetPredicate(
    (widget) => widget is Container && 
    widget.decoration is BoxDecoration &&
    (widget.decoration as BoxDecoration).color?.value == 0xFF4CAF50,
  );
}

/// Test data helpers
class TestData {
  static const lowConfidenceScore = 2.0;
  static const moderateConfidenceScore = 5.0;
  static const highConfidenceScore = 8.0;
  
  static const normalMessage = 'Results look normal and healthy';
  static const abnormalMessage = 'Results show abnormal patterns';
  static const concerningMessage = 'These results are concerning';
  static const lowConfidenceMessage = 'Low confidence analysis';
}