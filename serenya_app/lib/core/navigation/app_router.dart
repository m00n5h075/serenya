import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../screens/onboarding/onboarding_flow.dart';
import '../../screens/home_screen.dart';
import '../providers/app_state_provider.dart';
import '../../widgets/serenya_spinner.dart';

class AppRouter {
  static GoRouter createRouter(AppStateProvider appStateProvider) {
    return GoRouter(
      initialLocation: '/loading',
      refreshListenable: appStateProvider,
      redirect: (context, state) {
      final appState = context.read<AppStateProvider>();
      final currentPath = state.fullPath;
      
      if (kDebugMode) {
        print('ROUTER: Current path: $currentPath');
        print('ROUTER: isLoading: ${appState.isLoading}');
        print('ROUTER: error: ${appState.error}');
        print('ROUTER: isOnboardingComplete: ${appState.isOnboardingComplete}');
        print('ROUTER: isLoggedIn: ${appState.isLoggedIn}');
      }
      
      // If still loading, stay on loading screen
      if (appState.isLoading) {
        if (kDebugMode) {
          print('ROUTER: Staying on loading screen');
        }
        return currentPath != '/loading' ? '/loading' : null;
      }
      
      // If error occurred, show error but allow fallback to onboarding
      if (appState.error != null) {
        if (kDebugMode) {
          print('ROUTER: Error occurred: ${appState.error}');
        }
        // For now, if there's an error during startup, go to onboarding as fallback
        // This prevents users from being stuck on error screens
        if (!appState.isOnboardingComplete) {
          if (kDebugMode) {
            print('ROUTER: Error occurred but redirecting to onboarding as fallback');
          }
          return currentPath != '/onboarding' ? '/onboarding' : null;
        }
        return currentPath != '/error' ? '/error' : null;
      }
      
      // If onboarding not complete, redirect to onboarding
      if (!appState.isOnboardingComplete) {
        if (kDebugMode) {
          print('ROUTER: Redirecting to onboarding');
        }
        return currentPath != '/onboarding' ? '/onboarding' : null;
      }
      
      // If not logged in, redirect to onboarding
      if (!appState.isLoggedIn) {
        return currentPath != '/onboarding' ? '/onboarding' : null;
      }
      
      // If logged in and on onboarding, redirect to home
      if (appState.isLoggedIn && currentPath == '/onboarding') {
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
        path: '/home',
        builder: (context, state) => const HomeScreen(),
      ),
    ],
    );
  }
}

class LoadingScreen extends StatelessWidget {
  const LoadingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // Initialize app state when loading screen is shown
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppStateProvider>().initialize();
    });

    return const Scaffold(
      body: Center(
        child: SerenyaSpinnerLarge(),
      ),
    );
  }
}

class ErrorScreen extends StatelessWidget {
  const ErrorScreen({super.key});

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