import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../models/local_database_models.dart';
import '../core/providers/health_data_provider.dart';
import '../core/database/processing_job_repository.dart';
import '../api/api_client.dart';
import 'notification_service.dart';
import 'unified_polling_service.dart';

/// Doctor Reports Service for Premium Users
/// 
/// Handles doctor report generation using complete health data history.
/// Features:
/// - Premium user validation
/// - Health data sufficiency validation
/// - API integration with new backend endpoint
/// - Job monitoring through existing polling system
/// - Error handling for premium and health data validation
class DoctorReportsService {
  final ApiClient _apiClient;
  final NotificationService _notificationService = NotificationService();
  final UnifiedPollingService _pollingService = UnifiedPollingService();
  
  /// Constructor that accepts ApiClient dependency
  DoctorReportsService({required ApiClient apiClient}) : _apiClient = apiClient;

  /// Generate doctor report from health data
  /// 
  /// This method validates premium status and health data sufficiency
  /// before calling the new backend endpoint
  Future<DoctorReportResult> generateDoctorReport({
    required HealthDataProvider dataProvider,
    Map<String, dynamic>? additionalContext,
  }) async {
    try {
      // Step 1: Validate premium subscription
      final premiumValidation = await _validatePremiumAccess();
      if (!premiumValidation.isValid) {
        return DoctorReportResult(
          success: false,
          errorType: DoctorReportErrorType.premiumRequired,
          message: premiumValidation.errorMessage!,
        );
      }

      // Step 2: Validate health data sufficiency
      final healthDataValidation = await _validateHealthDataSufficiency(dataProvider);
      if (!healthDataValidation.isValid) {
        return DoctorReportResult(
          success: false,
          errorType: DoctorReportErrorType.insufficientHealthData,
          message: healthDataValidation.errorMessage!,
        );
      }

      // Step 3: Create processing job record
      final jobId = _generateJobId();
      final processingJob = await ProcessingJobRepository.createJob(
        jobId: jobId,
        jobType: JobType.doctorReport,
        status: JobStatus.processing,
        estimatedCompletionSeconds: 120, // Doctor reports take longer
      );

      // Step 4: Call backend API
      final apiResult = await _callDoctorReportsAPI(
        healthDataValidation.healthDataSummary!,
        additionalContext,
      );

      if (!apiResult.success) {
        // Mark job as failed
        await ProcessingJobRepository.failJob(jobId, apiResult.message);
        
        return DoctorReportResult(
          success: false,
          errorType: DoctorReportErrorType.apiError,
          message: apiResult.message,
        );
      }

      // Step 5: Update job with server job ID and start monitoring
      final serverJobId = apiResult.data!['job_id'] as String;
      await ProcessingJobRepository.updateJob(
        jobId,
        resultContentId: serverJobId,
      );

      // Step 6: Start monitoring through polling service
      await _pollingService.startMonitoringJob(serverJobId);

      // Step 7: Show notification
      await _notificationService.showNotification(
        title: 'Doctor Report Generation Started',
        body: 'Your comprehensive doctor report is being generated. This may take a few minutes.',
      );

      return DoctorReportResult(
        success: true,
        jobId: serverJobId,
        processingJob: processingJob,
        message: 'Doctor report generation initiated successfully',
      );

    } catch (e) {
      await _logError('doctor_report_generation_failed', e);
      
      return DoctorReportResult(
        success: false,
        errorType: DoctorReportErrorType.unexpected,
        message: 'Unexpected error: ${e.toString()}',
      );
    }
  }

  /// Validate premium subscription access
  Future<ValidationResult> _validatePremiumAccess() async {
    try {
      final subscriptionResult = await _apiClient.subscriptions.getCurrentSubscription();
      
      if (!subscriptionResult.success) {
        return ValidationResult(
          isValid: false,
          errorMessage: 'Unable to verify subscription status. Please check your internet connection and try again.',
        );
      }

      final subscription = subscriptionResult.data!;
      
      // Check if subscription is active and has advanced analysis feature
      if (subscription.status != 'active') {
        return ValidationResult(
          isValid: false,
          errorMessage: 'Doctor reports require an active premium subscription. Please upgrade your plan to access this feature.',
        );
      }

      if (!subscription.limits.advancedAnalysis) {
        return ValidationResult(
          isValid: false,
          errorMessage: 'Doctor reports are not included in your current plan. Please upgrade to access advanced analysis features.',
        );
      }

      return ValidationResult(isValid: true);
      
    } catch (e) {
      await _logError('premium_validation_failed', e);
      
      return ValidationResult(
        isValid: false,
        errorMessage: 'Unable to verify premium access. Please try again later.',
      );
    }
  }

  /// Validate health data sufficiency for doctor report generation
  Future<HealthDataValidationResult> _validateHealthDataSufficiency(
    HealthDataProvider dataProvider,
  ) async {
    try {
      // Get all completed documents (results)
      final completedDocuments = dataProvider.getDocumentsByStatus(ProcessingStatus.completed);
      
      if (completedDocuments.isEmpty) {
        return HealthDataValidationResult(
          isValid: false,
          errorMessage: 'No health data available. Please upload and process at least one medical document before generating a doctor report.',
        );
      }

      // Check for minimum health data requirements
      const minRequiredDocuments = 1; // Start with minimum requirement
      if (completedDocuments.length < minRequiredDocuments) {
        return HealthDataValidationResult(
          isValid: false,
          errorMessage: 'Insufficient health data. Doctor reports require at least $minRequiredDocuments processed medical document(s). You currently have ${completedDocuments.length}.',
        );
      }

      // Check for recent data (optional - could require data within last year)
      final recentCutoff = DateTime.now().subtract(const Duration(days: 365));
      final recentDocuments = completedDocuments.where((doc) {
        return doc.uploadDate != null && doc.uploadDate!.isAfter(recentCutoff);
      }).toList();

      if (recentDocuments.isEmpty) {
        return HealthDataValidationResult(
          isValid: false,
          errorMessage: 'No recent health data found. Please upload recent medical documents for accurate doctor report generation.',
        );
      }

      // Create health data summary for API call
      final healthDataSummary = _createHealthDataSummary(completedDocuments);

      return HealthDataValidationResult(
        isValid: true,
        documentCount: completedDocuments.length,
        recentDocumentCount: recentDocuments.length,
        healthDataSummary: healthDataSummary,
      );
      
    } catch (e) {
      await _logError('health_data_validation_failed', e);
      
      return HealthDataValidationResult(
        isValid: false,
        errorMessage: 'Unable to validate health data. Please try again.',
      );
    }
  }

  /// Create health data summary for API call
  Map<String, dynamic> _createHealthDataSummary(List<SerenyaContent> documents) {
    final summary = <String, dynamic>{
      'total_documents': documents.length,
      'document_types': <String, int>{},
      'date_range': <String, String>{},
      'medical_flags': <String>[],
      'confidence_scores': <double>[],
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

    // Aggregate medical flags
    final allFlags = <String>{};
    for (final doc in documents) {
      allFlags.addAll(doc.medicalFlags);
    }
    summary['medical_flags'] = allFlags.toList();

    // Aggregate confidence scores
    summary['confidence_scores'] = documents
        .map((doc) => doc.confidenceScore)
        .toList();

    return summary;
  }

  /// Call the new doctor reports API endpoint
  Future<ApiResult<Map<String, dynamic>>> _callDoctorReportsAPI(
    Map<String, dynamic> healthDataSummary,
    Map<String, dynamic>? additionalContext,
  ) async {
    try {
      
      final requestData = {
        'content_type': 'report',
        'report_type': 'medical_summary',
        'health_data': healthDataSummary,
        'timestamp': DateTime.now().millisecondsSinceEpoch,
        'api_version': 'v1',
      };

      if (additionalContext != null) {
        requestData['additional_context'] = additionalContext;
      }

      final response = await _apiClient.dio.post(
        '/api/v1/process/doctor-report',
        data: requestData,
        options: Options(
          sendTimeout: const Duration(seconds: 30), // Longer timeout for reports
          receiveTimeout: const Duration(seconds: 30),
        ),
      );

      if (response.statusCode == 200 || response.statusCode == 202) {
        return ApiResult.success(
          response.data as Map<String, dynamic>,
          statusCode: response.statusCode,
        );
      } else {
        return ApiResult.failed(
          _getErrorMessageForStatusCode(response.statusCode!),
          statusCode: response.statusCode,
        );
      }

    } on DioException catch (e) {
      await _logError('doctor_reports_api_dio_error', e);
      return ApiResult.failed(
        _getErrorMessageForDioException(e),
      );
    } catch (e) {
      await _logError('doctor_reports_api_call_failed', e);
      
      return ApiResult.failed(
        'An unexpected error occurred while connecting to our servers. Please try again.',
      );
    }
  }

  /// Get user-friendly error message for HTTP status codes
  String _getErrorMessageForStatusCode(int statusCode) {
    switch (statusCode) {
      case 400:
        return 'Invalid request. Please check your health data and try again.';
      case 401:
        return 'Authentication failed. Please log in again.';
      case 403:
        return 'Premium subscription required to generate doctor reports.';
      case 404:
        return 'Doctor reports service is temporarily unavailable.';
      case 422:
        return 'Insufficient health data to generate a comprehensive report.';
      case 429:
        return 'Too many requests. Please wait a moment before trying again.';
      case 500:
        return 'Server error. Our team has been notified and is working on a fix.';
      case 503:
        return 'Service temporarily unavailable. Please try again in a few minutes.';
      default:
        return 'Server returned error code $statusCode. Please try again later.';
    }
  }

  /// Get user-friendly error message for Dio exceptions
  String _getErrorMessageForDioException(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
        return 'Connection timeout. Please check your internet connection and try again.';
      case DioExceptionType.sendTimeout:
        return 'Request timeout. The server is taking too long to respond.';
      case DioExceptionType.receiveTimeout:
        return 'Response timeout. Please try again in a few moments.';
      case DioExceptionType.connectionError:
        return 'Network connection error. Please check your internet connection.';
      case DioExceptionType.cancel:
        return 'Request was cancelled.';
      case DioExceptionType.badResponse:
        if (e.response?.statusCode != null) {
          return _getErrorMessageForStatusCode(e.response!.statusCode!);
        }
        return 'Server error. Please try again later.';
      default:
        return 'Network error. Please check your connection and try again.';
    }
  }

  /// Generate unique job ID for local tracking
  String _generateJobId() {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final random = DateTime.now().microsecond;
    return 'doctor_report_${timestamp}_$random';
  }

  /// Log errors with context
  Future<void> _logError(String event, dynamic error) async {
    debugPrint('DOCTOR_REPORTS_SERVICE_ERROR: $event - $error');
    
    // TODO: Integrate with comprehensive audit logging system
  }
}

/// Result of doctor report generation attempt
class DoctorReportResult {
  final bool success;
  final String? jobId;
  final ProcessingJob? processingJob;
  final String message;
  final DoctorReportErrorType? errorType;

  DoctorReportResult({
    required this.success,
    this.jobId,
    this.processingJob,
    required this.message,
    this.errorType,
  });
}

/// Types of errors that can occur during doctor report generation
enum DoctorReportErrorType {
  premiumRequired,
  insufficientHealthData,
  apiError,
  unexpected,
}

/// Result of premium access validation
class ValidationResult {
  final bool isValid;
  final String? errorMessage;

  ValidationResult({
    required this.isValid,
    this.errorMessage,
  });
}

/// Result of health data validation with additional metadata
class HealthDataValidationResult {
  final bool isValid;
  final String? errorMessage;
  final int? documentCount;
  final int? recentDocumentCount;
  final Map<String, dynamic>? healthDataSummary;

  HealthDataValidationResult({
    required this.isValid,
    this.errorMessage,
    this.documentCount,
    this.recentDocumentCount,
    this.healthDataSummary,
  });
}

/// API result wrapper
class ApiResult<T> {
  final bool isSuccess;
  final T? data;
  final String message;
  final int? statusCode;

  ApiResult.success(this.data, {this.statusCode, String? message})
      : isSuccess = true,
        message = message ?? 'Success';

  ApiResult.failed(this.message, {this.statusCode})
      : isSuccess = false,
        data = null;

  bool get success => isSuccess;
}