import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/providers/app_state_provider.dart';
import 'core/providers/health_data_provider.dart';
import 'core/theme/healthcare_theme.dart';
import 'core/navigation/app_router.dart';

void main() {
  runApp(MyApp());
}

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AppStateProvider()),
        ChangeNotifierProvider(create: (_) => HealthDataProvider()),
      ],
      child: MaterialApp.router(
        title: 'Serenya',
        theme: HealthcareTheme.lightTheme.copyWith(
          extensions: <ThemeExtension<dynamic>>[
            HealthcareThemeExtensions.confidenceTheme,
            HealthcareThemeExtensions.medicalSafetyTheme,
          ],
        ),
        routerConfig: AppRouter.router,
        debugShowCheckedModeBanner: false,
      ),
    );
  }
}

