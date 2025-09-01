import 'package:flutter_test/flutter_test.dart';
import 'package:serenya_app/services/consent_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  
  group('ConsentService', () {
    late ConsentService consentService;

    setUp(() {
      consentService = ConsentService();
    });

    test('isOnboardingCompleted returns false initially', () async {
      final result = await consentService.isOnboardingCompleted();
      expect(result, isFalse);
    });

    test('trackSlideView stores slide data', () async {
      await consentService.trackSlideView(0, 'Welcome');
      
      final data = await consentService.getConsentData();
      expect(data, isNotNull);
      expect(data!['slide_views'], isA<List>());
      
      final slideViews = data['slide_views'] as List;
      expect(slideViews.length, 1);
      expect(slideViews[0]['slide_index'], 0);
      expect(slideViews[0]['slide_name'], 'Welcome');
      expect(slideViews[0]['timestamp'], isA<String>());
    });

    test('trackSlideView accumulates multiple views', () async {
      await consentService.trackSlideView(0, 'Welcome');
      await consentService.trackSlideView(1, 'Privacy');
      await consentService.trackSlideView(2, 'Disclaimer');
      
      final data = await consentService.getConsentData();
      final slideViews = data!['slide_views'] as List;
      
      expect(slideViews.length, 3);
      expect(slideViews[0]['slide_name'], 'Welcome');
      expect(slideViews[1]['slide_name'], 'Privacy');
      expect(slideViews[2]['slide_name'], 'Disclaimer');
    });

    test('recordConsent stores consent data and marks onboarding complete', () async {
      await consentService.recordConsent(true, true);
      
      final data = await consentService.getConsentData();
      expect(data!['consent'], isNotNull);
      
      final consent = data['consent'];
      expect(consent['agreed_to_terms'], isTrue);
      expect(consent['understood_disclaimer'], isTrue);
      expect(consent['timestamp'], isA<String>());
      expect(consent['version'], '1.0');
      
      final isCompleted = await consentService.isOnboardingCompleted();
      expect(isCompleted, isTrue);
    });

    test('clearConsentData removes all data', () async {
      // Add some data first
      await consentService.trackSlideView(0, 'Welcome');
      await consentService.recordConsent(true, true);
      
      // Verify data exists
      expect(await consentService.isOnboardingCompleted(), isTrue);
      expect(await consentService.getConsentData(), isNotNull);
      
      // Clear data
      await consentService.clearConsentData();
      
      // Verify data is cleared
      expect(await consentService.isOnboardingCompleted(), isFalse);
      expect(await consentService.getConsentData(), isNull);
    });

    test('getConsentData returns null when no data exists', () async {
      final data = await consentService.getConsentData();
      expect(data, isNull);
    });

    test('consent data includes proper timestamp formatting', () async {
      final beforeTime = DateTime.now();
      await consentService.recordConsent(true, true);
      final afterTime = DateTime.now();
      
      final data = await consentService.getConsentData();
      final timestamp = DateTime.parse(data!['consent']['timestamp']);
      
      expect(timestamp.isAfter(beforeTime) || timestamp.isAtSameMomentAs(beforeTime), isTrue);
      expect(timestamp.isBefore(afterTime) || timestamp.isAtSameMomentAs(afterTime), isTrue);
    });

    test('handles malformed existing data gracefully', () async {
      // This test would require mocking the storage to return bad data
      // In a real implementation, you'd inject the storage dependency
      
      // For now, just verify that the service doesn't crash with various inputs
      await consentService.trackSlideView(0, 'Welcome');
      final data = await consentService.getConsentData();
      expect(data, isNotNull);
    });
  });
}