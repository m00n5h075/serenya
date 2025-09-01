import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'screens/onboarding/onboarding_flow.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'core/providers/app_state_provider.dart';
import 'core/providers/health_data_provider.dart';

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
      child: MaterialApp(
        title: 'Serenya',
        theme: ThemeData(
          primarySwatch: Colors.blue,
          visualDensity: VisualDensity.adaptivePlatformDensity,
        ),
        home: AppWrapper(),
        debugShowCheckedModeBanner: false,
      ),
    );
  }
}

class AppWrapper extends StatefulWidget {
  @override
  _AppWrapperState createState() => _AppWrapperState();
}

class _AppWrapperState extends State<AppWrapper> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppStateProvider>().initialize();
    });
  }

  void _onOnboardingComplete() {
    context.read<AppStateProvider>().completeOnboarding();
  }

  void _onAuthenticationSuccess() {
    final appState = context.read<AppStateProvider>();
    appState.completeOnboarding();
    appState.setLoggedIn(true); // Mark user as logged in
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AppStateProvider>(
      builder: (context, appState, child) {
        if (appState.isLoading) {
          return Scaffold(
            body: Center(
              child: CircularProgressIndicator(),
            ),
          );
        }

        if (appState.error != null) {
          return Scaffold(
            body: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('Error: ${appState.error}'),
                  SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => appState.initialize(),
                    child: Text('Retry'),
                  ),
                ],
              ),
            ),
          );
        }

        // Show onboarding if not completed
        if (!appState.isOnboardingComplete) {
          return OnboardingFlow(
            onComplete: _onOnboardingComplete,
            onAuthenticationSuccess: _onAuthenticationSuccess,
          );
        }

        // Show login/home based on auth status
        return appState.isLoggedIn ? HomeScreen() : LoginScreen();
      },
    );
  }
}