import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:serenya_app/models/local_database_models.dart';

// Mock version of ProcessingJobRepository for testing
class TestProcessingJobRepository {
  static late Database _database;
  static const String _tableName = 'processing_jobs';

  static Future<void> initializeTestDatabase() async {
    _database = await openDatabase(
      inMemoryDatabasePath,
      version: 1,
      onCreate: (db, version) async {
        // Create the processing_jobs table
        await db.execute('''
          CREATE TABLE processing_jobs (
            job_id TEXT PRIMARY KEY,
            job_type TEXT NOT NULL CHECK(job_type IN ('document_upload', 'chat_message', 'doctor_report')),
            status TEXT NOT NULL CHECK(status IN ('processing', 'completed', 'failed')),
            initiated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            completed_at TEXT,
            estimated_completion_seconds INTEGER,
            result_content_id TEXT,
            error_message TEXT,
            retry_count INTEGER DEFAULT 0,
            last_poll_at TEXT,
            next_poll_at TEXT
          );
        ''');

        // Create indexes for testing
        await db.execute('''
          CREATE INDEX idx_processing_jobs_status 
          ON processing_jobs(status, next_poll_at);
        ''');

        await db.execute('''
          CREATE INDEX idx_processing_jobs_type 
          ON processing_jobs(job_type, status);
        ''');
      },
    );
  }

  static Future<ProcessingJob> createJob({
    required String jobId,
    required JobType jobType,
    required JobStatus status,
    DateTime? initiatedAt,
    int? estimatedCompletionSeconds,
    String? resultContentId,
    String? errorMessage,
  }) async {
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
      nextPollAt: _calculateNextPollTime(0),
    );

    await _database.insert(_tableName, job.toJson());
    return job;
  }

  static Future<ProcessingJob?> getJob(String jobId) async {
    final result = await _database.query(
      _tableName,
      where: 'job_id = ?',
      whereArgs: [jobId],
      limit: 1,
    );

    if (result.isEmpty) return null;
    return ProcessingJob.fromJson(result.first);
  }

  static Future<List<ProcessingJob>> getActiveJobs() async {
    final result = await _database.query(
      _tableName,
      where: 'status = ?',
      whereArgs: [JobStatus.processing.value],
      orderBy: 'next_poll_at ASC',
    );

    return result.map((json) => ProcessingJob.fromJson(json)).toList();
  }

  static Future<List<ProcessingJob>> getJobsReadyForPolling() async {
    final now = DateTime.now().toIso8601String();
    
    final result = await _database.query(
      _tableName,
      where: 'status = ? AND next_poll_at <= ?',
      whereArgs: [JobStatus.processing.value, now],
      orderBy: 'next_poll_at ASC',
    );

    return result.map((json) => ProcessingJob.fromJson(json)).toList();
  }

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
    final currentJob = await getJob(jobId);
    if (currentJob == null) {
      throw Exception('Job not found: $jobId');
    }

    DateTime? calculatedNextPoll = nextPollAt;
    if (calculatedNextPoll == null && 
        (status ?? currentJob.status) == JobStatus.processing) {
      calculatedNextPoll = _calculateNextPollTime(retryCount ?? currentJob.retryCount);
    } else if ((status ?? currentJob.status) != JobStatus.processing) {
      calculatedNextPoll = null; // Stop polling for non-processing jobs
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

    await _database.update(
      _tableName,
      updatedJob.toJson(),
      where: 'job_id = ?',
      whereArgs: [jobId],
    );

    return updatedJob;
  }

  static Future<ProcessingJob> updatePollingMetadata(String jobId, int retryCount) async {
    final now = DateTime.now();
    final nextPoll = _calculateNextPollTime(retryCount);

    return await updateJob(
      jobId,
      lastPollAt: now,
      nextPollAt: nextPoll,
      retryCount: retryCount,
    );
  }

  static Future<ProcessingJob> completeJob(String jobId, String resultContentId) async {
    final currentJob = await getJob(jobId);
    if (currentJob == null) {
      throw Exception('Job not found: $jobId');
    }

    // Create new job with explicit null for nextPollAt
    final updatedJob = ProcessingJob(
      jobId: currentJob.jobId,
      jobType: currentJob.jobType,
      status: JobStatus.completed,
      initiatedAt: currentJob.initiatedAt,
      completedAt: DateTime.now(),
      estimatedCompletionSeconds: currentJob.estimatedCompletionSeconds,
      resultContentId: resultContentId,
      errorMessage: currentJob.errorMessage,
      retryCount: currentJob.retryCount,
      lastPollAt: currentJob.lastPollAt,
      nextPollAt: null, // Explicitly set to null
    );

    await _database.update(
      _tableName,
      updatedJob.toJson(),
      where: 'job_id = ?',
      whereArgs: [jobId],
    );

    return updatedJob;
  }

  static Future<ProcessingJob> failJob(String jobId, String errorMessage) async {
    final currentJob = await getJob(jobId);
    if (currentJob == null) {
      throw Exception('Job not found: $jobId');
    }

    // Create new job with explicit null for nextPollAt
    final updatedJob = ProcessingJob(
      jobId: currentJob.jobId,
      jobType: currentJob.jobType,
      status: JobStatus.failed,
      initiatedAt: currentJob.initiatedAt,
      completedAt: DateTime.now(),
      estimatedCompletionSeconds: currentJob.estimatedCompletionSeconds,
      resultContentId: currentJob.resultContentId,
      errorMessage: errorMessage,
      retryCount: currentJob.retryCount,
      lastPollAt: currentJob.lastPollAt,
      nextPollAt: null, // Explicitly set to null
    );

    await _database.update(
      _tableName,
      updatedJob.toJson(),
      where: 'job_id = ?',
      whereArgs: [jobId],
    );

    return updatedJob;
  }

  static Future<bool> deleteJob(String jobId) async {
    final deletedCount = await _database.delete(
      _tableName,
      where: 'job_id = ?',
      whereArgs: [jobId],
    );
    return deletedCount > 0;
  }

  static Future<int> cleanupOldJobs({
    Duration completedJobAge = const Duration(hours: 24),
    Duration failedJobAge = const Duration(days: 7),
  }) async {
    final now = DateTime.now();
    final completedCutoff = now.subtract(completedJobAge).toIso8601String();
    final failedCutoff = now.subtract(failedJobAge).toIso8601String();

    final completedDeleted = await _database.delete(
      _tableName,
      where: 'status = ? AND completed_at IS NOT NULL AND completed_at < ?',
      whereArgs: [JobStatus.completed.value, completedCutoff],
    );
    
    final failedDeleted = await _database.delete(
      _tableName,
      where: 'status = ? AND completed_at IS NOT NULL AND completed_at < ?',
      whereArgs: [JobStatus.failed.value, failedCutoff],
    );
    
    return completedDeleted + failedDeleted;
  }

  static Future<List<ProcessingJob>> getJobsByTypeAndStatus(
    JobType jobType,
    JobStatus status,
  ) async {
    final result = await _database.query(
      _tableName,
      where: 'job_type = ? AND status = ?',
      whereArgs: [jobType.value, status.value],
      orderBy: 'initiated_at DESC',
    );

    return result.map((json) => ProcessingJob.fromJson(json)).toList();
  }

  static Future<Map<String, int>> getStatistics() async {
    final result = await _database.rawQuery('''
      SELECT status, COUNT(*) as count 
      FROM $_tableName 
      GROUP BY status
    ''');

    final stats = <String, int>{};
    for (final row in result) {
      stats[row['status'] as String] = row['count'] as int;
    }
    return stats;
  }

  static DateTime _calculateNextPollTime(int retryCount) {
    const pollIntervals = [5, 10, 20, 40, 60];
    final intervalIndex = retryCount.clamp(0, pollIntervals.length - 1);
    final intervalSeconds = pollIntervals[intervalIndex];
    return DateTime.now().add(Duration(seconds: intervalSeconds));
  }

  static Future<void> close() async {
    await _database.close();
  }
}

void main() {
  group('ProcessingJobRepository', () {
    setUpAll(() {
      // Initialize test bindings and FFI
      TestWidgetsFlutterBinding.ensureInitialized();
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    });

    setUp(() async {
      await TestProcessingJobRepository.initializeTestDatabase();
    });

    tearDown(() async {
      await TestProcessingJobRepository.close();
    });

    group('createJob', () {
      test('should create a new processing job with required fields', () async {
        const jobId = 'test-job-123';
        
        final job = await TestProcessingJobRepository.createJob(
          jobId: jobId,
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );

        expect(job.jobId, equals(jobId));
        expect(job.jobType, equals(JobType.documentUpload));
        expect(job.status, equals(JobStatus.processing));
        expect(job.retryCount, equals(0));
        expect(job.nextPollAt, isNotNull);
        expect(job.initiatedAt, isNotNull);
      });

      test('should create job with optional fields', () async {
        const jobId = 'test-job-456';
        final initiatedAt = DateTime.now();
        
        final job = await TestProcessingJobRepository.createJob(
          jobId: jobId,
          jobType: JobType.chatMessage,
          status: JobStatus.processing,
          initiatedAt: initiatedAt,
          estimatedCompletionSeconds: 30,
          resultContentId: 'content-123',
          errorMessage: 'Test error',
        );

        expect(job.jobId, equals(jobId));
        expect(job.jobType, equals(JobType.chatMessage));
        expect(job.status, equals(JobStatus.processing));
        expect(job.initiatedAt, equals(initiatedAt));
        expect(job.estimatedCompletionSeconds, equals(30));
        expect(job.resultContentId, equals('content-123'));
        expect(job.errorMessage, equals('Test error'));
      });

      test('should throw exception on duplicate job ID', () async {
        const jobId = 'duplicate-job';
        
        // Create first job
        await TestProcessingJobRepository.createJob(
          jobId: jobId,
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );

        // Attempt to create duplicate
        expect(
          () => TestProcessingJobRepository.createJob(
            jobId: jobId,
            jobType: JobType.documentUpload,
            status: JobStatus.processing,
          ),
          throwsA(isA<Exception>()),
        );
      });
    });

    group('getJob', () {
      test('should retrieve existing job by ID', () async {
        const jobId = 'retrieve-test-job';
        
        // Create job
        final originalJob = await TestProcessingJobRepository.createJob(
          jobId: jobId,
          jobType: JobType.doctorReport,
          status: JobStatus.processing,
          estimatedCompletionSeconds: 45,
        );

        // Retrieve job
        final retrievedJob = await TestProcessingJobRepository.getJob(jobId);

        expect(retrievedJob, isNotNull);
        expect(retrievedJob!.jobId, equals(originalJob.jobId));
        expect(retrievedJob.jobType, equals(originalJob.jobType));
        expect(retrievedJob.status, equals(originalJob.status));
        expect(retrievedJob.estimatedCompletionSeconds, equals(originalJob.estimatedCompletionSeconds));
      });

      test('should return null for non-existent job', () async {
        final job = await TestProcessingJobRepository.getJob('non-existent-job');
        expect(job, isNull);
      });
    });

    group('getActiveJobs', () {
      test('should return only processing jobs', () async {
        // Create jobs with different statuses
        await TestProcessingJobRepository.createJob(
          jobId: 'active-1',
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );

        await TestProcessingJobRepository.createJob(
          jobId: 'active-2',
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );

        await TestProcessingJobRepository.createJob(
          jobId: 'completed-1',
          jobType: JobType.documentUpload,
          status: JobStatus.completed,
        );

        final activeJobs = await TestProcessingJobRepository.getActiveJobs();

        expect(activeJobs.length, equals(2));
        expect(activeJobs.every((job) => job.status == JobStatus.processing), isTrue);
        expect(activeJobs.map((job) => job.jobId), containsAll(['active-1', 'active-2']));
      });

      test('should return jobs ordered by next_poll_at', () async {
        final now = DateTime.now();
        
        // Create jobs with different next_poll_at times
        await TestProcessingJobRepository.createJob(
          jobId: 'job-later',
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );

        await TestProcessingJobRepository.createJob(
          jobId: 'job-sooner',
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );

        // Update one job to poll sooner
        await TestProcessingJobRepository.updateJob(
          'job-sooner',
          nextPollAt: now.add(const Duration(seconds: 5)),
        );

        await TestProcessingJobRepository.updateJob(
          'job-later',
          nextPollAt: now.add(const Duration(seconds: 60)),
        );

        final activeJobs = await TestProcessingJobRepository.getActiveJobs();

        expect(activeJobs.length, equals(2));
        expect(activeJobs.first.jobId, equals('job-sooner'));
        expect(activeJobs.last.jobId, equals('job-later'));
      });
    });

    group('getJobsReadyForPolling', () {
      test('should return jobs ready for polling', () async {
        final now = DateTime.now();
        final pastTime = now.subtract(const Duration(seconds: 10));
        final futureTime = now.add(const Duration(seconds: 60));

        // Create job ready for polling (past due)
        await TestProcessingJobRepository.createJob(
          jobId: 'ready-job',
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );
        
        await TestProcessingJobRepository.updateJob(
          'ready-job',
          nextPollAt: pastTime,
        );

        // Create job not ready for polling (future)
        await TestProcessingJobRepository.createJob(
          jobId: 'not-ready-job',
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );
        
        await TestProcessingJobRepository.updateJob(
          'not-ready-job',
          nextPollAt: futureTime,
        );

        final readyJobs = await TestProcessingJobRepository.getJobsReadyForPolling();

        expect(readyJobs.length, equals(1));
        expect(readyJobs.first.jobId, equals('ready-job'));
      });
    });

    group('updateJob', () {
      test('should update job status and metadata', () async {
        const jobId = 'update-test-job';
        
        // Create original job
        await TestProcessingJobRepository.createJob(
          jobId: jobId,
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );

        final completedAt = DateTime.now();
        
        // Update job
        final updatedJob = await TestProcessingJobRepository.updateJob(
          jobId,
          status: JobStatus.completed,
          completedAt: completedAt,
          resultContentId: 'result-123',
          retryCount: 2,
        );

        expect(updatedJob.jobId, equals(jobId));
        expect(updatedJob.status, equals(JobStatus.completed));
        expect(updatedJob.completedAt, equals(completedAt));
        expect(updatedJob.resultContentId, equals('result-123'));
        expect(updatedJob.retryCount, equals(2));
      });

      test('should calculate next poll time for processing jobs', () async {
        const jobId = 'poll-time-test-job';
        
        await TestProcessingJobRepository.createJob(
          jobId: jobId,
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );

        final beforeUpdate = DateTime.now();
        
        final updatedJob = await TestProcessingJobRepository.updateJob(
          jobId,
          retryCount: 1,
        );

        expect(updatedJob.nextPollAt, isNotNull);
        expect(updatedJob.nextPollAt!.isAfter(beforeUpdate), isTrue);
        // Should be 10 seconds later (retry count 1 = 10 second interval)
        expect(
          updatedJob.nextPollAt!.difference(beforeUpdate).inSeconds,
          greaterThanOrEqualTo(8), // Allow some variance for test execution time
        );
      });

      test('should throw exception for non-existent job', () async {
        expect(
          () => TestProcessingJobRepository.updateJob('non-existent-job', status: JobStatus.completed),
          throwsA(isA<Exception>()),
        );
      });
    });

    group('updatePollingMetadata', () {
      test('should update last_poll_at and next_poll_at', () async {
        const jobId = 'polling-metadata-test';
        
        await TestProcessingJobRepository.createJob(
          jobId: jobId,
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );

        final beforeUpdate = DateTime.now();
        
        final updatedJob = await TestProcessingJobRepository.updatePollingMetadata(jobId, 2);

        expect(updatedJob.lastPollAt, isNotNull);
        expect(updatedJob.lastPollAt!.isAfter(beforeUpdate.subtract(const Duration(seconds: 1))), isTrue);
        expect(updatedJob.nextPollAt, isNotNull);
        expect(updatedJob.retryCount, equals(2));
        
        // Retry count 2 should result in 20-second interval
        expect(
          updatedJob.nextPollAt!.difference(updatedJob.lastPollAt!).inSeconds,
          greaterThanOrEqualTo(19),
        );
      });
    });

    group('completeJob', () {
      test('should mark job as completed with result content ID', () async {
        const jobId = 'complete-test-job';
        const resultContentId = 'result-content-123';
        
        await TestProcessingJobRepository.createJob(
          jobId: jobId,
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );

        final completedJob = await TestProcessingJobRepository.completeJob(jobId, resultContentId);

        expect(completedJob.status, equals(JobStatus.completed));
        expect(completedJob.resultContentId, equals(resultContentId));
        expect(completedJob.completedAt, isNotNull);
        expect(completedJob.nextPollAt, isNull); // Should stop polling
      });
    });

    group('failJob', () {
      test('should mark job as failed with error message', () async {
        const jobId = 'fail-test-job';
        const errorMessage = 'Test error message';
        
        await TestProcessingJobRepository.createJob(
          jobId: jobId,
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );

        final failedJob = await TestProcessingJobRepository.failJob(jobId, errorMessage);

        expect(failedJob.status, equals(JobStatus.failed));
        expect(failedJob.errorMessage, equals(errorMessage));
        expect(failedJob.completedAt, isNotNull);
        expect(failedJob.nextPollAt, isNull); // Should stop polling
      });
    });

    group('deleteJob', () {
      test('should delete existing job and return true', () async {
        const jobId = 'delete-test-job';
        
        await TestProcessingJobRepository.createJob(
          jobId: jobId,
          jobType: JobType.documentUpload,
          status: JobStatus.completed,
        );

        final deleted = await TestProcessingJobRepository.deleteJob(jobId);
        expect(deleted, isTrue);

        // Verify job is deleted
        final job = await TestProcessingJobRepository.getJob(jobId);
        expect(job, isNull);
      });

      test('should return false for non-existent job', () async {
        final deleted = await TestProcessingJobRepository.deleteJob('non-existent-job');
        expect(deleted, isFalse);
      });
    });

    group('cleanupOldJobs', () {
      test('should delete old completed and failed jobs', () async {
        final now = DateTime.now();
        final oldTime = now.subtract(const Duration(hours: 25)); // Older than 24h default
        
        // Create old completed job
        await TestProcessingJobRepository.createJob(
          jobId: 'old-completed-job',
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );
        
        await TestProcessingJobRepository.completeJob('old-completed-job', 'result-123');
        await TestProcessingJobRepository.updateJob(
          'old-completed-job',
          completedAt: oldTime,
        );

        // Create old failed job
        await TestProcessingJobRepository.createJob(
          jobId: 'old-failed-job',
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );
        
        await TestProcessingJobRepository.failJob('old-failed-job', 'Test error');
        await TestProcessingJobRepository.updateJob(
          'old-failed-job',
          completedAt: oldTime,
        );

        // Create recent job (should not be deleted)
        await TestProcessingJobRepository.createJob(
          jobId: 'recent-job',
          jobType: JobType.documentUpload,
          status: JobStatus.completed,
        );

        final deletedCount = await TestProcessingJobRepository.cleanupOldJobs(
          completedJobAge: const Duration(hours: 24),
          failedJobAge: const Duration(hours: 24), // Same age for both in test
        );

        expect(deletedCount, equals(2)); // Both old jobs should be deleted

        // Verify recent job still exists
        final recentJob = await TestProcessingJobRepository.getJob('recent-job');
        expect(recentJob, isNotNull);

        // Verify old jobs are deleted
        final oldCompletedJob = await TestProcessingJobRepository.getJob('old-completed-job');
        expect(oldCompletedJob, isNull);

        final oldFailedJob = await TestProcessingJobRepository.getJob('old-failed-job');
        expect(oldFailedJob, isNull);
      });
    });

    group('getJobsByTypeAndStatus', () {
      test('should return jobs filtered by type and status', () async {
        // Create jobs with different types and statuses
        await TestProcessingJobRepository.createJob(
          jobId: 'doc-processing',
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );

        await TestProcessingJobRepository.createJob(
          jobId: 'doc-completed',
          jobType: JobType.documentUpload,
          status: JobStatus.completed,
        );

        await TestProcessingJobRepository.createJob(
          jobId: 'chat-processing',
          jobType: JobType.chatMessage,
          status: JobStatus.processing,
        );

        final jobs = await TestProcessingJobRepository.getJobsByTypeAndStatus(
          JobType.documentUpload,
          JobStatus.processing,
        );

        expect(jobs.length, equals(1));
        expect(jobs.first.jobId, equals('doc-processing'));
        expect(jobs.first.jobType, equals(JobType.documentUpload));
        expect(jobs.first.status, equals(JobStatus.processing));
      });
    });

    group('getStatistics', () {
      test('should return job count statistics by status', () async {
        // Create jobs with different statuses
        await TestProcessingJobRepository.createJob(
          jobId: 'stat-processing-1',
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );

        await TestProcessingJobRepository.createJob(
          jobId: 'stat-processing-2',
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );

        await TestProcessingJobRepository.createJob(
          jobId: 'stat-completed-1',
          jobType: JobType.documentUpload,
          status: JobStatus.completed,
        );

        await TestProcessingJobRepository.createJob(
          jobId: 'stat-failed-1',
          jobType: JobType.documentUpload,
          status: JobStatus.failed,
        );

        final stats = await TestProcessingJobRepository.getStatistics();

        expect(stats['processing'], equals(2));
        expect(stats['completed'], equals(1));
        expect(stats['failed'], equals(1));
      });
    });

    group('exponential backoff', () {
      test('should calculate correct polling intervals', () async {
        const jobId = 'backoff-test-job';
        
        await TestProcessingJobRepository.createJob(
          jobId: jobId,
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );

        // Test different retry counts and their intervals
        final testCases = [
          {'retryCount': 0, 'expectedSeconds': 5},
          {'retryCount': 1, 'expectedSeconds': 10},
          {'retryCount': 2, 'expectedSeconds': 20},
          {'retryCount': 3, 'expectedSeconds': 40},
          {'retryCount': 4, 'expectedSeconds': 60},
          {'retryCount': 10, 'expectedSeconds': 60}, // Max interval
        ];

        for (final testCase in testCases) {
          final retryCount = testCase['retryCount'] as int;
          final expectedSeconds = testCase['expectedSeconds'] as int;
          
          final beforeUpdate = DateTime.now();
          
          final updatedJob = await TestProcessingJobRepository.updatePollingMetadata(
            jobId,
            retryCount,
          );

          final actualInterval = updatedJob.nextPollAt!.difference(beforeUpdate).inSeconds;
          
          expect(
            actualInterval,
            greaterThanOrEqualTo(expectedSeconds - 2), // Allow 2 second variance
            reason: 'Retry count $retryCount should result in ~$expectedSeconds second interval',
          );
          
          expect(
            actualInterval,
            lessThanOrEqualTo(expectedSeconds + 2),
            reason: 'Retry count $retryCount should result in ~$expectedSeconds second interval',
          );
        }
      });
    });
  });
}