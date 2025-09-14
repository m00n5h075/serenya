# Flutter Polling System Implementation Plan

## Executive Summary

This document provides a comprehensive implementation plan to fix critical architectural gaps in the Flutter app's polling system. The current implementation suffers from several severe issues that prevent proper job tracking, create resource leaks, and lack database persistence.

**Critical Issues Identified:**
- ProcessingJob records are never created during upload operations
- Timer-based polling lacks database persistence and recovery capability
- No job cleanup mechanism exists for completed tasks
- S3 cleanup is not performed after successful processing
- Resource leaks from uncancelled timers across app sessions
- Race conditions between multiple polling mechanisms

**Impact:** These gaps result in inconsistent job tracking, resource exhaustion, and inability to resume polling after app restarts.

## Critical Issues Identified

### 1. Missing ProcessingJob Database Integration
- **File:** `/Users/m00n5h075ai/development/serenya/serenya_app/lib/services/processing_service.dart`
- **Issue:** Lines 13-80 show ProcessingService.processDocument() never creates ProcessingJob records
- **Impact:** Job tracking relies solely on memory-based timers, lost on app restart

### 2. Non-Persistent Polling System
- **File:** `/Users/m00n5h075ai/development/serenya/serenya_app/lib/services/processing_service.dart`
- **Issue:** Lines 82-104 use Timer.periodic() without database backing
- **Impact:** Polling stops permanently when app is backgrounded or restarted

### 3. Duplicate Polling Logic
- **File:** `/Users/m00n5h075ai/development/serenya/serenya_app/lib/services/upload_service.dart`
- **Issue:** Lines 231-266 implement separate monitoring system
- **Impact:** Multiple timers polling same jobs, race conditions

### 4. Missing Job Cleanup
- **Files:** Both processing_service.dart and upload_service.dart
- **Issue:** No mechanism to remove completed jobs or clean S3 resources
- **Impact:** Database grows indefinitely, S3 storage costs increase

### 5. Resource Leak Management
- **File:** `/Users/m00n5h075ai/development/serenya/serenya_app/lib/services/processing_service.dart`
- **Issue:** Lines 295-301 dispose() only clears memory, not database state
- **Impact:** Zombie jobs remain active in database across app sessions

## Implementation Phases

### Phase P0: Critical Database Integration (2-3 days)
**Priority:** CRITICAL - Must be completed first
**Goal:** Establish persistent job tracking with database backing

### Phase P1: Unified Polling Service (2-3 days)  
**Priority:** HIGH - Core functionality restoration
**Goal:** Replace timer-based polling with robust database-driven system

### Phase P2: Resource Management & Cleanup (1-2 days)
**Priority:** MEDIUM - Performance and maintenance
**Goal:** Implement job lifecycle management and resource cleanup

## Detailed Code Changes

### Phase P0: Database Integration

#### 1. Create ProcessingJobRepository
**File:** `/Users/m00n5h075ai/development/serenya/serenya_app/lib/core/database/processing_job_repository.dart`

```dart
import 'dart:async';
import 'package:sqflite/sqflite.dart';
import '../models/local_database_models.dart';
import 'encrypted_database_service.dart';

class ProcessingJobRepository {
  static const String tableName = 'processing_jobs';

  /// Insert new processing job record
  Future<void> insertJob(ProcessingJob job) async {
    final db = await EncryptedDatabaseService.database;
    await db.insert(tableName, job.toJson());
  }

  /// Update existing job status and metadata
  Future<void> updateJob(ProcessingJob job) async {
    final db = await EncryptedDatabaseService.database;
    await db.update(
      tableName,
      job.toJson(),
      where: 'job_id = ?',
      whereArgs: [job.jobId],
    );
  }

  /// Get job by ID
  Future<ProcessingJob?> getJobById(String jobId) async {
    final db = await EncryptedDatabaseService.database;
    final results = await db.query(
      tableName,
      where: 'job_id = ?',
      whereArgs: [jobId],
      limit: 1,
    );
    
    if (results.isEmpty) return null;
    return ProcessingJob.fromJson(results.first);
  }

  /// Get all active jobs (processing status)
  Future<List<ProcessingJob>> getActiveJobs() async {
    final db = await EncryptedDatabaseService.database;
    final results = await db.query(
      tableName,
      where: 'status = ?',
      whereArgs: [JobStatus.processing.value],
      orderBy: 'initiated_at ASC',
    );
    
    return results.map((json) => ProcessingJob.fromJson(json)).toList();
  }

  /// Get jobs ready for polling (where nextPollAt <= now)
  Future<List<ProcessingJob>> getJobsReadyForPolling() async {
    final db = await EncryptedDatabaseService.database;
    final now = DateTime.now().toIso8601String();
    
    final results = await db.query(
      tableName,
      where: 'status = ? AND (next_poll_at IS NULL OR next_poll_at <= ?)',
      whereArgs: [JobStatus.processing.value, now],
      orderBy: 'next_poll_at ASC, initiated_at ASC',
      limit: 50, // Prevent excessive polling
    );
    
    return results.map((json) => ProcessingJob.fromJson(json)).toList();
  }

  /// Delete completed jobs older than specified days
  Future<int> cleanupCompletedJobs({int olderThanDays = 7}) async {
    final db = await EncryptedDatabaseService.database;
    final cutoffDate = DateTime.now().subtract(Duration(days: olderThanDays));
    
    return await db.delete(
      tableName,
      where: 'status IN (?, ?) AND completed_at < ?',
      whereArgs: [
        JobStatus.completed.value,
        JobStatus.failed.value,
        cutoffDate.toIso8601String(),
      ],
    );
  }

  /// Mark job as completed
  Future<void> completeJob(String jobId, {String? resultContentId, String? errorMessage}) async {
    final db = await EncryptedDatabaseService.database;
    final now = DateTime.now();
    
    await db.update(
      tableName,
      {
        'status': errorMessage == null ? JobStatus.completed.value : JobStatus.failed.value,
        'completed_at': now.toIso8601String(),
        'result_content_id': resultContentId,
        'error_message': errorMessage,
      },
      where: 'job_id = ?',
      whereArgs: [jobId],
    );
  }
}
```

#### 2. Modify ProcessingService to Create Jobs
**File:** `/Users/m00n5h075ai/development/serenya/serenya_app/lib/services/processing_service.dart`

**Changes Required:**

Lines 1-7, add import:
```dart
import '../core/database/processing_job_repository.dart';
```

Lines 8-12, add repository:
```dart
class ProcessingService {
  final ApiService _apiService = ApiService();
  final ProcessingJobRepository _jobRepository = ProcessingJobRepository();
  final Map<String, Timer> _retryTimers = {};
  final Map<String, int> _retryAttempts = {};
```

Lines 54-65, replace with job creation:
```dart
final jobId = uploadResult.data!['job_id'] as String;

// Create ProcessingJob record in database
final processingJob = ProcessingJob(
  jobId: jobId,
  jobType: JobType.documentUpload,
  status: JobStatus.processing,
  initiatedAt: DateTime.now(),
  estimatedCompletionSeconds: uploadResult.data!['estimated_completion_seconds'],
  nextPollAt: DateTime.now().add(Duration(seconds: 10)),
);
await _jobRepository.insertJob(processingJob);

// Update document with processing status
final updatedDocument = document.copyWith(
  processingStatus: ProcessingStatus.processing,
  updatedAt: DateTime.now(),
);
await dataProvider.updateDocument(updatedDocument);

// Remove timer-based monitoring - will be replaced by unified polling service
```

### Phase P1: Unified Polling Service

#### 3. Create UnifiedPollingService
**File:** `/Users/m00n5h075ai/development/serenya/serenya_app/lib/services/unified_polling_service.dart`

```dart
import 'dart:async';
import 'dart:math';
import '../models/local_database_models.dart';
import '../core/database/processing_job_repository.dart';
import '../core/providers/health_data_provider.dart';
import 'api_service.dart';
import 'notification_service.dart';

/// Unified polling service that manages all job polling from database
/// Replaces timer-based polling with persistent, recoverable system
class UnifiedPollingService {
  static UnifiedPollingService? _instance;
  static UnifiedPollingService get instance {
    _instance ??= UnifiedPollingService._internal();
    return _instance!;
  }
  UnifiedPollingService._internal();

  final ProcessingJobRepository _jobRepository = ProcessingJobRepository();
  final ApiService _apiService = ApiService();
  final NotificationService _notificationService = NotificationService();
  
  Timer? _pollingTimer;
  bool _isPolling = false;
  
  /// Start the unified polling system
  Future<void> startPolling(HealthDataProvider dataProvider) async {
    if (_isPolling) return;
    
    _isPolling = true;
    
    // Resume any active jobs from database
    await _resumeActiveJobs();
    
    // Start main polling loop
    _pollingTimer = Timer.periodic(Duration(seconds: 15), (_) async {
      await _pollActiveJobs(dataProvider);
    });
  }
  
  /// Stop polling system
  void stopPolling() {
    _isPolling = false;
    _pollingTimer?.cancel();
    _pollingTimer = null;
  }
  
  /// Resume jobs that were active when app last closed
  Future<void> _resumeActiveJobs() async {
    final activeJobs = await _jobRepository.getActiveJobs();
    print('Resuming ${activeJobs.length} active jobs from database');
    
    for (final job in activeJobs) {
      // Reset next poll time to now for immediate polling
      final resumedJob = job.copyWith(
        nextPollAt: DateTime.now(),
        lastPollAt: null, // Clear last poll to force immediate check
      );
      await _jobRepository.updateJob(resumedJob);
    }
  }
  
  /// Main polling loop - polls all jobs ready for polling
  Future<void> _pollActiveJobs(HealthDataProvider dataProvider) async {
    try {
      final jobsToCheck = await _jobRepository.getJobsReadyForPolling();
      
      for (final job in jobsToCheck) {
        await _pollSingleJob(job, dataProvider);
        
        // Small delay between jobs to prevent API flooding
        await Future.delayed(Duration(milliseconds: 100));
      }
    } catch (e) {
      print('Error in polling loop: $e');
    }
  }
  
  /// Poll a single job and handle status updates
  Future<void> _pollSingleJob(ProcessingJob job, HealthDataProvider dataProvider) async {
    try {
      final statusResult = await _apiService.getProcessingStatus(job.jobId);
      final now = DateTime.now();
      
      if (!statusResult.success || statusResult.data == null) {
        // API call failed - schedule retry with exponential backoff
        final nextPollDelay = _calculateBackoffDelay(job.retryCount);
        
        final updatedJob = job.copyWith(
          lastPollAt: now,
          nextPollAt: now.add(Duration(seconds: nextPollDelay)),
          retryCount: job.retryCount + 1,
        );
        await _jobRepository.updateJob(updatedJob);
        return;
      }
      
      await _handleJobStatusUpdate(job, statusResult.data!, dataProvider);
      
    } catch (e) {
      print('Error polling job ${job.jobId}: $e');
      
      // Schedule retry with exponential backoff
      final nextPollDelay = _calculateBackoffDelay(job.retryCount);
      final now = DateTime.now();
      
      final updatedJob = job.copyWith(
        lastPollAt: now,
        nextPollAt: now.add(Duration(seconds: nextPollDelay)),
        retryCount: job.retryCount + 1,
      );
      await _jobRepository.updateJob(updatedJob);
    }
  }
  
  /// Handle job status updates from API response
  Future<void> _handleJobStatusUpdate(
    ProcessingJob job,
    Map<String, dynamic> statusData,
    HealthDataProvider dataProvider,
  ) async {
    final status = statusData['status'] as String;
    final now = DateTime.now();
    
    switch (status) {
      case 'completed':
        await _handleJobCompleted(job, statusData, dataProvider);
        break;
        
      case 'failed':
        await _handleJobFailed(job, statusData);
        break;
        
      case 'processing':
        // Update last poll time and schedule next poll
        final updatedJob = job.copyWith(
          lastPollAt: now,
          nextPollAt: now.add(Duration(seconds: 20)), // Normal polling interval
          retryCount: 0, // Reset retry count on successful poll
        );
        await _jobRepository.updateJob(updatedJob);
        break;
        
      case 'timeout':
        await _handleJobTimeout(job);
        break;
    }
  }
  
  /// Handle successful job completion
  Future<void> _handleJobCompleted(
    ProcessingJob job,
    Map<String, dynamic> statusData,
    HealthDataProvider dataProvider,
  ) async {
    try {
      // Get the interpretation result
      final interpretationResult = await _apiService.getInterpretation(job.jobId);
      
      if (interpretationResult.success && interpretationResult.data != null) {
        final interpretation = interpretationResult.data!;
        
        // Update the associated document with results
        await _updateDocumentWithResults(job, interpretation, dataProvider);
        
        // Mark job as completed with result ID
        await _jobRepository.completeJob(
          job.jobId,
          resultContentId: interpretation['content_id'],
        );
        
        // Send completion notification
        await _notificationService.showResultsReadyNotification(
          // Get updated document for notification
          await _getDocumentForJob(job.jobId),
        );
        
      } else {
        // Failed to get interpretation
        await _jobRepository.completeJob(
          job.jobId,
          errorMessage: 'Failed to retrieve interpretation',
        );
      }
      
    } catch (e) {
      await _jobRepository.completeJob(
        job.jobId,
        errorMessage: 'Error processing completion: $e',
      );
    }
  }
  
  /// Handle job failure
  Future<void> _handleJobFailed(ProcessingJob job, Map<String, dynamic> statusData) async {
    final errorMessage = statusData['error_message'] as String? ?? 'Processing failed';
    
    await _jobRepository.completeJob(job.jobId, errorMessage: errorMessage);
    
    // Send error notification
    await _notificationService.showProcessingErrorNotification(errorMessage);
  }
  
  /// Handle job timeout
  Future<void> _handleJobTimeout(ProcessingJob job) async {
    await _jobRepository.completeJob(
      job.jobId,
      errorMessage: 'Processing timeout',
    );
    
    await _notificationService.showProcessingErrorNotification(
      'Processing timeout - please try again'
    );
  }
  
  /// Calculate exponential backoff delay for retries
  int _calculateBackoffDelay(int retryCount) {
    // Exponential backoff: 5, 10, 20, 40, 60 (max) seconds
    final baseDelay = 5;
    final maxDelay = 60;
    final delay = baseDelay * pow(2, min(retryCount, 3)).toInt();
    return min(delay, maxDelay);
  }
  
  /// Update document with processing results
  Future<void> _updateDocumentWithResults(
    ProcessingJob job,
    Map<String, dynamic> interpretation,
    HealthDataProvider dataProvider,
  ) async {
    // This implementation depends on how documents are linked to jobs
    // For now, we'll need to find the document by job timing or add job_id field
    
    // TODO: Implement document lookup by job_id or timestamp correlation
    print('Update document with results for job: ${job.jobId}');
  }
  
  /// Get document associated with a job for notifications
  Future<SerenyaContent?> _getDocumentForJob(String jobId) async {
    // TODO: Implement document lookup by job_id
    return null;
  }
}
```

#### 4. Update UploadService to Remove Duplicate Polling
**File:** `/Users/m00n5h075ai/development/serenya/serenya_app/lib/services/upload_service.dart`

**Lines 82-87, replace with:**
```dart
if (processingResult.success) {
  // Start unified polling service if not already started
  await UnifiedPollingService.instance.startPolling(dataProvider);

  return UploadResult(
    success: true,
    message: 'Upload started successfully',
    jobId: processingResult.jobId,
    document: processingResult.document,
  );
}
```

**Lines 231-300, remove entire _startProcessingMonitor method and related functions**

### Phase P2: Resource Management & Cleanup

#### 5. Add Job Cleanup Service
**File:** `/Users/m00n5h075ai/development/serenya/serenya_app/lib/services/job_cleanup_service.dart`

```dart
import 'dart:async';
import '../core/database/processing_job_repository.dart';
import 'api_service.dart';

/// Service responsible for cleaning up completed jobs and associated resources
class JobCleanupService {
  final ProcessingJobRepository _jobRepository = ProcessingJobRepository();
  final ApiService _apiService = ApiService();
  
  /// Perform comprehensive cleanup of old jobs and resources
  Future<CleanupResult> performCleanup() async {
    try {
      // Clean up database records
      final deletedJobs = await _jobRepository.cleanupCompletedJobs(olderThanDays: 2);
      
      // TODO: Request S3 cleanup for completed jobs
      await _requestS3Cleanup();
      
      return CleanupResult(
        success: true,
        deletedJobs: deletedJobs,
        message: 'Cleanup completed successfully. Removed $deletedJobs old job records.',
      );
      
    } catch (e) {
      return CleanupResult(
        success: false,
        deletedJobs: 0,
        message: 'Cleanup failed: $e',
      );
    }
  }
  
  /// Request server-side S3 cleanup for completed jobs
  Future<void> _requestS3Cleanup() async {
    try {
      await _apiService.requestResourceCleanup();
    } catch (e) {
      print('S3 cleanup request failed: $e');
      // Don't fail overall cleanup if S3 cleanup fails
    }
  }
}

class CleanupResult {
  final bool success;
  final int deletedJobs;
  final String message;
  
  CleanupResult({
    required this.success,
    required this.deletedJobs,
    required this.message,
  });
}
```

#### 6. Update ApiService for Resource Cleanup
**File:** `/Users/m00n5h075ai/development/serenya/serenya_app/lib/services/api_service.dart`

**Add method (around line 200+):**
```dart
/// Request cleanup of server-side resources for completed jobs
Future<ApiResponse> requestResourceCleanup() async {
  try {
    final response = await _httpClient.post('/api/jobs/cleanup');
    
    return ApiResponse(
      success: response.statusCode == 200,
      message: response.statusCode == 200 ? 'Cleanup requested' : 'Cleanup request failed',
      data: response.statusCode == 200 ? jsonDecode(response.body) : null,
    );
  } catch (e) {
    return ApiResponse(
      success: false,
      message: 'Network error during cleanup request: $e',
    );
  }
}
```

## Database Migration Requirements

### Migration Script: Add Missing ProcessingJob Columns
**File:** `/Users/m00n5h075ai/development/serenya/serenya_app/lib/core/database/migration_system.dart`

**Add to migration system (around line 50+):**
```dart
/// Migration to add missing ProcessingJob tracking columns
Future<void> _migrateTo_V1_1(Database db) async {
  await db.execute('''
    ALTER TABLE processing_jobs ADD COLUMN last_poll_at TEXT;
  ''');
  
  await db.execute('''
    ALTER TABLE processing_jobs ADD COLUMN next_poll_at TEXT;
  ''');
  
  await db.execute('''
    ALTER TABLE processing_jobs ADD COLUMN retry_count INTEGER DEFAULT 0;
  ''');
  
  // Update database version
  await db.execute('PRAGMA user_version = 2');
}
```

## Testing Strategy

### Unit Tests

#### 1. ProcessingJobRepository Tests
**File:** `/Users/m00n5h075ai/development/serenya/serenya_app/test/core/database/processing_job_repository_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:serenya_app/core/database/processing_job_repository.dart';
import 'package:serenya_app/models/local_database_models.dart';

void main() {
  group('ProcessingJobRepository', () {
    late ProcessingJobRepository repository;
    
    setUp(() {
      repository = ProcessingJobRepository();
    });
    
    test('should insert and retrieve processing job', () async {
      final job = ProcessingJob(
        jobId: 'test_job_123',
        jobType: JobType.documentUpload,
        status: JobStatus.processing,
        initiatedAt: DateTime.now(),
      );
      
      await repository.insertJob(job);
      final retrieved = await repository.getJobById('test_job_123');
      
      expect(retrieved, isNotNull);
      expect(retrieved!.jobId, equals('test_job_123'));
      expect(retrieved.status, equals(JobStatus.processing));
    });
    
    test('should get jobs ready for polling', () async {
      final pastJob = ProcessingJob(
        jobId: 'past_job',
        jobType: JobType.documentUpload,
        status: JobStatus.processing,
        initiatedAt: DateTime.now().subtract(Duration(hours: 1)),
        nextPollAt: DateTime.now().subtract(Duration(minutes: 1)),
      );
      
      await repository.insertJob(pastJob);
      final readyJobs = await repository.getJobsReadyForPolling();
      
      expect(readyJobs.length, greaterThan(0));
      expect(readyJobs.any((job) => job.jobId == 'past_job'), isTrue);
    });
    
    test('should cleanup completed jobs', () async {
      final oldCompletedJob = ProcessingJob(
        jobId: 'old_completed',
        jobType: JobType.documentUpload,
        status: JobStatus.completed,
        initiatedAt: DateTime.now().subtract(Duration(days: 10)),
        completedAt: DateTime.now().subtract(Duration(days: 10)),
      );
      
      await repository.insertJob(oldCompletedJob);
      final deletedCount = await repository.cleanupCompletedJobs(olderThanDays: 7);
      
      expect(deletedCount, greaterThan(0));
      
      final retrieved = await repository.getJobById('old_completed');
      expect(retrieved, isNull);
    });
  });
}
```

#### 2. UnifiedPollingService Tests
**File:** `/Users/m00n5h075ai/development/serenya/serenya_app/test/services/unified_polling_service_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:serenya_app/services/unified_polling_service.dart';

void main() {
  group('UnifiedPollingService', () {
    test('should resume active jobs on startup', () async {
      final pollingService = UnifiedPollingService.instance;
      
      // Setup mock data provider
      final mockDataProvider = MockHealthDataProvider();
      
      // Start polling
      await pollingService.startPolling(mockDataProvider);
      
      // Verify polling is active
      expect(pollingService._isPolling, isTrue);
    });
    
    test('should stop polling gracefully', () async {
      final pollingService = UnifiedPollingService.instance;
      
      pollingService.stopPolling();
      
      expect(pollingService._isPolling, isFalse);
    });
  });
}
```

### Integration Tests

#### 3. End-to-End Job Processing Test
**File:** `/Users/m00n5h075ai/development/serenya/serenya_app/integration_test/job_processing_integration_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:serenya_app/main.dart' as app;
import 'package:serenya_app/services/processing_service.dart';
import 'package:serenya_app/services/unified_polling_service.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  
  group('Job Processing Integration', () {
    testWidgets('should create job record and poll to completion', (tester) async {
      app.main();
      await tester.pumpAndSettle();
      
      // Simulate document upload
      // Verify ProcessingJob record is created
      // Verify polling detects completion
      // Verify document is updated with results
      // Verify job is marked as completed
      
      // TODO: Implement full integration test
    });
  });
}
```

## Risk Assessment & Rollback Plan

### Risk Assessment

#### High Risk Areas
1. **Database Migration Failures**
   - Risk: Existing processing_jobs table schema conflicts
   - Mitigation: Test migrations on development database copies first
   - Rollback: Database backup restoration

2. **Polling Service Startup Issues**
   - Risk: UnifiedPollingService fails to start, blocking all processing
   - Mitigation: Fallback to existing timer-based system during transition
   - Rollback: Feature flag to disable unified polling

3. **Job Completion Detection**
   - Risk: Jobs stuck in processing state due to polling logic bugs
   - Mitigation: Manual job completion endpoints for debugging
   - Rollback: Temporary job status reset functionality

#### Medium Risk Areas
1. **Resource Usage**
   - Risk: Increased database queries from polling service
   - Mitigation: Query optimization and polling rate limiting
   
2. **API Rate Limiting**
   - Risk: Too frequent polling triggers API limits
   - Mitigation: Exponential backoff and configurable polling intervals

### Rollback Plan

#### Immediate Rollback (< 1 hour)
1. **Disable Unified Polling Service**
   ```dart
   // In app startup code
   const ENABLE_UNIFIED_POLLING = false; // Set to false for rollback
   
   if (ENABLE_UNIFIED_POLLING) {
     await UnifiedPollingService.instance.startPolling(dataProvider);
   }
   ```

2. **Restore Timer-Based Processing**
   - Revert ProcessingService changes to use Timer.periodic()
   - Re-enable duplicate monitoring in UploadService

#### Database Rollback (1-2 hours)
1. **Restore Database Schema**
   ```sql
   -- Remove added columns
   ALTER TABLE processing_jobs DROP COLUMN last_poll_at;
   ALTER TABLE processing_jobs DROP COLUMN next_poll_at; 
   ALTER TABLE processing_jobs DROP COLUMN retry_count;
   ```

2. **Clear Job Records**
   ```sql
   DELETE FROM processing_jobs WHERE created_at > 'DEPLOYMENT_TIMESTAMP';
   ```

#### Full Rollback (2-4 hours)
1. **Code Reversion**
   - Git revert to pre-implementation commit
   - Redeploy previous version
   - Database schema restoration

2. **Data Recovery**
   - Restore from backup if data corruption occurred
   - Manual job status reconciliation if needed

## Success Criteria & Validation

### Phase P0 Success Criteria
- [ ] ProcessingJob records are created for every document upload
- [ ] Jobs persist correctly across app restarts
- [ ] Database queries for job retrieval complete in < 100ms
- [ ] No job record creation failures in error logs

**Validation Steps:**
1. Upload test document
2. Verify ProcessingJob record in database
3. Restart app
4. Confirm job record still exists and is resumable

### Phase P1 Success Criteria
- [ ] Single polling service handles all job monitoring
- [ ] Polling resumes correctly after app restart
- [ ] Job status updates propagate to UI within 30 seconds
- [ ] No duplicate polling timers in memory profiles
- [ ] API polling rate stays under 10 requests/minute per job

**Validation Steps:**
1. Start multiple uploads simultaneously
2. Force-close and restart app during processing
3. Verify all jobs resume polling correctly
4. Monitor API request logs for duplicate calls
5. Confirm job completion detection and document updates

### Phase P2 Success Criteria
- [ ] Completed jobs are automatically cleaned up after 7 days
- [ ] Job count in database doesn't exceed 1000 records
- [ ] S3 cleanup requests are sent for completed jobs
- [ ] No memory leaks from uncancelled timers
- [ ] App startup time not impacted by job cleanup

**Validation Steps:**
1. Create and complete test jobs
2. Wait or manually set timestamps to trigger cleanup
3. Verify old jobs are removed from database
4. Confirm S3 cleanup API calls in logs
5. Profile memory usage over extended app sessions

### Overall Success Metrics
- **Job Tracking Accuracy:** 100% of uploads create ProcessingJob records
- **Polling Reliability:** 95%+ of jobs complete successfully with proper status updates
- **Resource Efficiency:** < 50MB memory usage for polling service
- **Database Performance:** Job queries complete in < 100ms
- **User Experience:** Processing status updates within 30 seconds of server-side completion

### Production Monitoring
- Track ProcessingJob table size growth
- Monitor API polling request rates
- Alert on jobs stuck in processing > 30 minutes
- Track job completion success rates
- Monitor memory usage patterns for resource leaks

This implementation plan addresses all critical gaps in the Flutter polling system and provides a robust, database-backed solution for job tracking and monitoring. The phased approach allows for incremental rollout with proper validation at each stage.