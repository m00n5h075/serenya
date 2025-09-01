class HealthDocument {
  final int? id;
  final String fileName;
  final String fileType;
  final int fileSize;
  final DateTime uploadDate;
  final ProcessingStatus processingStatus;
  final double? aiConfidenceScore;
  final String? interpretationText;
  final DateTime createdAt;
  final DateTime updatedAt;

  HealthDocument({
    this.id,
    required this.fileName,
    required this.fileType,
    required this.fileSize,
    required this.uploadDate,
    this.processingStatus = ProcessingStatus.pending,
    this.aiConfidenceScore,
    this.interpretationText,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'file_name': fileName,
      'file_type': fileType,
      'file_size': fileSize,
      'upload_date': uploadDate.millisecondsSinceEpoch,
      'processing_status': processingStatus.toString().split('.').last,
      'ai_confidence_score': aiConfidenceScore,
      'interpretation_text': interpretationText,
      'created_at': createdAt.millisecondsSinceEpoch,
      'updated_at': updatedAt.millisecondsSinceEpoch,
    };
  }

  factory HealthDocument.fromMap(Map<String, dynamic> map) {
    return HealthDocument(
      id: map['id'],
      fileName: map['file_name'],
      fileType: map['file_type'],
      fileSize: map['file_size'],
      uploadDate: DateTime.fromMillisecondsSinceEpoch(map['upload_date']),
      processingStatus: ProcessingStatus.values.firstWhere(
        (e) => e.toString().split('.').last == map['processing_status'],
        orElse: () => ProcessingStatus.pending,
      ),
      aiConfidenceScore: map['ai_confidence_score']?.toDouble(),
      interpretationText: map['interpretation_text'],
      createdAt: DateTime.fromMillisecondsSinceEpoch(map['created_at']),
      updatedAt: DateTime.fromMillisecondsSinceEpoch(map['updated_at']),
    );
  }

  HealthDocument copyWith({
    int? id,
    String? fileName,
    String? fileType,
    int? fileSize,
    DateTime? uploadDate,
    ProcessingStatus? processingStatus,
    double? aiConfidenceScore,
    String? interpretationText,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return HealthDocument(
      id: id ?? this.id,
      fileName: fileName ?? this.fileName,
      fileType: fileType ?? this.fileType,
      fileSize: fileSize ?? this.fileSize,
      uploadDate: uploadDate ?? this.uploadDate,
      processingStatus: processingStatus ?? this.processingStatus,
      aiConfidenceScore: aiConfidenceScore ?? this.aiConfidenceScore,
      interpretationText: interpretationText ?? this.interpretationText,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}

enum ProcessingStatus {
  pending,
  processing,
  completed,
  failed,
  retrying,
}

class Interpretation {
  final int? id;
  final int documentId;
  final InterpretationType interpretationType;
  final double confidenceScore;
  final String interpretationText;
  final List<String> medicalFlags;
  final DateTime createdAt;

  Interpretation({
    this.id,
    required this.documentId,
    required this.interpretationType,
    required this.confidenceScore,
    required this.interpretationText,
    required this.medicalFlags,
    required this.createdAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'document_id': documentId,
      'interpretation_type': interpretationType.toString().split('.').last,
      'confidence_score': confidenceScore,
      'interpretation_text': interpretationText,
      'medical_flags': medicalFlags.join(','),
      'created_at': createdAt.millisecondsSinceEpoch,
    };
  }

  factory Interpretation.fromMap(Map<String, dynamic> map) {
    return Interpretation(
      id: map['id'],
      documentId: map['document_id'],
      interpretationType: InterpretationType.values.firstWhere(
        (e) => e.toString().split('.').last == map['interpretation_type'],
        orElse: () => InterpretationType.basic,
      ),
      confidenceScore: map['confidence_score']?.toDouble() ?? 0.0,
      interpretationText: map['interpretation_text'] ?? '',
      medicalFlags: map['medical_flags']?.toString().split(',').where((s) => s.isNotEmpty).toList() ?? [],
      createdAt: DateTime.fromMillisecondsSinceEpoch(map['created_at']),
    );
  }
}

enum InterpretationType {
  basic,
  detailed,
  clinical,
}

enum ConfidenceLevel {
  low,      // 1-3
  moderate, // 4-6
  high,     // 7-10
}

extension ConfidenceLevelExtension on double {
  ConfidenceLevel get confidenceLevel {
    if (this <= 3) return ConfidenceLevel.low;
    if (this <= 6) return ConfidenceLevel.moderate;
    return ConfidenceLevel.high;
  }
}