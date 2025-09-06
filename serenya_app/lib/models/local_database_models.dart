import 'dart:convert';
import 'package:equatable/equatable.dart';
import '../core/database/encrypted_database_service.dart';

/// Local Database Models for Encrypted SQLite Storage
/// 
/// Matches the database schema from database-architecture.md
/// All models support encryption/decryption for sensitive fields
/// UUIDs are server-generated and stored as strings

/// Content Types for AI-generated content
enum ContentType {
  result,  // AI analysis of specific medical documents (free tier)
  report;  // Comprehensive reports from complete medical history (premium tier)
  
  String get value => toString().split('.').last;
  
  static ContentType fromString(String value) {
    return ContentType.values.firstWhere((e) => e.value == value);
  }
}

/// Message sender types for chat conversations
enum MessageSenderType {
  user,    // User messages
  serenya; // AI responses
  
  String get value => toString().split('.').last;
  
  static MessageSenderType fromString(String value) {
    return MessageSenderType.values.firstWhere((e) => e.value == value);
  }
}

/// Medical test categories
enum TestCategoryType {
  blood,    // Blood tests (glucose, cholesterol, etc.)
  urine,    // Urine tests
  imaging,  // X-rays, CT scans, MRI, etc.
  other;    // Other medical tests
  
  String get value => toString().split('.').last;
  
  static TestCategoryType fromString(String value) {
    return TestCategoryType.values.firstWhere((e) => e.value == value);
  }
}

/// Vital sign types
enum VitalType {
  bloodPressure('blood_pressure'),
  heartRate('heart_rate'),
  temperature('temperature'),
  weight('weight'),
  height('height'),
  oxygenSaturation('oxygen_saturation');
  
  const VitalType(this.value);
  final String value;
  
  static VitalType fromString(String value) {
    return VitalType.values.firstWhere((v) => v.value == value);
  }
}

/// Central table for all AI analyses and reports
/// Timeline Integration: All timeline items come from this table
/// 
/// Encryption: Field-level encryption for 'content' and 'medical_flags'
class SerenyaContent extends Equatable {
  final String id;                    // Server-generated UUID
  final String userId;                // References server users.id
  final ContentType contentType;      // 'result' or 'report'
  final String title;                 // AI-generated, constrained format
  final String content;               // ENCRYPTED: Markdown formatted AI response
  final double confidenceScore;       // 0.0 to 10.0
  final List<String> medicalFlags;    // ENCRYPTED: AI-generated alerts array
  final DateTime createdAt;
  final DateTime updatedAt;

  const SerenyaContent({
    required this.id,
    required this.userId,
    required this.contentType,
    required this.title,
    required this.content,
    required this.confidenceScore,
    required this.medicalFlags,
    required this.createdAt,
    required this.updatedAt,
  });

  /// Create from encrypted database JSON (requires decryption)
  static Future<SerenyaContent> fromDatabaseJson(Map<String, dynamic> json) async {
    return SerenyaContent(
      id: json['id'],
      userId: json['user_id'],
      contentType: ContentType.fromString(json['content_type']),
      title: json['title'],
      content: await EnhancedEncryptionUtils.decryptField(json['content'], 'serenya_content'),
      confidenceScore: (json['confidence_score'] as num).toDouble(),
      medicalFlags: json['medical_flags'] != null
          ? (jsonDecode(await EnhancedEncryptionUtils.decryptField(
                json['medical_flags'], 'serenya_content'
              )) as List).cast<String>()
          : [],
      createdAt: DateTime.parse(json['created_at']),
      updatedAt: DateTime.parse(json['updated_at']),
    );
  }

  /// Convert to encrypted database JSON (requires encryption)
  Future<Map<String, dynamic>> toDatabaseJson() async {
    return {
      'id': id,
      'user_id': userId,
      'content_type': contentType.value,
      'title': title,
      'content': await EnhancedEncryptionUtils.encryptField(content, 'serenya_content'),
      'confidence_score': confidenceScore,
      'medical_flags': medicalFlags.isNotEmpty
          ? await EnhancedEncryptionUtils.encryptField(
              jsonEncode(medicalFlags), 'serenya_content'
            )
          : null,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  /// Create from decrypted fields (performance optimization for batch operations)
  static SerenyaContent fromDecryptedFields(
    Map<String, dynamic> baseJson,
    String decryptedContent,
    String? decryptedFlags,
  ) {
    return SerenyaContent(
      id: baseJson['id'],
      userId: baseJson['user_id'],
      contentType: ContentType.fromString(baseJson['content_type']),
      title: baseJson['title'],
      content: decryptedContent,
      confidenceScore: (baseJson['confidence_score'] as num).toDouble(),
      medicalFlags: decryptedFlags != null
          ? (jsonDecode(decryptedFlags) as List).cast<String>()
          : [],
      createdAt: DateTime.parse(baseJson['created_at']),
      updatedAt: DateTime.parse(baseJson['updated_at']),
    );
  }

  SerenyaContent copyWith({
    String? id,
    String? userId,
    ContentType? contentType,
    String? title,
    String? content,
    double? confidenceScore,
    List<String>? medicalFlags,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return SerenyaContent(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      contentType: contentType ?? this.contentType,
      title: title ?? this.title,
      content: content ?? this.content,
      confidenceScore: confidenceScore ?? this.confidenceScore,
      medicalFlags: medicalFlags ?? this.medicalFlags,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  List<Object?> get props => [
        id,
        userId,
        contentType,
        title,
        content,
        confidenceScore,
        medicalFlags,
        createdAt,
        updatedAt,
      ];
}

/// Normalized storage of extracted lab test results
/// Full table encryption using SQLCipher
class LabResult extends Equatable {
  final String id;                    // Server-generated UUID
  final String userId;                // References server users.id  
  final String serenyaContentId;      // References serenya_content.id
  final String testName;              // e.g., "Blood Glucose", "Total Cholesterol"
  final TestCategoryType testCategory;
  final double? testValue;            // Numeric result value
  final String? testUnit;             // e.g., "mg/dL", "mmol/L", "%"
  final double? referenceRangeLow;
  final double? referenceRangeHigh;
  final String? referenceRangeText;   // e.g., "Normal", "< 200 mg/dL"
  final bool isAbnormal;
  final double? confidenceScore;      // 0.0 to 10.0
  final String? aiInterpretation;     // AI analysis of this specific result
  final DateTime createdAt;

  const LabResult({
    required this.id,
    required this.userId,
    required this.serenyaContentId,
    required this.testName,
    required this.testCategory,
    this.testValue,
    this.testUnit,
    this.referenceRangeLow,
    this.referenceRangeHigh,
    this.referenceRangeText,
    required this.isAbnormal,
    this.confidenceScore,
    this.aiInterpretation,
    required this.createdAt,
  });

  /// Create from database JSON (SQLCipher automatically decrypts)
  factory LabResult.fromJson(Map<String, dynamic> json) {
    return LabResult(
      id: json['id'],
      userId: json['user_id'],
      serenyaContentId: json['serenya_content_id'],
      testName: json['test_name'],
      testCategory: TestCategoryType.fromString(json['test_category']),
      testValue: json['test_value']?.toDouble(),
      testUnit: json['test_unit'],
      referenceRangeLow: json['reference_range_low']?.toDouble(),
      referenceRangeHigh: json['reference_range_high']?.toDouble(),
      referenceRangeText: json['reference_range_text'],
      isAbnormal: json['is_abnormal'] == 1,
      confidenceScore: json['confidence_score']?.toDouble(),
      aiInterpretation: json['ai_interpretation'],
      createdAt: DateTime.parse(json['created_at']),
    );
  }

  /// Convert to database JSON (SQLCipher automatically encrypts)
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'serenya_content_id': serenyaContentId,
      'test_name': testName,
      'test_category': testCategory.value,
      'test_value': testValue,
      'test_unit': testUnit,
      'reference_range_low': referenceRangeLow,
      'reference_range_high': referenceRangeHigh,
      'reference_range_text': referenceRangeText,
      'is_abnormal': isAbnormal ? 1 : 0,
      'confidence_score': confidenceScore,
      'ai_interpretation': aiInterpretation,
      'created_at': createdAt.toIso8601String(),
    };
  }

  LabResult copyWith({
    String? id,
    String? userId,
    String? serenyaContentId,
    String? testName,
    TestCategoryType? testCategory,
    double? testValue,
    String? testUnit,
    double? referenceRangeLow,
    double? referenceRangeHigh,
    String? referenceRangeText,
    bool? isAbnormal,
    double? confidenceScore,
    String? aiInterpretation,
    DateTime? createdAt,
  }) {
    return LabResult(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      serenyaContentId: serenyaContentId ?? this.serenyaContentId,
      testName: testName ?? this.testName,
      testCategory: testCategory ?? this.testCategory,
      testValue: testValue ?? this.testValue,
      testUnit: testUnit ?? this.testUnit,
      referenceRangeLow: referenceRangeLow ?? this.referenceRangeLow,
      referenceRangeHigh: referenceRangeHigh ?? this.referenceRangeHigh,
      referenceRangeText: referenceRangeText ?? this.referenceRangeText,
      isAbnormal: isAbnormal ?? this.isAbnormal,
      confidenceScore: confidenceScore ?? this.confidenceScore,
      aiInterpretation: aiInterpretation ?? this.aiInterpretation,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  @override
  List<Object?> get props => [
        id,
        userId,
        serenyaContentId,
        testName,
        testCategory,
        testValue,
        testUnit,
        referenceRangeLow,
        referenceRangeHigh,
        referenceRangeText,
        isAbnormal,
        confidenceScore,
        aiInterpretation,
        createdAt,
      ];
}

/// Normalized storage of extracted vital sign measurements
/// Full table encryption using SQLCipher
class Vital extends Equatable {
  final String id;                    // Server-generated UUID
  final String userId;                // References server users.id
  final String serenyaContentId;      // References serenya_content.id
  final VitalType vitalType;
  final int? systolicValue;           // For blood pressure
  final int? diastolicValue;          // For blood pressure
  final double? numericValue;         // For single-value vitals
  final String? unit;                 // e.g., "mmHg", "°C", "kg", "bpm"
  final bool isAbnormal;
  final double? confidenceScore;      // 0.0 to 10.0
  final String? aiInterpretation;     // AI analysis of this vital sign
  final DateTime createdAt;

  const Vital({
    required this.id,
    required this.userId,
    required this.serenyaContentId,
    required this.vitalType,
    this.systolicValue,
    this.diastolicValue,
    this.numericValue,
    this.unit,
    required this.isAbnormal,
    this.confidenceScore,
    this.aiInterpretation,
    required this.createdAt,
  });

  /// Create from database JSON (SQLCipher automatically decrypts)
  factory Vital.fromJson(Map<String, dynamic> json) {
    return Vital(
      id: json['id'],
      userId: json['user_id'],
      serenyaContentId: json['serenya_content_id'],
      vitalType: VitalType.fromString(json['vital_type']),
      systolicValue: json['systolic_value'],
      diastolicValue: json['diastolic_value'],
      numericValue: json['numeric_value']?.toDouble(),
      unit: json['unit'],
      isAbnormal: json['is_abnormal'] == 1,
      confidenceScore: json['confidence_score']?.toDouble(),
      aiInterpretation: json['ai_interpretation'],
      createdAt: DateTime.parse(json['created_at']),
    );
  }

  /// Convert to database JSON (SQLCipher automatically encrypts)
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'serenya_content_id': serenyaContentId,
      'vital_type': vitalType.value,
      'systolic_value': systolicValue,
      'diastolic_value': diastolicValue,
      'numeric_value': numericValue,
      'unit': unit,
      'is_abnormal': isAbnormal ? 1 : 0,
      'confidence_score': confidenceScore,
      'ai_interpretation': aiInterpretation,
      'created_at': createdAt.toIso8601String(),
    };
  }

  /// Get formatted vital sign display
  String getFormattedValue() {
    switch (vitalType) {
      case VitalType.bloodPressure:
        return '${systolicValue ?? '?'}/${diastolicValue ?? '?'} ${unit ?? 'mmHg'}';
      case VitalType.heartRate:
      case VitalType.temperature:
      case VitalType.weight:
      case VitalType.height:
      case VitalType.oxygenSaturation:
        return '${numericValue ?? '?'} ${unit ?? ''}';
    }
  }

  Vital copyWith({
    String? id,
    String? userId,
    String? serenyaContentId,
    VitalType? vitalType,
    int? systolicValue,
    int? diastolicValue,
    double? numericValue,
    String? unit,
    bool? isAbnormal,
    double? confidenceScore,
    String? aiInterpretation,
    DateTime? createdAt,
  }) {
    return Vital(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      serenyaContentId: serenyaContentId ?? this.serenyaContentId,
      vitalType: vitalType ?? this.vitalType,
      systolicValue: systolicValue ?? this.systolicValue,
      diastolicValue: diastolicValue ?? this.diastolicValue,
      numericValue: numericValue ?? this.numericValue,
      unit: unit ?? this.unit,
      isAbnormal: isAbnormal ?? this.isAbnormal,
      confidenceScore: confidenceScore ?? this.confidenceScore,
      aiInterpretation: aiInterpretation ?? this.aiInterpretation,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  @override
  List<Object?> get props => [
        id,
        userId,
        serenyaContentId,
        vitalType,
        systolicValue,
        diastolicValue,
        numericValue,
        unit,
        isAbnormal,
        confidenceScore,
        aiInterpretation,
        createdAt,
      ];
}

/// Direct conversation messages linked to specific results or reports
/// Field-level encryption for 'message' content
class ChatMessage extends Equatable {
  final String id;                    // Server-generated UUID
  final String serenyaContentId;      // References serenya_content.id
  final MessageSenderType sender;     // 'user' or 'serenya'
  final String message;               // ENCRYPTED: The actual message content
  final Map<String, dynamic>? messageMetadata; // Optional: typing indicators, read status
  final DateTime createdAt;

  const ChatMessage({
    required this.id,
    required this.serenyaContentId,
    required this.sender,
    required this.message,
    this.messageMetadata,
    required this.createdAt,
  });

  /// Create from encrypted database JSON (requires decryption)
  static Future<ChatMessage> fromDatabaseJson(Map<String, dynamic> json) async {
    return ChatMessage(
      id: json['id'],
      serenyaContentId: json['serenya_content_id'],
      sender: MessageSenderType.fromString(json['sender']),
      message: await EnhancedEncryptionUtils.decryptField(json['message'], 'chat_messages'),
      messageMetadata: json['message_metadata'] != null
          ? jsonDecode(json['message_metadata']) as Map<String, dynamic>
          : null,
      createdAt: DateTime.parse(json['created_at']),
    );
  }

  /// Convert to encrypted database JSON (requires encryption)
  Future<Map<String, dynamic>> toDatabaseJson() async {
    return {
      'id': id,
      'serenya_content_id': serenyaContentId,
      'sender': sender.value,
      'message': await EnhancedEncryptionUtils.encryptField(message, 'chat_messages'),
      'message_metadata': messageMetadata != null
          ? jsonEncode(messageMetadata)
          : null,
      'created_at': createdAt.toIso8601String(),
    };
  }

  ChatMessage copyWith({
    String? id,
    String? serenyaContentId,
    MessageSenderType? sender,
    String? message,
    Map<String, dynamic>? messageMetadata,
    DateTime? createdAt,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      serenyaContentId: serenyaContentId ?? this.serenyaContentId,
      sender: sender ?? this.sender,
      message: message ?? this.message,
      messageMetadata: messageMetadata ?? this.messageMetadata,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  @override
  List<Object?> get props => [
        id,
        serenyaContentId,
        sender,
        message,
        messageMetadata,
        createdAt,
      ];
}

/// User preferences for local settings
/// Simple key-value storage, not encrypted (non-sensitive UI preferences)
class UserPreference extends Equatable {
  final String id;
  final String preferenceKey;
  final String? preferenceValue;
  final DateTime createdAt;
  final DateTime updatedAt;

  const UserPreference({
    required this.id,
    required this.preferenceKey,
    this.preferenceValue,
    required this.createdAt,
    required this.updatedAt,
  });

  factory UserPreference.fromJson(Map<String, dynamic> json) {
    return UserPreference(
      id: json['id'],
      preferenceKey: json['preference_key'],
      preferenceValue: json['preference_value'],
      createdAt: DateTime.parse(json['created_at']),
      updatedAt: DateTime.parse(json['updated_at']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'preference_key': preferenceKey,
      'preference_value': preferenceValue,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  UserPreference copyWith({
    String? id,
    String? preferenceKey,
    String? preferenceValue,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return UserPreference(
      id: id ?? this.id,
      preferenceKey: preferenceKey ?? this.preferenceKey,
      preferenceValue: preferenceValue ?? this.preferenceValue,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  List<Object?> get props => [
        id,
        preferenceKey,
        preferenceValue,
        createdAt,
        updatedAt,
      ];
}

