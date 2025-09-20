import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/widgets.dart';
import '../core/database/processing_job_repository.dart';
import '../core/providers/health_data_provider.dart';
import '../services/processing_service.dart';

/// Unified Polling Service for Phase P1
/// 
/// Single service that replaces all timer-based polling with database-driven polling.
/// Features:
/// - Singleton pattern for centralized management
/// - Database-driven job polling with exponential backoff
/// - App lifecycle integration for background/foreground handling
/// - Job resumption capability across app restarts
/// - Intelligent polling scheduling
/// - Integration with NotificationService for completion alerts
/// - Callback management for job completion/failure notifications
class UnifiedPollingService with WidgetsBindingObserver {
  static UnifiedPollingService? _instance;
  static const String _logPrefix = 'UNIFIED_POLLING_SERVICE';
  
  // Core services
  final ProcessingService _processingService = ProcessingService();
  
  // Callback management for job completion/failure notifications
  final Map<String, Function(String, dynamic)> _completionCallbacks = {};
  final Map<String, Function(String, String)> _failureCallbacks = {};
  
  // Polling state
  Timer? _pollingTimer;
  bool _isPolling = false;
  bool _isAppInBackground = false;
  HealthDataProvider? _healthDataProvider;
  
  // Polling configuration
  static const Duration _foregroundPollInterval = Duration(seconds: 10);
  static const Duration _backgroundPollInterval = Duration(seconds: 30);
  static const Duration _jobCleanupInterval = Duration(hours: 1);
  
  // Job resumption tracking
  Timer? _cleanupTimer;
  DateTime? _lastBackgroundTime;
  
  /// Private constructor for singleton pattern
  UnifiedPollingService._internal();
  
  /// Singleton instance getter
  factory UnifiedPollingService() {
    _instance ??= UnifiedPollingService._internal();
    return _instance!;
  }
  
  /// Initialize the polling service
  /// 
  /// Must be called from main.dart during app initialization
  /// Sets up app lifecycle integration and starts polling
  Future<void> initialize(HealthDataProvider healthDataProvider) async {
    try {
      _healthDataProvider = healthDataProvider;
      
      // Register for app lifecycle callbacks
      WidgetsBinding.instance.addObserver(this);
      
      // Resume any jobs that were processing when app was last closed
      await _resumeProcessingJobs();
      
      // Start polling for active jobs
      await _startPolling();
      
      // Start cleanup timer
      _startCleanupTimer();
      
      _log('Service initialized successfully');
    } catch (e) {
      _log('Failed to initialize service: $e', isError: true);
      rethrow;
    }
  }
  
  /// Register callbacks for job completion and failure notifications
  /// 
  /// Called by ChatProvider and other consumers to register for job status updates
  void registerJobCallbacks(
    String jobId, {
    Function(String jobId, dynamic result)? onCompletion,
    Function(String jobId, String error)? onFailure,
  }) {
    if (onCompletion != null) {
      _completionCallbacks[jobId] = onCompletion;
      _log('Registered completion callback for job: $jobId');
    }
    
    if (onFailure != null) {
      _failureCallbacks[jobId] = onFailure;
      _log('Registered failure callback for job: $jobId');
    }
  }

  /// Unregister callbacks for a specific job
  void unregisterJobCallbacks(String jobId) {
    final hadCompletion = _completionCallbacks.remove(jobId) != null;
    final hadFailure = _failureCallbacks.remove(jobId) != null;
    
    if (hadCompletion || hadFailure) {
      _log('Unregistered callbacks for job: $jobId');
    }
  }

  /// Start a new processing job
  /// 
  /// Called from UploadService to begin monitoring a new job
  Future<void> startMonitoringJob(String jobId) async {
    try {
      _log('Started monitoring job: $jobId');
      
      // Ensure polling is active
      if (!_isPolling) {
        await _startPolling();
      }
      
      // Log job start for debugging
      final job = await ProcessingJobRepository.getJob(jobId);
      if (job != null) {
        _log('Job details - Type: ${job.jobType.value}, Status: ${job.status.value}');
      }
      
    } catch (e) {
      _log('Failed to start monitoring job $jobId: $e', isError: true);
    }
  }
  
  /// Stop monitoring a specific job
  /// 
  /// Called when job completes or fails
  Future<void> stopMonitoringJob(String jobId) async {
    try {
      _log('Stopped monitoring job: $jobId');
      
      // Check if there are any remaining active jobs
      final activeJobs = await ProcessingJobRepository.getActiveJobs();
      if (activeJobs.isEmpty) {
        _log('No active jobs remaining, stopping polling');
        await _stopPolling();
      }
      
    } catch (e) {
      _log('Failed to stop monitoring job $jobId: $e', isError: true);
    }
  }
  
  /// Get current polling status
  /// 
  /// Used by UI to show polling state
  bool get isPolling => _isPolling;
  
  /// Get count of active jobs being monitored
  Future<int> getActiveJobCount() async {
    try {
      final jobs = await ProcessingJobRepository.getActiveJobs();
      return jobs.length;
    } catch (e) {
      _log('Failed to get active job count: $e', isError: true);
      return 0;
    }
  }
  
  /// App lifecycle callback - App resumed from background
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    
    switch (state) {
      case AppLifecycleState.resumed:
        _handleAppResumed();
        break;
      case AppLifecycleState.paused:
        _handleAppPaused();
        break;
      case AppLifecycleState.detached:
        _handleAppDetached();
        break;
      default:
        break;
    }
  }
  
  /// Handle app resuming from background
  Future<void> _handleAppResumed() async {
    try {
      _isAppInBackground = false;
      _log('App resumed - switching to foreground polling');
      
      // Resume jobs that might have completed while in background
      await _resumeProcessingJobs();
      
      // Switch to more frequent foreground polling
      if (_isPolling) {
        await _restartPollingWithInterval(_foregroundPollInterval);
      }
      
      _lastBackgroundTime = null;
      
    } catch (e) {
      _log('Error handling app resume: $e', isError: true);
    }
  }
  
  /// Handle app going to background
  Future<void> _handleAppPaused() async {
    try {
      _isAppInBackground = true;
      _lastBackgroundTime = DateTime.now();
      _log('App paused - switching to background polling');
      
      // Switch to less frequent background polling to save battery
      if (_isPolling) {
        await _restartPollingWithInterval(_backgroundPollInterval);
      }
      
    } catch (e) {
      _log('Error handling app pause: $e', isError: true);
    }
  }
  
  /// Handle app being detached/terminated
  Future<void> _handleAppDetached() async {
    try {
      _log('App detached - stopping polling service');
      await dispose();
    } catch (e) {
      _log('Error handling app detach: $e', isError: true);
    }
  }
  
  /// Resume processing jobs on app startup
  /// 
  /// Finds jobs that were processing when app was closed and resumes monitoring
  Future<void> _resumeProcessingJobs() async {
    try {
      if (_healthDataProvider == null) {
        _log('Health data provider not available for job resumption');
        return;
      }
      
      final activeJobs = await ProcessingJobRepository.getActiveJobs();
      _log('Found ${activeJobs.length} jobs to resume');
      
      if (activeJobs.isNotEmpty) {
        // Check each job's current status
        int resumedCount = 0;
        int completedCount = 0;
        
        for (final job in activeJobs) {
          try {
            // Poll the job status immediately
            final pollResult = await _processingService.pollJobStatus(
              job.jobId,
              dataProvider: _healthDataProvider!,
            );
            
            if (pollResult.success) {
              if (!pollResult.shouldContinuePolling) {
                // Job completed while app was closed
                completedCount++;
                _log('Job ${job.jobId} completed while app was closed');
              } else {
                resumedCount++;
              }
            } else {
              _log('Failed to poll resumed job ${job.jobId}: ${pollResult.errorMessage}');
            }
          } catch (e) {
            _log('Error polling resumed job ${job.jobId}: $e', isError: true);
          }
        }
        
        _log('Resumed $resumedCount jobs, $completedCount completed during downtime');
        
        // Start polling if we have active jobs
        if (resumedCount > 0) {
          await _startPolling();
        }
      }
      
    } catch (e) {
      _log('Failed to resume processing jobs: $e', isError: true);
    }
  }
  
  /// Start the polling timer
  Future<void> _startPolling() async {
    if (_isPolling) {
      _log('Polling already active');
      return;
    }
    
    try {
      _isPolling = true;
      final interval = _isAppInBackground ? _backgroundPollInterval : _foregroundPollInterval;
      
      _pollingTimer = Timer.periodic(interval, (timer) {
        _performPollingCycle();
      });
      
      // Perform initial polling immediately
      _performPollingCycle();
      
      _log('Polling started with ${interval.inSeconds}s interval');
    } catch (e) {
      _isPolling = false;
      _log('Failed to start polling: $e', isError: true);
      rethrow;
    }
  }
  
  /// Stop the polling timer
  Future<void> _stopPolling() async {
    if (!_isPolling) {
      return;
    }
    
    try {
      _pollingTimer?.cancel();
      _pollingTimer = null;
      _isPolling = false;
      
      _log('Polling stopped');
    } catch (e) {
      _log('Error stopping polling: $e', isError: true);
    }
  }
  
  /// Restart polling with a new interval
  Future<void> _restartPollingWithInterval(Duration interval) async {
    await _stopPolling();
    await _startPolling();
  }
  
  /// Perform a single polling cycle
  /// 
  /// Checks all jobs that are ready for polling and processes them
  Future<void> _performPollingCycle() async {
    if (_healthDataProvider == null) {
      _log('Health data provider not available during polling cycle');
      return;
    }
    
    try {
      // Get jobs ready for polling
      final jobsToCheck = await ProcessingJobRepository.getJobsReadyForPolling();
      
      if (jobsToCheck.isEmpty) {
        _log('No jobs ready for polling');
        return;
      }
      
      _log('Polling ${jobsToCheck.length} jobs');
      
      int completedJobs = 0;
      int continuingJobs = 0;
      int failedJobs = 0;
      
      // Process each job
      for (final job in jobsToCheck) {
        try {
          final pollResult = await _processingService.pollJobStatus(
            job.jobId,
            dataProvider: _healthDataProvider!,
          );
          
          if (pollResult.success) {
            if (pollResult.shouldContinuePolling) {
              continuingJobs++;
            } else {
              completedJobs++;
              _log('Job ${job.jobId} completed');
              
              // Invoke completion callback if registered
              final completionCallback = _completionCallbacks[job.jobId];
              if (completionCallback != null) {
                try {
                  // Create a result object with available data
                  final callbackResult = {
                    'jobId': job.jobId,
                    'message': pollResult.message,
                    'resultContentId': pollResult.resultContentId,
                    'completedAt': DateTime.now(),
                  };
                  await completionCallback(job.jobId, callbackResult);
                  _log('Successfully invoked completion callback for job: ${job.jobId}');
                } catch (callbackError) {
                  _log('Error invoking completion callback for job ${job.jobId}: $callbackError', isError: true);
                }
                // Clean up callback after successful completion
                unregisterJobCallbacks(job.jobId);
              }
            }
          } else {
            failedJobs++;
            _log('Job ${job.jobId} failed: ${pollResult.errorMessage}');
            
            // Invoke failure callback if registered
            final failureCallback = _failureCallbacks[job.jobId];
            if (failureCallback != null) {
              try {
                await failureCallback(job.jobId, pollResult.errorMessage ?? 'Unknown error');
                _log('Successfully invoked failure callback for job: ${job.jobId}');
              } catch (callbackError) {
                _log('Error invoking failure callback for job ${job.jobId}: $callbackError', isError: true);
              }
              // Clean up callback after failure
              unregisterJobCallbacks(job.jobId);
            }
          }
          
        } catch (e) {
          failedJobs++;
          _log('Error polling job ${job.jobId}: $e', isError: true);
          
          // Invoke failure callback for unexpected errors
          final failureCallback = _failureCallbacks[job.jobId];
          if (failureCallback != null) {
            try {
              await failureCallback(job.jobId, e.toString());
              _log('Successfully invoked failure callback for polling error: ${job.jobId}');
            } catch (callbackError) {
              _log('Error invoking failure callback for polling error ${job.jobId}: $callbackError', isError: true);
            }
            // Clean up callback after failure
            unregisterJobCallbacks(job.jobId);
          }
        }
        
        // Brief delay between job polls to avoid overwhelming the server
        await Future.delayed(const Duration(milliseconds: 100));
      }
      
      _log('Poll cycle complete: $completedJobs completed, $continuingJobs continuing, $failedJobs failed');
      
      // If no jobs are continuing, stop polling
      if (continuingJobs == 0) {
        final allActiveJobs = await ProcessingJobRepository.getActiveJobs();
        if (allActiveJobs.isEmpty) {
          _log('No active jobs remaining after polling cycle');
          await _stopPolling();
        }
      }
      
    } catch (e) {
      _log('Error during polling cycle: $e', isError: true);
    }
  }
  
  /// Start cleanup timer for old jobs
  void _startCleanupTimer() {
    _cleanupTimer = Timer.periodic(_jobCleanupInterval, (timer) {
      _performCleanup();
    });
    
    _log('Cleanup timer started with ${_jobCleanupInterval.inHours}h interval');
  }
  
  /// Perform cleanup of old jobs
  Future<void> _performCleanup() async {
    try {
      final deletedCount = await ProcessingJobRepository.cleanupOldJobs();
      if (deletedCount > 0) {
        _log('Cleaned up $deletedCount old jobs');
      }
      
      // Also cleanup old processing service resources
      await _processingService.cleanupOldJobs();
      
    } catch (e) {
      _log('Error during cleanup: $e', isError: true);
    }
  }
  
  /// Force immediate polling of all active jobs
  /// 
  /// Used by UI refresh or manual sync
  Future<void> forcePollAllJobs() async {
    try {
      _log('Force polling all active jobs');
      await _performPollingCycle();
    } catch (e) {
      _log('Failed to force poll jobs: $e', isError: true);
    }
  }
  
  /// Get detailed status of polling service
  /// 
  /// Used for debugging and monitoring
  Future<Map<String, dynamic>> getServiceStatus() async {
    try {
      final stats = await ProcessingJobRepository.getStatistics();
      final activeJobs = await ProcessingJobRepository.getActiveJobs();
      
      return {
        'isPolling': _isPolling,
        'isAppInBackground': _isAppInBackground,
        'activeJobCount': activeJobs.length,
        'lastBackgroundTime': _lastBackgroundTime?.toIso8601String(),
        'currentInterval': (_isAppInBackground ? _backgroundPollInterval : _foregroundPollInterval).inSeconds,
        'jobStatistics': stats,
        'nextScheduledJobs': activeJobs.take(5).map((job) => {
          'jobId': job.jobId,
          'nextPollAt': job.nextPollAt?.toIso8601String(),
          'retryCount': job.retryCount,
          'type': job.jobType.value,
        }).toList(),
      };
    } catch (e) {
      _log('Failed to get service status: $e', isError: true);
      return {
        'error': e.toString(),
        'isPolling': _isPolling,
      };
    }
  }
  
  /// Clean shutdown of the service
  Future<void> dispose() async {
    try {
      // Remove app lifecycle observer
      WidgetsBinding.instance.removeObserver(this);
      
      // Stop polling
      await _stopPolling();
      
      // Stop cleanup timer
      _cleanupTimer?.cancel();
      _cleanupTimer = null;
      
      // Clear all registered callbacks
      _completionCallbacks.clear();
      _failureCallbacks.clear();
      _log('Cleared all registered callbacks');
      
      // Dispose processing service
      _processingService.dispose();
      
      _log('Service disposed successfully');
      
    } catch (e) {
      _log('Error disposing service: $e', isError: true);
    }
  }
  
  /// Log messages with consistent formatting
  void _log(String message, {bool isError = false}) {
    if (kDebugMode || isError) {
      final timestamp = DateTime.now().toIso8601String();
      final level = isError ? 'ERROR' : 'INFO';
      debugPrint('[$timestamp] $_logPrefix $level: $message');
    }
  }
}

// Note: Extension removed - NotificationService already has private methods
// The showNotification method will need to be added to NotificationService directly