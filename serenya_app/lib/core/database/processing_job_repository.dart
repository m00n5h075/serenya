import 'package:flutter/foundation.dart';
import '../../models/local_database_models.dart';
import 'encrypted_database_service.dart';

/// Repository for managing ProcessingJob database operations
/// 
/// Provides CRUD operations for the processing_jobs table with:
/// - Persistent job tracking across app restarts
/// - Exponential backoff polling state management
/// - Transactional operations for data integrity
/// - Comprehensive error handling with three-layer strategy
class ProcessingJobRepository {
  static const String _tableName = 'processing_jobs';

  /// Create a new processing job record
  /// 
  /// Returns the created job or throws an exception on failure
  /// Uses transaction to ensure atomicity
  static Future<ProcessingJob> createJob({
    required String jobId,
    required JobType jobType,
    required JobStatus status,
    DateTime? initiatedAt,
    int? estimatedCompletionSeconds,
    String? resultContentId,
    String? errorMessage,
  }) async {
    try {
      final db = await EncryptedDatabaseService.database;
      final now = DateTime.now();
      
      final job = ProcessingJob(
        jobId: jobId,
        jobType: jobType,
        status: status,
        initiatedAt: initiatedAt ?? now,
        estimatedCompletionSeconds: estimatedCompletionSeconds,
        resultContentId: resultContentId,
        errorMessage: errorMessage,
        retryCount: 0,
        lastPollAt: null,
        nextPollAt: _calculateNextPollTime(0), // Initial poll in 5 seconds
      );

      await db.transaction((txn) async {
        await txn.insert(_tableName, job.toJson());
        await _logRepositoryEvent('job_created', jobId: jobId, jobType: jobType.value);
      });

      return job;
    } catch (e) {
      await _logRepositoryEvent('job_creation_failed', jobId: jobId, error: e.toString());
      throw ProcessingJobRepositoryException('Failed to create processing job: $e');
    }
  }

  /// Get a processing job by ID
  /// 
  /// Returns null if job doesn't exist
  static Future<ProcessingJob?> getJob(String jobId) async {
    try {
      final db = await EncryptedDatabaseService.database;
      
      final result = await db.query(
        _tableName,
        where: 'job_id = ?',
        whereArgs: [jobId],
        limit: 1,
      );

      if (result.isEmpty) {
        return null;
      }

      final job = ProcessingJob.fromJson(result.first);
      await _logRepositoryEvent('job_retrieved', jobId: jobId);
      return job;

    } catch (e) {
      await _logRepositoryEvent('job_retrieval_failed', jobId: jobId, error: e.toString());
      throw ProcessingJobRepositoryException('Failed to retrieve processing job: $e');
    }
  }

  /// Get all active processing jobs (processing status)
  /// 
  /// Returns jobs that need polling, ordered by next_poll_at
  static Future<List<ProcessingJob>> getActiveJobs() async {
    try {
      final db = await EncryptedDatabaseService.database;
      final now = DateTime.now().toIso8601String();
      
      final result = await db.query(
        _tableName,
        where: 'status = ? AND (next_poll_at IS NULL OR next_poll_at <= ?)',
        whereArgs: [JobStatus.processing.value, now],
        orderBy: 'next_poll_at ASC',
      );

      final jobs = result.map((json) => ProcessingJob.fromJson(json)).toList();
      await _logRepositoryEvent('active_jobs_retrieved', count: jobs.length);
      return jobs;

    } catch (e) {
      await _logRepositoryEvent('active_jobs_retrieval_failed', error: e.toString());
      throw ProcessingJobRepositoryException('Failed to retrieve active jobs: $e');
    }
  }

  /// Get jobs ready for polling (where next_poll_at <= now)
  /// 
  /// Used by polling service to determine which jobs to check
  static Future<List<ProcessingJob>> getJobsReadyForPolling() async {
    try {
      final db = await EncryptedDatabaseService.database;
      final now = DateTime.now().toIso8601String();
      
      final result = await db.query(
        _tableName,
        where: 'status = ? AND next_poll_at <= ?',
        whereArgs: [JobStatus.processing.value, now],
        orderBy: 'next_poll_at ASC',
      );

      final jobs = result.map((json) => ProcessingJob.fromJson(json)).toList();
      await _logRepositoryEvent('polling_jobs_retrieved', count: jobs.length);
      return jobs;

    } catch (e) {
      await _logRepositoryEvent('polling_jobs_retrieval_failed', error: e.toString());
      throw ProcessingJobRepositoryException('Failed to retrieve jobs ready for polling: $e');
    }
  }

  /// Update processing job with new status and metadata
  /// 
  /// Handles status transitions and polling schedule updates
  /// Uses transaction for atomicity
  static Future<ProcessingJob> updateJob(
    String jobId, {
    JobStatus? status,
    DateTime? completedAt,
    String? resultContentId,
    String? errorMessage,
    int? retryCount,
    DateTime? lastPollAt,
    DateTime? nextPollAt,
  }) async {
    try {
      final db = await EncryptedDatabaseService.database;
      
      // Get current job first
      final currentJob = await getJob(jobId);
      if (currentJob == null) {
        throw ProcessingJobRepositoryException('Job not found: $jobId');
      }

      // Calculate next poll time if not provided and still processing
      DateTime? calculatedNextPoll = nextPollAt;
      if (calculatedNextPoll == null && 
          (status ?? currentJob.status) == JobStatus.processing) {
        calculatedNextPoll = _calculateNextPollTime(retryCount ?? currentJob.retryCount);
      }

      final updatedJob = currentJob.copyWith(
        status: status ?? currentJob.status,
        completedAt: completedAt ?? currentJob.completedAt,
        resultContentId: resultContentId ?? currentJob.resultContentId,
        errorMessage: errorMessage ?? currentJob.errorMessage,
        retryCount: retryCount ?? currentJob.retryCount,
        lastPollAt: lastPollAt ?? currentJob.lastPollAt,
        nextPollAt: calculatedNextPoll,
      );

      await db.transaction((txn) async {
        await txn.update(
          _tableName,
          updatedJob.toJson(),
          where: 'job_id = ?',
          whereArgs: [jobId],
        );
        
        await _logRepositoryEvent('job_updated', 
          jobId: jobId, 
          status: updatedJob.status.value,
          retryCount: updatedJob.retryCount,
        );
      });

      return updatedJob;

    } catch (e) {
      await _logRepositoryEvent('job_update_failed', jobId: jobId, error: e.toString());
      throw ProcessingJobRepositoryException('Failed to update processing job: $e');
    }
  }

  /// Update polling metadata after successful poll
  /// 
  /// Updates lastPollAt and calculates nextPollAt based on retry count
  static Future<ProcessingJob> updatePollingMetadata(
    String jobId,
    int retryCount,
  ) async {
    final now = DateTime.now();
    final nextPoll = _calculateNextPollTime(retryCount);

    return await updateJob(
      jobId,
      lastPollAt: now,
      nextPollAt: nextPoll,
      retryCount: retryCount,
    );
  }

  /// Mark job as completed with result
  /// 
  /// Sets status to completed, records completion time, and links result
  static Future<ProcessingJob> completeJob(
    String jobId,
    String resultContentId,
  ) async {
    return await updateJob(
      jobId,
      status: JobStatus.completed,
      completedAt: DateTime.now(),
      resultContentId: resultContentId,
      nextPollAt: null, // Stop polling
    );
  }

  /// Mark job as failed with error details
  /// 
  /// Sets status to failed and records error message
  static Future<ProcessingJob> failJob(
    String jobId,
    String errorMessage,
  ) async {
    return await updateJob(
      jobId,
      status: JobStatus.failed,
      completedAt: DateTime.now(),
      errorMessage: errorMessage,
      nextPollAt: null, // Stop polling
    );
  }

  /// Delete completed or failed jobs older than specified duration
  /// 
  /// Used for cleanup to prevent database growth
  /// Default cleanup after 24 hours for completed jobs, 7 days for failed jobs
  static Future<int> cleanupOldJobs({
    Duration completedJobAge = const Duration(hours: 24),
    Duration failedJobAge = const Duration(days: 7),
  }) async {
    try {
      final db = await EncryptedDatabaseService.database;
      final now = DateTime.now();
      
      final completedCutoff = now.subtract(completedJobAge).toIso8601String();
      final failedCutoff = now.subtract(failedJobAge).toIso8601String();
      
      int deletedCount = 0;

      await db.transaction((txn) async {
        // Delete completed jobs older than cutoff
        final completedDeleted = await txn.delete(
          _tableName,
          where: 'status = ? AND completed_at < ?',
          whereArgs: [JobStatus.completed.value, completedCutoff],
        );
        
        // Delete failed jobs older than cutoff  
        final failedDeleted = await txn.delete(
          _tableName,
          where: 'status = ? AND completed_at < ?',
          whereArgs: [JobStatus.failed.value, failedCutoff],
        );
        
        deletedCount = completedDeleted + failedDeleted;
        
        await _logRepositoryEvent('jobs_cleaned_up', 
          count: deletedCount,
          completedDeleted: completedDeleted,
          failedDeleted: failedDeleted,
        );
      });

      return deletedCount;

    } catch (e) {
      await _logRepositoryEvent('job_cleanup_failed', error: e.toString());
      throw ProcessingJobRepositoryException('Failed to cleanup old jobs: $e');
    }
  }

  /// Delete a specific processing job
  /// 
  /// Used for immediate cleanup after successful processing
  static Future<bool> deleteJob(String jobId) async {
    try {
      final db = await EncryptedDatabaseService.database;
      
      final deletedCount = await db.delete(
        _tableName,
        where: 'job_id = ?',
        whereArgs: [jobId],
      );

      final success = deletedCount > 0;
      await _logRepositoryEvent('job_deleted', jobId: jobId, success: success);
      return success;

    } catch (e) {
      await _logRepositoryEvent('job_deletion_failed', jobId: jobId, error: e.toString());
      throw ProcessingJobRepositoryException('Failed to delete processing job: $e');
    }
  }

  /// Get jobs by type and status
  /// 
  /// Used for debugging and monitoring
  static Future<List<ProcessingJob>> getJobsByTypeAndStatus(
    JobType jobType,
    JobStatus status,
  ) async {
    try {
      final db = await EncryptedDatabaseService.database;
      
      final result = await db.query(
        _tableName,
        where: 'job_type = ? AND status = ?',
        whereArgs: [jobType.value, status.value],
        orderBy: 'initiated_at DESC',
      );

      final jobs = result.map((json) => ProcessingJob.fromJson(json)).toList();
      await _logRepositoryEvent('jobs_retrieved_by_type_status', 
        jobType: jobType.value, 
        status: status.value,
        count: jobs.length,
      );
      return jobs;

    } catch (e) {
      await _logRepositoryEvent('jobs_by_type_status_failed', error: e.toString());
      throw ProcessingJobRepositoryException('Failed to retrieve jobs by type and status: $e');
    }
  }

  /// Calculate next polling time using exponential backoff
  /// 
  /// Implements polling intervals: 5s, 10s, 20s, 40s, then 60s max
  /// Based on documentation requirements
  static DateTime _calculateNextPollTime(int retryCount) {
    const pollIntervals = [5, 10, 20, 40, 60]; // seconds
    final intervalIndex = retryCount.clamp(0, pollIntervals.length - 1);
    final intervalSeconds = pollIntervals[intervalIndex];
    
    return DateTime.now().add(Duration(seconds: intervalSeconds));
  }

  /// Get repository statistics for monitoring
  /// 
  /// Returns counts by status for dashboard/debugging
  static Future<Map<String, int>> getStatistics() async {
    try {
      final db = await EncryptedDatabaseService.database;
      
      final result = await db.rawQuery('''
        SELECT status, COUNT(*) as count 
        FROM $_tableName 
        GROUP BY status
      ''');

      final stats = <String, int>{};
      for (final row in result) {
        stats[row['status'] as String] = row['count'] as int;
      }

      await _logRepositoryEvent('statistics_retrieved', stats: stats);
      return stats;

    } catch (e) {
      await _logRepositoryEvent('statistics_retrieval_failed', error: e.toString());
      throw ProcessingJobRepositoryException('Failed to retrieve statistics: $e');
    }
  }

  /// Log repository events for debugging and monitoring
  static Future<void> _logRepositoryEvent(
    String event, {
    String? jobId,
    String? jobType,
    String? status,
    String? error,
    int? count,
    int? retryCount,
    int? completedDeleted,
    int? failedDeleted,
    bool? success,
    Map<String, int>? stats,
  }) async {
    if (kDebugMode) {
      final details = <String>[];
      if (jobId != null) details.add('jobId: $jobId');
      if (jobType != null) details.add('type: $jobType');
      if (status != null) details.add('status: $status');
      if (count != null) details.add('count: $count');
      if (retryCount != null) details.add('retries: $retryCount');
      if (error != null) details.add('error: $error');
      if (success != null) details.add('success: $success');
      if (stats != null) details.add('stats: $stats');
      
      final detailsStr = details.isNotEmpty ? ' (${details.join(', ')})' : '';
      print('PROCESSING_JOB_REPO: $event$detailsStr');
    }
    
    // TODO: Integrate with comprehensive audit logging system
  }
}

/// Exception for ProcessingJob repository operations
class ProcessingJobRepositoryException implements Exception {
  final String message;
  
  ProcessingJobRepositoryException(this.message);
  
  @override
  String toString() => 'ProcessingJobRepositoryException: $message';
}