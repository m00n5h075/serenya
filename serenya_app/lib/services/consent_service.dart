import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dart:convert';

class ConsentService {
  static const _storage = FlutterSecureStorage();
  static const String _onboardingCompletedKey = 'onboarding_completed';
  static const String _consentDataKey = 'consent_data';

  // Check if onboarding is completed
  Future<bool> isOnboardingCompleted() async {
    try {
      final completed = await _storage.read(key: _onboardingCompletedKey);
      return completed == 'true';
    } catch (e) {
      // If secure storage fails, assume onboarding is not completed
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
    await _storage.write(key: _onboardingCompletedKey, value: 'true');
    print('🔍 CONSENT_SERVICE: Storage write completed');
    
    // Verify it was written
    final verification = await _storage.read(key: _onboardingCompletedKey);
    print('🔍 CONSENT_SERVICE: Verification read: $verification');
  }

  // Clear all consent (for app reset)
  Future<void> clearAllConsent() async {
    await clearConsentData();
  }
}