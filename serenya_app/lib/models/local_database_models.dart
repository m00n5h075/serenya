import 'dart:convert';
import 'package:equatable/equatable.dart';
import '../core/database/encrypted_database_service.dart';
import '../core/constants/app_constants.dart';

enum ConfidenceLevel {
  low,
  moderate, 
  high,
}

extension ConfidenceLevelExtension on double {
  ConfidenceLevel get confidenceLevel {
    if (this < AppConstants.lowConfidenceThreshold) {
      return ConfidenceLevel.low;
    } else if (this < AppConstants.moderateConfidenceThreshold) {
      return ConfidenceLevel.moderate;
    } else {
      return ConfidenceLevel.high;
    }
  }
}

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

/// Processing status for uploaded documents
enum ProcessingStatus {
  pending,
  uploaded,
  processing,
  completed,
  failed,
  timeout,
  retrying;
  
  String get value => toString().split('.').last;
  
  static ProcessingStatus fromString(String value) {
    return ProcessingStatus.values.firstWhere((e) => e.value == value);
  }
}

/// Job types for processing_jobs table
enum JobType {
  documentUpload,  // 'document_upload'
  chatMessage,     // 'chat_message' 
  doctorReport;    // 'doctor_report'
  
  String get value {
    switch (this) {
      case JobType.documentUpload:
        return 'document_upload';
      case JobType.chatMessage:
        return 'chat_message';
      case JobType.doctorReport:
        return 'doctor_report';
    }
  }
  
  static JobType fromString(String value) {
    switch (value) {
      case 'document_upload':
        return JobType.documentUpload;
      case 'chat_message':
        return JobType.chatMessage;
      case 'doctor_report':
        return JobType.doctorReport;
      default:
        throw ArgumentError('Unknown job type: $value');
    }
  }
}

/// Job status for processing_jobs table
enum JobStatus {
  processing,
  completed,
  failed;
  
  String get value => toString().split('.').last;
  
  static JobStatus fromString(String value) {
    return JobStatus.values.firstWhere((e) => e.value == value);
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
  final String? summary;              // ENCRYPTED: Brief description/analysis
  final String content;               // ENCRYPTED: Markdown formatted AI response
  final double confidenceScore;       // 0.0 to 10.0
  final DateTime? documentDate;       // ISO8601: Original document date
  final List<String> medicalFlags;    // ENCRYPTED: AI-generated alerts array
  
  // Workflow fields for upload/processing tracking
  final String? fileName;             // Original uploaded file name
  final String? fileType;             // File type (pdf, jpg, etc.)
  final int? fileSize;                // File size in bytes
  final DateTime? uploadDate;         // When file was uploaded
  final ProcessingStatus? processingStatus; // Current processing status
  
  // Processing metadata
  final String? encryptionVersion;    // Encryption version (default: 'v1')
  final String? tableKeyId;           // Table key ID (default: 'serenya_content')
  final int? processingTimeSeconds;   // Processing time in seconds
  final String? modelVersion;         // AI model version used
  
  final DateTime createdAt;
  final DateTime updatedAt;

  const SerenyaContent({
    required this.id,
    required this.userId,
    required this.contentType,
    required this.title,
    this.summary,
    required this.content,
    required this.confidenceScore,
    this.documentDate,
    required this.medicalFlags,
    this.fileName,
    this.fileType,
    this.fileSize,
    this.uploadDate,
    this.processingStatus,
    this.encryptionVersion,
    this.tableKeyId,
    this.processingTimeSeconds,
    this.modelVersion,
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
      summary: json['summary'] != null 
          ? await EnhancedEncryptionUtils.decryptField(json['summary'], 'serenya_content')
          : null,
      content: await EnhancedEncryptionUtils.decryptField(json['content'], 'serenya_content'),
      confidenceScore: (json['confidence_score'] as num).toDouble(),
      documentDate: json['document_date'] != null ? DateTime.parse(json['document_date']) : null,
      medicalFlags: json['medical_flags'] != null
          ? (jsonDecode(await EnhancedEncryptionUtils.decryptField(
                json['medical_flags'], 'serenya_content'
              )) as List).cast<String>()
          : [],
      fileName: json['file_name'],
      fileType: json['file_type'],
      fileSize: json['file_size'],
      uploadDate: json['upload_date'] != null ? DateTime.parse(json['upload_date']) : null,
      processingStatus: json['processing_status'] != null 
          ? ProcessingStatus.fromString(json['processing_status']) 
          : null,
      encryptionVersion: json['encryption_version'],
      tableKeyId: json['table_key_id'],
      processingTimeSeconds: json['processing_time_seconds'],
      modelVersion: json['model_version'],
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
      'summary': summary != null 
          ? await EnhancedEncryptionUtils.encryptField(summary!, 'serenya_content')
          : null,
      'content': await EnhancedEncryptionUtils.encryptField(content, 'serenya_content'),
      'confidence_score': confidenceScore,
      'document_date': documentDate?.toIso8601String(),
      'medical_flags': medicalFlags.isNotEmpty
          ? await EnhancedEncryptionUtils.encryptField(
              jsonEncode(medicalFlags), 'serenya_content'
            )
          : null,
      'file_name': fileName,
      'file_type': fileType,
      'file_size': fileSize,
      'upload_date': uploadDate?.toIso8601String(),
      'processing_status': processingStatus?.value,
      'encryption_version': encryptionVersion,
      'table_key_id': tableKeyId,
      'processing_time_seconds': processingTimeSeconds,
      'model_version': modelVersion,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  /// Create from decrypted fields (performance optimization for batch operations)
  static SerenyaContent fromDecryptedFields(
    Map<String, dynamic> baseJson,
    String decryptedContent,
    String? decryptedFlags,
    String? decryptedSummary,
  ) {
    return SerenyaContent(
      id: baseJson['id'],
      userId: baseJson['user_id'],
      contentType: ContentType.fromString(baseJson['content_type']),
      title: baseJson['title'],
      summary: decryptedSummary,
      content: decryptedContent,
      confidenceScore: (baseJson['confidence_score'] as num).toDouble(),
      documentDate: baseJson['document_date'] != null ? DateTime.parse(baseJson['document_date']) : null,
      medicalFlags: decryptedFlags != null
          ? (jsonDecode(decryptedFlags) as List).cast<String>()
          : [],
      fileName: baseJson['file_name'],
      fileType: baseJson['file_type'],
      fileSize: baseJson['file_size'],
      uploadDate: baseJson['upload_date'] != null ? DateTime.parse(baseJson['upload_date']) : null,
      processingStatus: baseJson['processing_status'] != null 
          ? ProcessingStatus.fromString(baseJson['processing_status']) 
          : null,
      encryptionVersion: baseJson['encryption_version'],
      tableKeyId: baseJson['table_key_id'],
      processingTimeSeconds: baseJson['processing_time_seconds'],
      modelVersion: baseJson['model_version'],
      createdAt: DateTime.parse(baseJson['created_at']),
      updatedAt: DateTime.parse(baseJson['updated_at']),
    );
  }

  /// Create a copy with updated fields (for workflow state changes)
  SerenyaContent copyWith({
    String? id,
    String? userId,
    ContentType? contentType,
    String? title,
    String? summary,
    String? content,
    double? confidenceScore,
    DateTime? documentDate,
    List<String>? medicalFlags,
    String? fileName,
    String? fileType,
    int? fileSize,
    DateTime? uploadDate,
    ProcessingStatus? processingStatus,
    String? encryptionVersion,
    String? tableKeyId,
    int? processingTimeSeconds,
    String? modelVersion,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return SerenyaContent(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      contentType: contentType ?? this.contentType,
      title: title ?? this.title,
      summary: summary ?? this.summary,
      content: content ?? this.content,
      confidenceScore: confidenceScore ?? this.confidenceScore,
      documentDate: documentDate ?? this.documentDate,
      medicalFlags: medicalFlags ?? this.medicalFlags,
      fileName: fileName ?? this.fileName,
      fileType: fileType ?? this.fileType,
      fileSize: fileSize ?? this.fileSize,
      uploadDate: uploadDate ?? this.uploadDate,
      processingStatus: processingStatus ?? this.processingStatus,
      encryptionVersion: encryptionVersion ?? this.encryptionVersion,
      tableKeyId: tableKeyId ?? this.tableKeyId,
      processingTimeSeconds: processingTimeSeconds ?? this.processingTimeSeconds,
      modelVersion: modelVersion ?? this.modelVersion,
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
        summary,
        content,
        confidenceScore,
        documentDate,
        medicalFlags,
        fileName,
        fileType,
        fileSize,
        uploadDate,
        processingStatus,
        encryptionVersion,
        tableKeyId,
        processingTimeSeconds,
        modelVersion,
        createdAt,
        updatedAt,
      ];
}

/// Extension for backward compatibility with HealthDocument
extension HealthDocumentCompat on SerenyaContent {
  /// Legacy field mapping: interpretationText -> content
  String? get interpretationText => content.isNotEmpty ? content : null;
  
  /// Legacy field mapping: aiConfidenceScore -> confidenceScore  
  double? get aiConfidenceScore => confidenceScore;
  
  /// Legacy compatibility: check if has ID (for null safety)
  String? get id => this.id;
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
  final DateTime? testDate;           // Date when test was performed
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
    this.testDate,
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
      testDate: json['test_date'] != null ? DateTime.parse(json['test_date']) : null,
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
      'test_date': testDate?.toIso8601String(),
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
    DateTime? testDate,
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
      testDate: testDate ?? this.testDate,
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
        testDate,
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
  final DateTime? measurementDate;    // Date when measurement was taken
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
    this.measurementDate,
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
      measurementDate: json['measurement_date'] != null ? DateTime.parse(json['measurement_date']) : null,
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
      'measurement_date': measurementDate?.toIso8601String(),
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
    DateTime? measurementDate,
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
      measurementDate: measurementDate ?? this.measurementDate,
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
        measurementDate,
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
  final String? suggestedPromptId;    // Optional: Reference to chat_options
  final DateTime createdAt;

  const ChatMessage({
    required this.id,
    required this.serenyaContentId,
    required this.sender,
    required this.message,
    this.messageMetadata,
    this.suggestedPromptId,
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
      suggestedPromptId: json['suggested_prompt_id'],
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
      'suggested_prompt_id': suggestedPromptId,
      'created_at': createdAt.toIso8601String(),
    };
  }

  ChatMessage copyWith({
    String? id,
    String? serenyaContentId,
    MessageSenderType? sender,
    String? message,
    Map<String, dynamic>? messageMetadata,
    String? suggestedPromptId,
    DateTime? createdAt,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      serenyaContentId: serenyaContentId ?? this.serenyaContentId,
      sender: sender ?? this.sender,
      message: message ?? this.message,
      messageMetadata: messageMetadata ?? this.messageMetadata,
      suggestedPromptId: suggestedPromptId ?? this.suggestedPromptId,
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
        suggestedPromptId,
        createdAt,
      ];
}

/// User preferences for local settings
/// Simple key-value storage, not encrypted (non-sensitive UI preferences)
class UserPreference extends Equatable {
  final String key;                    // Primary key - preference identifier
  final String? value;                 // Preference value
  final DateTime createdAt;
  final DateTime updatedAt;

  const UserPreference({
    required this.key,
    this.value,
    required this.createdAt,
    required this.updatedAt,
  });

  factory UserPreference.fromJson(Map<String, dynamic> json) {
    return UserPreference(
      key: json['key'],
      value: json['value'],
      createdAt: DateTime.parse(json['created_at']),
      updatedAt: DateTime.parse(json['updated_at']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'key': key,
      'value': value,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  UserPreference copyWith({
    String? key,
    String? value,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return UserPreference(
      key: key ?? this.key,
      value: value ?? this.value,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  List<Object?> get props => [
        key,
        value,
        createdAt,
        updatedAt,
      ];
}

/// Processing job tracking for async operations
/// Simple non-encrypted storage for job metadata and polling
class ProcessingJob extends Equatable {
  final String jobId;                    // Server job_id: {user_id}_{timestamp}_{random}
  final JobType jobType;                 // Type of processing job
  final JobStatus status;                // Current job status
  final DateTime initiatedAt;            // When job was started
  final DateTime? completedAt;           // When job completed (if completed)
  final int? estimatedCompletionSeconds; // Server-provided estimate
  final String? resultContentId;         // References serenya_content.id when complete
  final String? errorMessage;            // Error details for failed jobs
  final int retryCount;                  // Number of retry attempts
  final DateTime? lastPollAt;            // Last time we polled server
  final DateTime? nextPollAt;            // When to poll next

  const ProcessingJob({
    required this.jobId,
    required this.jobType,
    required this.status,
    required this.initiatedAt,
    this.completedAt,
    this.estimatedCompletionSeconds,
    this.resultContentId,
    this.errorMessage,
    this.retryCount = 0,
    this.lastPollAt,
    this.nextPollAt,
  });

  factory ProcessingJob.fromJson(Map<String, dynamic> json) {
    return ProcessingJob(
      jobId: json['job_id'],
      jobType: JobType.fromString(json['job_type']),
      status: JobStatus.fromString(json['status']),
      initiatedAt: DateTime.parse(json['initiated_at']),
      completedAt: json['completed_at'] != null 
          ? DateTime.parse(json['completed_at']) 
          : null,
      estimatedCompletionSeconds: json['estimated_completion_seconds'],
      resultContentId: json['result_content_id'],
      errorMessage: json['error_message'],
      retryCount: json['retry_count'] ?? 0,
      lastPollAt: json['last_poll_at'] != null 
          ? DateTime.parse(json['last_poll_at']) 
          : null,
      nextPollAt: json['next_poll_at'] != null 
          ? DateTime.parse(json['next_poll_at']) 
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'job_id': jobId,
      'job_type': jobType.value,
      'status': status.value,
      'initiated_at': initiatedAt.toIso8601String(),
      'completed_at': completedAt?.toIso8601String(),
      'estimated_completion_seconds': estimatedCompletionSeconds,
      'result_content_id': resultContentId,
      'error_message': errorMessage,
      'retry_count': retryCount,
      'last_poll_at': lastPollAt?.toIso8601String(),
      'next_poll_at': nextPollAt?.toIso8601String(),
    };
  }

  ProcessingJob copyWith({
    String? jobId,
    JobType? jobType,
    JobStatus? status,
    DateTime? initiatedAt,
    DateTime? completedAt,
    int? estimatedCompletionSeconds,
    String? resultContentId,
    String? errorMessage,
    int? retryCount,
    DateTime? lastPollAt,
    DateTime? nextPollAt,
  }) {
    return ProcessingJob(
      jobId: jobId ?? this.jobId,
      jobType: jobType ?? this.jobType,
      status: status ?? this.status,
      initiatedAt: initiatedAt ?? this.initiatedAt,
      completedAt: completedAt ?? this.completedAt,
      estimatedCompletionSeconds: estimatedCompletionSeconds ?? this.estimatedCompletionSeconds,
      resultContentId: resultContentId ?? this.resultContentId,
      errorMessage: errorMessage ?? this.errorMessage,
      retryCount: retryCount ?? this.retryCount,
      lastPollAt: lastPollAt ?? this.lastPollAt,
      nextPollAt: nextPollAt ?? this.nextPollAt,
    );
  }

  @override
  List<Object?> get props => [
        jobId,
        jobType,
        status,
        initiatedAt,
        completedAt,
        estimatedCompletionSeconds,
        resultContentId,
        errorMessage,
        retryCount,
        lastPollAt,
        nextPollAt,
      ];
}

