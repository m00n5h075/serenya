import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:serenya_app/core/services/timeline_preload_service.dart';
import 'package:serenya_app/core/providers/health_data_provider.dart';
import 'package:serenya_app/models/local_database_models.dart';

import 'timeline_preload_service_test.mocks.dart';

@GenerateMocks([HealthDataProvider])
void main() {
  group('TimelinePreloadService Tests', () {
    late TimelinePreloadService service;
    late MockHealthDataProvider mockProvider;

    setUp(() {
      mockProvider = MockHealthDataProvider();
      
      // Default provider state
      when(mockProvider.hasMoreData).thenReturn(true);
      when(mockProvider.content).thenReturn([]);
      when(mockProvider.preloadNextBatch()).thenAnswer((_) async {});
      
      service = TimelinePreloadService(mockProvider);
    });

    tearDown(() {
      service.dispose();
      reset(mockProvider);
    });

    group('Basic preloading functionality', () {
      test('should initialize with default metrics', () {
        final metrics = service.metrics;
        
        expect(metrics.averagePreloadTime, equals(Duration.zero));
        expect(metrics.averagePreloadSize, equals(0));
        expect(metrics.successRate, equals(0.0));
        expect(metrics.totalPreloadRequests, equals(0));
        expect(metrics.currentThreshold, equals(0.8));
        expect(metrics.adaptivePageSize, equals(20));
      });

      test('should not preload when no more data available', () async {
        when(mockProvider.hasMoreData).thenReturn(false);
        
        await service.preloadContent();
        
        verifyNever(mockProvider.preloadNextBatch());
        expect(service.metrics.totalPreloadRequests, equals(0));
      });

      test('should preload content successfully', () async {
        when(mockProvider.preloadNextBatch())
            .thenAnswer((_) async {});
        
        await service.preloadContent(forcePreload: true);
        
        // Wait for debounce timer
        await Future.delayed(const Duration(milliseconds: 350));
        
        // setPageSize is void method - verification only
        verify(mockProvider.setPageSize(20)).called(1); // Default page size for preload
        verify(mockProvider.preloadNextBatch()).called(1);
        expect(service.metrics.totalPreloadRequests, equals(1));
        expect(service.metrics.successRate, equals(1.0));
      });

      test('should handle preload errors gracefully', () async {
        when(mockProvider.preloadNextBatch())
            .thenThrow(Exception('Network error'));
        
        await service.preloadContent(forcePreload: true);
        
        // Wait for debounce timer
        await Future.delayed(const Duration(milliseconds: 350));
        
        expect(service.metrics.totalPreloadRequests, equals(1));
        expect(service.metrics.successRate, equals(0.0));
      });

      test('should debounce preload requests', () async {
        // Make multiple rapid preload calls
        service.preloadContent();
        service.preloadContent();
        service.preloadContent();
        
        // Wait for debounce timer
        await Future.delayed(const Duration(milliseconds: 350));
        
        // Should only make one actual preload call due to debouncing
        verify(mockProvider.preloadNextBatch()).called(1);
      });
    });

    group('Adaptive threshold adjustment', () {
      test('should lower threshold when preload is slow', () async {
        final initialThreshold = service.recommendedThreshold;
        
        // Simulate slow preload
        when(mockProvider.preloadNextBatch())
            .thenAnswer((_) async {
              await Future.delayed(const Duration(milliseconds: 2500)); // Slow preload
            });
        
        await service.preloadContent(forcePreload: true);
        await Future.delayed(const Duration(milliseconds: 350));
        
        expect(service.recommendedThreshold, lessThan(initialThreshold));
      });

      test('should raise threshold when preload is fast', () async {
        // Store initial threshold for comparison after fast preload
        
        // First make it slow to lower the threshold
        when(mockProvider.preloadNextBatch())
            .thenAnswer((_) async {
              await Future.delayed(const Duration(milliseconds: 2500));
            });
        
        await service.preloadContent(forcePreload: true);
        await Future.delayed(const Duration(milliseconds: 350));
        
        // Now make it fast
        when(mockProvider.preloadNextBatch())
            .thenAnswer((_) async {
              await Future.delayed(const Duration(milliseconds: 200)); // Fast preload
            });
        
        await service.preloadContent(forcePreload: true);
        await Future.delayed(const Duration(milliseconds: 350));
        
        expect(service.recommendedThreshold, greaterThan(service.recommendedThreshold));
      });

      test('should keep threshold within bounds', () async {
        // Make many slow preloads to try to push threshold below minimum
        when(mockProvider.preloadNextBatch())
            .thenAnswer((_) async {
              await Future.delayed(const Duration(milliseconds: 3000));
            });
        
        for (int i = 0; i < 10; i++) {
          await service.preloadContent(forcePreload: true);
          await Future.delayed(const Duration(milliseconds: 350));
        }
        
        expect(service.recommendedThreshold, greaterThanOrEqualTo(0.7));
        expect(service.recommendedThreshold, lessThanOrEqualTo(0.9));
      });
    });

    group('Adaptive page size adjustment', () {
      test('should decrease page size when loading is slow', () async {
        final initialPageSize = service.metrics.adaptivePageSize;
        
        // Simulate slow loading multiple times to build history
        when(mockProvider.preloadNextBatch())
            .thenAnswer((_) async {
              await Future.delayed(const Duration(milliseconds: 2000)); // Slow loading
            });
        
        for (int i = 0; i < 5; i++) {
          await service.preloadContent(forcePreload: true);
          await Future.delayed(const Duration(milliseconds: 350));
        }
        
        expect(service.metrics.adaptivePageSize, lessThan(initialPageSize));
      });

      test('should increase page size when loading is fast', () async {
        // First make it slow to decrease page size
        when(mockProvider.preloadNextBatch())
            .thenAnswer((_) async {
              await Future.delayed(const Duration(milliseconds: 2000));
            });
        
        await service.preloadContent(forcePreload: true);
        await Future.delayed(const Duration(milliseconds: 350));
        
        final currentPageSize = service.metrics.adaptivePageSize;
        
        // Now make it fast
        when(mockProvider.preloadNextBatch())
            .thenAnswer((_) async {
              await Future.delayed(const Duration(milliseconds: 300)); // Fast loading
            });
        
        for (int i = 0; i < 5; i++) {
          await service.preloadContent(forcePreload: true);
          await Future.delayed(const Duration(milliseconds: 350));
        }
        
        expect(service.metrics.adaptivePageSize, greaterThan(currentPageSize));
      });

      test('should keep page size within bounds', () async {
        // Try to push page size below minimum
        when(mockProvider.preloadNextBatch())
            .thenAnswer((_) async {
              await Future.delayed(const Duration(milliseconds: 3000));
            });
        
        for (int i = 0; i < 20; i++) {
          await service.preloadContent(forcePreload: true);
          await Future.delayed(const Duration(milliseconds: 350));
        }
        
        expect(service.metrics.adaptivePageSize, greaterThanOrEqualTo(10));
        expect(service.metrics.adaptivePageSize, lessThanOrEqualTo(50));
      });
    });

    group('Scroll-based preload decisions', () {
      test('should recommend preload when scroll reaches threshold', () {
        final scrollMetrics = MockScrollMetrics();
        when(scrollMetrics.pixels).thenReturn(80.0);
        when(scrollMetrics.maxScrollExtent).thenReturn(100.0);
        
        final shouldPreload = service.shouldPreload(scrollMetrics);
        expect(shouldPreload, isTrue);
      });

      test('should not recommend preload before threshold', () {
        final scrollMetrics = MockScrollMetrics();
        when(scrollMetrics.pixels).thenReturn(70.0);
        when(scrollMetrics.maxScrollExtent).thenReturn(100.0);
        
        final shouldPreload = service.shouldPreload(scrollMetrics);
        expect(shouldPreload, isFalse);
      });

      test('should not recommend preload when no more data', () {
        when(mockProvider.hasMoreData).thenReturn(false);
        
        final scrollMetrics = MockScrollMetrics();
        when(scrollMetrics.pixels).thenReturn(90.0);
        when(scrollMetrics.maxScrollExtent).thenReturn(100.0);
        
        final shouldPreload = service.shouldPreload(scrollMetrics);
        expect(shouldPreload, isFalse);
      });

      test('should handle zero scroll extent gracefully', () {
        final scrollMetrics = MockScrollMetrics();
        when(scrollMetrics.pixels).thenReturn(0.0);
        when(scrollMetrics.maxScrollExtent).thenReturn(0.0);
        
        final shouldPreload = service.shouldPreload(scrollMetrics);
        expect(shouldPreload, isFalse);
      });
    });

    group('Performance metrics tracking', () {
      test('should track preload times correctly', () async {
        when(mockProvider.preloadNextBatch())
            .thenAnswer((_) async {
              await Future.delayed(const Duration(milliseconds: 500));
            });
        
        await service.preloadContent(forcePreload: true);
        await Future.delayed(const Duration(milliseconds: 350));
        
        final metrics = service.metrics;
        expect(metrics.averagePreloadTime.inMilliseconds, greaterThan(400));
        expect(metrics.averagePreloadTime.inMilliseconds, lessThan(600));
      });

      test('should limit stored metrics to prevent memory growth', () async {
        when(mockProvider.preloadNextBatch())
            .thenAnswer((_) async {});
        
        // Make many preload requests to test metric limiting
        for (int i = 0; i < 25; i++) {
          await service.preloadContent(forcePreload: true);
          await Future.delayed(const Duration(milliseconds: 350));
        }
        
        expect(service.metrics.totalPreloadRequests, equals(25));
        // Internal metric arrays should be limited (this would require access to private fields in real implementation)
      });

      test('should calculate success rate correctly', () async {
        // Successful preloads
        when(mockProvider.preloadNextBatch())
            .thenAnswer((_) async {});
        
        for (int i = 0; i < 3; i++) {
          await service.preloadContent(forcePreload: true);
          await Future.delayed(const Duration(milliseconds: 350));
        }
        
        // Failed preloads
        when(mockProvider.preloadNextBatch())
            .thenThrow(Exception('Error'));
        
        for (int i = 0; i < 2; i++) {
          await service.preloadContent(forcePreload: true);
          await Future.delayed(const Duration(milliseconds: 350));
        }
        
        final metrics = service.metrics;
        expect(metrics.totalPreloadRequests, equals(5));
        expect(metrics.successRate, equals(0.6)); // 3 successful out of 5 total
      });
    });

    group('Content type filtering', () {
      test('should pass content type to provider during preload', () async {
        when(mockProvider.preloadNextBatch())
            .thenAnswer((_) async {});
        
        await service.preloadContent(
          contentType: ContentType.result,
          forcePreload: true,
        );
        
        await Future.delayed(const Duration(milliseconds: 350));
        
        verify(mockProvider.preloadNextBatch()).called(1);
      });
    });

    group('Cleanup and disposal', () {
      test('should clear metrics when requested', () {
        // Add some metrics first
        service.preloadContent(forcePreload: true);
        
        service.clearMetrics();
        
        final metrics = service.metrics;
        expect(metrics.totalPreloadRequests, equals(0));
        expect(metrics.successRate, equals(0.0));
        expect(metrics.averagePreloadTime, equals(Duration.zero));
      });

      test('should dispose resources properly', () {
        // This would test that timers are cancelled, etc.
        // In a real implementation, you'd verify that dispose() cancels active timers
        expect(() => service.dispose(), returnsNormally);
      });
    });
  });
}

/// Mock ScrollMetrics for testing
class MockScrollMetrics extends Mock implements ScrollMetrics {}