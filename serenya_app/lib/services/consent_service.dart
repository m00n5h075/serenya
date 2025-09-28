import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dart:convert';

class ConsentService {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
      keyCipherAlgorithm: KeyCipherAlgorithm.RSA_ECB_PKCS1Padding,
      storageCipherAlgorithm: StorageCipherAlgorithm.AES_GCM_NoPadding,
    ),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
  );
  static const String _onboardingCompletedKey = 'onboarding_completed';
  static const String _consentDataKey = 'consent_data';

  // Check if onboarding is completed
  Future<bool> isOnboardingCompleted() async {
    try {
      if (kDebugMode) {
        print('🔍 CONSENT_SERVICE: isOnboardingCompleted() called - reading from storage...');
        print('🔍 CONSENT_SERVICE: Using storage key: "$_onboardingCompletedKey"');
      }
      
      final completed = await _storage.read(key: _onboardingCompletedKey);
      
      if (kDebugMode) {
        print('🔍 CONSENT_SERVICE: Storage read result: "$completed" (type: ${completed.runtimeType})');
        print('🔍 CONSENT_SERVICE: Returning: ${completed == 'true'}');
      }
      
      // CRITICAL FIX: Additional verification for null values
      if (completed == null) {
        if (kDebugMode) {
          print('🔍 CONSENT_SERVICE: Storage returned null - checking if key exists');
        }
        
        // Try to list all keys to see if our key exists
        try {
          final allKeys = await _storage.readAll();
          if (kDebugMode) {
            print('🔍 CONSENT_SERVICE: All storage keys: ${allKeys.keys.toList()}');
            print('🔍 CONSENT_SERVICE: Key "$_onboardingCompletedKey" exists: ${allKeys.containsKey(_onboardingCompletedKey)}');
          }
        } catch (e) {
          if (kDebugMode) {
            print('❌ CONSENT_SERVICE: Error reading all keys: $e');
          }
        }
        
        return false;
      }
      
      return completed == 'true';
    } catch (e) {
      // If secure storage fails, assume onboarding is not completed
      if (kDebugMode) {
        print('❌ CONSENT_SERVICE: Failed to read onboarding status: $e');
        print('❌ CONSENT_SERVICE: Error type: ${e.runtimeType}');
        print('❌ CONSENT_SERVICE: Error details: $e');
      }
      debugPrint('ConsentService: Failed to read onboarding status: $e');
      return false;
    }
  }

  // Track slide view
  Future<void> trackSlideView(int slideIndex, String slideName) async {
    final timestamp = DateTime.now().toIso8601String();
    final existingData = await _storage.read(key: _consentDataKey);
    
    Map<String, dynamic> consentData = {};
    if (existingData != null) {
      try {
        consentData = jsonDecode(existingData);
      } catch (e) {
        consentData = {};
      }
    }

    // Track slide views
    if (!consentData.containsKey('slide_views')) {
      consentData['slide_views'] = [];
    }

    (consentData['slide_views'] as List).add({
      'slide_index': slideIndex,
      'slide_name': slideName,
      'timestamp': timestamp,
    });

    await _storage.write(key: _consentDataKey, value: jsonEncode(consentData));
  }

  // Record consent agreement
  Future<void> recordConsent(bool agreedToTerms, bool understoodDisclaimer) async {
    final timestamp = DateTime.now().toIso8601String();
    final existingData = await _storage.read(key: _consentDataKey);
    
    Map<String, dynamic> consentData = {};
    if (existingData != null) {
      try {
        consentData = jsonDecode(existingData);
      } catch (e) {
        consentData = {};
      }
    }

    consentData['consent'] = {
      'agreed_to_terms': agreedToTerms,
      'understood_disclaimer': understoodDisclaimer,
      'timestamp': timestamp,
      'version': '1.0', // Track consent version for legal compliance
    };

    await _storage.write(key: _consentDataKey, value: jsonEncode(consentData));
    // Note: Do NOT mark onboarding as completed here
    // Onboarding completion should happen after biometric setup in the onboarding flow
  }

  // Get consent data for audit/compliance
  Future<Map<String, dynamic>?> getConsentData() async {
    final data = await _storage.read(key: _consentDataKey);
    if (data != null) {
      try {
        return jsonDecode(data);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  // Clear consent data (for logout/reset)
  Future<void> clearConsentData() async {
    await _storage.delete(key: _onboardingCompletedKey);
    await _storage.delete(key: _consentDataKey);
  }

  // Mark onboarding as completed
  Future<void> markOnboardingCompleted() async {
    print('🔍 CONSENT_SERVICE: markOnboardingCompleted() called - writing to storage');
    
    try {
      // Try to write the value
      await _storage.write(key: _onboardingCompletedKey, value: 'true');
      print('🔍 CONSENT_SERVICE: Storage write completed');
      
      // Verify it was written immediately
      final verification = await _storage.read(key: _onboardingCompletedKey);
      print('🔍 CONSENT_SERVICE: Immediate verification read: $verification');
      
      if (verification != 'true') {
        throw Exception('Storage verification failed - expected "true", got "$verification"');
      }
      
      print('🔍 CONSENT_SERVICE: Storage verification successful');
      
      // CRITICAL FIX: Add a delay and re-verify to ensure persistence
      await Future.delayed(const Duration(milliseconds: 100));
      final delayedVerification = await _storage.read(key: _onboardingCompletedKey);
      print('🔍 CONSENT_SERVICE: Delayed verification read: $delayedVerification');
      
      if (delayedVerification != 'true') {
        throw Exception('Delayed storage verification failed - expected "true", got "$delayedVerification"');
      }
      
      print('🔍 CONSENT_SERVICE: All storage verifications successful');
    } catch (e) {
      print('❌ CONSENT_SERVICE: Error in markOnboardingCompleted: $e');
      rethrow;
    }
  }

  // Clear all consent (for app reset)
  Future<void> clearAllConsent() async {
    await clearConsentData();
  }
}