import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:serenya_app/widgets/timeline/timeline_container.dart';
import 'package:serenya_app/core/providers/health_data_provider.dart';
import 'package:serenya_app/models/local_database_models.dart';
import 'package:serenya_app/core/theme/healthcare_theme.dart';

import 'timeline_container_pagination_test.mocks.dart';

@GenerateMocks([HealthDataProvider])

Widget createTestWidget(Widget child) {
  return MaterialApp(
    theme: HealthcareTheme.lightTheme.copyWith(
      extensions: <ThemeExtension<dynamic>>[
        HealthcareThemeExtensions.confidenceTheme,
        HealthcareThemeExtensions.medicalSafetyTheme,
      ],
    ),
    home: Scaffold(body: child),
  );
}

void main() {
  group('TimelineContainer Pagination Tests', () {
    late MockHealthDataProvider mockProvider;
    
    setUp(() {
      mockProvider = MockHealthDataProvider();
    });

    testWidgets('should display loading state initially', (WidgetTester tester) async {
      when(mockProvider.content).thenReturn([]);
      when(mockProvider.isLoading).thenReturn(true);
      when(mockProvider.isLoadingMore).thenReturn(false);
      when(mockProvider.hasMoreData).thenReturn(true);
      when(mockProvider.error).thenReturn(null);

      await tester.pumpWidget(
        createTestWidget(
          TimelineContainer(
            provider: mockProvider,
            onDocumentTap: (document) {},
          ),
        ),
      );

      // Should show loading skeleton
      expect(find.byType(Card), findsNWidgets(3)); // 3 loading cards
      expect(find.byType(CircularProgressIndicator), findsNothing); // No main progress indicator
    });

    testWidgets('should display documents in timeline', (WidgetTester tester) async {
      final testContent = _generateTestContent(5);
      
      when(mockProvider.content).thenReturn(testContent);
      when(mockProvider.isLoading).thenReturn(false);
      when(mockProvider.isLoadingMore).thenReturn(false);
      when(mockProvider.hasMoreData).thenReturn(false);
      when(mockProvider.error).thenReturn(null);

      await tester.pumpWidget(
        createTestWidget(
          TimelineContainer(
            provider: mockProvider,
            onDocumentTap: (document) {},
          ),
        ),
      );

      await tester.pump();

      // Should show document cards
      expect(find.byType(Card), findsNWidgets(5));
      expect(find.text('Test File 0'), findsOneWidget);
      expect(find.text('Test File 4'), findsOneWidget);
    });

    testWidgets('should show loading more indicator when loading more content', (WidgetTester tester) async {
      final testContent = _generateTestContent(10);
      
      when(mockProvider.content).thenReturn(testContent);
      when(mockProvider.isLoading).thenReturn(false);
      when(mockProvider.isLoadingMore).thenReturn(true);
      when(mockProvider.hasMoreData).thenReturn(true);
      when(mockProvider.error).thenReturn(null);

      await tester.pumpWidget(
        createTestWidget(
          TimelineContainer(
              provider: mockProvider,
              onDocumentTap: (document) {},
          ),
        ),
      );

      await tester.pump();

      // Should show document cards plus loading more indicator
      expect(find.byType(Card), findsNWidgets(10)); // Document cards
      expect(find.text('Loading more...'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('should handle scroll events for infinite scroll', (WidgetTester tester) async {
      final testContent = _generateTestContent(20);
      
      when(mockProvider.content).thenReturn(testContent);
      when(mockProvider.isLoading).thenReturn(false);
      when(mockProvider.isLoadingMore).thenReturn(false);
      when(mockProvider.hasMoreData).thenReturn(true);
      when(mockProvider.error).thenReturn(null);
      when(mockProvider.loadMoreContent(contentType: anyNamed('contentType')))
          .thenAnswer((_) async {});
      when(mockProvider.applyPreloadedContent()).thenReturn(null);

      await tester.pumpWidget(
        createTestWidget(
          TimelineContainer(
              provider: mockProvider,
              onDocumentTap: (document) {},
          ),
        ),
      );

      await tester.pump();

      // Find the ListView and scroll to near bottom (95%)
      final listView = find.byType(ListView);
      await tester.fling(listView, const Offset(0, -3000), 1000);
      await tester.pumpAndSettle();

      // Should have triggered load more
      verify(mockProvider.applyPreloadedContent()).called(greaterThan(0));
      verify(mockProvider.loadMoreContent(contentType: null)).called(greaterThan(0));
    });

    testWidgets('should disable infinite scroll when enableInfiniteScroll is false', (WidgetTester tester) async {
      final testContent = _generateTestContent(20);
      
      when(mockProvider.content).thenReturn(testContent);
      when(mockProvider.isLoading).thenReturn(false);
      when(mockProvider.isLoadingMore).thenReturn(false);
      when(mockProvider.hasMoreData).thenReturn(true);
      when(mockProvider.error).thenReturn(null);

      await tester.pumpWidget(
        createTestWidget(
          TimelineContainer(
              provider: mockProvider,
              onDocumentTap: (document) {},
              enableInfiniteScroll: false,
          ),
        ),
      );

      await tester.pump();

      // Scroll to bottom
      final listView = find.byType(ListView);
      await tester.fling(listView, const Offset(0, -3000), 1000);
      await tester.pumpAndSettle();

      // Should not have triggered load more
      verifyNever(mockProvider.loadMoreContent(contentType: anyNamed('contentType')));
    });

    testWidgets('should handle pull to refresh', (WidgetTester tester) async {
      final testContent = _generateTestContent(5);
      
      when(mockProvider.content).thenReturn(testContent);
      when(mockProvider.isLoading).thenReturn(false);
      when(mockProvider.isLoadingMore).thenReturn(false);
      when(mockProvider.hasMoreData).thenReturn(false);
      when(mockProvider.error).thenReturn(null);
      when(mockProvider.loadContent()).thenAnswer((_) async {});

      await tester.pumpWidget(
        createTestWidget(
          TimelineContainer(
              provider: mockProvider,
              onDocumentTap: (document) {},
          ),
        ),
      );

      await tester.pump();

      // Find RefreshIndicator and trigger refresh
      await tester.fling(find.byType(ListView), const Offset(0, 300), 1000);
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(seconds: 1)); // Complete refresh animation

      verify(mockProvider.loadContent()).called(greaterThan(0));
    });

    testWidgets('should show error state and allow retry', (WidgetTester tester) async {
      when(mockProvider.content).thenReturn([]);
      when(mockProvider.isLoading).thenReturn(false);
      when(mockProvider.isLoadingMore).thenReturn(false);
      when(mockProvider.hasMoreData).thenReturn(true);
      when(mockProvider.error).thenReturn('Network connection failed');
      when(mockProvider.loadContent()).thenAnswer((_) async {});

      await tester.pumpWidget(
        createTestWidget(
          TimelineContainer(
              provider: mockProvider,
              onDocumentTap: (document) {},
          ),
        ),
      );

      await tester.pump();

      // Should show error state
      expect(find.text('Unable to load documents'), findsOneWidget);
      expect(find.text('Network connection failed'), findsOneWidget);
      expect(find.text('Try Again'), findsOneWidget);
      expect(find.byIcon(Icons.error_outline), findsOneWidget);

      // Tap retry button
      await tester.tap(find.text('Try Again'));
      await tester.pump();

      verify(mockProvider.loadContent()).called(greaterThan(0));
    });

    testWidgets('should show empty state when no documents', (WidgetTester tester) async {
      when(mockProvider.content).thenReturn([]);
      when(mockProvider.isLoading).thenReturn(false);
      when(mockProvider.isLoadingMore).thenReturn(false);
      when(mockProvider.hasMoreData).thenReturn(false);
      when(mockProvider.error).thenReturn(null);

      await tester.pumpWidget(
        createTestWidget(
          TimelineContainer(
              provider: mockProvider,
              onDocumentTap: (document) {},
          ),
        ),
      );

      await tester.pump();

      // Should show empty state
      expect(find.text('Your Health Journey Starts Here'), findsOneWidget);
    });

    testWidgets('should handle document tap events', (WidgetTester tester) async {
      final testContent = _generateTestContent(3);
      SerenyaContent? tappedDocument;
      
      when(mockProvider.content).thenReturn(testContent);
      when(mockProvider.isLoading).thenReturn(false);
      when(mockProvider.isLoadingMore).thenReturn(false);
      when(mockProvider.hasMoreData).thenReturn(false);
      when(mockProvider.error).thenReturn(null);

      await tester.pumpWidget(
        createTestWidget(
          TimelineContainer(
              provider: mockProvider,
              onDocumentTap: (document) {
                tappedDocument = document;
              },
          ),
        ),
      );

      await tester.pump();

      // Tap on first document
      await tester.tap(find.text('Test File 0'));
      await tester.pump();

      expect(tappedDocument, isNotNull);
      expect(tappedDocument?.id, equals('test-content-0'));
    });

    group('Performance optimizations', () {
      testWidgets('should use RepaintBoundary for document cards', (WidgetTester tester) async {
        final testContent = _generateTestContent(5);
        
        when(mockProvider.content).thenReturn(testContent);
        when(mockProvider.isLoading).thenReturn(false);
        when(mockProvider.isLoadingMore).thenReturn(false);
        when(mockProvider.hasMoreData).thenReturn(false);
        when(mockProvider.error).thenReturn(null);

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: TimelineContainer(
                provider: mockProvider,
                onDocumentTap: (document) {},
              ),
            ),
          ),
        );

        await tester.pump();

        // Should use RepaintBoundary for performance
        expect(find.byType(RepaintBoundary), findsNWidgets(5));
      });

      testWidgets('should have stable keys for document cards', (WidgetTester tester) async {
        final testContent = _generateTestContent(3);
        
        when(mockProvider.content).thenReturn(testContent);
        when(mockProvider.isLoading).thenReturn(false);
        when(mockProvider.isLoadingMore).thenReturn(false);
        when(mockProvider.hasMoreData).thenReturn(false);
        when(mockProvider.error).thenReturn(null);

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: TimelineContainer(
                provider: mockProvider,
                onDocumentTap: (document) {},
              ),
            ),
          ),
        );

        await tester.pump();

        // Find RepaintBoundary widgets and check they have ValueKey
        final repaintBoundaries = tester.widgetList<RepaintBoundary>(find.byType(RepaintBoundary));
        for (final boundary in repaintBoundaries) {
          expect(boundary.key, isA<ValueKey>());
        }
      });
    });

    group('Content type filtering', () {
      testWidgets('should pass content type filter to provider', (WidgetTester tester) async {
        final testContent = _generateTestContent(5, contentType: ContentType.result);
        
        when(mockProvider.content).thenReturn(testContent);
        when(mockProvider.isLoading).thenReturn(false);
        when(mockProvider.isLoadingMore).thenReturn(false);
        when(mockProvider.hasMoreData).thenReturn(true);
        when(mockProvider.error).thenReturn(null);
        when(mockProvider.loadContentByType(ContentType.result)).thenAnswer((_) async {});

        await tester.pumpWidget(
          MaterialApp(
            theme: HealthcareTheme.lightTheme.copyWith(
              extensions: <ThemeExtension<dynamic>>[
                HealthcareThemeExtensions.confidenceTheme,
                HealthcareThemeExtensions.medicalSafetyTheme,
              ],
            ),
            home: Scaffold(
              body: TimelineContainer(
                provider: mockProvider,
                onDocumentTap: (document) {},
                filterType: ContentType.result,
              ),
            ),
          ),
        );

        await tester.pump();

        // Should have called loadContentByType with the filter
        verify(mockProvider.loadContentByType(ContentType.result)).called(greaterThan(0));
      });
    });
  });
}

/// Helper function to generate test content
List<SerenyaContent> _generateTestContent(
  int count, {
  ContentType contentType = ContentType.result,
}) {
  final now = DateTime.now();
  return List.generate(count, (index) {
    return SerenyaContent(
      id: 'test-content-$index',
      fileName: 'Test File $index',
      fileType: 'pdf',
      fileSize: 1000,
      uploadDate: now.subtract(Duration(minutes: index)),
      createdAt: now.subtract(Duration(minutes: index)),
      updatedAt: now.subtract(Duration(minutes: index)),
      processingStatus: ProcessingStatus.completed,
      contentType: contentType,
      content: 'Test interpretation $index',
      confidenceScore: 0.85,
      title: 'Test Document $index',
      userId: 'test-user',
      medicalFlags: const [],
    );
  });
}