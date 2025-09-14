import 'dart:io';
import 'package:dio/dio.dart';
import '../api_client.dart';
import '../error_handler.dart';
import '../../core/security/local_audit_logger.dart';

/// Documents API endpoints implementation
/// 
/// Handles all document-related API calls including:
/// - Medical document upload (single and batch)
/// - Document processing status tracking
/// - Document metadata management
/// - Secure file handling with encryption
/// - Document audit logging
class DocumentsApi {
  final Dio _dio;
  final ApiErrorHandler _errorHandler;

  DocumentsApi(this._dio, this._errorHandler);

  /// POST /documents/upload
  /// Upload a single medical document
  Future<ApiResult<DocumentUploadResponse>> uploadDocument({
    required File file,
    required String fileName,
    required String mimeType,
    String? description,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(
          file.path,
          filename: fileName,
          contentType: DioMediaType.parse(mimeType),
        ),
        'file_name': fileName,
        'mime_type': mimeType,
        if (description != null) 'description': description,
        if (metadata != null) 'metadata': metadata,
      });

      final response = await _dio.post(
        '/api/v1/process/upload',
        data: formData,
      );

      await _logDocumentOperation('single_upload', {
        'file_name': fileName,
        'mime_type': mimeType,
        'file_size_bytes': await file.length(),
      });

      return ApiResult.success(
        DocumentUploadResponse.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Document upload');
    } catch (e) {
      return ApiResult.failed('Unexpected error during document upload: $e');
    }
  }

  /// POST /documents/batch-upload
  /// Upload multiple medical documents
  Future<ApiResult<BatchUploadResponse>> batchUploadDocuments({
    required List<DocumentUploadRequest> documents,
  }) async {
    try {
      final formData = FormData();

      for (int i = 0; i < documents.length; i++) {
        final doc = documents[i];
        
        formData.files.add(MapEntry(
          'files',
          await MultipartFile.fromFile(
            doc.file.path,
            filename: doc.fileName,
            contentType: DioMediaType.parse(doc.mimeType),
          ),
        ));

        // Add metadata for each file
        formData.fields.add(MapEntry('file_names[$i]', doc.fileName));
        formData.fields.add(MapEntry('mime_types[$i]', doc.mimeType));
        
        if (doc.description != null) {
          formData.fields.add(MapEntry('descriptions[$i]', doc.description!));
        }
        
        if (doc.metadata != null) {
          formData.fields.add(MapEntry('metadata[$i]', doc.metadata.toString()));
        }
      }

      final response = await _dio.post(
        '/api/v1/process/batch-upload',
        data: formData,
      );

      await _logDocumentOperation('batch_upload', {
        'document_count': documents.length,
        'total_size_bytes': await _calculateTotalSize(documents),
      });

      return ApiResult.success(
        BatchUploadResponse.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Batch document upload');
    } catch (e) {
      return ApiResult.failed('Unexpected error during batch upload: $e');
    }
  }

  /// GET /documents/{document_id}/status
  /// Get document processing status
  Future<ApiResult<DocumentStatus>> getDocumentStatus(String documentId) async {
    try {
      final response = await _dio.get('/documents/$documentId/status');

      await _logDocumentOperation('status_check', {
        'document_id': documentId,
      });

      return ApiResult.success(
        DocumentStatus.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Get document status');
    } catch (e) {
      return ApiResult.failed('Unexpected error getting document status: $e');
    }
  }

  /// GET /documents/{document_id}
  /// Get document details and metadata
  Future<ApiResult<DocumentDetails>> getDocumentDetails(String documentId) async {
    try {
      final response = await _dio.get('/documents/$documentId');

      await _logDocumentOperation('details_fetch', {
        'document_id': documentId,
      });

      return ApiResult.success(
        DocumentDetails.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Get document details');
    } catch (e) {
      return ApiResult.failed('Unexpected error getting document details: $e');
    }
  }

  /// PUT /documents/{document_id}
  /// Update document metadata
  Future<ApiResult<DocumentDetails>> updateDocumentMetadata({
    required String documentId,
    String? fileName,
    String? description,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final requestData = <String, dynamic>{};
      if (fileName != null) requestData['file_name'] = fileName;
      if (description != null) requestData['description'] = description;
      if (metadata != null) requestData['metadata'] = metadata;

      if (requestData.isEmpty) {
        return ApiResult.failed('No metadata to update');
      }

      final response = await _dio.put(
        '/documents/$documentId',
        data: requestData,
      );

      await _logDocumentOperation('metadata_update', {
        'document_id': documentId,
        'updated_fields': requestData.keys.toList(),
      });

      return ApiResult.success(
        DocumentDetails.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Update document metadata');
    } catch (e) {
      return ApiResult.failed('Unexpected error updating document: $e');
    }
  }

  /// DELETE /documents/{document_id}
  /// Delete a document
  Future<ApiResult<void>> deleteDocument(String documentId) async {
    try {
      final response = await _dio.delete('/documents/$documentId');

      await _logDocumentOperation('document_deletion', {
        'document_id': documentId,
      });

      return ApiResult.success(
        null,
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Delete document');
    } catch (e) {
      return ApiResult.failed('Unexpected error deleting document: $e');
    }
  }

  /// GET /documents
  /// List user documents with filtering and pagination
  Future<ApiResult<DocumentListResponse>> listDocuments({
    int? limit,
    String? cursor,
    String? status,
    String? mimeType,
    DateTime? uploadedAfter,
    DateTime? uploadedBefore,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (limit != null) queryParams['limit'] = limit;
      if (cursor != null) queryParams['cursor'] = cursor;
      if (status != null) queryParams['status'] = status;
      if (mimeType != null) queryParams['mime_type'] = mimeType;
      if (uploadedAfter != null) queryParams['uploaded_after'] = uploadedAfter.toIso8601String();
      if (uploadedBefore != null) queryParams['uploaded_before'] = uploadedBefore.toIso8601String();

      final response = await _dio.get(
        '/documents',
        queryParameters: queryParams,
      );

      await _logDocumentOperation('document_list', {
        'query_params': queryParams,
      });

      return ApiResult.success(
        DocumentListResponse.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'List documents');
    } catch (e) {
      return ApiResult.failed('Unexpected error listing documents: $e');
    }
  }

  /// Calculate total size of documents for logging
  Future<int> _calculateTotalSize(List<DocumentUploadRequest> documents) async {
    int totalSize = 0;
    for (final doc in documents) {
      totalSize += await doc.file.length();
    }
    return totalSize;
  }

  /// Log document operation for audit trail
  Future<void> _logDocumentOperation(String operation, Map<String, dynamic> context) async {
    await LocalAuditLogger.logSecurityEvent(
      'document_api_operation',
      additionalData: {
        'operation': operation,
        'context': context,
        'timestamp': DateTime.now().toIso8601String(),
      },
    );
  }

  /// Reset API state
  Future<void> reset() async {
    // No persistent state to reset for documents API
  }
}

/// Document upload request model
class DocumentUploadRequest {
  final File file;
  final String fileName;
  final String mimeType;
  final String? description;
  final Map<String, dynamic>? metadata;

  DocumentUploadRequest({
    required this.file,
    required this.fileName,
    required this.mimeType,
    this.description,
    this.metadata,
  });
}

/// Document upload response model
class DocumentUploadResponse {
  final String documentId;
  final String fileName;
  final String mimeType;
  final int fileSizeBytes;
  final String status;
  final DateTime uploadedAt;
  final String? description;

  DocumentUploadResponse({
    required this.documentId,
    required this.fileName,
    required this.mimeType,
    required this.fileSizeBytes,
    required this.status,
    required this.uploadedAt,
    this.description,
  });

  factory DocumentUploadResponse.fromJson(Map<String, dynamic> json) {
    return DocumentUploadResponse(
      documentId: json['document_id'] as String,
      fileName: json['file_name'] as String,
      mimeType: json['mime_type'] as String,
      fileSizeBytes: json['file_size_bytes'] as int,
      status: json['status'] as String,
      uploadedAt: DateTime.parse(json['uploaded_at'] as String),
      description: json['description'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'document_id': documentId,
      'file_name': fileName,
      'mime_type': mimeType,
      'file_size_bytes': fileSizeBytes,
      'status': status,
      'uploaded_at': uploadedAt.toIso8601String(),
      if (description != null) 'description': description,
    };
  }
}

/// Batch upload response model
class BatchUploadResponse {
  final List<DocumentUploadResponse> successful;
  final List<BatchUploadError> failed;
  final int totalCount;
  final int successCount;
  final int failureCount;

  BatchUploadResponse({
    required this.successful,
    required this.failed,
    required this.totalCount,
    required this.successCount,
    required this.failureCount,
  });

  factory BatchUploadResponse.fromJson(Map<String, dynamic> json) {
    return BatchUploadResponse(
      successful: (json['successful'] as List)
          .map((item) => DocumentUploadResponse.fromJson(item))
          .toList(),
      failed: (json['failed'] as List)
          .map((item) => BatchUploadError.fromJson(item))
          .toList(),
      totalCount: json['total_count'] as int,
      successCount: json['success_count'] as int,
      failureCount: json['failure_count'] as int,
    );
  }
}

/// Batch upload error model
class BatchUploadError {
  final String fileName;
  final String error;
  final String errorCode;

  BatchUploadError({
    required this.fileName,
    required this.error,
    required this.errorCode,
  });

  factory BatchUploadError.fromJson(Map<String, dynamic> json) {
    return BatchUploadError(
      fileName: json['file_name'] as String,
      error: json['error'] as String,
      errorCode: json['error_code'] as String,
    );
  }
}

/// Document status model
class DocumentStatus {
  final String documentId;
  final String status;
  final double? progressPercent;
  final String? errorMessage;
  final DateTime lastUpdated;
  final Map<String, dynamic>? processingMetadata;

  DocumentStatus({
    required this.documentId,
    required this.status,
    this.progressPercent,
    this.errorMessage,
    required this.lastUpdated,
    this.processingMetadata,
  });

  factory DocumentStatus.fromJson(Map<String, dynamic> json) {
    return DocumentStatus(
      documentId: json['document_id'] as String,
      status: json['status'] as String,
      progressPercent: json['progress_percent']?.toDouble(),
      errorMessage: json['error_message'] as String?,
      lastUpdated: DateTime.parse(json['last_updated'] as String),
      processingMetadata: json['processing_metadata'] as Map<String, dynamic>?,
    );
  }
}

/// Document details model
class DocumentDetails {
  final String documentId;
  final String fileName;
  final String mimeType;
  final int fileSizeBytes;
  final String status;
  final DateTime uploadedAt;
  final DateTime lastUpdated;
  final String? description;
  final Map<String, dynamic>? metadata;
  final Map<String, dynamic>? processingResults;

  DocumentDetails({
    required this.documentId,
    required this.fileName,
    required this.mimeType,
    required this.fileSizeBytes,
    required this.status,
    required this.uploadedAt,
    required this.lastUpdated,
    this.description,
    this.metadata,
    this.processingResults,
  });

  factory DocumentDetails.fromJson(Map<String, dynamic> json) {
    return DocumentDetails(
      documentId: json['document_id'] as String,
      fileName: json['file_name'] as String,
      mimeType: json['mime_type'] as String,
      fileSizeBytes: json['file_size_bytes'] as int,
      status: json['status'] as String,
      uploadedAt: DateTime.parse(json['uploaded_at'] as String),
      lastUpdated: DateTime.parse(json['last_updated'] as String),
      description: json['description'] as String?,
      metadata: json['metadata'] as Map<String, dynamic>?,
      processingResults: json['processing_results'] as Map<String, dynamic>?,
    );
  }
}

/// Document list response model
class DocumentListResponse {
  final List<DocumentDetails> documents;
  final String? nextCursor;
  final bool hasMore;
  final int totalCount;

  DocumentListResponse({
    required this.documents,
    this.nextCursor,
    required this.hasMore,
    required this.totalCount,
  });

  factory DocumentListResponse.fromJson(Map<String, dynamic> json) {
    return DocumentListResponse(
      documents: (json['documents'] as List)
          .map((item) => DocumentDetails.fromJson(item))
          .toList(),
      nextCursor: json['next_cursor'] as String?,
      hasMore: json['has_more'] as bool,
      totalCount: json['total_count'] as int,
    );
  }
}