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

  bool get isInitialized => _isInitialized;
  bool get isOnboardingComplete => _isOnboardingComplete;
  bool get isLoggedIn => _isLoggedIn;
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
      // Add timeout to prevent perpetual loading
      await _checkAppState().timeout(
        const Duration(seconds: 10),
        onTimeout: () {
          if (kDebugMode) {
            print('APP_STATE: Initialization timed out after 10 seconds');
          }
          throw TimeoutException('App initialization timed out', const Duration(seconds: 10));
        },
      );
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
    final loggedIn = await _authService.isLoggedIn();
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
    _setLoading(true);
    _clearError();

    try {
      await _consentService.markOnboardingCompleted();
      _isOnboardingComplete = true;
      notifyListeners();
    } catch (e) {
      _setError('Failed to complete onboarding: $e');
    } finally {
      _setLoading(false);
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
}