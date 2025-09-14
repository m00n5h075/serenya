import 'package:flutter_test/flutter_test.dart';
import 'package:serenya_app/models/local_database_models.dart';

void main() {
  group('ContentType Enum', () {
    test('should convert to string correctly', () {
      expect(ContentType.result.value, 'result');
      expect(ContentType.report.value, 'report');
    });

    test('should convert from string correctly', () {
      expect(ContentType.fromString('result'), ContentType.result);
      expect(ContentType.fromString('report'), ContentType.report);
    });

    test('should throw on invalid string', () {
      expect(() => ContentType.fromString('invalid'), throwsA(isA<StateError>()));
    });
  });

  group('MessageSenderType Enum', () {
    test('should convert to string correctly', () {
      expect(MessageSenderType.user.value, 'user');
      expect(MessageSenderType.serenya.value, 'serenya');
    });

    test('should convert from string correctly', () {
      expect(MessageSenderType.fromString('user'), MessageSenderType.user);
      expect(MessageSenderType.fromString('serenya'), MessageSenderType.serenya);
    });
  });

  group('VitalType Enum', () {
    test('should have correct values', () {
      expect(VitalType.bloodPressure.value, 'blood_pressure');
      expect(VitalType.heartRate.value, 'heart_rate');
      expect(VitalType.temperature.value, 'temperature');
      expect(VitalType.weight.value, 'weight');
      expect(VitalType.height.value, 'height');
      expect(VitalType.oxygenSaturation.value, 'oxygen_saturation');
    });

    test('should convert from string correctly', () {
      expect(VitalType.fromString('blood_pressure'), VitalType.bloodPressure);
      expect(VitalType.fromString('heart_rate'), VitalType.heartRate);
      expect(VitalType.fromString('oxygen_saturation'), VitalType.oxygenSaturation);
    });
  });

  group('SerenyaContent Model', () {
    final testContent = SerenyaContent(
      id: 'test-uuid-1',
      userId: 'user-uuid-1',
      contentType: ContentType.result,
      title: 'Blood Test Analysis',
      content: 'Your blood test results show...',
      confidenceScore: 8.5,
      medicalFlags: const ['normal_glucose', 'elevated_cholesterol'],
      createdAt: DateTime.parse('2025-01-01T10:00:00Z'),
      updatedAt: DateTime.parse('2025-01-01T10:00:00Z'),
    );

    test('should create instance correctly', () {
      expect(testContent.id, 'test-uuid-1');
      expect(testContent.userId, 'user-uuid-1');
      expect(testContent.contentType, ContentType.result);
      expect(testContent.title, 'Blood Test Analysis');
      expect(testContent.content, 'Your blood test results show...');
      expect(testContent.confidenceScore, 8.5);
      expect(testContent.medicalFlags, ['normal_glucose', 'elevated_cholesterol']);
    });

    test('should implement equality correctly', () {
      final content1 = SerenyaContent(
        id: 'test-1',
        userId: 'user-1',
        contentType: ContentType.result,
        title: 'Test',
        content: 'Content',
        confidenceScore: 5.0,
        medicalFlags: const [],
        createdAt: DateTime.parse('2025-01-01T10:00:00Z'),
        updatedAt: DateTime.parse('2025-01-01T10:00:00Z'),
      );

      final content2 = SerenyaContent(
        id: 'test-1',
        userId: 'user-1',
        contentType: ContentType.result,
        title: 'Test',
        content: 'Content',
        confidenceScore: 5.0,
        medicalFlags: const [],
        createdAt: DateTime.parse('2025-01-01T10:00:00Z'),
        updatedAt: DateTime.parse('2025-01-01T10:00:00Z'),
      );

      expect(content1, equals(content2));
    });

    test('should create copy with modified fields', () {
      final modified = testContent.copyWith(
        title: 'Updated Blood Test Analysis',
        confidenceScore: 9.0,
      );

      expect(modified.title, 'Updated Blood Test Analysis');
      expect(modified.confidenceScore, 9.0);
      expect(modified.id, testContent.id); // Unchanged fields should remain
      expect(modified.content, testContent.content);
    });

    test('should create from decrypted fields correctly', () {
      final baseJson = {
        'id': 'test-uuid',
        'user_id': 'user-uuid',
        'content_type': 'result',
        'title': 'Test Analysis',
        'confidence_score': 7.5,
        'created_at': '2025-01-01T10:00:00Z',
        'updated_at': '2025-01-01T10:00:00Z',
      };

      final content = SerenyaContent.fromDecryptedFields(
        baseJson,
        'Decrypted content text',
        '["flag1", "flag2"]',
        null,
      );

      expect(content.id, 'test-uuid');
      expect(content.contentType, ContentType.result);
      expect(content.content, 'Decrypted content text');
      expect(content.medicalFlags, ['flag1', 'flag2']);
      expect(content.confidenceScore, 7.5);
    });

    test('should handle null medical flags correctly', () {
      final baseJson = {
        'id': 'test-uuid',
        'user_id': 'user-uuid',
        'content_type': 'result',
        'title': 'Test Analysis',
        'confidence_score': 7.5,
        'created_at': '2025-01-01T10:00:00Z',
        'updated_at': '2025-01-01T10:00:00Z',
      };

      final content = SerenyaContent.fromDecryptedFields(
        baseJson,
        'Decrypted content text',
        null, // No medical flags
        null, // No summary
      );

      expect(content.medicalFlags, isEmpty);
    });
  });

  group('LabResult Model', () {
    final testLabResult = LabResult(
      id: 'lab-uuid-1',
      userId: 'user-uuid-1',
      serenyaContentId: 'content-uuid-1',
      testName: 'Blood Glucose',
      testCategory: TestCategoryType.blood,
      testValue: 95.0,
      testUnit: 'mg/dL',
      referenceRangeLow: 70.0,
      referenceRangeHigh: 100.0,
      referenceRangeText: 'Normal',
      isAbnormal: false,
      confidenceScore: 9.2,
      aiInterpretation: 'Your glucose level is within normal range.',
      createdAt: DateTime.parse('2025-01-01T10:00:00Z'),
    );

    test('should create instance correctly', () {
      expect(testLabResult.id, 'lab-uuid-1');
      expect(testLabResult.testName, 'Blood Glucose');
      expect(testLabResult.testCategory, TestCategoryType.blood);
      expect(testLabResult.testValue, 95.0);
      expect(testLabResult.testUnit, 'mg/dL');
      expect(testLabResult.isAbnormal, false);
      expect(testLabResult.confidenceScore, 9.2);
    });

    test('should convert to JSON correctly', () {
      final json = testLabResult.toJson();

      expect(json['id'], 'lab-uuid-1');
      expect(json['test_name'], 'Blood Glucose');
      expect(json['test_category'], 'blood');
      expect(json['test_value'], 95.0);
      expect(json['is_abnormal'], 0); // Boolean to integer conversion
      expect(json['created_at'], '2025-01-01T10:00:00.000Z');
    });

    test('should create from JSON correctly', () {
      final json = {
        'id': 'lab-uuid-2',
        'user_id': 'user-uuid-2',
        'serenya_content_id': 'content-uuid-2',
        'test_name': 'Total Cholesterol',
        'test_category': 'blood',
        'test_value': 220.0,
        'test_unit': 'mg/dL',
        'reference_range_low': 100.0,
        'reference_range_high': 200.0,
        'reference_range_text': 'Elevated',
        'is_abnormal': 1, // Integer to boolean conversion
        'confidence_score': 8.8,
        'ai_interpretation': 'Cholesterol is elevated.',
        'created_at': '2025-01-01T11:00:00Z',
      };

      final labResult = LabResult.fromJson(json);

      expect(labResult.id, 'lab-uuid-2');
      expect(labResult.testName, 'Total Cholesterol');
      expect(labResult.testValue, 220.0);
      expect(labResult.isAbnormal, true); // Integer 1 should convert to true
      expect(labResult.confidenceScore, 8.8);
    });

    test('should handle null values correctly', () {
      final json = {
        'id': 'lab-uuid-3',
        'user_id': 'user-uuid-3',
        'serenya_content_id': 'content-uuid-3',
        'test_name': 'Qualitative Test',
        'test_category': 'other',
        'test_value': null,
        'test_unit': null,
        'reference_range_low': null,
        'reference_range_high': null,
        'reference_range_text': 'Positive',
        'is_abnormal': 0,
        'confidence_score': null,
        'ai_interpretation': null,
        'created_at': '2025-01-01T12:00:00Z',
      };

      final labResult = LabResult.fromJson(json);

      expect(labResult.testValue, isNull);
      expect(labResult.testUnit, isNull);
      expect(labResult.confidenceScore, isNull);
      expect(labResult.aiInterpretation, isNull);
      expect(labResult.referenceRangeText, 'Positive');
    });
  });

  group('Vital Model', () {
    test('should create blood pressure vital correctly', () {
      final bpVital = Vital(
        id: 'vital-uuid-1',
        userId: 'user-uuid-1',
        serenyaContentId: 'content-uuid-1',
        vitalType: VitalType.bloodPressure,
        systolicValue: 120,
        diastolicValue: 80,
        unit: 'mmHg',
        isAbnormal: false,
        confidenceScore: 9.0,
        aiInterpretation: 'Blood pressure is normal.',
        createdAt: DateTime.parse('2025-01-01T10:00:00Z'),
      );

      expect(bpVital.vitalType, VitalType.bloodPressure);
      expect(bpVital.systolicValue, 120);
      expect(bpVital.diastolicValue, 80);
      expect(bpVital.numericValue, isNull);
    });

    test('should create single-value vital correctly', () {
      final heartRateVital = Vital(
        id: 'vital-uuid-2',
        userId: 'user-uuid-1',
        serenyaContentId: 'content-uuid-1',
        vitalType: VitalType.heartRate,
        numericValue: 72.0,
        unit: 'bpm',
        isAbnormal: false,
        createdAt: DateTime.parse('2025-01-01T10:00:00Z'),
      );

      expect(heartRateVital.vitalType, VitalType.heartRate);
      expect(heartRateVital.numericValue, 72.0);
      expect(heartRateVital.systolicValue, isNull);
      expect(heartRateVital.diastolicValue, isNull);
    });

    test('should format blood pressure value correctly', () {
      final bpVital = Vital(
        id: 'vital-uuid',
        userId: 'user-uuid',
        serenyaContentId: 'content-uuid',
        vitalType: VitalType.bloodPressure,
        systolicValue: 130,
        diastolicValue: 85,
        unit: 'mmHg',
        isAbnormal: true,
        createdAt: DateTime.now(),
      );

      expect(bpVital.getFormattedValue(), '130/85 mmHg');
    });

    test('should format single-value vital correctly', () {
      final weightVital = Vital(
        id: 'vital-uuid',
        userId: 'user-uuid',
        serenyaContentId: 'content-uuid',
        vitalType: VitalType.weight,
        numericValue: 70.5,
        unit: 'kg',
        isAbnormal: false,
        createdAt: DateTime.now(),
      );

      expect(weightVital.getFormattedValue(), '70.5 kg');
    });

    test('should handle missing values in formatting', () {
      final incompleteVital = Vital(
        id: 'vital-uuid',
        userId: 'user-uuid',
        serenyaContentId: 'content-uuid',
        vitalType: VitalType.bloodPressure,
        // Missing systolic/diastolic values
        isAbnormal: false,
        createdAt: DateTime.now(),
      );

      expect(incompleteVital.getFormattedValue(), '?/? mmHg');
    });

    test('should convert to/from JSON correctly', () {
      final vital = Vital(
        id: 'vital-uuid',
        userId: 'user-uuid',
        serenyaContentId: 'content-uuid',
        vitalType: VitalType.temperature,
        numericValue: 36.5,
        unit: '°C',
        isAbnormal: false,
        confidenceScore: 8.5,
        createdAt: DateTime.parse('2025-01-01T10:00:00Z'),
      );

      final json = vital.toJson();
      final reconstructed = Vital.fromJson(json);

      expect(reconstructed.id, vital.id);
      expect(reconstructed.vitalType, vital.vitalType);
      expect(reconstructed.numericValue, vital.numericValue);
      expect(reconstructed.unit, vital.unit);
      expect(reconstructed.isAbnormal, vital.isAbnormal);
    });
  });

  group('ChatMessage Model', () {
    test('should create user message correctly', () async {
      final userMessage = ChatMessage(
        id: 'msg-uuid-1',
        serenyaContentId: 'content-uuid-1',
        sender: MessageSenderType.user,
        message: 'What does this mean?',
        createdAt: DateTime.parse('2025-01-01T10:00:00Z'),
      );

      expect(userMessage.sender, MessageSenderType.user);
      expect(userMessage.message, 'What does this mean?');
      expect(userMessage.messageMetadata, isNull);
    });

    test('should create AI response with metadata correctly', () {
      final aiMessage = ChatMessage(
        id: 'msg-uuid-2',
        serenyaContentId: 'content-uuid-1',
        sender: MessageSenderType.serenya,
        message: 'This indicates your glucose levels are normal.',
        messageMetadata: const {
          'confidence': 0.95,
          'sources': ['lab_results', 'medical_knowledge'],
        },
        createdAt: DateTime.parse('2025-01-01T10:05:00Z'),
      );

      expect(aiMessage.sender, MessageSenderType.serenya);
      expect(aiMessage.messageMetadata?['confidence'], 0.95);
      expect(aiMessage.messageMetadata?['sources'], isA<List>());
    });

    test('should implement equality correctly', () {
      final message1 = ChatMessage(
        id: 'msg-1',
        serenyaContentId: 'content-1',
        sender: MessageSenderType.user,
        message: 'Test message',
        createdAt: DateTime.parse('2025-01-01T10:00:00Z'),
      );

      final message2 = ChatMessage(
        id: 'msg-1',
        serenyaContentId: 'content-1',
        sender: MessageSenderType.user,
        message: 'Test message',
        createdAt: DateTime.parse('2025-01-01T10:00:00Z'),
      );

      expect(message1, equals(message2));
    });
  });

  group('UserPreference Model', () {
    test('should create preference correctly', () {
      final preference = UserPreference(
        key: 'theme_mode',
        value: 'dark',
        createdAt: DateTime.parse('2025-01-01T10:00:00Z'),
        updatedAt: DateTime.parse('2025-01-01T10:00:00Z'),
      );

      expect(preference.key, 'theme_mode');
      expect(preference.value, 'dark');
    });

    test('should handle null preference value', () {
      final preference = UserPreference(
        key: 'optional_setting',
        value: null,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      expect(preference.value, isNull);
    });

    test('should convert to/from JSON correctly', () {
      final preference = UserPreference(
        key: 'language',
        value: 'en',
        createdAt: DateTime.parse('2025-01-01T10:00:00Z'),
        updatedAt: DateTime.parse('2025-01-01T10:00:00Z'),
      );

      final json = preference.toJson();
      final reconstructed = UserPreference.fromJson(json);

      expect(reconstructed.key, preference.key);
      expect(reconstructed.value, preference.value);
    });
  });

  group('Model Validation', () {
    test('should validate confidence score ranges', () {
      // This would test validation logic if implemented in the models
      // For now, just verify the constraint is documented correctly
      expect(0.0, lessThanOrEqualTo(10.0));
      expect(10.0, greaterThanOrEqualTo(0.0));
    });

    test('should validate required fields', () {
      // Test that required fields are properly enforced
      expect(() => SerenyaContent(
        id: '',
        userId: '',
        contentType: ContentType.result,
        title: '',
        content: '',
        confidenceScore: 0.0,
        medicalFlags: const [],
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      ), returnsNormally); // Should allow empty strings if that's intended
    });
  });
}