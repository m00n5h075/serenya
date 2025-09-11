import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

/// Timeline Performance Monitor
/// 
/// Monitors scroll performance, frame rates, and memory usage
/// for the Timeline widget to ensure 60 FPS smooth scrolling
class TimelinePerformanceMonitor {
  // Frame rate monitoring
  final List<Duration> _frameTimes = [];
  int _droppedFrames = 0;
  int _totalFrames = 0;
  
  // Memory monitoring
  int _peakMemoryUsage = 0;
  final List<int> _memorySnapshots = [];
  
  // Scroll performance
  final List<double> _scrollSpeeds = [];
  final List<Duration> _scrollResponseTimes = [];
  DateTime? _lastScrollEvent;
  
  // Performance targets
  static const Duration _targetFrameTime = Duration(microseconds: 16667); // 60 FPS
  static const int _maxMemoryMB = 100; // 100MB memory target
  static const double _maxScrollSpeed = 5000.0; // Max scroll pixels/second
  
  Timer? _monitoringTimer;
  bool _isMonitoring = false;
  
  /// Start performance monitoring
  void startMonitoring() {
    if (_isMonitoring) return;
    
    _isMonitoring = true;
    _clearMetrics();
    
    // Monitor frame rate
    SchedulerBinding.instance.addPostFrameCallback(_onFrameRendered);
    
    // Monitor memory usage every 5 seconds
    _monitoringTimer = Timer.periodic(Duration(seconds: 5), (_) {
      _recordMemorySnapshot();
    });
    
    debugPrint('Timeline performance monitoring started');
  }

  /// Stop performance monitoring
  void stopMonitoring() {
    if (!_isMonitoring) return;
    
    _isMonitoring = false;
    
    // Frame callback is automatically removed after execution
    _monitoringTimer?.cancel();
    
    debugPrint('Timeline performance monitoring stopped');
    _printPerformanceSummary();
  }

  /// Record scroll event for performance analysis
  void recordScrollEvent(double scrollPosition, double velocity) {
    final now = DateTime.now();
    
    if (_lastScrollEvent != null) {
      final responseTime = now.difference(_lastScrollEvent!);
      _scrollResponseTimes.add(responseTime);
      
      // Keep only last 100 measurements
      if (_scrollResponseTimes.length > 100) {
        _scrollResponseTimes.removeAt(0);
      }
    }
    
    _scrollSpeeds.add(velocity.abs());
    _lastScrollEvent = now;
    
    // Keep only last 100 measurements
    if (_scrollSpeeds.length > 100) {
      _scrollSpeeds.removeAt(0);
    }
  }

  /// Record frame rendering time
  void _onFrameRendered(Duration timestamp) {
    _totalFrames++;
    
    if (_frameTimes.isNotEmpty) {
      final frameTime = timestamp - _frameTimes.last;
      
      // Check for dropped frames (longer than 16.67ms for 60 FPS)
      if (frameTime > _targetFrameTime) {
        _droppedFrames++;
      }
    }
    
    _frameTimes.add(timestamp);
    
    // Keep only last 100 frame times
    if (_frameTimes.length > 100) {
      _frameTimes.removeAt(0);
    }
  }

  /// Record memory usage snapshot
  void _recordMemorySnapshot() async {
    try {
      // Get memory info from platform (Android/iOS specific)
      final memoryInfo = await _getMemoryInfo();
      _memorySnapshots.add(memoryInfo);
      
      if (memoryInfo > _peakMemoryUsage) {
        _peakMemoryUsage = memoryInfo;
      }
      
      // Keep only last 20 snapshots
      if (_memorySnapshots.length > 20) {
        _memorySnapshots.removeAt(0);
      }
      
      // Alert if memory usage is high
      if (memoryInfo > _maxMemoryMB) {
        debugPrint('WARNING: High memory usage detected: ${memoryInfo}MB');
      }
      
    } catch (e) {
      debugPrint('Error recording memory snapshot: $e');
    }
  }

  /// Get current memory usage (platform-specific implementation)
  Future<int> _getMemoryInfo() async {
    try {
      // For now, return a mock value since memory monitoring requires platform-specific code
      // In a real implementation, you would use:
      // - Android: ActivityManager.getMemoryInfo()
      // - iOS: mach_task_basic_info
      return 50; // Mock 50MB
    } catch (e) {
      return 0;
    }
  }

  /// Get current performance metrics
  PerformanceMetrics getMetrics() {
    return PerformanceMetrics(
      averageFrameRate: _calculateAverageFrameRate(),
      droppedFramePercentage: _totalFrames > 0 ? (_droppedFrames / _totalFrames) * 100 : 0,
      averageScrollSpeed: _scrollSpeeds.isEmpty 
          ? 0.0 
          : _scrollSpeeds.reduce((a, b) => a + b) / _scrollSpeeds.length,
      averageScrollResponseTime: _scrollResponseTimes.isEmpty 
          ? Duration.zero 
          : _scrollResponseTimes.reduce((a, b) => a + b) ~/ _scrollResponseTimes.length,
      currentMemoryUsage: _memorySnapshots.isNotEmpty ? _memorySnapshots.last : 0,
      peakMemoryUsage: _peakMemoryUsage,
      averageMemoryUsage: _memorySnapshots.isEmpty 
          ? 0 
          : _memorySnapshots.reduce((a, b) => a + b) ~/ _memorySnapshots.length,
      totalFrames: _totalFrames,
      droppedFrames: _droppedFrames,
      isPerformingWell: _isPerformingWell(),
    );
  }

  /// Calculate average frame rate
  double _calculateAverageFrameRate() {
    if (_frameTimes.length < 2) return 0.0;
    
    final totalTime = _frameTimes.last - _frameTimes.first;
    final frameCount = _frameTimes.length - 1;
    
    if (totalTime.inMicroseconds == 0) return 0.0;
    
    return (frameCount * 1000000) / totalTime.inMicroseconds;
  }

  /// Check if performance meets targets
  bool _isPerformingWell() {
    final avgFrameRate = _calculateAverageFrameRate();
    final droppedPercentage = _totalFrames > 0 ? (_droppedFrames / _totalFrames) * 100 : 0.0;
    final avgScrollTime = _scrollResponseTimes.isNotEmpty 
        ? _scrollResponseTimes.map((t) => t.inMicroseconds).reduce((a, b) => a + b) / _scrollResponseTimes.length / 1000
        : 0.0;
    
    return avgFrameRate >= 55 && // At least 55 FPS
           droppedPercentage <= 5 && // Less than 5% dropped frames
           _peakMemoryUsage <= _maxMemoryMB && // Within memory limit
           avgScrollTime <= 16; // Responsive scrolling
  }

  /// Print performance summary (without circular dependency)
  void _printPerformanceSummary() {
    final avgFrameRate = _calculateAverageFrameRate();
    final droppedPercentage = _totalFrames > 0 ? (_droppedFrames / _totalFrames) * 100 : 0.0;
    final avgScrollSpeed = _scrollSpeeds.isEmpty 
        ? 0.0 
        : _scrollSpeeds.reduce((a, b) => a + b) / _scrollSpeeds.length;
    final avgScrollTime = _scrollResponseTimes.isEmpty 
        ? Duration.zero 
        : _scrollResponseTimes.reduce((a, b) => a + b) ~/ _scrollResponseTimes.length;
    final currentMemory = _memorySnapshots.isNotEmpty ? _memorySnapshots.last : 0;
    final isPerformingWell = avgFrameRate >= 55 && droppedPercentage <= 5 && _peakMemoryUsage <= _maxMemoryMB && avgScrollTime.inMilliseconds <= 16;
    
    debugPrint('=== Timeline Performance Summary ===');
    debugPrint('Frame Rate: ${avgFrameRate.toStringAsFixed(1)} FPS');
    debugPrint('Dropped Frames: ${droppedPercentage.toStringAsFixed(1)}%');
    debugPrint('Scroll Speed: ${avgScrollSpeed.toStringAsFixed(1)} px/s');
    debugPrint('Scroll Response: ${avgScrollTime.inMilliseconds}ms');
    debugPrint('Memory Usage: ${currentMemory}MB (Peak: ${_peakMemoryUsage}MB)');
    debugPrint('Performance Status: ${isPerformingWell ? "GOOD" : "NEEDS OPTIMIZATION"}');
    debugPrint('=====================================');
  }

  /// Clear all metrics
  void _clearMetrics() {
    _frameTimes.clear();
    _memorySnapshots.clear();
    _scrollSpeeds.clear();
    _scrollResponseTimes.clear();
    _droppedFrames = 0;
    _totalFrames = 0;
    _peakMemoryUsage = 0;
    _lastScrollEvent = null;
  }

  /// Export metrics as JSON for analysis (without circular dependency)
  Map<String, dynamic> exportMetrics() {
    final avgFrameRate = _calculateAverageFrameRate();
    final droppedPercentage = _totalFrames > 0 ? (_droppedFrames / _totalFrames) * 100 : 0.0;
    final avgScrollSpeed = _scrollSpeeds.isEmpty 
        ? 0.0 
        : _scrollSpeeds.reduce((a, b) => a + b) / _scrollSpeeds.length;
    final avgScrollTime = _scrollResponseTimes.isEmpty 
        ? Duration.zero 
        : _scrollResponseTimes.reduce((a, b) => a + b) ~/ _scrollResponseTimes.length;
    final currentMemory = _memorySnapshots.isNotEmpty ? _memorySnapshots.last : 0;
    final avgMemory = _memorySnapshots.isEmpty 
        ? 0 
        : _memorySnapshots.reduce((a, b) => a + b) ~/ _memorySnapshots.length;
    final isPerformingWell = avgFrameRate >= 55 && droppedPercentage <= 5 && _peakMemoryUsage <= _maxMemoryMB && avgScrollTime.inMilliseconds <= 16;
    
    return {
      'timestamp': DateTime.now().toIso8601String(),
      'frameRate': avgFrameRate,
      'droppedFramePercentage': droppedPercentage,
      'scrollSpeed': avgScrollSpeed,
      'scrollResponseTime': avgScrollTime.inMilliseconds,
      'memoryUsage': currentMemory,
      'peakMemoryUsage': _peakMemoryUsage,
      'isPerformingWell': isPerformingWell,
      'totalFrames': _totalFrames,
      'droppedFrames': _droppedFrames,
    };
  }

  /// Dispose resources
  void dispose() {
    stopMonitoring();
  }
}

/// Performance metrics data class
class PerformanceMetrics {
  final double averageFrameRate;
  final double droppedFramePercentage;
  final double averageScrollSpeed;
  final Duration averageScrollResponseTime;
  final int currentMemoryUsage;
  final int peakMemoryUsage;
  final int averageMemoryUsage;
  final int totalFrames;
  final int droppedFrames;
  final bool isPerformingWell;

  PerformanceMetrics({
    required this.averageFrameRate,
    required this.droppedFramePercentage,
    required this.averageScrollSpeed,
    required this.averageScrollResponseTime,
    required this.currentMemoryUsage,
    required this.peakMemoryUsage,
    required this.averageMemoryUsage,
    required this.totalFrames,
    required this.droppedFrames,
    required this.isPerformingWell,
  });

  @override
  String toString() {
    return 'PerformanceMetrics('
        'fps: ${averageFrameRate.toStringAsFixed(1)}, '
        'droppedFrames: ${droppedFramePercentage.toStringAsFixed(1)}%, '
        'scrollSpeed: ${averageScrollSpeed.toStringAsFixed(1)}px/s, '
        'responseTime: ${averageScrollResponseTime.inMilliseconds}ms, '
        'memory: ${currentMemoryUsage}MB, '
        'status: ${isPerformingWell ? "GOOD" : "POOR"}'
        ')';
  }
}