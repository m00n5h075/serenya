import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../../models/local_database_models.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers/health_data_provider.dart';
import '../../core/services/timeline_preload_service.dart';
import '../../core/utils/timeline_performance_monitor.dart';
import 'timeline_card.dart';
import 'timeline_empty_state.dart';

/// Timeline Container Component
/// 
/// Enhanced container for displaying medical documents with infinite scroll
/// Handles loading states, errors, empty states, pull-to-refresh, and pagination
/// Optimized for performance with large document collections
class TimelineContainer extends StatefulWidget {
  final HealthDataProvider provider;
  final Function(SerenyaContent) onDocumentTap;
  final ContentType? filterType;
  final bool enableInfiniteScroll;
  final bool enablePreloading;
  final double preloadThreshold; // 0.0 to 1.0 (80% = 0.8)

  const TimelineContainer({
    super.key,
    required this.provider,
    required this.onDocumentTap,
    this.filterType,
    this.enableInfiniteScroll = true,
    this.enablePreloading = true,
    this.preloadThreshold = 0.8,
  });

  @override
  State<TimelineContainer> createState() => _TimelineContainerState();
}

class _TimelineContainerState extends State<TimelineContainer> {
  late final ScrollController _scrollController;
  late final TimelinePreloadService _preloadService;
  late final TimelinePerformanceMonitor _performanceMonitor;
  // Preload tracking managed by TimelinePreloadService

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
    _scrollController.addListener(_onScroll);
    
    // Initialize services
    _preloadService = TimelinePreloadService(widget.provider);
    _performanceMonitor = TimelinePerformanceMonitor();
    
    // Start performance monitoring in debug mode
    if (kDebugMode) {
      _performanceMonitor.startMonitoring();
    }
    
    // Load initial content if not already loaded
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (widget.provider.content.isEmpty && !widget.provider.isLoading) {
        _loadInitialContent();
      }
    });
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    _preloadService.dispose();
    _performanceMonitor.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.provider,
      builder: (context, child) {
        final documents = widget.provider.content;
        final isLoading = widget.provider.isLoading;
        final isLoadingMore = widget.provider.isLoadingMore;
        final error = widget.provider.error;
        
        // For any errors or issues, show the welcoming empty state instead of anxiety-inducing error messages
        // This prioritizes user emotional experience over technical error reporting
        if (error != null || (documents.isEmpty && !isLoading)) {
          return _buildEmptyState();
        }

        // Loading state (first load)
        if (isLoading && documents.isEmpty) {
          return _buildLoadingState();
        }

        // Timeline list with documents and infinite scroll
        return _buildTimelineList(documents, isLoadingMore);
      },
    );
  }

  /// Load initial content based on filter type
  Future<void> _loadInitialContent() async {
    if (widget.filterType != null) {
      await widget.provider.loadContentByType(widget.filterType!);
    } else {
      await widget.provider.loadContent();
    }
  }

  /// Handle scroll events for infinite scroll and preloading
  void _onScroll() {
    if (!widget.enableInfiniteScroll) return;
    
    final scrollPosition = _scrollController.position;
    final scrollMetrics = scrollPosition;
    
    // Record performance metrics
    if (kDebugMode) {
      // Record scroll performance metrics
      _performanceMonitor.recordScrollEvent(
        scrollPosition.pixels, 
        0.0, // Velocity tracking simplified for production stability
      );
    }
    
    // Use intelligent preloading service
    if (widget.enablePreloading && _preloadService.shouldPreload(scrollMetrics)) {
      _preloadService.preloadContent(
        contentType: widget.filterType,
        scrollMetrics: scrollMetrics,
      );
    }
    
    // Calculate scroll percentage for loading more content
    final scrollPercentage = scrollPosition.maxScrollExtent > 0 
        ? scrollPosition.pixels / scrollPosition.maxScrollExtent
        : 0.0;
    
    // Load more content when reaching 95% (near bottom)
    if (scrollPercentage >= 0.95 && 
        widget.provider.hasMoreData && 
        !widget.provider.isLoadingMore) {
      _loadMoreContent();
    }
  }


  /// Load more content when user scrolls near bottom
  Future<void> _loadMoreContent() async {
    // Apply any preloaded content first
    widget.provider.applyPreloadedContent();
    
    // Then load more if needed
    await widget.provider.loadMoreContent(contentType: widget.filterType);
  }


  /// Build empty state with refresh capability
  Widget _buildEmptyState() {
    return RefreshIndicator(
      onRefresh: _loadInitialContent,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: SizedBox(
          height: MediaQuery.of(context).size.height - 200,
          child: const TimelineEmptyState(),
        ),
      ),
    );
  }

  /// Build loading state with skeleton cards
  Widget _buildLoadingState() {
    return Container(
      color: const Color(0xFFF8F9FA),
      child: ListView.builder(
        padding: const EdgeInsets.only(
          top: 72,
          left: AppConstants.defaultPadding,
          right: AppConstants.defaultPadding,
          bottom: 100,
        ),
        itemCount: 3, // Show 3 loading cards
        itemBuilder: (context, index) {
          return Padding(
            padding: const EdgeInsets.only(bottom: AppConstants.smallPadding),
            child: _buildLoadingCard(),
          );
        },
      ),
    );
  }

  /// Build optimized timeline list with infinite scroll
  Widget _buildTimelineList(List<SerenyaContent> documents, bool isLoadingMore) {
    return RefreshIndicator(
      onRefresh: _loadInitialContent,
      child: Container(
        color: const Color(0xFFF8F9FA), // Timeline background from UI specs
        child: ListView.builder(
          controller: _scrollController,
          padding: const EdgeInsets.only(
            top: 72, // Top padding from UI specs
            left: AppConstants.defaultPadding,
            right: AppConstants.defaultPadding,
            bottom: 100, // Extra space for FAB
          ),
          // Add extra item for loading indicator if loading more
          itemCount: documents.length + (isLoadingMore ? 1 : 0),
          itemBuilder: (context, index) {
            // Show loading indicator at bottom when loading more
            if (index >= documents.length) {
              return _buildLoadMoreIndicator();
            }

            final document = documents[index];
            return Padding(
              padding: const EdgeInsets.only(bottom: AppConstants.smallPadding),
              child: _buildOptimizedDocumentCard(document, index),
            );
          },
          // Performance optimizations
          cacheExtent: 1000, // Cache more items for smooth scrolling
          addAutomaticKeepAlives: false, // Don't keep all items alive
          addRepaintBoundaries: true, // Optimize repainting
        ),
      ),
    );
  }

  /// Build optimized document card with performance considerations
  Widget _buildOptimizedDocumentCard(SerenyaContent document, int index) {
    return RepaintBoundary(
      key: ValueKey(document.id), // Use stable key for efficient updates
      child: DocumentCard(
        document: document,
        onTap: () => widget.onDocumentTap(document),
        showConfidence: true,
      ),
    );
  }

  /// Build loading indicator for infinite scroll
  Widget _buildLoadMoreIndicator() {
    return Container(
      padding: const EdgeInsets.all(AppConstants.defaultPadding),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.blue[600]!),
              ),
            ),
            const SizedBox(height: AppConstants.smallPadding),
            Text(
              'Loading more...',
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[600],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLoadingCard() {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppConstants.borderRadius),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.defaultPadding),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(width: AppConstants.smallPadding),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: double.infinity,
                        height: 16,
                        decoration: BoxDecoration(
                          color: Colors.grey[300],
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Container(
                        width: 100,
                        height: 12,
                        decoration: BoxDecoration(
                          color: Colors.grey[300],
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  width: 60,
                  height: 24,
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppConstants.smallPadding),
            Row(
              children: [
                Container(
                  width: 80,
                  height: 12,
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const Spacer(),
                Container(
                  width: 40,
                  height: 16,
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}