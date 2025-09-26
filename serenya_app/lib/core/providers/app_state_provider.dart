import 'dart:async';
import 'package:flutter/foundation.dart';
import '../../services/auth_service.dart';
import '../../services/consent_service.dart';

class AppStateProvider extends ChangeNotifier {
  bool _isInitialized = false;
  bool _isOnboardingComplete = false;
  bool _isLoggedIn = false;
  bool _isLoading = true;
  bool _isAuthenticating = false; // STRATEGIC FIX: Prevent router redirects during authentication
  String? _error;
  
  // CRITICAL FIX: Accept AuthService as parameter to break circular dependency
  final AuthService _authService;
  final ConsentService _consentService = ConsentService();

  AppStateProvider({required AuthService authService}) : _authService = authService {
    if (kDebugMode) {
      print('🏠 APP_STATE: AppStateProvider created with provided AuthService instance');
    }
    // CRITICAL FIX: Set up the reference so AuthService can notify us
    _authService.setAppStateProvider(this);
  }

  bool get isInitialized => _isInitialized;
  bool get isOnboardingComplete => _isOnboardingComplete;
  bool get isAuthenticating => _isAuthenticating; // STRATEGIC FIX: Expose authentication state
  
  /// Expose AuthService for components that need direct access (like ConsentSlide)
  AuthService get authService => _authService;
  bool get isLoggedIn => _isLoggedIn;

  /// Force refresh the authentication state and notify listeners
  void refreshAuthState() {
    final hasTokens = _authService.hasValidTokensSync();
    // STRATEGIC FIX: User is only logged in when BOTH authenticated AND onboarded
    final newState = hasTokens && _isOnboardingComplete;
    if (newState != _isLoggedIn) {
      _isLoggedIn = newState;
      debugPrint('APP_STATE: Login state changed to: $newState (hasTokens: $hasTokens, onboarded: $_isOnboardingComplete)');
      notifyListeners();
    }
  }
  bool get isLoading => _isLoading;
  String? get error => _error;

  Future<void> initialize() async {
    if (_isInitialized) return;

    if (kDebugMode) {
      print('APP_STATE: Starting initialization...');
    }
    _setLoading(true);
    _clearError();

    try {
      if (kDebugMode) {
        print('APP_STATE: Checking app state...');
      }
      
      // Start both the state check and minimum loading time
      final stateCheckFuture = _checkAppState().timeout(
        const Duration(seconds: 30),
        onTimeout: () {
          if (kDebugMode) {
            print('APP_STATE: Initialization timed out after 30 seconds');
          }
          throw TimeoutException('App initialization timed out', const Duration(seconds: 30));
        },
      );
      
      // Ensure minimum loading time to show spinner (iOS fix)
      final minimumLoadingFuture = Future.delayed(const Duration(milliseconds: 800));
      
      await Future.wait([stateCheckFuture, minimumLoadingFuture]);
      
      if (kDebugMode) {
        print('APP_STATE: App state checked successfully');
      }
      _isInitialized = true;
      if (kDebugMode) {
        print('APP_STATE: Initialization complete');
      }
    } catch (e) {
      if (kDebugMode) {
        print('APP_STATE: Error during initialization: $e');
      }
      if (e is TimeoutException) {
        _setError('App took too long to load. Please try restarting the app.');
      } else {
        _setError('Failed to initialize app: $e');
      }
    } finally {
      if (kDebugMode) {
        print('APP_STATE: Setting loading to false');
      }
      _setLoading(false);
    }
  }

  Future<void> _checkAppState() async {
    if (kDebugMode) {
      print('🔍 APP_STATE: Starting _checkAppState()');
    }
    if (kDebugMode) {
      print('APP_STATE: Checking onboarding status...');
    }
    final onboardingComplete = await _consentService.isOnboardingCompleted();
    if (kDebugMode) {
      print('APP_STATE: Onboarding complete: $onboardingComplete');
    }
    
    if (kDebugMode) {
      print('APP_STATE: Checking login status...');
    }
    // FIXED: Use proper authentication check during initialization
    final loggedIn = await _authService.isLoggedIn(isInitialization: true);
    if (kDebugMode) {
      print('APP_STATE: Authentication check result: $loggedIn');
    }
    
    // CRITICAL: Only mark as logged in if BOTH conditions are met
    final finalLoggedInState = loggedIn && onboardingComplete;
    if (kDebugMode) {
      print('🔍 APP_STATE: Final state calculation:');
      print('🔍 APP_STATE:   - onboardingComplete: $onboardingComplete');
      print('🔍 APP_STATE:   - authService.isLoggedIn: $loggedIn');
      print('🔍 APP_STATE:   - finalLoggedInState: $finalLoggedInState');
    }
    
    _isOnboardingComplete = onboardingComplete;
    _isLoggedIn = finalLoggedInState;
    
    if (kDebugMode) {
      print('APP_STATE: Setting state - onboardingComplete: $_isOnboardingComplete, loggedIn: $_isLoggedIn');
      print('APP_STATE: Notifying listeners...');
    }
    notifyListeners();
    if (kDebugMode) {
      print('APP_STATE: Listeners notified');
    }
  }

  Future<void> completeOnboarding() async {
    print('🔍 APP_STATE: completeOnboarding() called');
    print('🔍 APP_STATE: Before - isOnboardingComplete: $_isOnboardingComplete, isLoggedIn: $_isLoggedIn, isAuthenticating: $_isAuthenticating');
    
    // STRATEGIC FIX: Don't trigger loading notifications if we're in authentication flow
    if (!_isAuthenticating) {
      _setLoading(true);
    } else {
      _isLoading = true; // Set directly without notifying listeners
      print('🔍 APP_STATE: Setting loading = true (no notifications during authentication)');
    }
    _clearError();

    try {
      await _consentService.markOnboardingCompleted();
      _isOnboardingComplete = true;
      
      // VERIFICATION: Immediately check if the onboarding completion was persisted
      final verificationCheck = await _consentService.isOnboardingCompleted();
      print('🔍 APP_STATE: VERIFICATION - onboarding completion persisted correctly: $verificationCheck');
      
      if (!verificationCheck) {
        print('❌ APP_STATE: CRITICAL ERROR - onboarding completion was not persisted!');
        throw Exception('Failed to persist onboarding completion');
      }
      
      // STRATEGIC FIX: Set logged in state only when BOTH authentication AND onboarding are complete
      final hasTokens = _authService.hasValidTokensSync();
      if (hasTokens) {
        _isLoggedIn = true;
        print('🔍 APP_STATE: User fully authenticated and onboarded - setting isLoggedIn = true');
      } else {
        print('🔍 APP_STATE: Onboarding complete but no valid tokens - isLoggedIn remains false');
      }
      
      print('🔍 APP_STATE: After completion - isOnboardingComplete: $_isOnboardingComplete, isLoggedIn: $_isLoggedIn');
      
      // STRATEGIC FIX: If we're in authentication flow, complete it automatically
      // to avoid widget disposal issues when calling completeAuthentication() from disposed widgets
      if (_isAuthenticating) {
        print('🔍 APP_STATE: In authentication flow - calling completeAuthentication() automatically');
        // Call completeAuthentication() directly to avoid context issues
        completeAuthentication();
      } else {
        print('🔍 APP_STATE: Not in authentication flow - notifying listeners directly');
        notifyListeners();
        print('🔍 APP_STATE: Listeners notified - should trigger final router redirect to home');
      }
    } catch (e) {
      print('🔍 APP_STATE: ERROR completing onboarding: $e');
      _setError('Failed to complete onboarding: $e');
    } finally {
      print('🔍 APP_STATE: Setting loading to false');
      // STRATEGIC FIX: Don't trigger loading notifications if we're in authentication flow
      if (!_isAuthenticating) {
        _setLoading(false);
      } else {
        _isLoading = false; // Set directly without notifying listeners
      }
      print('🔍 APP_STATE: completeOnboarding() method complete');
    }
  }

  Future<void> login({Map<String, dynamic>? consentData}) async {
    _setLoading(true);
    _clearError();

    try {
      final result = await _authService.signInWithGoogle(
        consentData: consentData,
        requireBiometric: true,
      );
      
      if (result.success) {
        _isLoggedIn = true;
        // Now that user is authenticated, initialize polling service for job monitoring
        // TODO: Add polling service initialization here
        notifyListeners();
      } else if (result.cancelled) {
        _setError('Sign in was cancelled');
      } else {
        _setError(result.message);
      }
    } catch (e) {
      _setError('Login error: $e');
    } finally {
      _setLoading(false);
    }
  }

  Future<void> logout() async {
    _setLoading(true);
    _clearError();

    try {
      await _authService.signOut();
      _isLoggedIn = false;
      notifyListeners();
    } catch (e) {
      _setError('Logout error: $e');
    } finally {
      _setLoading(false);
    }
  }

  Future<void> resetApp() async {
    _setLoading(true);
    _clearError();

    try {
      await _authService.signOut();
      await _consentService.clearAllConsent();
      
      _isOnboardingComplete = false;
      _isLoggedIn = false;
      notifyListeners();
    } catch (e) {
      _setError('Failed to reset app: $e');
    } finally {
      _setLoading(false);
    }
  }

  void _setLoading(bool loading) {
    _isLoading = loading;
    notifyListeners();
  }

  void _setError(String error) {
    _error = error;
    notifyListeners();
  }

  void _clearError() {
    _error = null;
  }

  // Method to set logged in status directly (for onboarding flow)
  void setLoggedIn(bool loggedIn) {
    _isLoggedIn = loggedIn;
    notifyListeners();
  }

  // Method to refresh app state after authentication changes
  Future<void> refreshAppState() async {
    if (kDebugMode) {
      print('APP_STATE: Refreshing app state...');
    }
    await _checkAppState();
  }

  /// STRATEGIC FIX: Mark authentication start to prevent router redirects
  void startAuthentication() {
    print('🔐 APP_STATE: Starting authentication - preventing router redirects');
    _isAuthenticating = true;
    // CRITICAL: Don't call notifyListeners() - this would trigger router redirects
    // The router will stay on current page until completeAuthentication() is called
  }

  /// STRATEGIC FIX: Mark authentication complete and allow router redirects
  void completeAuthentication() {
    print('🔐 APP_STATE: Authentication complete - allowing router redirects');
    _isAuthenticating = false;
    notifyListeners(); // Now safe to trigger router redirects
  }
}