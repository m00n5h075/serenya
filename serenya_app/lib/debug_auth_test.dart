import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'services/auth_service.dart';
import 'services/consent_service.dart';
import 'dart:convert';

/// Debug helper to test authentication persistence
/// This file helps diagnose authentication persistence issues
class AuthDebugHelper {
  static const _storage = FlutterSecureStorage();
  
  /// Print all stored authentication data
  static Future<void> printStoredAuthData() async {
    if (kDebugMode) {
      print('🔧 DEBUG: === STORED AUTHENTICATION DATA ===');
      
      final accessToken = await _storage.read(key: 'serenya_access_token');
      final refreshToken = await _storage.read(key: 'serenya_refresh_token');
      final userData = await _storage.read(key: 'serenya_user_data');
      final sessionData = await _storage.read(key: 'serenya_session_data');
      final lastAuthTime = await _storage.read(key: 'serenya_last_auth_time');
      final biometricSession = await _storage.read(key: 'serenya_biometric_session');
      final offlineAuth = await _storage.read(key: 'serenya_offline_auth_cache');
      final onboardingCompleted = await _storage.read(key: 'onboarding_completed');
      
      print('🔧 DEBUG: accessToken exists: ${accessToken != null}');
      if (accessToken != null) {
        print('🔧 DEBUG: accessToken (first 50 chars): ${accessToken.substring(0, accessToken.length < 50 ? accessToken.length : 50)}...');
      }
      
      print('🔧 DEBUG: refreshToken exists: ${refreshToken != null}');
      if (refreshToken != null) {
        print('🔧 DEBUG: refreshToken (first 50 chars): ${refreshToken.substring(0, refreshToken.length < 50 ? refreshToken.length : 50)}...');
      }
      
      print('🔧 DEBUG: userData exists: ${userData != null}');
      if (userData != null) {
        try {
          final userJson = jsonDecode(userData);
          print('🔧 DEBUG: userData: ${userJson['email'] ?? 'no email'} (${userJson['id'] ?? 'no id'})');
        } catch (e) {
          print('🔧 DEBUG: userData parse error: $e');
        }
      }
      
      print('🔧 DEBUG: sessionData exists: ${sessionData != null}');
      print('🔧 DEBUG: lastAuthTime: $lastAuthTime');
      print('🔧 DEBUG: biometricSession: $biometricSession');
      
      print('🔧 DEBUG: offlineAuth exists: ${offlineAuth != null}');
      if (offlineAuth != null) {
        try {
          final offlineJson = jsonDecode(offlineAuth);
          print('🔧 DEBUG: offlineAuth cachedAt: ${offlineJson['cached_at']}');
          print('🔧 DEBUG: offlineAuth userId: ${offlineJson['user_id']}');
        } catch (e) {
          print('🔧 DEBUG: offlineAuth parse error: $e');
        }
      }
      
      print('🔧 DEBUG: onboardingCompleted: $onboardingCompleted');
      
      print('🔧 DEBUG: === END STORED DATA ===');
    }
  }
  
  /// Test the full authentication flow during app startup
  static Future<void> testAppStartupFlow() async {
    if (kDebugMode) {
      print('🧪 TEST: === TESTING APP STARTUP FLOW ===');
      
      // Step 1: Print stored data
      await printStoredAuthData();
      
      // Step 2: Test ConsentService
      final consentService = ConsentService();
      final onboardingComplete = await consentService.isOnboardingCompleted();
      print('🧪 TEST: ConsentService.isOnboardingCompleted(): $onboardingComplete');
      
      // Step 3: Test AuthService
      final authService = AuthService();
      print('🧪 TEST: Testing AuthService.hasAccount()...');
      final hasAccount = await authService.hasAccount();
      print('🧪 TEST: AuthService.hasAccount(): $hasAccount');
      
      print('🧪 TEST: Testing AuthService.isLoggedIn(isInitialization: true)...');
      final isLoggedInInit = await authService.isLoggedIn(isInitialization: true);
      print('🧪 TEST: AuthService.isLoggedIn(isInitialization: true): $isLoggedInInit');
      
      print('🧪 TEST: Testing AuthService.hasValidTokensSync()...');
      final hasValidTokens = authService.hasValidTokensSync();
      print('🧪 TEST: AuthService.hasValidTokensSync(): $hasValidTokens');
      
      // Step 4: Calculate expected router decision
      print('🧪 TEST: === EXPECTED ROUTER DECISION ===');
      print('🧪 TEST: onboardingComplete: $onboardingComplete');
      print('🧪 TEST: hasAccount: $hasAccount');
      print('🧪 TEST: isLoggedIn: $isLoggedInInit');
      print('🧪 TEST: hasValidTokens: $hasValidTokens');
      
      if (!onboardingComplete) {
        print('🧪 TEST: ROUTER SHOULD GO TO: /onboarding (onboarding not complete)');
      } else if (onboardingComplete && !isLoggedInInit) {
        if (hasAccount) {
          print('🧪 TEST: ROUTER SHOULD GO TO: /auth-prompt (onboarding complete, has account, not logged in)');
        } else {
          print('🧪 TEST: ROUTER SHOULD GO TO: /onboarding (onboarding complete, no account)');
        }
      } else if (onboardingComplete && isLoggedInInit) {
        print('🧪 TEST: ROUTER SHOULD GO TO: /home (fully authenticated)');
      }
      
      print('🧪 TEST: === END TEST ===');
    }
  }
  
  /// Clear all authentication data (for testing)
  static Future<void> clearAllAuthData() async {
    if (kDebugMode) {
      print('🗑️ DEBUG: Clearing all authentication data...');
      await Future.wait([
        _storage.delete(key: 'serenya_access_token'),
        _storage.delete(key: 'serenya_refresh_token'),
        _storage.delete(key: 'serenya_user_data'),
        _storage.delete(key: 'serenya_session_data'),
        _storage.delete(key: 'serenya_last_auth_time'),
        _storage.delete(key: 'serenya_biometric_session'),
        _storage.delete(key: 'serenya_offline_auth_cache'),
        _storage.delete(key: 'onboarding_completed'),
        _storage.delete(key: 'consent_data'),
      ]);
      print('🗑️ DEBUG: All authentication data cleared');
    }
  }
  
  /// Simulate a completed authentication state (for testing)
  static Future<void> simulateCompletedAuth() async {
    if (kDebugMode) {
      print('🎭 DEBUG: Simulating completed authentication state...');
      
      // Create fake tokens
      final fakeAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJpYXQiOjE3MzI2NDQwMDAsImV4cCI6MjAzMjY0NDAwMH0.fake-signature';
      final fakeRefreshToken = 'fake-refresh-token';
      final fakeUserData = jsonEncode({
        'id': 'test-user-id',
        'email': 'test@example.com',
        'name': 'Test User'
      });
      final fakeSessionData = jsonEncode({
        'session_id': 'test-session'
      });
      final currentTime = DateTime.now().toIso8601String();
      final offlineAuthData = jsonEncode({
        'cached_at': currentTime,
        'user_id': 'test-user-id',
        'user_email': 'test@example.com',
        'session_valid': true,
      });
      
      await Future.wait([
        _storage.write(key: 'serenya_access_token', value: fakeAccessToken),
        _storage.write(key: 'serenya_refresh_token', value: fakeRefreshToken),
        _storage.write(key: 'serenya_user_data', value: fakeUserData),
        _storage.write(key: 'serenya_session_data', value: fakeSessionData),
        _storage.write(key: 'serenya_last_auth_time', value: currentTime),
        _storage.write(key: 'serenya_biometric_session', value: currentTime),
        _storage.write(key: 'serenya_offline_auth_cache', value: offlineAuthData),
        _storage.write(key: 'onboarding_completed', value: 'true'),
      ]);
      
      print('🎭 DEBUG: Completed authentication state simulated');
      print('🎭 DEBUG: This should result in AuthPromptScreen on app restart');
    }
  }
}