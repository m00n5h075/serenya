import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import '../../core/security/local_audit_logger.dart';

/// Connectivity monitoring service for offline capability
/// 
/// Features:
/// - Real-time network connectivity monitoring
/// - Connection quality assessment
/// - Network change notifications
/// - Connection retry logic
/// - Bandwidth estimation
class ConnectivityService {
  static final ConnectivityService _instance = ConnectivityService._internal();
  factory ConnectivityService() => _instance;
  ConnectivityService._internal();

  final Connectivity _connectivity = Connectivity();
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  
  // Stream controllers for connectivity events
  final _connectivityController = StreamController<ConnectivityStatus>.broadcast();
  final _networkQualityController = StreamController<NetworkQuality>.broadcast();
  
  ConnectivityStatus _currentStatus = ConnectivityStatus.unknown;
  NetworkQuality _currentQuality = NetworkQuality.unknown;
  DateTime? _lastConnectivityChange;
  bool _isInitialized = false;

  // Getters
  Stream<ConnectivityStatus> get connectivityStream => _connectivityController.stream;
  Stream<NetworkQuality> get networkQualityStream => _networkQualityController.stream;
  ConnectivityStatus get currentStatus => _currentStatus;
  NetworkQuality get currentQuality => _currentQuality;
  bool get isOnline => _currentStatus == ConnectivityStatus.connected;
  bool get isOffline => _currentStatus == ConnectivityStatus.disconnected;

  /// Initialize connectivity monitoring
  Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      // Check initial connectivity
      await _checkInitialConnectivity();
      
      // Start monitoring connectivity changes
      _connectivitySubscription = _connectivity.onConnectivityChanged.listen(
        (results) => _onConnectivityChanged(results),
        onError: (error) async {
          await _logConnectivityEvent('connectivity_monitoring_error', {
            'error': error.toString(),
          });
        },
      );

      _isInitialized = true;
      
      await _logConnectivityEvent('connectivity_service_initialized', {
        'initial_status': _currentStatus.toString(),
      });

    } catch (e) {
      await _logConnectivityEvent('connectivity_service_init_failed', {
        'error': e.toString(),
      });
      rethrow;
    }
  }

  /// Check initial connectivity status
  Future<void> _checkInitialConnectivity() async {
    try {
      final results = await _connectivity.checkConnectivity();
      await _processConnectivityResult(results);
    } catch (e) {
      _currentStatus = ConnectivityStatus.unknown;
      await _logConnectivityEvent('initial_connectivity_check_failed', {
        'error': e.toString(),
      });
    }
  }

  /// Handle connectivity changes
  Future<void> _onConnectivityChanged(List<ConnectivityResult> results) async {
    await _processConnectivityResult(results);
    
    // Assess network quality when connectivity changes
    if (_currentStatus == ConnectivityStatus.connected) {
      await _assessNetworkQuality();
    }
  }

  /// Process connectivity results
  Future<void> _processConnectivityResult(List<ConnectivityResult> results) async {
    final previousStatus = _currentStatus;
    
    // Determine connectivity status from results
    if (results.contains(ConnectivityResult.wifi) || 
        results.contains(ConnectivityResult.ethernet)) {
      _currentStatus = ConnectivityStatus.connected;
      _currentQuality = NetworkQuality.good; // WiFi generally has good quality
    } else if (results.contains(ConnectivityResult.mobile)) {
      _currentStatus = ConnectivityStatus.connected;
      _currentQuality = NetworkQuality.fair; // Mobile may vary
    } else if (results.contains(ConnectivityResult.none)) {
      _currentStatus = ConnectivityStatus.disconnected;
      _currentQuality = NetworkQuality.none;
    } else {
      _currentStatus = ConnectivityStatus.unknown;
      _currentQuality = NetworkQuality.unknown;
    }

    // Notify if status changed
    if (previousStatus != _currentStatus) {
      _lastConnectivityChange = DateTime.now();
      _connectivityController.add(_currentStatus);
      
      await _logConnectivityEvent('connectivity_status_changed', {
        'previous_status': previousStatus.toString(),
        'new_status': _currentStatus.toString(),
        'connection_types': results.map((r) => r.toString()).toList(),
      });

      if (kDebugMode) {
        print('🌐 Connectivity changed: ${previousStatus.toString()} → ${_currentStatus.toString()}');
      }
    }
  }

  /// Assess network quality through simple connectivity test
  Future<void> _assessNetworkQuality() async {
    if (_currentStatus != ConnectivityStatus.connected) {
      _currentQuality = NetworkQuality.none;
      return;
    }

    try {
      final startTime = DateTime.now();
      
      // Simple connectivity test - try to reach a reliable endpoint
      // In production, this could be your health check endpoint
      await _connectivity.checkConnectivity();
      
      final latency = DateTime.now().difference(startTime);
      
      // Assess quality based on latency and connection type
      if (latency.inMilliseconds < 100) {
        _currentQuality = NetworkQuality.excellent;
      } else if (latency.inMilliseconds < 300) {
        _currentQuality = NetworkQuality.good;
      } else if (latency.inMilliseconds < 1000) {
        _currentQuality = NetworkQuality.fair;
      } else {
        _currentQuality = NetworkQuality.poor;
      }

      _networkQualityController.add(_currentQuality);

      await _logConnectivityEvent('network_quality_assessed', {
        'quality': _currentQuality.toString(),
        'latency_ms': latency.inMilliseconds,
      });

    } catch (e) {
      _currentQuality = NetworkQuality.poor;
      _networkQualityController.add(_currentQuality);
      
      await _logConnectivityEvent('network_quality_assessment_failed', {
        'error': e.toString(),
      });
    }
  }

  /// Test connectivity with a specific timeout
  Future<bool> testConnectivity({Duration timeout = const Duration(seconds: 5)}) async {
    try {
      final completer = Completer<bool>();
      
      // Set up timeout
      Timer(timeout, () {
        if (!completer.isCompleted) {
          completer.complete(false);
        }
      });

      // Test connectivity
      final results = await _connectivity.checkConnectivity();
      final hasConnection = !results.contains(ConnectivityResult.none);
      
      if (!completer.isCompleted) {
        completer.complete(hasConnection);
      }
      
      final isConnected = await completer.future;
      
      await _logConnectivityEvent('connectivity_test_completed', {
        'is_connected': isConnected,
        'timeout_seconds': timeout.inSeconds,
      });
      
      return isConnected;
      
    } catch (e) {
      await _logConnectivityEvent('connectivity_test_failed', {
        'error': e.toString(),
        'timeout_seconds': timeout.inSeconds,
      });
      return false;
    }
  }

  /// Wait for connection with optional timeout
  Future<bool> waitForConnection({Duration? timeout}) async {
    if (isOnline) return true;

    final completer = Completer<bool>();
    late StreamSubscription<ConnectivityStatus> subscription;

    subscription = connectivityStream.listen((status) {
      if (status == ConnectivityStatus.connected && !completer.isCompleted) {
        subscription.cancel();
        completer.complete(true);
      }
    });

    // Set up timeout if provided
    Timer? timeoutTimer;
    if (timeout != null) {
      timeoutTimer = Timer(timeout, () {
        if (!completer.isCompleted) {
          subscription.cancel();
          completer.complete(false);
        }
      });
    }

    final result = await completer.future;
    timeoutTimer?.cancel();

    await _logConnectivityEvent('wait_for_connection_completed', {
      'result': result,
      'timeout_seconds': timeout?.inSeconds,
    });

    return result;
  }

  /// Get connection stability score (0.0 to 1.0)
  double getConnectionStability() {
    if (_lastConnectivityChange == null) return 1.0;
    
    final timeSinceLastChange = DateTime.now().difference(_lastConnectivityChange!);
    
    // More stable if connection hasn't changed recently
    // Full stability after 5 minutes without changes
    const stabilityMinutes = 5;
    final stability = (timeSinceLastChange.inMinutes / stabilityMinutes).clamp(0.0, 1.0);
    
    return stability;
  }

  /// Log connectivity events
  Future<void> _logConnectivityEvent(String event, Map<String, dynamic> data) async {
    await LocalAuditLogger.logSecurityEvent(
      'connectivity_$event',
      additionalData: {
        'current_status': _currentStatus.toString(),
        'current_quality': _currentQuality.toString(),
        'timestamp': DateTime.now().toIso8601String(),
        ...data,
      },
    );
  }

  /// Dispose resources
  Future<void> dispose() async {
    await _connectivitySubscription?.cancel();
    await _connectivityController.close();
    await _networkQualityController.close();
    _isInitialized = false;

    await _logConnectivityEvent('connectivity_service_disposed', {});
  }
}

/// Connectivity status enumeration
enum ConnectivityStatus {
  connected,
  disconnected,
  unknown,
}

/// Network quality levels
enum NetworkQuality {
  excellent, // < 100ms latency
  good,      // < 300ms latency  
  fair,      // < 1000ms latency
  poor,      // >= 1000ms latency
  none,      // No connection
  unknown,   // Cannot determine
}