import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import '../models/local_database_models.dart';
import '../core/constants/app_constants.dart';
import '../core/providers/health_data_provider.dart';
import '../core/database/processing_job_repository.dart';
import 'api_service.dart';
import 'notification_service.dart';

class ProcessingService {
  final ApiService _apiService = ApiService();
  final NotificationService _notificationService = NotificationService();

  Future<ProcessingResult> processDocument({
    required File file,
    required String fileName,
    required HealthDataProvider dataProvider,
  }) async {
    try {
      // Start upload process using three-layer error handling (no initial document creation)
      final uploadResult = await _executeWithErrorHandling(
        operation: () => _apiService.uploadDocument(
          file: file,
          fileName: fileName,
          fileType: _extractFileType(fileName),
        ),
        context: 'document_upload',
        fileName: fileName,
      );

      if (!uploadResult.success || uploadResult.data == null) {
        return ProcessingResult(
          success: false,
          message: uploadResult.message,
          error: uploadResult.errorCode,
        );
      }

      final jobId = uploadResult.data!['job_id'] as String;
      final estimatedSeconds = uploadResult.data!['estimated_completion_seconds'] as int?;
      
      // Create persistent processing job record (replaces timer approach)
      final processingJob = await ProcessingJobRepository.createJob(
        jobId: jobId,
        jobType: JobType.documentUpload,
        status: JobStatus.processing,
        estimatedCompletionSeconds: estimatedSeconds,
      );

      // Send notification about upload success
      await _notificationService.showNotification(
        title: 'Upload Complete',
        body: 'Your document $fileName is now being processed.',
      );

      return ProcessingResult(
        success: true,
        jobId: jobId,
        document: null, // No initial document created
        processingJob: processingJob,
        message: 'Document uploaded successfully. Processing started.',
      );

    } catch (e) {
      // Handle unexpected errors with comprehensive logging
      await _logProcessingError('document_upload_failed', fileName, e);
      
      return ProcessingResult(
        success: false,
        message: 'Upload failed: ${e.toString()}',
        error: e,
      );
    }
  }

  /// Poll processing status for a specific job
  /// 
  /// This method is called by the polling service to check job status
  /// Replaces timer-based monitoring with database-driven polling
  Future<ProcessingJobPollResult> pollJobStatus(
    String jobId, {
    required HealthDataProvider dataProvider,
  }) async {
    try {
      // Get current job from database
      final job = await ProcessingJobRepository.getJob(jobId);
      if (job == null) {
        return ProcessingJobPollResult(
          jobId: jobId,
          success: false,
          errorMessage: 'Job not found in database',
          shouldContinuePolling: false,
        );
      }

      // Check server status using three-layer error handling
      final statusResult = await _executeWithErrorHandling(
        operation: () => _apiService.getProcessingStatus(jobId),
        context: 'status_poll',
        jobId: jobId,
      );

      if (!statusResult.success || statusResult.data == null) {
        // Update retry count and schedule next poll
        final updatedJob = await ProcessingJobRepository.updatePollingMetadata(
          jobId, 
          job.retryCount + 1,
        );
        
        return ProcessingJobPollResult(
          jobId: jobId,
          success: false,
          errorMessage: statusResult.message,
          shouldContinuePolling: updatedJob.retryCount < AppConstants.maxRetryAttempts,
          nextPollAt: updatedJob.nextPollAt,
        );
      }

      final statusData = statusResult.data!;
      final status = statusData['status'] as String;

      return await _handlePollingStatusUpdate(
        job,
        status,
        statusData,
        dataProvider,
      );

    } catch (e) {
      await _logProcessingError('job_polling_failed', jobId, e);
      
      return ProcessingJobPollResult(
        jobId: jobId,
        success: false,
        errorMessage: 'Polling failed: ${e.toString()}',
        shouldContinuePolling: false,
      );
    }
  }

  /// Handle status update from polling
  /// 
  /// Processes different status transitions and updates database accordingly
  Future<ProcessingJobPollResult> _handlePollingStatusUpdate(
    ProcessingJob job,
    String status,
    Map<String, dynamic> statusData,
    HealthDataProvider dataProvider,
  ) async {
    switch (status) {
      case 'completed':
        return await _handleJobCompletion(job, statusData, dataProvider);

      case 'failed':
        return await _handleJobFailure(job, statusData, dataProvider);

      case 'processing':
        return await _handleJobStillProcessing(job, dataProvider);

      case 'timeout':
        return await _handleJobTimeout(job, dataProvider);

      default:
        await _logProcessingError('unknown_job_status', job.jobId, 'Unknown status: $status');
        return ProcessingJobPollResult(
          jobId: job.jobId,
          success: false,
          errorMessage: 'Unknown job status: $status',
          shouldContinuePolling: false,
        );
    }
  }

  /// Handle job completion
  Future<ProcessingJobPollResult> _handleJobCompletion(
    ProcessingJob job,
    Map<String, dynamic> statusData,
    HealthDataProvider dataProvider,
  ) async {
    try {
      // Handle different job types
      switch (job.jobType) {
        case JobType.documentUpload:
          return await _handleDocumentJobCompletion(job, statusData, dataProvider);
        case JobType.doctorReport:
          return await _handleDoctorReportJobCompletion(job, statusData, dataProvider);
        case JobType.chatMessage:
          return await _handleChatJobCompletion(job, statusData, dataProvider);
      }

    } catch (e) {
      await _logProcessingError('job_completion_failed', job.jobId, e);
      return await _handleJobFailure(
        job,
        {'error_message': 'Completion handling failed: ${e.toString()}'},
        dataProvider,
      );
    }
  }

  /// Handle document upload job completion
  Future<ProcessingJobPollResult> _handleDocumentJobCompletion(
    ProcessingJob job,
    Map<String, dynamic> statusData,
    HealthDataProvider dataProvider,
  ) async {
    // Get interpretation results
    final interpretationResult = await _executeWithErrorHandling(
      operation: () => _apiService.getInterpretation(job.jobId),
      context: 'interpretation_retrieval',
      jobId: job.jobId,
    );

    if (!interpretationResult.success || interpretationResult.data == null) {
      return await _handleJobFailure(
        job, 
        {'error_message': 'Failed to retrieve interpretation: ${interpretationResult.message}'}, 
        dataProvider,
      );
    }

    final interpretation = interpretationResult.data!;
    final resultContentId = interpretation['content_id'] as String?;
    
    if (resultContentId == null) {
      return await _handleJobFailure(
        job,
        {'error_message': 'No content ID in interpretation response'},
        dataProvider,
      );
    }

    // Mark job as completed in database
    await ProcessingJobRepository.completeJob(job.jobId, resultContentId);

    // Create document in UI database (no initial document exists for uploads)
    await _createDocumentWithResults(
      resultContentId,
      interpretation,
      dataProvider,
      ContentType.result,
      jobId: job.jobId,
    );

    // Send completion notification
    await _notificationService.showNotification(
      title: 'Processing Complete',
      body: 'Your document analysis is ready to view.',
    );

    return ProcessingJobPollResult(
      jobId: job.jobId,
      success: true,
      shouldContinuePolling: false,
      resultContentId: resultContentId,
    );
  }

  /// Handle doctor report job completion
  Future<ProcessingJobPollResult> _handleDoctorReportJobCompletion(
    ProcessingJob job,
    Map<String, dynamic> statusData,
    HealthDataProvider dataProvider,
  ) async {
    // Get doctor report results
    final reportResult = await _executeWithErrorHandling(
      operation: () => _apiService.getInterpretation(job.jobId), // Same endpoint but different content type
      context: 'doctor_report_retrieval',
      jobId: job.jobId,
    );

    if (!reportResult.success || reportResult.data == null) {
      return await _handleJobFailure(
        job, 
        {'error_message': 'Failed to retrieve doctor report: ${reportResult.message}'}, 
        dataProvider,
      );
    }

    final report = reportResult.data!;
    final reportContentId = report['content_id'] as String?;
    
    if (reportContentId == null) {
      return await _handleJobFailure(
        job,
        {'error_message': 'No content ID in doctor report response'},
        dataProvider,
      );
    }

    // Mark job as completed in database
    await ProcessingJobRepository.completeJob(job.jobId, reportContentId);

    // Create document in UI database with report content type
    await _createDocumentWithResults(
      reportContentId,
      report,
      dataProvider,
      ContentType.report,
      jobId: job.jobId,
    );

    // Send completion notification
    await _notificationService.showNotification(
      title: 'Doctor Report Complete',
      body: 'Your comprehensive doctor report is ready to view.',
    );

    return ProcessingJobPollResult(
      jobId: job.jobId,
      success: true,
      shouldContinuePolling: false,
      resultContentId: reportContentId,
    );
  }

  /// Handle chat message job completion
  Future<ProcessingJobPollResult> _handleChatJobCompletion(
    ProcessingJob job,
    Map<String, dynamic> statusData,
    HealthDataProvider dataProvider,
  ) async {
    // TODO: Implement chat message completion handling
    // For now, just mark as completed with placeholder result ID
    await ProcessingJobRepository.completeJob(job.jobId, 'chat_result_${job.jobId}');

    return ProcessingJobPollResult(
      jobId: job.jobId,
      success: true,
      shouldContinuePolling: false,
    );
  }

  /// Handle job failure
  Future<ProcessingJobPollResult> _handleJobFailure(
    ProcessingJob job,
    Map<String, dynamic> statusData,
    HealthDataProvider dataProvider,
  ) async {
    final errorMessage = statusData['error_message'] as String? ?? 'Processing failed';
    
    // Mark job as failed in database
    await ProcessingJobRepository.failJob(job.jobId, errorMessage);

    // Update document to show failure
    await _updateDocumentWithFailure(job.jobId, errorMessage, dataProvider);

    // Send failure notification
    await _notificationService.showNotification(
      title: 'Processing Failed',
      body: 'Document processing failed: $errorMessage',
    );

    return ProcessingJobPollResult(
      jobId: job.jobId,
      success: false,
      errorMessage: errorMessage,
      shouldContinuePolling: false,
    );
  }

  /// Handle job still processing
  Future<ProcessingJobPollResult> _handleJobStillProcessing(
    ProcessingJob job,
    HealthDataProvider dataProvider,
  ) async {
    // Update polling metadata for next check
    final updatedJob = await ProcessingJobRepository.updatePollingMetadata(
      job.jobId,
      job.retryCount,
    );

    return ProcessingJobPollResult(
      jobId: job.jobId,
      success: true,
      shouldContinuePolling: true,
      nextPollAt: updatedJob.nextPollAt,
    );
  }

  /// Handle job timeout
  Future<ProcessingJobPollResult> _handleJobTimeout(
    ProcessingJob job,
    HealthDataProvider dataProvider,
  ) async {
    if (job.retryCount < AppConstants.maxRetryAttempts) {
      // Schedule retry
      final updatedJob = await ProcessingJobRepository.updatePollingMetadata(
        job.jobId,
        job.retryCount + 1,
      );

      return ProcessingJobPollResult(
        jobId: job.jobId,
        success: true,
        shouldContinuePolling: true,
        nextPollAt: updatedJob.nextPollAt,
        message: 'Job timed out, retrying...',
      );
    } else {
      // Max retries exceeded
      return await _handleJobFailure(
        job,
        {'error_message': 'Processing timeout after ${AppConstants.maxRetryAttempts} retry attempts'},
        dataProvider,
      );
    }
  }

  /// Create document with successful processing results
  Future<void> _createDocumentWithResults(
    String contentId,
    Map<String, dynamic> interpretation,
    HealthDataProvider dataProvider,
    ContentType contentType, {
    String? jobId, // Optional jobId for cleanup
  }) async {
    // Create new document record with the results
    // This is used for doctor reports which don't have an initial document
    
    final document = SerenyaContent(
      id: contentId,
      userId: 'current_user', // This should come from auth service
      contentType: contentType,
      title: interpretation['title'] ?? 'Doctor Report', // Use Bedrock title with fallback
      summary: interpretation['summary'],
      content: interpretation['detailed_interpretation'] ?? interpretation['interpretation_text'] ?? '',
      confidenceScore: (interpretation['confidence_score'] as num?)?.toDouble() ?? 0.0,
      documentDate: interpretation['document_date'] != null 
          ? DateTime.parse(interpretation['document_date'])
          : null,
      medicalFlags: _extractMedicalFlags(interpretation),
      processingStatus: ProcessingStatus.completed,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );

    await dataProvider.addDocument(document);
    
    // Trigger cleanup of temporary S3 files after successful storage
    // This is a fire-and-forget operation for all content types
    if (jobId != null) {
      _triggerCleanupAsync(jobId);
    }
  }

  /// Update document to show processing failure
  Future<void> _updateDocumentWithFailure(
    String jobId,
    String errorMessage,
    HealthDataProvider dataProvider,
  ) async {
    // In a full implementation, this would find the document by job ID
    // and update it to show the failure status
    // For now, we log the failure
    await _logProcessingError('document_processing_failed', jobId, errorMessage);
  }

  /// Trigger async cleanup of temporary S3 files (fire-and-forget)
  /// 
  /// Called after successful storage to SerenyaContent table for all content types
  void _triggerCleanupAsync(String jobId) {
    // Use Future.microtask to make this truly fire-and-forget
    Future.microtask(() async {
      try {
        final cleanupResult = await _apiService.cleanupTempFiles(jobId);
        if (cleanupResult.success) {
          _log('Successfully cleaned up temp files for job: $jobId', 'cleanup_success');
        } else {
          _log('Failed to cleanup temp files for job: $jobId - ${cleanupResult.message}', 'cleanup_failure');
        }
      } catch (e) {
        // Log but don't fail - this is fire-and-forget
        _log('Error during async cleanup for job: $jobId - $e', 'cleanup_error');
      }
    });
  }

  /// Three-layer error handling wrapper
  /// 
  /// Implements the error handling strategy from dev rules:
  /// Layer 1: Network/connectivity errors
  /// Layer 2: API response validation
  /// Layer 3: Unexpected exceptions
  Future<T> _executeWithErrorHandling<T>({
    required Future<T> Function() operation,
    required String context,
    String? fileName,
    String? jobId,
  }) async {
    try {
      // Layer 1: Execute operation with network error handling
      final result = await operation();
      
      // Layer 2: Validate result (this is operation-specific)
      // For now, we just return the result
      return result;
      
    } on SocketException catch (e) {
      // Layer 1: Network connectivity errors
      await _logProcessingError('network_error', context, e);
      rethrow;
    } on TimeoutException catch (e) {
      // Layer 1: Request timeout errors
      await _logProcessingError('timeout_error', context, e);
      rethrow;
    } catch (e) {
      // Layer 3: Unexpected exceptions
      await _logProcessingError('unexpected_error', context, e);
      rethrow;
    }
  }

  /// Extract medical flags from API response
  List<String> _extractMedicalFlags(Map<String, dynamic> interpretation) {
    final flags = interpretation['medical_flags'] as List?;
    if (flags == null) return [];
    
    return flags
        .whereType<String>()
        .cast<String>()
        .toList();
  }

  /// Extract file type from filename
  String _extractFileType(String fileName) {
    final extension = fileName.toLowerCase().split('.').last;
    return extension;
  }

  /// Cancel processing for a specific job
  /// 
  /// Marks job as failed in database instead of canceling timers
  Future<void> cancelProcessing(String jobId) async {
    try {
      await ProcessingJobRepository.failJob(
        jobId, 
        'Processing cancelled by user',
      );
      
      await _logProcessingError('job_cancelled', jobId, 'User requested cancellation');
    } catch (e) {
      await _logProcessingError('job_cancellation_failed', jobId, e);
    }
  }

  /// Get all active processing jobs
  /// 
  /// Used by polling service and UI to show current processing status
  Future<List<ProcessingJob>> getActiveJobs() async {
    try {
      return await ProcessingJobRepository.getActiveJobs();
    } catch (e) {
      await _logProcessingError('active_jobs_retrieval_failed', 'service', e);
      return [];
    }
  }

  /// Clean up old completed jobs
  /// 
  /// Should be called periodically to prevent database growth
  Future<void> cleanupOldJobs() async {
    try {
      final deletedCount = await ProcessingJobRepository.cleanupOldJobs();
      if (deletedCount > 0) {
        debugPrint('ProcessingService: Cleaned up $deletedCount old jobs');
      }
    } catch (e) {
      await _logProcessingError('job_cleanup_failed', 'service', e);
    }
  }

  /// Log messages with consistent formatting
  void _log(String message, String level) {
    if (kDebugMode || level == 'error' || level == 'cleanup_error' || level == 'cleanup_failure') {
      final timestamp = DateTime.now().toIso8601String();
      final levelUpper = level.toUpperCase();
      debugPrint('[$timestamp] PROCESSING_SERVICE $levelUpper: $message');
    }
  }

  /// Log processing errors with comprehensive context
  Future<void> _logProcessingError(String event, String context, dynamic error) async {
    debugPrint('PROCESSING_SERVICE_ERROR: $event in $context - $error');
    
    // TODO: Integrate with comprehensive audit logging system
    // This should include:
    // - User context
    // - Device information 
    // - Network conditions
    // - Error categorization
    // - Automatic retry recommendations
  }

  /// Dispose resources (no longer needed without timers)
  void dispose() {
    // No timer cleanup needed in database-driven approach
    // Resources are managed by the database connection
  }
}

class ProcessingResult {
  final bool success;
  final String? jobId;
  final SerenyaContent? document;
  final ProcessingJob? processingJob;
  final String message;
  final dynamic error;

  ProcessingResult({
    required this.success,
    this.jobId,
    this.document,
    this.processingJob,
    required this.message,
    this.error,
  });
}

/// Result of polling a processing job
class ProcessingJobPollResult {
  final String jobId;
  final bool success;
  final bool shouldContinuePolling;
  final String? errorMessage;
  final String? message;
  final DateTime? nextPollAt;
  final String? resultContentId;

  ProcessingJobPollResult({
    required this.jobId,
    required this.success,
    required this.shouldContinuePolling,
    this.errorMessage,
    this.message,
    this.nextPollAt,
    this.resultContentId,
  });
}