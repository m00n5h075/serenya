import 'dart:io';
import 'dart:async';
import 'package:path_provider/path_provider.dart';
import '../core/security/local_audit_logger.dart';
import 'pdf_generation_service.dart';

/// App-level PDF cleanup service (SECONDARY cleanup mechanism)
/// 
/// This service implements the CTO's recommended hybrid approach:
/// - PRIMARY: Immediate cleanup with try/finally in PDF generation service
/// - SECONDARY: App-level periodic cleanup as safety net (this service)
/// 
/// Features:
/// - Periodic cleanup of orphaned PDFs (1+ hour old)
/// - Integration with app lifecycle (startup, resume)
/// - Background cleanup every hour
/// - Guaranteed cleanup safety net for any missed files
/// - Audit logging for cleanup operations
class PdfCleanupService {
  static const Duration _cleanupInterval = Duration(hours: 1);
  static const Duration _fileRetentionPeriod = Duration(hours: 1);
  static const String _pdfFilePrefix = 'serenya_results_';
  
  Timer? _periodicTimer;
  bool _isInitialized = false;
  bool _isCleanupInProgress = false;
  
  // Singleton pattern
  static final PdfCleanupService _instance = PdfCleanupService._internal();
  factory PdfCleanupService() => _instance;
  PdfCleanupService._internal();

  /// Initialize the cleanup service
  /// Should be called during app startup
  Future<void> initialize() async {
    if (_isInitialized) return;
    
    try {
      await _logCleanupOperation('cleanup_service_initializing', {});
      
      // Perform initial cleanup on startup
      await performCleanup();
      
      // Start periodic cleanup timer
      _startPeriodicCleanup();
      
      _isInitialized = true;
      
      await _logCleanupOperation('cleanup_service_initialized', {
        'cleanup_interval_hours': _cleanupInterval.inHours,
        'file_retention_hours': _fileRetentionPeriod.inHours,
      });
      
    } catch (e) {
      await _logCleanupOperation('cleanup_service_init_failed', {
        'error': e.toString(),
      });
      print('Warning: PDF cleanup service initialization failed: $e');
    }
  }

  /// Start periodic cleanup timer
  void _startPeriodicCleanup() {
    _periodicTimer?.cancel();
    _periodicTimer = Timer.periodic(_cleanupInterval, (_) {
      performCleanup().catchError((error) {
        print('Warning: Periodic PDF cleanup failed: $error');
      });
    });
  }

  /// Perform cleanup of orphaned PDF files
  /// This is the SECONDARY cleanup mechanism - the safety net
  Future<CleanupResult> performCleanup() async {
    if (_isCleanupInProgress) {
      return CleanupResult(
        filesScanned: 0,
        filesRemoved: 0,
        errors: ['Cleanup already in progress'],
      );
    }
    
    _isCleanupInProgress = true;
    final startTime = DateTime.now();
    
    try {
      await _logCleanupOperation('cleanup_operation_started', {});
      
      final tempDir = await getTemporaryDirectory();
      final result = await _cleanupDirectory(tempDir);
      
      await _logCleanupOperation('cleanup_operation_completed', {
        'files_scanned': result.filesScanned,
        'files_removed': result.filesRemoved,
        'errors_count': result.errors.length,
        'duration_ms': DateTime.now().difference(startTime).inMilliseconds,
      });
      
      return result;
      
    } catch (e) {
      await _logCleanupOperation('cleanup_operation_failed', {
        'error': e.toString(),
        'duration_ms': DateTime.now().difference(startTime).inMilliseconds,
      });
      
      return CleanupResult(
        filesScanned: 0,
        filesRemoved: 0,
        errors: ['Cleanup operation failed: $e'],
      );
    } finally {
      _isCleanupInProgress = false;
    }
  }

  /// Clean up PDF files in a specific directory
  Future<CleanupResult> _cleanupDirectory(Directory directory) async {
    int filesScanned = 0;
    int filesRemoved = 0;
    final List<String> errors = [];
    
    try {
      if (!await directory.exists()) {
        return CleanupResult(
          filesScanned: 0,
          filesRemoved: 0,
          errors: [],
        );
      }
      
      final now = DateTime.now();
      
      // List all files in the directory
      await for (final entity in directory.list()) {
        if (entity is File) {
          filesScanned++;
          
          try {
            // Check if this is a Serenya PDF file
            if (_isSerenyaPdfFile(entity.path)) {
              final lastModified = await entity.lastModified();
              final age = now.difference(lastModified);
              
              // Remove files older than retention period
              if (age > _fileRetentionPeriod) {
                final success = await PdfGenerationService.cleanupPdfFile(entity.path);
                if (success) {
                  filesRemoved++;
                } else {
                  errors.add('Failed to remove file: ${entity.path}');
                }
              }
            }
          } catch (e) {
            errors.add('Error processing file ${entity.path}: $e');
          }
        }
      }
      
    } catch (e) {
      errors.add('Error accessing directory ${directory.path}: $e');
    }
    
    return CleanupResult(
      filesScanned: filesScanned,
      filesRemoved: filesRemoved,
      errors: errors,
    );
  }

  /// Check if a file is a Serenya PDF file based on its name
  bool _isSerenyaPdfFile(String filePath) {
    final fileName = filePath.split('/').last.toLowerCase();
    return fileName.startsWith(_pdfFilePrefix) && fileName.endsWith('.pdf');
  }

  /// Handle app resume event
  /// Triggers cleanup to clean up any files that accumulated while app was paused
  Future<void> onAppResume() async {
    if (!_isInitialized) return;
    
    try {
      await _logCleanupOperation('app_resume_cleanup_triggered', {});
      
      // Perform cleanup after app resume
      await performCleanup();
      
      // Restart periodic cleanup if timer was cancelled
      if (_periodicTimer == null || !_periodicTimer!.isActive) {
        _startPeriodicCleanup();
      }
      
    } catch (e) {
      await _logCleanupOperation('app_resume_cleanup_failed', {
        'error': e.toString(),
      });
    }
  }

  /// Handle app startup event
  /// Ensures cleanup service is running and performs initial cleanup
  Future<void> onAppStartup() async {
    await initialize();
  }

  /// Get cleanup statistics for monitoring
  Future<CleanupStats> getCleanupStats() async {
    try {
      final tempDir = await getTemporaryDirectory();
      int totalPdfFiles = 0;
      int oldPdfFiles = 0;
      int totalSizeBytes = 0;
      
      final now = DateTime.now();
      
      if (await tempDir.exists()) {
        await for (final entity in tempDir.list()) {
          if (entity is File && _isSerenyaPdfFile(entity.path)) {
            totalPdfFiles++;
            
            try {
              final stats = await entity.stat();
              totalSizeBytes += stats.size;
              
              final lastModified = await entity.lastModified();
              final age = now.difference(lastModified);
              
              if (age > _fileRetentionPeriod) {
                oldPdfFiles++;
              }
            } catch (e) {
              // Ignore individual file stat errors
            }
          }
        }
      }
      
      return CleanupStats(
        totalPdfFiles: totalPdfFiles,
        oldPdfFiles: oldPdfFiles,
        totalSizeBytes: totalSizeBytes,
        isServiceActive: _isInitialized && _periodicTimer?.isActive == true,
        nextCleanupDue: _periodicTimer != null 
            ? DateTime.now().add(_cleanupInterval)
            : null,
      );
      
    } catch (e) {
      return CleanupStats(
        totalPdfFiles: -1,
        oldPdfFiles: -1,
        totalSizeBytes: -1,
        isServiceActive: false,
        nextCleanupDue: null,
        error: e.toString(),
      );
    }
  }

  /// Dispose the service and cleanup resources
  Future<void> dispose() async {
    if (!_isInitialized) return;
    
    try {
      await _logCleanupOperation('cleanup_service_disposing', {});
      
      _periodicTimer?.cancel();
      _periodicTimer = null;
      _isInitialized = false;
      
      // Perform final cleanup before shutdown
      if (!_isCleanupInProgress) {
        await performCleanup();
      }
      
      await _logCleanupOperation('cleanup_service_disposed', {});
      
    } catch (e) {
      print('Warning: Error disposing PDF cleanup service: $e');
    }
  }

  /// Log cleanup operations for audit trail
  static Future<void> _logCleanupOperation(String operation, Map<String, dynamic> context) async {
    try {
      await LocalAuditLogger.logSecurityEvent(
        'pdf_cleanup_operation',
        additionalData: {
          'operation': operation,
          'context': context,
          'timestamp': DateTime.now().toIso8601String(),
        },
      );
    } catch (e) {
      // Don't let logging errors affect cleanup operations
      print('Warning: Failed to log cleanup operation: $e');
    }
  }
}

/// Result of a cleanup operation
class CleanupResult {
  final int filesScanned;
  final int filesRemoved;
  final List<String> errors;

  CleanupResult({
    required this.filesScanned,
    required this.filesRemoved,
    required this.errors,
  });

  bool get hasErrors => errors.isNotEmpty;
  bool get isSuccessful => errors.isEmpty;
  
  @override
  String toString() {
    return 'CleanupResult(scanned: $filesScanned, removed: $filesRemoved, errors: ${errors.length})';
  }
}

/// Statistics about PDF cleanup service
class CleanupStats {
  final int totalPdfFiles;
  final int oldPdfFiles;
  final int totalSizeBytes;
  final bool isServiceActive;
  final DateTime? nextCleanupDue;
  final String? error;

  CleanupStats({
    required this.totalPdfFiles,
    required this.oldPdfFiles,
    required this.totalSizeBytes,
    required this.isServiceActive,
    this.nextCleanupDue,
    this.error,
  });

  double get totalSizeMB => totalSizeBytes / (1024 * 1024);
  
  bool get hasError => error != null;
  bool get needsCleanup => oldPdfFiles > 0;
  
  @override
  String toString() {
    return 'CleanupStats(total: $totalPdfFiles, old: $oldPdfFiles, size: ${totalSizeMB.toStringAsFixed(2)}MB, active: $isServiceActive)';
  }
}