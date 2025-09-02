import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../screens/onboarding/onboarding_flow.dart';
import '../../screens/login_screen.dart';
import '../../screens/home_screen.dart';
import '../providers/app_state_provider.dart';

class AppRouter {
  static final GoRouter router = GoRouter(
    initialLocation: '/loading',
    redirect: (context, state) {
      final appState = context.read<AppStateProvider>();
      final currentPath = state.fullPath;
      
      // If still loading, stay on loading screen
      if (appState.isLoading) {
        return currentPath != '/loading' ? '/loading' : null;
      }
      
      // If error occurred, go to error screen
      if (appState.error != null) {
        return currentPath != '/error' ? '/error' : null;
      }
      
      // If onboarding not complete, redirect to onboarding
      if (!appState.isOnboardingComplete) {
        return currentPath != '/onboarding' ? '/onboarding' : null;
      }
      
      // If not logged in, redirect to login
      if (!appState.isLoggedIn) {
        return currentPath != '/login' ? '/login' : null;
      }
      
      // If logged in and on auth screens, redirect to home
      if (appState.isLoggedIn && 
          (currentPath == '/login' || currentPath == '/onboarding')) {
        return '/home';
      }
      
      // No redirect needed
      return null;
    },
    routes: [
      GoRoute(
        path: '/loading',
        builder: (context, state) => const LoadingScreen(),
      ),
      GoRoute(
        path: '/error',
        builder: (context, state) => const ErrorScreen(),
      ),
      GoRoute(
        path: '/onboarding',
        builder: (context, state) => OnboardingFlow(
          onComplete: () => context.read<AppStateProvider>().completeOnboarding(),
          onAuthenticationSuccess: () {
            final appState = context.read<AppStateProvider>();
            appState.completeOnboarding();
            appState.setLoggedIn(true);
          },
        ),
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => LoginScreen(),
      ),
      GoRoute(
        path: '/home',
        builder: (context, state) => HomeScreen(),
      ),
    ],
  );
}

class LoadingScreen extends StatelessWidget {
  const LoadingScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // Initialize app state when loading screen is shown
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppStateProvider>().initialize();
    });

    return const Scaffold(
      body: Center(
        child: CircularProgressIndicator(),
      ),
    );
  }
}

class ErrorScreen extends StatelessWidget {
  const ErrorScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Consumer<AppStateProvider>(
      builder: (context, appState, child) {
        return Scaffold(
          body: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('Error: ${appState.error}'),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () => appState.initialize(),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}