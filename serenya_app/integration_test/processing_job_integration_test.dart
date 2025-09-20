import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:serenya_app/models/local_database_models.dart';
import 'package:serenya_app/core/database/processing_job_repository.dart';
import 'package:serenya_app/services/processing_service.dart';
import 'package:serenya_app/core/providers/health_data_provider.dart';
import 'package:serenya_app/core/database/encrypted_database_service.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Processing Job Integration Tests', () {
    late ProcessingService processingService;
    late HealthDataProvider healthDataProvider;

    setUpAll(() async {
      // Initialize the database system
      await EncryptedDatabaseService.database;
      
      processingService = ProcessingService();
      healthDataProvider = HealthDataProvider();
      
      // Clean up any existing test data
      await _cleanupTestData();
    });

    tearDown(() async {
      await _cleanupTestData();
    });

    testWidgets('End-to-end processing job workflow', (WidgetTester tester) async {
      // Test the complete workflow from document upload to job completion
      
      // Step 1: Create a test file
      final testFile = await _createTestFile();
      const fileName = 'test_medical_report.pdf';

      try {
        // Step 2: Process document (this should create a ProcessingJob)
        final processingResult = await processingService.processDocument(
          file: testFile,
          fileName: fileName,
          dataProvider: healthDataProvider,
        );

        // Verify processing started successfully
        expect(processingResult.success, isTrue);
        expect(processingResult.jobId, isNotNull);
        expect(processingResult.processingJob, isNotNull);
        expect(processingResult.processingJob!.jobType, equals(JobType.documentUpload));
        expect(processingResult.processingJob!.status, equals(JobStatus.processing));

        final jobId = processingResult.jobId!;

        // Step 3: Verify job was created in database
        final createdJob = await ProcessingJobRepository.getJob(jobId);
        expect(createdJob, isNotNull);
        expect(createdJob!.jobId, equals(jobId));
        expect(createdJob.jobType, equals(JobType.documentUpload));
        expect(createdJob.status, equals(JobStatus.processing));
        expect(createdJob.nextPollAt, isNotNull);

        // Step 4: Verify job appears in active jobs list
        final activeJobs = await ProcessingJobRepository.getActiveJobs();
        expect(activeJobs.any((job) => job.jobId == jobId), isTrue);

        // Step 5: Test polling readiness
        final jobsReadyForPolling = await ProcessingJobRepository.getJobsReadyForPolling();
        // Job should be ready for polling (next_poll_at in the near future)
        expect(jobsReadyForPolling.any((job) => job.jobId == jobId), isTrue);

        // Step 6: Simulate polling status updates
        await _simulateJobPollingProgress(jobId, healthDataProvider);

        // Step 7: Verify job completion
        final completedJob = await ProcessingJobRepository.getJob(jobId);
        expect(completedJob!.status, equals(JobStatus.completed));
        expect(completedJob.resultContentId, isNotNull);
        expect(completedJob.completedAt, isNotNull);
        expect(completedJob.nextPollAt, isNull); // Should stop polling

        // Step 8: Verify job no longer appears in active jobs
        final finalActiveJobs = await ProcessingJobRepository.getActiveJobs();
        expect(finalActiveJobs.any((job) => job.jobId == jobId), isFalse);

        // Step 9: Test job cleanup
        await ProcessingJobRepository.cleanupOldJobs(
          completedJobAge: const Duration(milliseconds: 1), // Clean up immediately
        );

        final cleanedJob = await ProcessingJobRepository.getJob(jobId);
        expect(cleanedJob, isNull); // Job should be cleaned up

      } finally {
        await testFile.delete();
      }
    });

    testWidgets('Processing job failure handling', (WidgetTester tester) async {
      // Test failure scenarios and retry logic
      
      const jobId = 'test-failure-job';
      
      // Create a job that will fail
      await ProcessingJobRepository.createJob(
        jobId: jobId,
        jobType: JobType.documentUpload,
        status: JobStatus.processing,
      );

      // Simulate multiple polling attempts with failures
      for (int attempt = 0; attempt < 3; attempt++) {
        final updatedJob = await ProcessingJobRepository.updatePollingMetadata(
          jobId,
          attempt,
        );

        // Verify exponential backoff
        if (attempt > 0) {
          final expectedInterval = [5, 10, 20][attempt - 1];
          final actualInterval = updatedJob.nextPollAt!
              .difference(updatedJob.lastPollAt!)
              .inSeconds;
              
          expect(
            actualInterval,
            greaterThanOrEqualTo(expectedInterval - 2),
            reason: 'Attempt $attempt should have ~$expectedInterval second interval',
          );
        }
      }

      // Simulate job failure
      const errorMessage = 'Simulated processing failure';
      final finalJob = await ProcessingJobRepository.failJob(jobId, errorMessage);

      expect(finalJob.status, equals(JobStatus.failed));
      expect(finalJob.errorMessage, equals(errorMessage));
      expect(finalJob.completedAt, isNotNull);
      expect(finalJob.nextPollAt, isNull); // Should stop polling
    });

    testWidgets('Multiple concurrent jobs handling', (WidgetTester tester) async {
      // Test handling multiple jobs simultaneously
      
      const jobCount = 5;
      final jobIds = <String>[];

      // Create multiple jobs
      for (int i = 0; i < jobCount; i++) {
        final jobId = 'concurrent-job-$i';
        jobIds.add(jobId);
        
        await ProcessingJobRepository.createJob(
          jobId: jobId,
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );
      }

      // Verify all jobs are active
      final activeJobs = await ProcessingJobRepository.getActiveJobs();
      expect(activeJobs.length, greaterThanOrEqualTo(jobCount));

      for (final jobId in jobIds) {
        expect(activeJobs.any((job) => job.jobId == jobId), isTrue);
      }

      // Complete jobs at different times
      for (int i = 0; i < jobCount; i++) {
        if (i % 2 == 0) {
          // Complete even-numbered jobs
          await ProcessingJobRepository.completeJob(
            jobIds[i],
            'result-content-$i',
          );
        } else {
          // Fail odd-numbered jobs
          await ProcessingJobRepository.failJob(
            jobIds[i],
            'Error for job $i',
          );
        }
      }

      // Verify final states
      final statistics = await ProcessingJobRepository.getStatistics();
      expect(statistics['completed'], greaterThanOrEqualTo(jobCount ~/ 2));
      expect(statistics['failed'], greaterThanOrEqualTo(jobCount - (jobCount ~/ 2)));

      // Verify no more active jobs
      final finalActiveJobs = await ProcessingJobRepository.getActiveJobs();
      for (final jobId in jobIds) {
        expect(finalActiveJobs.any((job) => job.jobId == jobId), isFalse);
      }
    });

    testWidgets('Database persistence across app restarts', (WidgetTester tester) async {
      // Test that jobs persist across database connections
      
      const jobId = 'persistence-test-job';
      
      // Create job
      await ProcessingJobRepository.createJob(
        jobId: jobId,
        jobType: JobType.doctorReport,
        status: JobStatus.processing,
        estimatedCompletionSeconds: 120,
      );

      // Simulate app restart by closing and reopening database
      await EncryptedDatabaseService.close();
      await EncryptedDatabaseService.database; // Reinitialize

      // Verify job still exists with all data intact
      final persistedJob = await ProcessingJobRepository.getJob(jobId);
      expect(persistedJob, isNotNull);
      expect(persistedJob!.jobId, equals(jobId));
      expect(persistedJob.jobType, equals(JobType.doctorReport));
      expect(persistedJob.status, equals(JobStatus.processing));
      expect(persistedJob.estimatedCompletionSeconds, equals(120));

      // Verify job is still active
      final activeJobs = await ProcessingJobRepository.getActiveJobs();
      expect(activeJobs.any((job) => job.jobId == jobId), isTrue);
    });

    testWidgets('Error handling and recovery', (WidgetTester tester) async {
      // Test error handling in repository operations
      
      // Test repository exception handling
      expect(
        () => ProcessingJobRepository.getJob(''),
        throwsA(isA<ProcessingJobRepositoryException>()),
      );

      expect(
        () => ProcessingJobRepository.updateJob(
          'non-existent-job',
          status: JobStatus.completed,
        ),
        throwsA(isA<ProcessingJobRepositoryException>()),
      );

      // Test graceful handling of corrupted data
      const jobId = 'recovery-test-job';
      await ProcessingJobRepository.createJob(
        jobId: jobId,
        jobType: JobType.documentUpload,
        status: JobStatus.processing,
      );

      // Verify job can be retrieved and updated normally
      final job = await ProcessingJobRepository.getJob(jobId);
      expect(job, isNotNull);

      final updatedJob = await ProcessingJobRepository.updateJob(
        jobId,
        retryCount: 1,
      );
      expect(updatedJob.retryCount, equals(1));
    });
  });
}

/// Helper function to create a test file
Future<File> _createTestFile() async {
  final tempDir = Directory.systemTemp;
  final testFile = File('${tempDir.path}/test_medical_report.pdf');
  
  // Create a simple test PDF content (not a real PDF, just for testing)
  const testContent = '''
%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer << /Size 4 /Root 1 0 R >>
startxref
187
%%EOF
''';

  await testFile.writeAsString(testContent);
  return testFile;
}

/// Helper function to simulate job polling progress
Future<void> _simulateJobPollingProgress(
  String jobId,
  HealthDataProvider healthDataProvider,
) async {
  // Test processing service functionality

  // Simulate several polling attempts
  for (int i = 0; i < 3; i++) {
    await Future.delayed(const Duration(milliseconds: 100));
    
    // Update polling metadata to simulate polling
    await ProcessingJobRepository.updatePollingMetadata(jobId, i);
  }

  // Simulate job completion
  await ProcessingJobRepository.completeJob(
    jobId,
    'test-result-content-id-$jobId',
  );
}

/// Helper function to clean up test data
Future<void> _cleanupTestData() async {
  try {
    // Clean up all test jobs
    final allJobs = await ProcessingJobRepository.getActiveJobs();
    for (final job in allJobs) {
      if (job.jobId.contains('test') || 
          job.jobId.contains('concurrent') ||
          job.jobId.contains('persistence') ||
          job.jobId.contains('recovery')) {
        await ProcessingJobRepository.deleteJob(job.jobId);
      }
    }

    // Also clean up completed/failed test jobs
    await ProcessingJobRepository.cleanupOldJobs(
      completedJobAge: Duration.zero,
      failedJobAge: Duration.zero,
    );
  } catch (e) {
    // Ignore cleanup errors
    debugPrint('Cleanup warning: $e');
  }
}