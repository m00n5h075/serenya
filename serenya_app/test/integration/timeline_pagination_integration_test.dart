import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:serenya_app/widgets/timeline/timeline_container.dart';
import 'package:serenya_app/core/providers/health_data_provider.dart';
import 'package:serenya_app/models/local_database_models.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  group('Timeline Pagination Integration Tests', () {
    late HealthDataProvider provider;
    late Database database;

    setUpAll(() {
      // Initialize FFI for testing
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    });

    setUp(() async {
      // Initialize test database in memory using FFI
      database = await openDatabase(
        inMemoryDatabasePath,
        version: 1,
        onCreate: (db, version) async {
          await _createTestTables(db);
        },
      );
      
      // Create provider with real repository
      provider = HealthDataProvider();
      
      // Create comprehensive test data
      await _createIntegrationTestData(database);
    });

    tearDown(() async {
      await database.close();
    });

    group('End-to-End Pagination Flow', () {
      testWidgets('should load and paginate content through complete user journey', (WidgetTester tester) async {
        await tester.pumpWidget(
          ChangeNotifierProvider<HealthDataProvider>.value(
            value: provider,
            child: MaterialApp(
              home: Scaffold(
                body: Consumer<HealthDataProvider>(
                  builder: (context, provider, child) {
                    return TimelineContainer(
                      provider: provider,
                      onDocumentTap: (document) {},
                      enableInfiniteScroll: true,
                    );
                  },
                ),
              ),
            ),
          ),
        );

        // Initial load
        await provider.loadContent();
        await tester.pumpAndSettle();

        // Find initial content (should load first page of 20)
        expect(provider.content.length, equals(20));
        expect(provider.hasMoreData, isTrue);

        // Simulate scroll to trigger load more
        final scrollFinder = find.byType(ListView);
        await tester.fling(scrollFinder, const Offset(0.0, -5000.0), 3000.0);
        await tester.pumpAndSettle();

        // Load more should be triggered
        expect(provider.content.length, greaterThan(20));
        expect(provider.isLoadingMore, isFalse);
      });

      testWidgets('should handle content filtering during pagination', (WidgetTester tester) async {
        await tester.pumpWidget(
          ChangeNotifierProvider<HealthDataProvider>.value(
            value: provider,
            child: MaterialApp(
              home: Scaffold(
                body: Consumer<HealthDataProvider>(
                  builder: (context, provider, child) {
                    return TimelineContainer(
                      provider: provider,
                      onDocumentTap: (document) {},
                      filterType: ContentType.result,
                    );
                  },
                ),
              ),
            ),
          ),
        );

        // Load content with filter
        await provider.loadContentByType(ContentType.result);
        await tester.pumpAndSettle();

        // Verify all content matches filter
        expect(provider.content.every((c) => c.contentType == ContentType.result), isTrue);
      });

      testWidgets('should maintain scroll position during content updates', (WidgetTester tester) async {
        await tester.pumpWidget(
          ChangeNotifierProvider<HealthDataProvider>.value(
            value: provider,
            child: MaterialApp(
              home: Scaffold(
                body: Consumer<HealthDataProvider>(
                  builder: (context, provider, child) {
                    return TimelineContainer(
                      provider: provider,
                      onDocumentTap: (document) {},
                    );
                  },
                ),
              ),
            ),
          ),
        );

        // Load initial content
        await provider.loadContent();
        await tester.pumpAndSettle();

        // Scroll down
        final scrollFinder = find.byType(ListView);
        await tester.fling(scrollFinder, const Offset(0.0, -1000.0), 1000.0);
        await tester.pumpAndSettle();

        // Get scroll controller
        ScrollController? scrollController;
        final listView = tester.widget<ListView>(scrollFinder);
        scrollController = listView.controller;

        // Record scroll position
        final scrollPosition = scrollController?.position.pixels ?? 0.0;

        // Add new content (simulating real-time updates)
        final testContent = SerenyaContent(
          id: 'new-test-content',
          fileName: 'New Test File',
          fileType: 'pdf',
          fileSize: 1000,
          uploadDate: DateTime.now(),
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
          processingStatus: ProcessingStatus.completed,
          contentType: ContentType.result,
          content: 'New test interpretation',
          confidenceScore: 0.85,
          title: 'New Test Document',
          userId: 'test-user',
          medicalFlags: const [],
        );
        
        await provider.addContent(testContent);
        await tester.pumpAndSettle();
        
        // Scroll position should be maintained reasonably (allowing for some variance)
        final newScrollPosition = scrollController?.position.pixels ?? 0.0;
        expect((newScrollPosition - scrollPosition).abs(), lessThan(100.0));
      });
    });
  });
}

/// Create comprehensive test data for integration testing
Future<void> _createIntegrationTestData(Database database) async {
  final batch = database.batch();
  final now = DateTime.now();
  
  // Create 100 test documents with mixed content types and realistic data
  for (int i = 0; i < 100; i++) {
    final content = SerenyaContent(
      id: 'integration-test-$i',
      fileName: 'Integration Test Document $i',
      fileType: ['pdf', 'jpg', 'png'][i % 3],
      fileSize: 1000 + i * 100,
      uploadDate: now.subtract(Duration(hours: i)),
      createdAt: now.subtract(Duration(hours: i)),
      updatedAt: now.subtract(Duration(hours: i)),
      processingStatus: ProcessingStatus.completed,
      contentType: i % 4 == 0 ? ContentType.report : ContentType.result,
      content: 'Integration test interpretation for document $i. This contains realistic length medical information to test display and performance.',
      confidenceScore: 0.75 + (i % 5) * 0.05,
      title: 'Integration Test Document $i',
      userId: 'test-user',
      medicalFlags: const [],
    );
    
    final dbData = await content.toDatabaseJson();
    batch.insert('serenya_content', dbData);
  }
  
  await batch.commit();
}

// Large dataset creation function available for future performance testing expansion

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