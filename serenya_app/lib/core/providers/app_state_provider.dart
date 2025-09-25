import 'dart:async';
import 'package:flutter/foundation.dart';
import '../../services/auth_service.dart';
import '../../services/consent_service.dart';

class AppStateProvider extends ChangeNotifier {
  bool _isInitialized = false;
  bool _isOnboardingComplete = false;
  bool _isLoggedIn = false;
  bool _isLoading = true;
  String? _error;
  
  final AuthService _authService = AuthService();
  final ConsentService _consentService = ConsentService();

  AppStateProvider() {
    // Set up the circular reference so AuthService can notify us
    _authService.setAppStateProvider(this);
  }

  bool get isInitialized => _isInitialized;
  bool get isOnboardingComplete => _isOnboardingComplete;
  
  /// Expose AuthService for components that need direct access (like ConsentSlide)
  AuthService get authService => _authService;
  bool get isLoggedIn {
    // Check actual token existence instead of cached state
    // This ensures isLoggedIn reflects current authentication status immediately
    try {
      final result = _authService.hasValidTokensSync();
      print('🔍 APP_STATE: isLoggedIn getter called - hasValidTokensSync() returned: $result');
      // Update cached state if it changed
      if (result != _isLoggedIn) {
        print('🔍 APP_STATE: Cached login state changed from $_isLoggedIn to $result');
        _isLoggedIn = result;
        // Don't call notifyListeners here to avoid infinite loops
      }
      return result;
    } catch (e) {
      print('🔍 APP_STATE: ERROR in isLoggedIn getter: $e - returning false');
      return false;
    }
  }

  /// Force refresh the authentication state and notify listeners
  void refreshAuthState() {
    final newState = _authService.hasValidTokensSync();
    if (newState != _isLoggedIn) {
      _isLoggedIn = newState;
      debugPrint('APP_STATE: Authentication state changed to: $newState');
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
      print('APP_STATE: Checking onboarding status...');
    }
    final onboardingComplete = await _consentService.isOnboardingCompleted();
    if (kDebugMode) {
      print('APP_STATE: Onboarding complete: $onboardingComplete');
    }
    
    if (kDebugMode) {
      print('APP_STATE: Checking login status...');
    }
    // During initialization, just use the fast sync check to avoid expensive crypto operations
    final loggedIn = _authService.hasValidTokensSync();
    if (kDebugMode) {
      print('APP_STATE: Logged in: $loggedIn');
    }
    
    _isOnboardingComplete = onboardingComplete;
    _isLoggedIn = loggedIn;
    if (kDebugMode) {
      print('APP_STATE: Notifying listeners...');
    }
    notifyListeners();
    if (kDebugMode) {
      print('APP_STATE: Listeners notified');
    }
  }

  Future<void> completeOnboarding() async {
    print('🔍 APP_STATE: completeOnboarding() called');
    print('🔍 APP_STATE: Before - isOnboardingComplete: $_isOnboardingComplete, isLoggedIn: $_isLoggedIn');
    _setLoading(true);
    _clearError();

    try {
      await _consentService.markOnboardingCompleted();
      _isOnboardingComplete = true;
      print('🔍 APP_STATE: After storage write - isOnboardingComplete: $_isOnboardingComplete, isLoggedIn: $_isLoggedIn');
      print('🔍 APP_STATE: About to notify listeners');
      notifyListeners();
      print('🔍 APP_STATE: Listeners notified - onboarding completion should trigger router redirect');
    } catch (e) {
      print('🔍 APP_STATE: ERROR completing onboarding: $e');
      _setError('Failed to complete onboarding: $e');
    } finally {
      print('🔍 APP_STATE: Setting loading to false');
      _setLoading(false);
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
}