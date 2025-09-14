import 'dart:async';
import 'dart:convert';
import 'dart:collection';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/security/local_audit_logger.dart';
import 'connectivity_service.dart';
import '../api_client.dart';

/// Offline request queuing system for reliable API operations
/// 
/// Features:
/// - Persistent request storage across app restarts
/// - Priority-based queue processing
/// - Automatic retry with exponential backoff
/// - Request deduplication and merging
/// - Progress tracking and status updates
/// - Request cancellation and cleanup
class RequestQueue {
  static final RequestQueue _instance = RequestQueue._internal();
  factory RequestQueue() => _instance;
  RequestQueue._internal();

  static const _secureStorage = FlutterSecureStorage();
  static const String _queueStorageKey = 'serenya_request_queue_v1';
  
  final Queue<QueuedRequest> _queue = Queue<QueuedRequest>();
  final Map<String, QueuedRequest> _requestMap = {};
  final Map<String, Completer<ApiResult<dynamic>>> _completers = {};
  
  final _statusController = StreamController<QueueStatus>.broadcast();
  final _requestStatusController = StreamController<RequestStatusUpdate>.broadcast();
  
  Timer? _processingTimer;
  bool _isProcessing = false;
  bool _isInitialized = false;
  int _totalRequests = 0;
  int _completedRequests = 0;
  int _failedRequests = 0;

  // Stream getters
  Stream<QueueStatus> get statusStream => _statusController.stream;
  Stream<RequestStatusUpdate> get requestStatusStream => _requestStatusController.stream;
  
  // Status getters
  int get queueLength => _queue.length;
  int get totalRequests => _totalRequests;
  int get completedRequests => _completedRequests;
  int get failedRequests => _failedRequests;
  bool get isProcessing => _isProcessing;
  double get progressPercent => _totalRequests > 0 
      ? (_completedRequests + _failedRequests) / _totalRequests 
      : 0.0;

  /// Initialize the request queue
  Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      await _loadQueueFromStorage();
      await _startQueueProcessor();
      
      _isInitialized = true;
      
      await _logQueueEvent('request_queue_initialized', {
        'queue_length': _queue.length,
      });

    } catch (e) {
      await _logQueueEvent('request_queue_init_failed', {
        'error': e.toString(),
      });
      rethrow;
    }
  }

  /// Add request to queue with priority
  Future<ApiResult<T>> enqueue<T>({
    required String method,
    required String path,
    Map<String, dynamic>? data,
    Map<String, dynamic>? queryParameters,
    Map<String, dynamic>? headers,
    RequestPriority priority = RequestPriority.normal,
    RequestPolicy policy = RequestPolicy.retryOnFailure,
    Duration? timeout,
    Map<String, dynamic>? metadata,
  }) async {
    final request = QueuedRequest(
      id: _generateRequestId(),
      method: method.toUpperCase(),
      path: path,
      data: data,
      queryParameters: queryParameters,
      headers: headers ?? {},
      priority: priority,
      policy: policy,
      timeout: timeout ?? const Duration(minutes: 2),
      metadata: metadata ?? {},
      createdAt: DateTime.now(),
      maxRetryAttempts: _getMaxRetryAttempts(policy),
    );

    // Check for duplicate requests
    if (policy.allowDeduplication) {
      final duplicate = _findDuplicateRequest(request);
      if (duplicate != null) {
        await _logQueueEvent('duplicate_request_detected', {
          'original_id': duplicate.id,
          'new_id': request.id,
          'method': method,
          'path': path,
        });
        
        // Return the existing completer
        return _completers[duplicate.id]!.future as Future<ApiResult<T>>;
      }
    }

    // Add to queue with priority ordering
    final completer = Completer<ApiResult<T>>();
    _completers[request.id] = completer as Completer<ApiResult<dynamic>>;
    
    _addToQueue(request);
    _totalRequests++;
    
    // Persist queue
    await _saveQueueToStorage();
    
    // Start processing if not already running
    if (!_isProcessing) {
      _startQueueProcessor();
    }

    await _logQueueEvent('request_enqueued', {
      'request_id': request.id,
      'method': request.method,
      'path': request.path,
      'priority': request.priority.toString(),
      'queue_length': _queue.length,
    });

    _broadcastQueueStatus();
    
    return completer.future;
  }

  /// Add request to priority queue
  void _addToQueue(QueuedRequest request) {
    _requestMap[request.id] = request;
    
    // Insert based on priority (higher priority first)
    var inserted = false;
    final queueList = _queue.toList();
    
    for (int i = 0; i < queueList.length; i++) {
      if (request.priority.index > queueList[i].priority.index) {
        _queue.clear();
        _queue.addAll([
          ...queueList.sublist(0, i),
          request,
          ...queueList.sublist(i),
        ]);
        inserted = true;
        break;
      }
    }
    
    if (!inserted) {
      _queue.add(request);
    }
  }

  /// Start queue processor
  Future<void> _startQueueProcessor() async {
    if (_isProcessing) return;
    
    _isProcessing = true;
    _processingTimer = Timer.periodic(
      const Duration(seconds: 2),
      (_) => _processQueue(),
    );
    
    await _logQueueEvent('queue_processor_started', {});
  }

  /// Process queued requests
  Future<void> _processQueue() async {
    if (_queue.isEmpty) return;

    // Check connectivity
    final connectivity = ConnectivityService();
    if (!connectivity.isOnline) {
      await _logQueueEvent('queue_processing_skipped_offline', {
        'queue_length': _queue.length,
      });
      return;
    }

    final request = _queue.removeFirst();
    _requestStatusController.add(RequestStatusUpdate(
      requestId: request.id,
      status: RequestStatus.processing,
      message: 'Processing request...',
    ));

    try {
      // Execute the request
      final result = await _executeRequest(request);
      
      // Complete successfully
      await _completeRequest(request, result);
      _completedRequests++;

    } catch (e) {
      await _handleRequestError(request, e);
    }

    // Save updated queue
    await _saveQueueToStorage();
    _broadcastQueueStatus();
  }

  /// Execute a queued request
  Future<ApiResult<dynamic>> _executeRequest(QueuedRequest request) async {
    final apiClient = ApiClient();
    
    try {
      final requestOptions = RequestOptions(
        method: request.method,
        path: request.path,
        data: request.data,
        queryParameters: request.queryParameters,
        headers: request.headers,
      );

      // Use the main Dio client to make the request
      final response = await apiClient.dio.fetch(requestOptions);
      
      await _logQueueEvent('request_executed_successfully', {
        'request_id': request.id,
        'method': request.method,
        'path': request.path,
        'status_code': response.statusCode,
        'attempt': request.currentAttempt + 1,
      });

      return ApiResult.success(
        response.data,
        statusCode: response.statusCode,
        metadata: {
          'request_id': request.id,
          'attempts': request.currentAttempt + 1,
          'queued_at': request.createdAt.toIso8601String(),
        },
      );

    } catch (e) {
      await _logQueueEvent('request_execution_failed', {
        'request_id': request.id,
        'method': request.method,
        'path': request.path,
        'attempt': request.currentAttempt + 1,
        'error': e.toString(),
      });
      rethrow;
    }
  }

  /// Handle request execution error
  Future<void> _handleRequestError(QueuedRequest request, dynamic error) async {
    request.currentAttempt++;
    request.lastError = error.toString();
    request.lastAttemptAt = DateTime.now();

    final shouldRetry = request.currentAttempt < request.maxRetryAttempts &&
                       request.policy.allowRetry &&
                       _shouldRetryError(error);

    if (shouldRetry) {
      // Calculate backoff delay
      final delay = _calculateBackoffDelay(request.currentAttempt);
      request.nextRetryAt = DateTime.now().add(delay);
      
      // Re-queue for retry
      _addToQueue(request);
      
      _requestStatusController.add(RequestStatusUpdate(
        requestId: request.id,
        status: RequestStatus.retryScheduled,
        message: 'Retry ${request.currentAttempt}/${request.maxRetryAttempts} scheduled',
        nextRetryAt: request.nextRetryAt,
      ));

      await _logQueueEvent('request_retry_scheduled', {
        'request_id': request.id,
        'attempt': request.currentAttempt,
        'max_attempts': request.maxRetryAttempts,
        'retry_delay_seconds': delay.inSeconds,
        'error': error.toString(),
      });

    } else {
      // Max retries reached or non-retryable error
      final result = ApiResult.failed(
        'Request failed after ${request.currentAttempt} attempts: ${request.lastError}',
        statusCode: error is DioException ? error.response?.statusCode : null,
        metadata: {
          'request_id': request.id,
          'attempts': request.currentAttempt,
          'final_error': request.lastError,
        },
      );
      
      await _completeRequest(request, result);
      _failedRequests++;

      await _logQueueEvent('request_failed_permanently', {
        'request_id': request.id,
        'total_attempts': request.currentAttempt,
        'final_error': request.lastError,
      });
    }
  }

  /// Complete a request (success or failure)
  Future<void> _completeRequest(QueuedRequest request, ApiResult<dynamic> result) async {
    final completer = _completers.remove(request.id);
    _requestMap.remove(request.id);

    if (completer != null && !completer.isCompleted) {
      completer.complete(result);
    }

    _requestStatusController.add(RequestStatusUpdate(
      requestId: request.id,
      status: result.success ? RequestStatus.completed : RequestStatus.failed,
      message: result.success ? 'Request completed successfully' : result.error ?? 'Request failed',
      result: result,
    ));
  }

  /// Find duplicate request based on method, path, and data
  QueuedRequest? _findDuplicateRequest(QueuedRequest newRequest) {
    for (final existing in _requestMap.values) {
      if (existing.method == newRequest.method &&
          existing.path == newRequest.path &&
          _deepEquals(existing.data, newRequest.data) &&
          _deepEquals(existing.queryParameters, newRequest.queryParameters)) {
        return existing;
      }
    }
    return null;
  }

  /// Deep equality check for maps
  bool _deepEquals(dynamic a, dynamic b) {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    if (a.runtimeType != b.runtimeType) return false;
    
    if (a is Map && b is Map) {
      if (a.length != b.length) return false;
      for (final key in a.keys) {
        if (!b.containsKey(key) || !_deepEquals(a[key], b[key])) {
          return false;
        }
      }
      return true;
    }
    
    return a == b;
  }

  /// Calculate exponential backoff delay
  Duration _calculateBackoffDelay(int attemptNumber) {
    const baseDelay = Duration(seconds: 2);
    const maxDelay = Duration(minutes: 5);
    
    final exponentialDelay = Duration(
      seconds: (baseDelay.inSeconds * (1 << (attemptNumber - 1))).clamp(
        baseDelay.inSeconds,
        maxDelay.inSeconds,
      ),
    );
    
    // Add jitter to prevent thundering herd
    final jitterMs = (exponentialDelay.inMilliseconds * 0.1).round();
    final jitter = Duration(milliseconds: (jitterMs * (0.5 - DateTime.now().millisecond / 1000)).round());
    
    return exponentialDelay + jitter;
  }

  /// Determine if error should be retried
  bool _shouldRetryError(dynamic error) {
    if (error is DioException) {
      switch (error.type) {
        case DioExceptionType.connectionTimeout:
        case DioExceptionType.sendTimeout:
        case DioExceptionType.receiveTimeout:
        case DioExceptionType.connectionError:
          return true;
        case DioExceptionType.badResponse:
          final statusCode = error.response?.statusCode;
          return statusCode != null && (statusCode >= 500 || statusCode == 429);
        default:
          return false;
      }
    }
    return false;
  }

  /// Get max retry attempts based on policy
  int _getMaxRetryAttempts(RequestPolicy policy) {
    switch (policy) {
      case RequestPolicy.noRetry:
        return 1;
      case RequestPolicy.retryOnce:
        return 2;
      case RequestPolicy.retryOnFailure:
        return 3;
      case RequestPolicy.persistentRetry:
        return 5;
    }
  }

  /// Generate unique request ID
  String _generateRequestId() {
    return 'req_${DateTime.now().microsecondsSinceEpoch}_$_totalRequests';
  }

  /// Broadcast queue status
  void _broadcastQueueStatus() {
    _statusController.add(QueueStatus(
      queueLength: _queue.length,
      totalRequests: _totalRequests,
      completedRequests: _completedRequests,
      failedRequests: _failedRequests,
      isProcessing: _isProcessing,
      progressPercent: progressPercent,
    ));
  }

  /// Save queue to persistent storage
  Future<void> _saveQueueToStorage() async {
    try {
      final queueData = {
        'requests': _queue.map((req) => req.toJson()).toList(),
        'metadata': {
          'total_requests': _totalRequests,
          'completed_requests': _completedRequests,
          'failed_requests': _failedRequests,
          'saved_at': DateTime.now().toIso8601String(),
        },
      };
      
      await _secureStorage.write(
        key: _queueStorageKey,
        value: jsonEncode(queueData),
      );
      
    } catch (e) {
      await _logQueueEvent('queue_save_failed', {
        'error': e.toString(),
      });
    }
  }

  /// Load queue from persistent storage
  Future<void> _loadQueueFromStorage() async {
    try {
      final queueJson = await _secureStorage.read(key: _queueStorageKey);
      if (queueJson == null) return;

      final queueData = jsonDecode(queueJson) as Map<String, dynamic>;
      final requests = (queueData['requests'] as List)
          .map((json) => QueuedRequest.fromJson(json))
          .toList();
      
      // Restore queue and metadata
      _queue.clear();
      _requestMap.clear();
      
      for (final request in requests) {
        _queue.add(request);
        _requestMap[request.id] = request;
      }
      
      final metadata = queueData['metadata'] as Map<String, dynamic>?;
      if (metadata != null) {
        _totalRequests = metadata['total_requests'] ?? 0;
        _completedRequests = metadata['completed_requests'] ?? 0;
        _failedRequests = metadata['failed_requests'] ?? 0;
      }

      await _logQueueEvent('queue_loaded_from_storage', {
        'loaded_requests': requests.length,
        'total_requests': _totalRequests,
      });
      
    } catch (e) {
      await _logQueueEvent('queue_load_failed', {
        'error': e.toString(),
      });
    }
  }

  /// Cancel a specific request
  Future<bool> cancelRequest(String requestId) async {
    final request = _requestMap[requestId];
    if (request == null) return false;

    // Remove from queue and maps
    _queue.removeWhere((r) => r.id == requestId);
    _requestMap.remove(requestId);
    
    // Complete with cancellation
    final completer = _completers.remove(requestId);
    if (completer != null && !completer.isCompleted) {
      completer.complete(ApiResult.failed(
        'Request was cancelled',
        metadata: {'request_id': requestId, 'cancelled': true},
      ));
    }

    await _saveQueueToStorage();
    _broadcastQueueStatus();

    await _logQueueEvent('request_cancelled', {
      'request_id': requestId,
    });

    return true;
  }

  /// Clear all queued requests
  Future<void> clearQueue() async {
    // Complete all pending requests with cancellation
    for (final completer in _completers.values) {
      if (!completer.isCompleted) {
        completer.complete(ApiResult.failed(
          'Queue was cleared',
          metadata: {'cancelled': true},
        ));
      }
    }

    _queue.clear();
    _requestMap.clear();
    _completers.clear();
    
    await _saveQueueToStorage();
    _broadcastQueueStatus();

    await _logQueueEvent('queue_cleared', {
      'requests_cleared': _queue.length,
    });
  }

  /// Log queue events
  Future<void> _logQueueEvent(String event, Map<String, dynamic> data) async {
    await LocalAuditLogger.logSecurityEvent(
      'request_queue_$event',
      additionalData: {
        'queue_length': _queue.length,
        'is_processing': _isProcessing,
        'timestamp': DateTime.now().toIso8601String(),
        ...data,
      },
    );
  }

  /// Dispose resources
  Future<void> dispose() async {
    _processingTimer?.cancel();
    _isProcessing = false;
    
    await _statusController.close();
    await _requestStatusController.close();
    
    await _logQueueEvent('request_queue_disposed', {});
  }
}

/// Queued request model
class QueuedRequest {
  final String id;
  final String method;
  final String path;
  final Map<String, dynamic>? data;
  final Map<String, dynamic>? queryParameters;
  final Map<String, dynamic> headers;
  final RequestPriority priority;
  final RequestPolicy policy;
  final Duration timeout;
  final Map<String, dynamic> metadata;
  final DateTime createdAt;
  final int maxRetryAttempts;
  
  int currentAttempt;
  String? lastError;
  DateTime? lastAttemptAt;
  DateTime? nextRetryAt;

  QueuedRequest({
    required this.id,
    required this.method,
    required this.path,
    this.data,
    this.queryParameters,
    required this.headers,
    required this.priority,
    required this.policy,
    required this.timeout,
    required this.metadata,
    required this.createdAt,
    required this.maxRetryAttempts,
    this.currentAttempt = 0,
    this.lastError,
    this.lastAttemptAt,
    this.nextRetryAt,
  });

  factory QueuedRequest.fromJson(Map<String, dynamic> json) {
    return QueuedRequest(
      id: json['id'],
      method: json['method'],
      path: json['path'],
      data: json['data'],
      queryParameters: json['query_parameters'],
      headers: Map<String, dynamic>.from(json['headers']),
      priority: RequestPriority.values[json['priority']],
      policy: RequestPolicy.values[json['policy']],
      timeout: Duration(milliseconds: json['timeout_ms']),
      metadata: Map<String, dynamic>.from(json['metadata']),
      createdAt: DateTime.parse(json['created_at']),
      maxRetryAttempts: json['max_retry_attempts'],
      currentAttempt: json['current_attempt'] ?? 0,
      lastError: json['last_error'],
      lastAttemptAt: json['last_attempt_at'] != null 
          ? DateTime.parse(json['last_attempt_at'])
          : null,
      nextRetryAt: json['next_retry_at'] != null 
          ? DateTime.parse(json['next_retry_at'])
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'method': method,
      'path': path,
      'data': data,
      'query_parameters': queryParameters,
      'headers': headers,
      'priority': priority.index,
      'policy': policy.index,
      'timeout_ms': timeout.inMilliseconds,
      'metadata': metadata,
      'created_at': createdAt.toIso8601String(),
      'max_retry_attempts': maxRetryAttempts,
      'current_attempt': currentAttempt,
      'last_error': lastError,
      'last_attempt_at': lastAttemptAt?.toIso8601String(),
      'next_retry_at': nextRetryAt?.toIso8601String(),
    };
  }
}

/// Request priority levels
enum RequestPriority {
  low,
  normal, 
  high,
  urgent,
}

/// Request retry policies
enum RequestPolicy {
  noRetry,
  retryOnce,
  retryOnFailure,
  persistentRetry;

  bool get allowRetry => this != RequestPolicy.noRetry;
  bool get allowDeduplication => this != RequestPolicy.persistentRetry;
}

/// Request status enumeration
enum RequestStatus {
  queued,
  processing,
  retryScheduled,
  completed,
  failed,
  cancelled,
}

/// Queue status model
class QueueStatus {
  final int queueLength;
  final int totalRequests;
  final int completedRequests;
  final int failedRequests;
  final bool isProcessing;
  final double progressPercent;

  QueueStatus({
    required this.queueLength,
    required this.totalRequests,
    required this.completedRequests,
    required this.failedRequests,
    required this.isProcessing,
    required this.progressPercent,
  });
}

/// Request status update model
class RequestStatusUpdate {
  final String requestId;
  final RequestStatus status;
  final String message;
  final DateTime? nextRetryAt;
  final ApiResult<dynamic>? result;

  RequestStatusUpdate({
    required this.requestId,
    required this.status,
    required this.message,
    this.nextRetryAt,
    this.result,
  });
}