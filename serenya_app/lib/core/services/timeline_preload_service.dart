import 'dart:async';
import 'package:flutter/material.dart';
import '../../models/local_database_models.dart';
import '../providers/health_data_provider.dart';

/// Timeline Preloading Service
/// 
/// Handles intelligent preloading for timeline content with performance monitoring
/// and adaptive strategies based on device capabilities and network conditions
class TimelinePreloadService {
  final HealthDataProvider _provider;
  
  // Performance monitoring
  final List<Duration> _preloadTimes = [];
  final List<int> _preloadSizes = [];
  int _totalPreloadRequests = 0;
  int _successfulPreloadRequests = 0;
  
  // Adaptive thresholds
  double _currentPreloadThreshold = 0.8; // Default 80%
  int _adaptivePageSize = 20;
  
  // Debouncing
  Timer? _preloadTimer;
  bool _isPreloading = false;
  
  TimelinePreloadService(this._provider);

  /// Get current performance metrics
  PreloadMetrics get metrics => PreloadMetrics(
    averagePreloadTime: _preloadTimes.isEmpty 
        ? Duration.zero 
        : _preloadTimes.reduce((a, b) => a + b) ~/ _preloadTimes.length,
    averagePreloadSize: _preloadSizes.isEmpty 
        ? 0 
        : _preloadSizes.reduce((a, b) => a + b) ~/ _preloadSizes.length,
    successRate: _totalPreloadRequests == 0 
        ? 0.0 
        : _successfulPreloadRequests / _totalPreloadRequests,
    totalPreloadRequests: _totalPreloadRequests,
    currentThreshold: _currentPreloadThreshold,
    adaptivePageSize: _adaptivePageSize,
  );

  /// Intelligent preload with adaptive strategy
  Future<void> preloadContent({
    ContentType? contentType,
    ScrollMetrics? scrollMetrics,
    bool forcePreload = false,
  }) async {
    if (_isPreloading && !forcePreload) return;
    
    // Cancel any pending preload
    _preloadTimer?.cancel();
    
    _preloadTimer = Timer(const Duration(milliseconds: 300), () async {
      await _executePreload(contentType, scrollMetrics);
    });
  }

  /// Execute the actual preload operation
  Future<void> _executePreload(ContentType? contentType, ScrollMetrics? scrollMetrics) async {
    if (!_provider.hasMoreData || _isPreloading) return;
    
    _isPreloading = true;
    final stopwatch = Stopwatch()..start();
    
    try {
      final startingContentCount = _provider.content.length;
      
      // Adaptive page size based on performance
      _adjustPageSizeBasedOnPerformance();
      
      // Set adaptive page size
      _provider.setPageSize(_adaptivePageSize);
      
      // Preload next batch
      await _provider.preloadNextBatch(contentType: contentType);
      
      // Track metrics
      stopwatch.stop();
      final preloadTime = stopwatch.elapsed;
      final contentLoaded = _provider.content.length - startingContentCount;
      
      _recordPreloadMetrics(preloadTime, contentLoaded, true);
      _successfulPreloadRequests++;
      
      // Adjust threshold based on performance
      _adjustThresholdBasedOnPerformance(preloadTime);
      
      debugPrint('Preload completed: $contentLoaded items in ${preloadTime.inMilliseconds}ms');
      
    } catch (e) {
      stopwatch.stop();
      _recordPreloadMetrics(stopwatch.elapsed, 0, false);
      debugPrint('Preload failed: $e');
    } finally {
      _totalPreloadRequests++;
      _isPreloading = false;
    }
  }

  /// Record preload performance metrics
  void _recordPreloadMetrics(Duration duration, int itemsLoaded, bool success) {
    _preloadTimes.add(duration);
    _preloadSizes.add(itemsLoaded);
    
    // Keep only last 20 measurements
    if (_preloadTimes.length > 20) {
      _preloadTimes.removeAt(0);
      _preloadSizes.removeAt(0);
    }
  }

  /// Adjust preload threshold based on performance
  void _adjustThresholdBasedOnPerformance(Duration preloadTime) {
    if (preloadTime.inMilliseconds > 2000) {
      // If preload is slow, start earlier
      _currentPreloadThreshold = (_currentPreloadThreshold - 0.05).clamp(0.7, 0.9);
    } else if (preloadTime.inMilliseconds < 500) {
      // If preload is fast, can start later
      _currentPreloadThreshold = (_currentPreloadThreshold + 0.05).clamp(0.7, 0.9);
    }
  }

  /// Adjust page size based on performance
  void _adjustPageSizeBasedOnPerformance() {
    if (_preloadTimes.isEmpty) return;
    
    final averageTime = _preloadTimes.reduce((a, b) => a + b) ~/ _preloadTimes.length;
    
    if (averageTime.inMilliseconds > 1500) {
      // If loading is slow, reduce page size
      _adaptivePageSize = (_adaptivePageSize - 5).clamp(10, 50);
    } else if (averageTime.inMilliseconds < 500) {
      // If loading is fast, can increase page size
      _adaptivePageSize = (_adaptivePageSize + 5).clamp(10, 50);
    }
  }

  /// Get recommended preload threshold based on current performance
  double get recommendedThreshold => _currentPreloadThreshold;

  /// Check if should trigger preload based on scroll position
  bool shouldPreload(ScrollMetrics scrollMetrics) {
    if (!_provider.hasMoreData || _isPreloading) return false;
    
    final scrollPercentage = scrollMetrics.maxScrollExtent > 0 
        ? scrollMetrics.pixels / scrollMetrics.maxScrollExtent 
        : 0.0;
    
    return scrollPercentage >= _currentPreloadThreshold;
  }

  /// Clear all cached metrics (useful for testing)
  void clearMetrics() {
    _preloadTimes.clear();
    _preloadSizes.clear();
    _totalPreloadRequests = 0;
    _successfulPreloadRequests = 0;
    _currentPreloadThreshold = 0.8;
    _adaptivePageSize = 20;
  }

  /// Dispose resources
  void dispose() {
    _preloadTimer?.cancel();
  }
}

/// Preload performance metrics
class PreloadMetrics {
  final Duration averagePreloadTime;
  final int averagePreloadSize;
  final double successRate;
  final int totalPreloadRequests;
  final double currentThreshold;
  final int adaptivePageSize;

  PreloadMetrics({
    required this.averagePreloadTime,
    required this.averagePreloadSize,
    required this.successRate,
    required this.totalPreloadRequests,
    required this.currentThreshold,
    required this.adaptivePageSize,
  });

  @override
  String toString() {
    return 'PreloadMetrics('
        'avgTime: ${averagePreloadTime.inMilliseconds}ms, '
        'avgSize: $averagePreloadSize, '
        'successRate: ${(successRate * 100).toStringAsFixed(1)}%, '
        'totalRequests: $totalPreloadRequests, '
        'threshold: ${(currentThreshold * 100).toStringAsFixed(0)}%, '
        'pageSize: $adaptivePageSize'
        ')';
  }
}