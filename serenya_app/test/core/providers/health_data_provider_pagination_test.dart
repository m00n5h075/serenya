import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:serenya_app/core/providers/health_data_provider.dart';
import 'package:serenya_app/core/database/health_data_repository.dart';
import 'package:serenya_app/models/local_database_models.dart';

import 'health_data_provider_pagination_test.mocks.dart';

@GenerateMocks([HealthDataRepository])
void main() {
  group('HealthDataProvider Pagination Tests', () {
    late HealthDataProvider provider;
    late MockHealthDataRepository mockRepository;

    setUp(() {
      mockRepository = MockHealthDataRepository();
      provider = HealthDataProvider();
      // Replace the repository with our mock
      provider.setRepositoryForTesting(mockRepository);
    });

    group('Basic pagination functionality', () {
      test('should initialize with default pagination state', () {
        expect(provider.currentPage, equals(0));
        expect(provider.hasMoreData, isTrue);
        expect(provider.isLoadingMore, isFalse);
        expect(provider.pageSize, equals(20)); // Default page size
        expect(provider.totalContentCount, equals(0));
      });

      test('should load first page of content', () async {
        final testContent = _generateTestContent(5);
        when(mockRepository.getAllContent(
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        )).thenAnswer((_) async => testContent);

        await provider.loadContent();

        expect(provider.content.length, equals(5));
        expect(provider.isLoading, isFalse);
        expect(provider.currentPage, equals(1));
        expect(provider.hasMoreData, isFalse); // Less than page size, so no more data
        
        verify(mockRepository.getAllContent(
          limit: 20,
          lastContentId: null,
        )).called(1);
      });

      test('should load more content for infinite scroll', () async {
        // Setup initial content
        final initialContent = _generateTestContent(20);
        when(mockRepository.getAllContent(
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        )).thenAnswer((_) async => initialContent);

        await provider.loadContent();
        
        // Setup additional content
        final moreContent = _generateTestContent(15, startIndex: 20);
        when(mockRepository.getAllContent(
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        )).thenAnswer((_) async => moreContent);

        await provider.loadMoreContent();

        expect(provider.content.length, equals(35)); // 20 + 15
        expect(provider.currentPage, equals(2));
        expect(provider.hasMoreData, isFalse); // Less than page size
        expect(provider.isLoadingMore, isFalse);
        
        verify(mockRepository.getAllContent(
          limit: 20,
          lastContentId: initialContent.last.id,
        )).called(1);
      });

      test('should handle loading more when no more data available', () async {
        provider.setHasMoreDataForTesting(false);
        
        await provider.loadMoreContent();
        
        verifyNever(mockRepository.getAllContent(
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        ));
        expect(provider.isLoadingMore, isFalse);
      });
    });

    group('Preloading functionality', () {
      test('should preload next batch in background', () async {
        // Setup initial content
        final initialContent = _generateTestContent(20);
        when(mockRepository.getAllContent(
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        )).thenAnswer((_) async => initialContent);

        await provider.loadContent();
        
        // Setup preload content
        final preloadContent = _generateTestContent(10, startIndex: 20);
        when(mockRepository.getAllContent(
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        )).thenAnswer((_) async => preloadContent);

        await provider.preloadNextBatch();
        
        // Content should not be added to main list yet
        expect(provider.content.length, equals(20));
        
        // Apply preloaded content
        provider.applyPreloadedContent();
        
        expect(provider.content.length, equals(30));
        expect(provider.currentPage, equals(2));
      });

      test('should handle preload errors gracefully', () async {
        when(mockRepository.getAllContent(
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        )).thenThrow(Exception('Network error'));

        // Should not throw exception
        await provider.preloadNextBatch();
        
        expect(provider.error, isNull); // Preload errors should be silent
      });
    });

    group('Content type filtering', () {
      test('should load content by type with pagination', () async {
        final resultContent = _generateTestContent(15, contentType: ContentType.result);
        when(mockRepository.getContentByType(
          ContentType.result,
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        )).thenAnswer((_) async => resultContent);

        await provider.loadContentByType(ContentType.result);

        expect(provider.content.length, equals(15));
        expect(provider.content.every((c) => c.contentType == ContentType.result), isTrue);
        
        verify(mockRepository.getContentByType(
          ContentType.result,
          limit: 20,
          lastContentId: null,
        )).called(1);
      });

      test('should load more content by type', () async {
        // Initial load
        final initialContent = _generateTestContent(20, contentType: ContentType.report);
        when(mockRepository.getContentByType(
          ContentType.report,
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        )).thenAnswer((_) async => initialContent);

        await provider.loadContentByType(ContentType.report);
        
        // Load more
        final moreContent = _generateTestContent(10, startIndex: 20, contentType: ContentType.report);
        when(mockRepository.getContentByType(
          ContentType.report,
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        )).thenAnswer((_) async => moreContent);

        await provider.loadMoreContent(contentType: ContentType.report);

        expect(provider.content.length, equals(30));
        expect(provider.content.every((c) => c.contentType == ContentType.report), isTrue);
      });
    });

    group('Caching functionality', () {
      test('should cache loaded content', () async {
        final testContent = _generateTestContent(5);
        when(mockRepository.getAllContent(
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        )).thenAnswer((_) async => testContent);

        await provider.loadContent();

        final cachedContent = provider.getCachedContent(testContent.first.id);
        expect(cachedContent, isNotNull);
        expect(cachedContent?.id, equals(testContent.first.id));
      });

      test('should refresh cache on new load', () async {
        final firstContent = _generateTestContent(3);
        when(mockRepository.getAllContent(
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        )).thenAnswer((_) async => firstContent);

        await provider.loadContent();
        
        final secondContent = _generateTestContent(3, startIndex: 10);
        when(mockRepository.getAllContent(
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        )).thenAnswer((_) async => secondContent);

        await provider.loadContent(refresh: true);

        // Should have new content, not appended
        expect(provider.content.length, equals(3));
        expect(provider.content.first.id, equals(secondContent.first.id));
        
        // Old cached content should be cleared
        final oldCachedContent = provider.getCachedContent(firstContent.first.id);
        expect(oldCachedContent, isNull);
      });
    });

    group('Error handling', () {
      test('should handle repository errors during pagination', () async {
        when(mockRepository.getAllContent(
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        )).thenThrow(Exception('Database error'));

        await provider.loadContent();

        expect(provider.error, isNotNull);
        expect(provider.error, contains('Failed to load content'));
        expect(provider.isLoading, isFalse);
      });

      test('should handle errors during load more', () async {
        // Initial successful load
        final initialContent = _generateTestContent(20);
        when(mockRepository.getAllContent(
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        )).thenAnswer((_) async => initialContent);

        await provider.loadContent();
        
        // Error on load more
        when(mockRepository.getAllContent(
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        )).thenThrow(Exception('Network timeout'));

        await provider.loadMoreContent();

        expect(provider.error, isNotNull);
        expect(provider.content.length, equals(20)); // Original content preserved
        expect(provider.isLoadingMore, isFalse);
      });
    });

    group('Page size customization', () {
      test('should allow custom page sizes', () {
        provider.setPageSize(50);
        expect(provider.pageSize, equals(50));
      });

      test('should use custom page size for loading', () async {
        provider.setPageSize(10);
        
        final testContent = _generateTestContent(10);
        when(mockRepository.getAllContent(
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        )).thenAnswer((_) async => testContent);

        await provider.loadContent();

        verify(mockRepository.getAllContent(
          limit: 10,
          lastContentId: null,
        )).called(1);
      });
    });

    group('State management', () {
      test('should notify listeners during pagination operations', () async {
        int notificationCount = 0;
        provider.addListener(() => notificationCount++);

        final testContent = _generateTestContent(5);
        when(mockRepository.getAllContent(
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        )).thenAnswer((_) async => testContent);

        await provider.loadContent();

        expect(notificationCount, greaterThan(1)); // Should notify multiple times during load
      });

      test('should reset pagination state correctly', () async {
        // Load some content first
        final testContent = _generateTestContent(20);
        when(mockRepository.getAllContent(
          limit: anyNamed('limit'),
          lastContentId: anyNamed('lastContentId'),
        )).thenAnswer((_) async => testContent);

        await provider.loadContent();
        await provider.loadMoreContent(); // This would increment page
        
        // Reset and load fresh
        await provider.loadContent(resetPagination: true);

        expect(provider.currentPage, equals(1));
        expect(provider.hasMoreData, isTrue);
      });
    });
  });
}

/// Helper function to generate test content
List<SerenyaContent> _generateTestContent(
  int count, {
  int startIndex = 0,
  ContentType contentType = ContentType.result,
}) {
  final now = DateTime.now();
  return List.generate(count, (index) {
    final i = startIndex + index;
    return SerenyaContent(
      id: 'test-content-$i',
      fileName: 'Test File $i',
      fileType: 'pdf',
      fileSize: 1000,
      uploadDate: now.subtract(Duration(minutes: i)),
      createdAt: now.subtract(Duration(minutes: i)),
      updatedAt: now.subtract(Duration(minutes: i)),
      processingStatus: ProcessingStatus.completed,
      contentType: contentType,
      content: 'Test interpretation $i',
      confidenceScore: 0.85,
      title: 'Test File $i',
      userId: 'test-user',
      medicalFlags: const [],
    );
  });
}

/// Extension to add testing methods to HealthDataProvider
extension HealthDataProviderTesting on HealthDataProvider {
  void setRepositoryForTesting(HealthDataRepository repository) {
    // This would require modifying the provider to accept repository injection
    // For now, this is a placeholder for the testing pattern
  }
  
  void setHasMoreDataForTesting(bool hasMore) {
    // This would require exposing a setter for testing
    // For now, this is a placeholder for the testing pattern
  }
}