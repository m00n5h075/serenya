import 'package:flutter_test/flutter_test.dart';
import 'package:serenya_app/services/unified_polling_service.dart';
import 'package:serenya_app/core/providers/health_data_provider.dart';
import 'package:serenya_app/core/database/processing_job_repository.dart';
import 'package:serenya_app/models/local_database_models.dart';

void main() {
  group('UnifiedPollingService', () {
    late UnifiedPollingService pollingService;
    late HealthDataProvider healthDataProvider;

    setUpAll(() async {
      // Initialize test database
      TestWidgetsFlutterBinding.ensureInitialized();
    });

    setUp(() {
      pollingService = UnifiedPollingService();
      healthDataProvider = HealthDataProvider();
    });

    tearDown(() async {
      await pollingService.dispose();
    });

    group('initialization', () {
      test('should initialize successfully with health data provider', () async {
        // Act & Assert
        expect(() => pollingService.initialize(healthDataProvider), returnsNormally);
      });

      test('should start as not polling', () {
        // Assert
        expect(pollingService.isPolling, isFalse);
      });

      test('should return zero active jobs initially', () async {
        // Act
        final count = await pollingService.getActiveJobCount();
        
        // Assert
        expect(count, equals(0));
      });
    });

    group('job monitoring', () {
      test('should start monitoring job successfully', () async {
        // Arrange
        await pollingService.initialize(healthDataProvider);
        const testJobId = 'test-job-123';
        
        // Create a test job in the repository
        await ProcessingJobRepository.createJob(
          jobId: testJobId,
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );
        
        // Act & Assert
        expect(() => pollingService.startMonitoringJob(testJobId), returnsNormally);
      });

      test('should enable polling when job monitoring starts', () async {
        // Arrange
        await pollingService.initialize(healthDataProvider);
        const testJobId = 'test-job-456';
        
        await ProcessingJobRepository.createJob(
          jobId: testJobId,
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );
        
        // Act
        await pollingService.startMonitoringJob(testJobId);
        
        // Assert
        expect(pollingService.isPolling, isTrue);
      });

      test('should stop monitoring job and polling when no active jobs remain', () async {
        // Arrange
        await pollingService.initialize(healthDataProvider);
        const testJobId = 'test-job-789';
        
        await ProcessingJobRepository.createJob(
          jobId: testJobId,
          jobType: JobType.documentUpload,
          status: JobStatus.processing,
        );
        
        await pollingService.startMonitoringJob(testJobId);
        expect(pollingService.isPolling, isTrue);
        
        // Complete the job
        await ProcessingJobRepository.completeJob(testJobId, 'result-content-123');
        
        // Act
        await pollingService.stopMonitoringJob(testJobId);
        
        // Assert
        expect(pollingService.isPolling, isFalse);
      });
    });

    group('service status', () {
      test('should provide detailed service status', () async {
        // Arrange
        await pollingService.initialize(healthDataProvider);
        
        // Act
        final status = await pollingService.getServiceStatus();
        
        // Assert
        expect(status, isA<Map<String, dynamic>>());
        expect(status.containsKey('isPolling'), isTrue);
        expect(status.containsKey('activeJobCount'), isTrue);
        expect(status.containsKey('jobStatistics'), isTrue);
      });

      test('should handle service status errors gracefully', () async {
        // Act (without initialization)
        final status = await pollingService.getServiceStatus();
        
        // Assert
        expect(status, isA<Map<String, dynamic>>());
        expect(status.containsKey('isPolling'), isTrue);
        expect(status['isPolling'], isFalse);
      });
    });

    group('force polling', () {
      test('should handle force poll when no jobs exist', () async {
        // Arrange
        await pollingService.initialize(healthDataProvider);
        
        // Act & Assert
        expect(() => pollingService.forcePollAllJobs(), returnsNormally);
      });
    });

    group('disposal', () {
      test('should dispose cleanly', () async {
        // Arrange
        await pollingService.initialize(healthDataProvider);
        
        // Act & Assert
        expect(() => pollingService.dispose(), returnsNormally);
        expect(pollingService.isPolling, isFalse);
      });
    });
  });
}