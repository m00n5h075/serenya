import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/local_database_models.dart';
import '../core/providers/health_data_provider.dart';
import '../core/database/health_data_repository.dart';
import '../api/endpoints/chat_api.dart';

/// Chat Data Export Service
/// 
/// Handles structured health data extraction for chat contexts.
/// Features:
/// - Results chat: Document-specific lab results and vitals only
/// - Report chat: All lab results and vitals from complete health history
/// - Structured data only (no AI analysis or documents)
/// - Follows doctor report patterns for data aggregation
class ChatDataExportService {
  final HealthDataRepository _repository;

  ChatDataExportService({
    required HealthDataRepository repository,
  }) : _repository = repository;

  /// Extract structured health data for results chat (document-specific)
  /// 
  /// Extracts only lab results and vitals from a specific document
  Future<ChatDataResult> extractResultsChatData(String contentId) async {
    try {
      // Get the specific document
      final document = await _repository.getContentById(contentId);
      if (document == null) {
        return ChatDataResult(
          success: false,
          errorMessage: 'Document not found',
        );
      }

      // Only process completed documents
      if (document.processingStatus != ProcessingStatus.completed) {
        return ChatDataResult(
          success: false,
          errorMessage: 'Document is not fully processed yet',
        );
      }

      // Extract structured data from this document only
      final structuredData = await _extractStructuredDataFromDocument(document);
      
      if (structuredData.isEmpty) {
        return ChatDataResult(
          success: false,
          errorMessage: 'No structured health data (lab results or vitals) found in this document',
        );
      }

      return ChatDataResult(
        success: true,
        structuredData: structuredData,
        documentCount: 1,
        dataType: ChatDataType.results,
      );

    } catch (e) {
      await _logError('results_chat_data_extraction_failed', e);
      
      return ChatDataResult(
        success: false,
        errorMessage: 'Failed to extract results data: ${e.toString()}',
      );
    }
  }

  /// Extract structured health data for report chat (full health history)
  /// 
  /// Extracts lab results and vitals from all completed documents
  Future<ChatDataResult> extractReportChatData(HealthDataProvider dataProvider) async {
    try {
      // Get all completed documents (reuse doctor report pattern)
      final completedDocuments = dataProvider.getDocumentsByStatus(ProcessingStatus.completed);
      
      if (completedDocuments.isEmpty) {
        return ChatDataResult(
          success: false,
          errorMessage: 'No completed health documents available',
        );
      }

      // Extract structured data from all documents
      final allStructuredData = <String, dynamic>{
        'lab_results': <Map<String, dynamic>>[],
        'vitals': <Map<String, dynamic>>[],
        'metadata': <String, dynamic>{},
      };

      int documentsWithData = 0;
      
      for (final document in completedDocuments) {
        final documentStructuredData = await _extractStructuredDataFromDocument(document);
        
        if (documentStructuredData.isNotEmpty) {
          documentsWithData++;
          
          // Merge lab results
          if (documentStructuredData['lab_results'] != null) {
            final labResults = documentStructuredData['lab_results'] as List<Map<String, dynamic>>;
            allStructuredData['lab_results']!.addAll(labResults);
          }
          
          // Merge vitals
          if (documentStructuredData['vitals'] != null) {
            final vitals = documentStructuredData['vitals'] as List<Map<String, dynamic>>;
            allStructuredData['vitals']!.addAll(vitals);
          }
        }
      }

      if (documentsWithData == 0) {
        return ChatDataResult(
          success: false,
          errorMessage: 'No structured health data (lab results or vitals) found in health history',
        );
      }

      // Add metadata summary (following doctor report pattern)
      allStructuredData['metadata'] = _createMetadataSummary(completedDocuments, documentsWithData);

      return ChatDataResult(
        success: true,
        structuredData: allStructuredData,
        documentCount: documentsWithData,
        dataType: ChatDataType.report,
      );

    } catch (e) {
      await _logError('report_chat_data_extraction_failed', e);
      
      return ChatDataResult(
        success: false,
        errorMessage: 'Failed to extract report data: ${e.toString()}',
      );
    }
  }

  /// Extract structured data from a single document
  /// 
  /// Only extracts lab results and vitals - NO AI analysis or documents
  Future<Map<String, dynamic>> _extractStructuredDataFromDocument(SerenyaContent document) async {
    final structuredData = <String, dynamic>{
      'lab_results': <Map<String, dynamic>>[],
      'vitals': <Map<String, dynamic>>[],
    };

    try {
      // Get lab results for this document
      final labResults = await _repository.getLabResultsForContent(document.id);
      
      for (final labResult in labResults) {
        // Add lab result data
        structuredData['lab_results']!.add({
          'name': labResult.testName,
          'value': labResult.testValue,
          'unit': labResult.testUnit,
          'reference_range_low': labResult.referenceRangeLow,
          'reference_range_high': labResult.referenceRangeHigh,
          'reference_range_text': labResult.referenceRangeText,
          'is_abnormal': labResult.isAbnormal,
          'timestamp': labResult.testDate?.toIso8601String(),
          'document_id': document.id,
          'confidence_score': labResult.confidenceScore,
        });
      }
      
      // Get vitals for this document
      final vitals = await _repository.getVitalsForContent(document.id);
      
      for (final vital in vitals) {
        // Add vital sign data
        // Determine the value based on vital type
        dynamic vitalValue;
        if (vital.systolicValue != null && vital.diastolicValue != null) {
          vitalValue = '${vital.systolicValue}/${vital.diastolicValue}';
        } else if (vital.numericValue != null) {
          vitalValue = vital.numericValue;
        } else {
          vitalValue = null;
        }
        
        structuredData['vitals']!.add({
          'name': vital.vitalType.toString(),
          'value': vitalValue,
          'unit': vital.unit,
          'timestamp': vital.measurementDate?.toIso8601String(),
          'document_id': document.id,
          'confidence_score': vital.confidenceScore,
        });
      }

    } catch (e) {
      await _logError('document_structured_data_extraction_failed', e);
      // Return empty structure on error
    }

    return structuredData;
  }

  /// Create metadata summary for report chat (following doctor report pattern)
  Map<String, dynamic> _createMetadataSummary(List<SerenyaContent> documents, int documentsWithData) {
    final summary = <String, dynamic>{
      'total_documents': documents.length,
      'documents_with_structured_data': documentsWithData,
      'document_types': <String, int>{},
      'date_range': <String, String>{},
    };

    // Aggregate document types
    for (final doc in documents) {
      final fileType = doc.fileType ?? 'unknown';
      summary['document_types'][fileType] = (summary['document_types'][fileType] ?? 0) + 1;
    }

    // Find date range
    final dates = documents
        .where((doc) => doc.uploadDate != null)
        .map((doc) => doc.uploadDate!)
        .toList();
    
    if (dates.isNotEmpty) {
      dates.sort();
      summary['date_range']['earliest'] = dates.first.toIso8601String();
      summary['date_range']['latest'] = dates.last.toIso8601String();
    }

    return summary;
  }

  /// Check if a chat option requires data based on boolean flag
  bool shouldIncludeDataForChatOption(ChatPrompt chatPrompt) {
    // Check if this chat prompt requires structured data
    return chatPrompt.requiresHealthData == true;
  }

  /// Log errors with context
  Future<void> _logError(String event, dynamic error) async {
    debugPrint('CHAT_DATA_EXPORT_SERVICE_ERROR: $event - $error');
    
    // TODO: Integrate with comprehensive audit logging system
  }
}

/// Result of chat data extraction
class ChatDataResult {
  final bool success;
  final Map<String, dynamic>? structuredData;
  final int? documentCount;
  final ChatDataType? dataType;
  final String? errorMessage;

  ChatDataResult({
    required this.success,
    this.structuredData,
    this.documentCount,
    this.dataType,
    this.errorMessage,
  });
}

/// Types of chat data extraction
enum ChatDataType {
  results,  // Document-specific structured data
  report,   // Full health history structured data
}