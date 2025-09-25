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
      try {
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
      
      // Simplified routing logic
      print('🔍 ROUTER: Evaluating redirect logic - isOnboardingComplete: ${appState.isOnboardingComplete}, isLoggedIn: ${appState.isLoggedIn}');
      
      if (!appState.isOnboardingComplete) {
        // If onboarding not complete, always go to onboarding (handles both logged in and not logged in states)
        print('🔍 ROUTER: CONDITION 1 - Onboarding not complete, redirecting to onboarding');
        return currentPath != '/onboarding' ? '/onboarding' : null;
      }
      
      // If onboarding complete but not logged in, go to onboarding for re-authentication
      if (appState.isOnboardingComplete && !appState.isLoggedIn) {
        print('🔍 ROUTER: CONDITION 2 - Onboarding complete but not logged in, redirecting to onboarding');
        return currentPath != '/onboarding' ? '/onboarding' : null;
      }
      
      // If both onboarding complete and logged in, go to home
      if (appState.isOnboardingComplete && appState.isLoggedIn && currentPath != '/home') {
        print('🔍 ROUTER: CONDITION 3 - Both onboarding complete and logged in, redirecting to home');
        return '/home';
      }
      
      // No redirect needed
      print('🔍 ROUTER: NO REDIRECT NEEDED - staying on current path: $currentPath');
      return null;
      } catch (e) {
        // Context may be disposed during navigation - return null to avoid crash
        if (kDebugMode) {
          print('ROUTER: Error accessing AppStateProvider (context disposed): $e');
        }
        return null;
      }
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
          onComplete: () {
            print('🔍 ROUTER: onComplete callback RECEIVED from OnboardingFlow');
            try {
              final appStateProvider = context.read<AppStateProvider>();
              print('🔍 ROUTER: Got AppStateProvider, calling completeOnboarding()');
              appStateProvider.completeOnboarding();
              print('🔍 ROUTER: completeOnboarding() call completed');
            } catch (e) {
              print('🔍 ROUTER: ERROR in onComplete callback: $e');
              if (kDebugMode) {
                print('ROUTER: Error completing onboarding (context disposed): $e');
              }
            }
          },
          onAuthenticationSuccess: () {
            try {
              final appState = context.read<AppStateProvider>();
              appState.completeOnboarding();
              appState.setLoggedIn(true);
            } catch (e) {
              if (kDebugMode) {
                print('ROUTER: Error in auth success (context disposed): $e');
              }
            }
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