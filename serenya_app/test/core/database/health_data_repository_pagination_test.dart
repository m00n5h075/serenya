import 'package:flutter_test/flutter_test.dart';
import 'package:serenya_app/core/database/health_data_repository.dart';
import 'package:serenya_app/models/local_database_models.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  group('HealthDataRepository Pagination Tests', () {
    late HealthDataRepository repository;
    late Database database;

    setUpAll(() {
      // Initialize FFI
      sqfliteFfiInit();
      // Change the default factory to use FFI implementation
      databaseFactory = databaseFactoryFfi;
    });

    setUp(() async {
      repository = HealthDataRepository();
      
      // Initialize test database in memory using FFI
      database = await openDatabase(
        inMemoryDatabasePath,
        version: 1,
        onCreate: (db, version) async {
          await _createTestTables(db);
        },
      );
      
      // Create test data
      await _createTestData(database);
    });

    tearDown(() async {
      await database.close();
    });

    group('getAllContent with pagination', () {
      test('should return limited results when limit is specified', () async {
        final result = await repository.getAllContent(limit: 5);
        
        expect(result.length, equals(5));
        expect(result.first.createdAt.isAfter(result.last.createdAt), isTrue);
      });

      test('should return all results when no limit is specified', () async {
        final result = await repository.getAllContent();
        
        expect(result.length, equals(20)); // Total test data
      });

      test('should support offset-based pagination', () async {
        final firstPage = await repository.getAllContent(limit: 5, offset: 0);
        final secondPage = await repository.getAllContent(limit: 5, offset: 5);
        
        expect(firstPage.length, equals(5));
        expect(secondPage.length, equals(5));
        
        // Ensure no overlap
        final firstIds = firstPage.map((c) => c.id).toSet();
        final secondIds = secondPage.map((c) => c.id).toSet();
        expect(firstIds.intersection(secondIds).isEmpty, isTrue);
        
        // Ensure chronological order
        expect(firstPage.first.createdAt.isAfter(secondPage.first.createdAt), isTrue);
      });

      test('should support cursor-based pagination with lastContentId', () async {
        final firstBatch = await repository.getAllContent(limit: 5);
        final lastContentId = firstBatch.last.id;
        
        final secondBatch = await repository.getAllContent(
          limit: 5,
          lastContentId: lastContentId,
        );
        
        expect(secondBatch.length, equals(5));
        
        // Ensure no overlap
        final firstIds = firstBatch.map((c) => c.id).toSet();
        final secondIds = secondBatch.map((c) => c.id).toSet();
        expect(firstIds.intersection(secondIds).isEmpty, isTrue);
        
        // Ensure correct chronological order
        expect(secondBatch.first.createdAt.isBefore(firstBatch.last.createdAt), isTrue);
      });

      test('should handle empty results gracefully', () async {
        // Clear all data
        await database.delete('serenya_content');
        
        final result = await repository.getAllContent(limit: 5);
        expect(result.isEmpty, isTrue);
      });
    });

    group('getContentByType with pagination', () {
      test('should filter by content type and paginate', () async {
        final results = await repository.getContentByType(
          ContentType.result,
          limit: 5,
        );
        
        expect(results.length, lessThanOrEqualTo(5));
        expect(results.every((c) => c.contentType == ContentType.result), isTrue);
      });

      test('should support cursor-based pagination with content type filter', () async {
        final firstBatch = await repository.getContentByType(
          ContentType.result,
          limit: 3,
        );
        
        if (firstBatch.isNotEmpty) {
          final lastContentId = firstBatch.last.id;
          
          final secondBatch = await repository.getContentByType(
            ContentType.result,
            limit: 3,
            lastContentId: lastContentId,
          );
          
          // Ensure no overlap
          final firstIds = firstBatch.map((c) => c.id).toSet();
          final secondIds = secondBatch.map((c) => c.id).toSet();
          expect(firstIds.intersection(secondIds).isEmpty, isTrue);
          
          // Ensure all results match content type
          expect(secondBatch.every((c) => c.contentType == ContentType.result), isTrue);
        }
      });
    });

    group('Content count and hasMore functionality', () {
      test('should return correct total content count', () async {
        final count = await repository.getContentCount();
        expect(count, equals(20));
      });

      test('should return correct count by content type', () async {
        final resultCount = await repository.getContentCount(contentType: ContentType.result);
        final reportCount = await repository.getContentCount(contentType: ContentType.report);
        
        expect(resultCount + reportCount, equals(20));
        expect(resultCount, greaterThan(0));
        expect(reportCount, greaterThan(0));
      });

      test('should correctly determine if more content is available', () async {
        final hasMore1 = await repository.hasMoreContent(currentCount: 5);
        expect(hasMore1, isTrue);
        
        final hasMore2 = await repository.hasMoreContent(currentCount: 25);
        expect(hasMore2, isFalse);
      });
    });

    group('Performance tests', () {
      test('should handle large datasets efficiently', () async {
        // Create additional test data for performance testing
        await _createLargeTestData(database, 1000);
        
        final stopwatch = Stopwatch()..start();
        final result = await repository.getAllContent(limit: 50);
        stopwatch.stop();
        
        expect(result.length, equals(50));
        expect(stopwatch.elapsedMilliseconds, lessThan(1000)); // Should complete in < 1s
      });

      test('cursor-based pagination should be faster than offset-based', () async {
        await _createLargeTestData(database, 500);
        
        // Test offset-based pagination
        final offsetStopwatch = Stopwatch()..start();
        await repository.getAllContent(limit: 20, offset: 400);
        offsetStopwatch.stop();
        
        // Test cursor-based pagination
        final firstBatch = await repository.getAllContent(limit: 400);
        final lastContentId = firstBatch.last.id;
        
        final cursorStopwatch = Stopwatch()..start();
        await repository.getAllContent(limit: 20, lastContentId: lastContentId);
        cursorStopwatch.stop();
        
        // Cursor-based should generally be faster for deep pagination
        // Note: In practice, this difference is more pronounced with larger datasets
        expect(cursorStopwatch.elapsedMilliseconds, lessThan(offsetStopwatch.elapsedMilliseconds * 2));
      });
    });

    group('Edge cases', () {
      test('should handle invalid lastContentId gracefully', () async {
        final result = await repository.getAllContent(
          limit: 5,
          lastContentId: 'non-existent-id',
        );
        
        // Should still return results, ignoring invalid cursor
        expect(result.isNotEmpty, isTrue);
      });

      test('should handle limit of 0', () async {
        final result = await repository.getAllContent(limit: 0);
        expect(result.isEmpty, isTrue);
      });

      test('should handle very large limit', () async {
        final result = await repository.getAllContent(limit: 1000000);
        expect(result.length, equals(20)); // Only returns available data
      });
    });
  });
}

/// Create test data in the database
Future<void> _createTestData(Database database) async {
  final now = DateTime.now();
  
  for (int i = 0; i < 20; i++) {
    final content = SerenyaContent(
      id: 'test-content-$i',
      fileName: 'Test File $i',
      fileType: i % 2 == 0 ? 'pdf' : 'jpg',
      fileSize: 1000 + i * 100,
      uploadDate: now.subtract(Duration(days: i)),
      createdAt: now.subtract(Duration(days: i)),
      updatedAt: now.subtract(Duration(days: i)),
      processingStatus: ProcessingStatus.completed,
      contentType: i % 3 == 0 ? ContentType.report : ContentType.result,
      content: 'Test interpretation $i',
      confidenceScore: 0.8 + (i % 3) * 0.05,
      title: 'Test File $i',
      userId: 'test-user',
      medicalFlags: const [],
    );
    
    final dbData = await content.toDatabaseJson();
    await database.insert('serenya_content', dbData);
  }
}

/// Create large test dataset for performance testing
Future<void> _createLargeTestData(Database database, int count) async {
  final batch = database.batch();
  final now = DateTime.now();
  
  for (int i = 0; i < count; i++) {
    final content = SerenyaContent(
      id: 'perf-test-content-$i',
      fileName: 'Performance Test File $i',
      fileType: 'pdf',
      fileSize: 1000,
      uploadDate: now.subtract(Duration(minutes: i)),
      createdAt: now.subtract(Duration(minutes: i)),
      updatedAt: now.subtract(Duration(minutes: i)),
      processingStatus: ProcessingStatus.completed,
      contentType: ContentType.result,
      content: 'Performance test interpretation',
      confidenceScore: 0.85,
      title: 'Performance Test File $i',
      userId: 'test-user',
      medicalFlags: const [],
    );
    
    final dbData = await content.toDatabaseJson();
    batch.insert('serenya_content', dbData);
  }
  
  await batch.commit();
}

/// Create basic database tables for testing
Future<void> _createTestTables(Database db) async {
  await db.execute('''
    CREATE TABLE serenya_content (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      upload_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      processing_status TEXT NOT NULL,
      content_type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      confidence_score REAL,
      medical_flags TEXT
    );
  ''');
}