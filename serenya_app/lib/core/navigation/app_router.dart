import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../screens/onboarding/onboarding_flow.dart';
import '../../screens/home_screen.dart';
import '../../screens/auth_prompt_screen.dart';
import '../providers/app_state_provider.dart';
import '../../widgets/serenya_spinner.dart';

class AppRouter {
  static GoRouter createRouter(AppStateProvider appStateProvider) {
    return GoRouter(
      initialLocation: '/loading',
      refreshListenable: appStateProvider,
      redirect: (context, state) {
      try {
        // CRITICAL FIX: Add error boundary for provider access
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
      
      // STRATEGIC FIX: If authenticating, prevent redirects to avoid widget disposal
      if (appState.isAuthenticating) {
        if (kDebugMode) {
          print('🔐 ROUTER: Authentication in progress - preventing redirects to avoid widget disposal');
        }
        return null; // Stay on current route
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
      
      // Updated routing logic to handle authentication prompt
      // FIXED: Use synchronous token check while determining if user has an account
      final hasValidTokens = appState.authService.hasValidTokensSync();
      print('🔍 ROUTER: Evaluating redirect logic:');
      print('🔍 ROUTER:   - isOnboardingComplete: ${appState.isOnboardingComplete}');
      print('🔍 ROUTER:   - isLoggedIn: ${appState.isLoggedIn}');
      print('🔍 ROUTER:   - hasValidTokensSync: $hasValidTokens');
      print('🔍 ROUTER:   - currentPath: $currentPath');
      
      if (!appState.isOnboardingComplete) {
        // If onboarding not complete, always go to onboarding (handles both logged in and not logged in states)
        print('🔍 ROUTER: CONDITION 1 - Onboarding not complete, redirecting to onboarding');
        return currentPath != '/onboarding' ? '/onboarding' : null;
      }
      
      // If onboarding complete but not logged in, check if user has valid session tokens
      if (appState.isOnboardingComplete && !appState.isLoggedIn) {
        // Check if user has valid session tokens (authenticated user who needs to re-authenticate)
        if (hasValidTokens) {
          // Authenticated user with completed onboarding - show auth prompt instead of onboarding
          print('🔍 ROUTER: CONDITION 2A - Onboarding complete, has valid session tokens but not logged in, redirecting to auth prompt');
          print('🔍 ROUTER: This should be the case for app kill/restart scenario');
          return currentPath != '/auth-prompt' ? '/auth-prompt' : null;
        } else {
          // No valid session tokens - user needs to authenticate again, show auth prompt if they have an account
          print('🔍 ROUTER: CONDITION 2B - Onboarding complete but no valid session tokens');
          // For now, assume they have an account and send to auth prompt - 
          // the auth prompt will handle checking if account exists and redirect to onboarding if needed
          print('🔍 ROUTER: Sending to auth prompt to check for stored account');
          return currentPath != '/auth-prompt' ? '/auth-prompt' : null;
        }
      }
      
      // If both onboarding complete and logged in, go to home
      if (appState.isOnboardingComplete && appState.isLoggedIn && currentPath != '/home') {
        print('🔍 ROUTER: CONDITION 3 - Both onboarding complete and logged in, redirecting to home');
        return '/home';
      }
      
      // No redirect needed
      print('🔍 ROUTER: NO REDIRECT NEEDED - staying on current path: $currentPath');
      return null;
      } catch (e, stackTrace) {
        // CRITICAL FIX: Enhanced error handling with more details
        if (kDebugMode) {
          print('🔥 ROUTER: Error accessing AppStateProvider: $e');
          print('🔥 ROUTER: Stack trace: $stackTrace');
          print('🔥 ROUTER: Error type: ${e.runtimeType}');
        }
        
        // If it's a provider error, redirect to loading to reinitialize
        if (e.toString().contains('Provider') || e.toString().contains('context')) {
          if (kDebugMode) {
            print('🔥 ROUTER: Provider/context error - redirecting to loading screen');
          }
          return '/loading';
        }
        
        // For other errors, stay on current route to avoid navigation loops
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
            print('🔍 ROUTER: Onboarding completion is now handled directly in ConsentSlide - no action needed');
          },
          onAuthenticationSuccess: () {
            print('🔍 ROUTER: onAuthenticationSuccess callback RECEIVED from OnboardingFlow');
            print('🔍 ROUTER: Authentication success is now handled directly in ConsentSlide - no action needed');
          },
        ),
      ),
      GoRoute(
        path: '/auth-prompt',
        builder: (context, state) => const AuthPromptScreen(),
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
    // CRITICAL FIX: Add error handling for initialization
    WidgetsBinding.instance.addPostFrameCallback((_) {
      try {
        if (kDebugMode) {
          print('🔄 LOADING_SCREEN: Attempting to initialize AppStateProvider...');
        }
        
        final appState = context.read<AppStateProvider>();
        appState.initialize().catchError((error, stackTrace) {
          if (kDebugMode) {
            print('❌ LOADING_SCREEN: AppStateProvider initialization failed: $error');
            print('❌ LOADING_SCREEN: Stack trace: $stackTrace');
          }
        });
      } catch (e, stackTrace) {
        if (kDebugMode) {
          print('🔥 LOADING_SCREEN: Error accessing AppStateProvider: $e');
          print('🔥 LOADING_SCREEN: Stack trace: $stackTrace');
        }
      }
    });

    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const SerenyaSpinnerLarge(),
            const SizedBox(height: 24),
            const Text(
              'Loading Serenya...',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w500,
                color: Color(0xFF2196F3),
              ),
            ),
            if (kDebugMode) ...[
              const SizedBox(height: 16),
              Text(
                'Debug: Initializing core services',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey[600],
                ),
              ),
            ],
          ],
        ),
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