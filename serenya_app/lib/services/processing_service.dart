import 'dart:async';
import 'dart:io';
import '../models/health_document.dart';
import '../core/constants/app_constants.dart';
import '../core/providers/health_data_provider.dart';
import 'api_service.dart';

class ProcessingService {
  final ApiService _apiService = ApiService();
  final Map<String, Timer> _retryTimers = {};
  final Map<String, int> _retryAttempts = {};

  Future<ProcessingResult> processDocument({
    required File file,
    required String fileName,
    required HealthDataProvider dataProvider,
  }) async {
    try {
      // Create initial document record
      final document = HealthDocument(
        fileName: fileName,
        fileType: _extractFileType(fileName),
        fileSize: await file.length(),
        uploadDate: DateTime.now(),
        processingStatus: ProcessingStatus.pending,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      await dataProvider.addDocument(document);

      // Start upload process
      final uploadResult = await _apiService.uploadDocument(
        file: file,
        fileName: fileName,
        fileType: document.fileType,
      );

      final jobId = uploadResult['job_id'] as String;
      
      // Update document with processing status
      final updatedDocument = document.copyWith(
        processingStatus: ProcessingStatus.processing,
        updatedAt: DateTime.now(),
      );
      await dataProvider.updateDocument(updatedDocument);

      // Start monitoring processing
      _startProcessingMonitor(jobId, updatedDocument, dataProvider);

      return ProcessingResult(
        success: true,
        jobId: jobId,
        document: updatedDocument,
        message: 'Document uploaded successfully. Processing started.',
      );

    } catch (e) {
      return ProcessingResult(
        success: false,
        message: 'Upload failed: ${e.toString()}',
        error: e,
      );
    }
  }

  void _startProcessingMonitor(
    String jobId,
    HealthDocument document,
    HealthDataProvider dataProvider,
  ) {
    Timer.periodic(Duration(seconds: 10), (timer) async {
      try {
        final status = await _apiService.getProcessingStatus(jobId);
        await _handleProcessingUpdate(
          jobId,
          status,
          document,
          dataProvider,
          timer,
        );
      } catch (e) {
        print('Error checking processing status: $e');
        // Continue monitoring - temporary network issues shouldn't stop monitoring
      }
    });
  }

  Future<void> _handleProcessingUpdate(
    String jobId,
    Map<String, dynamic> statusData,
    HealthDocument document,
    HealthDataProvider dataProvider,
    Timer timer,
  ) async {
    final status = statusData['status'] as String;
    final currentTime = DateTime.now();

    switch (status) {
      case 'completed':
        timer.cancel();
        _retryTimers.remove(jobId);
        _retryAttempts.remove(jobId);
        
        try {
          final interpretation = await _apiService.getInterpretation(jobId);
          final updatedDocument = document.copyWith(
            processingStatus: ProcessingStatus.completed,
            aiConfidenceScore: interpretation['confidence_score']?.toDouble(),
            interpretationText: interpretation['interpretation_text'],
            updatedAt: currentTime,
          );
          
          await dataProvider.updateDocument(updatedDocument);
          
          // Add detailed interpretation
          if (interpretation['detailed_interpretation'] != null) {
            final detailedInterpretation = Interpretation(
              documentId: updatedDocument.id!,
              interpretationType: InterpretationType.detailed,
              confidenceScore: interpretation['confidence_score']?.toDouble() ?? 0.0,
              interpretationText: interpretation['detailed_interpretation'],
              medicalFlags: _extractMedicalFlags(interpretation),
              createdAt: currentTime,
            );
            
            await dataProvider.addInterpretation(detailedInterpretation);
          }
          
        } catch (e) {
          print('Error getting interpretation: $e');
          await _markDocumentFailed(document, dataProvider, 'Failed to retrieve interpretation');
        }
        break;

      case 'failed':
        timer.cancel();
        await _handleProcessingFailure(jobId, document, dataProvider, statusData);
        break;

      case 'processing':
        // Continue monitoring - update timestamp to show it's still active
        final updatedDocument = document.copyWith(
          processingStatus: ProcessingStatus.processing,
          updatedAt: currentTime,
        );
        await dataProvider.updateDocument(updatedDocument);
        break;

      case 'timeout':
        timer.cancel();
        await _handleProcessingTimeout(jobId, document, dataProvider);
        break;
    }
  }

  Future<void> _handleProcessingFailure(
    String jobId,
    HealthDocument document,
    HealthDataProvider dataProvider,
    Map<String, dynamic> statusData,
  ) async {
    final currentAttempt = _retryAttempts[jobId] ?? 0;
    final errorMessage = statusData['error_message'] as String?;
    
    if (currentAttempt < AppConstants.maxRetryAttempts) {
      await _scheduleRetry(jobId, document, dataProvider, currentAttempt);
    } else {
      _retryAttempts.remove(jobId);
      await _markDocumentFailed(
        document,
        dataProvider,
        errorMessage ?? 'Processing failed after ${AppConstants.maxRetryAttempts} attempts',
      );
    }
  }

  Future<void> _handleProcessingTimeout(
    String jobId,
    HealthDocument document,
    HealthDataProvider dataProvider,
  ) async {
    final currentAttempt = _retryAttempts[jobId] ?? 0;
    
    if (currentAttempt < AppConstants.maxRetryAttempts) {
      await _scheduleRetry(jobId, document, dataProvider, currentAttempt);
    } else {
      _retryAttempts.remove(jobId);
      await _markDocumentFailed(
        document,
        dataProvider,
        'Processing timeout after ${AppConstants.processingTimeoutMinutes} minutes',
      );
    }
  }

  Future<void> _scheduleRetry(
    String jobId,
    HealthDocument document,
    HealthDataProvider dataProvider,
    int attemptNumber,
  ) async {
    _retryAttempts[jobId] = attemptNumber + 1;
    
    // Update document status to retrying
    final updatedDocument = document.copyWith(
      processingStatus: ProcessingStatus.retrying,
      updatedAt: DateTime.now(),
    );
    await dataProvider.updateDocument(updatedDocument);
    
    // Schedule retry based on attempt number
    final retryDelay = Duration(seconds: AppConstants.retryDelaySeconds[attemptNumber]);
    
    _retryTimers[jobId] = Timer(retryDelay, () async {
      try {
        await _apiService.retryProcessing(jobId);
        
        // Update status back to processing
        final processingDocument = updatedDocument.copyWith(
          processingStatus: ProcessingStatus.processing,
          updatedAt: DateTime.now(),
        );
        await dataProvider.updateDocument(processingDocument);
        
        // Resume monitoring
        _startProcessingMonitor(jobId, processingDocument, dataProvider);
        
      } catch (e) {
        print('Retry failed: $e');
        await _markDocumentFailed(
          document,
          dataProvider,
          'Retry attempt ${attemptNumber + 1} failed: ${e.toString()}',
        );
      }
    });
  }

  Future<void> _markDocumentFailed(
    HealthDocument document,
    HealthDataProvider dataProvider,
    String errorMessage,
  ) async {
    final failedDocument = document.copyWith(
      processingStatus: ProcessingStatus.failed,
      interpretationText: 'Processing failed: $errorMessage',
      updatedAt: DateTime.now(),
    );
    await dataProvider.updateDocument(failedDocument);
  }

  List<String> _extractMedicalFlags(Map<String, dynamic> interpretation) {
    final flags = interpretation['medical_flags'] as List?;
    if (flags == null) return [];
    
    return flags
        .where((flag) => flag is String)
        .cast<String>()
        .toList();
  }

  String _extractFileType(String fileName) {
    final extension = fileName.toLowerCase().split('.').last;
    return extension;
  }

  void cancelProcessing(String jobId) {
    _retryTimers[jobId]?.cancel();
    _retryTimers.remove(jobId);
    _retryAttempts.remove(jobId);
  }

  void dispose() {
    for (final timer in _retryTimers.values) {
      timer.cancel();
    }
    _retryTimers.clear();
    _retryAttempts.clear();
  }
}

class ProcessingResult {
  final bool success;
  final String? jobId;
  final HealthDocument? document;
  final String message;
  final dynamic error;

  ProcessingResult({
    required this.success,
    this.jobId,
    this.document,
    required this.message,
    this.error,
  });
}