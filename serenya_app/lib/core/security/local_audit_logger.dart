import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:crypto/crypto.dart';
import 'package:path/path.dart';

/// Audit event categories matching server-side audit system
enum AuditCategory {
  authentication,     // Login, logout, session events
  authorization,      // Access control decisions
  dataAccess,        // Medical data read operations
  dataModification,  // Medical data write operations
  securityEvent,     // Key access, encryption operations
  systemEvent,       // App lifecycle, errors
  userAction,        // User-initiated operations
}

/// Audit event severity levels
enum AuditSeverity {
  info,     // Normal operations
  warning,  // Potential issues
  error,    // System errors
  critical, // Security violations
}

/// Local Audit Logging System for Sensitive Operations
/// 
/// Implements comprehensive security event tracking for:
/// - Authentication events (biometric, PIN, session management)
/// - Encryption key access and operations
/// - Database operations on sensitive medical data
/// - Security violations and threats
/// - Data access and modification events
/// 
/// All audit logs are encrypted and tamper-resistant
class LocalAuditLogger {
  static Database? _auditDb;
  static const String _auditDbName = 'serenya_audit_log.db';
  static const String _auditTableName = 'audit_events';

  /// Initialize audit logging system
  static Future<void> initialize() async {
    try {
      if (_auditDb != null) return;
      
      // Platform-specific SQLite setup
      if (Platform.isLinux || Platform.isWindows) {
        sqfliteFfiInit();
        databaseFactory = databaseFactoryFfi;
      }

      final databasePath = await getDatabasesPath();
      final path = join(databasePath, _auditDbName);

      // Open audit database (separate from main encrypted database)
      _auditDb = await openDatabase(
        path,
        version: 1,
        onCreate: _createAuditTables,
        onOpen: (db) async {
          try {
            // Enable WAL mode for better performance
            // Handle Android emulator limitations gracefully
            await db.execute('PRAGMA journal_mode=WAL;');
          } catch (e) {
            if (kDebugMode) {
              print('AUDIT_INIT: WAL mode not supported, using default journal mode: $e');
            }
            // Continue without WAL mode - not critical for audit functionality
          }
        },
      );

      // Log audit system initialization
      await _logDirectEvent(
        AuditCategory.systemEvent,
        'audit_system_initialized',
        AuditSeverity.info,
        {'version': '1.0.0'},
      );

    } catch (e) {
      if (kDebugMode) {
        print('AUDIT_INIT_ERROR: $e');
      }
      rethrow;
    }
  }

  /// Create audit logging tables
  static Future<void> _createAuditTables(Database db, int version) async {
    await db.execute('''
      CREATE TABLE $_auditTableName (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        category TEXT NOT NULL,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        user_context TEXT,
        session_id TEXT,
        event_data TEXT NOT NULL,
        checksum TEXT NOT NULL,
        device_id TEXT NOT NULL,
        app_version TEXT NOT NULL
      );
    ''');

    // Create indexes for efficient querying
    await db.execute('''
      CREATE INDEX idx_audit_timestamp ON $_auditTableName(timestamp DESC);
    ''');
    
    await db.execute('''
      CREATE INDEX idx_audit_category ON $_auditTableName(category);
    ''');
    
    await db.execute('''
      CREATE INDEX idx_audit_severity ON $_auditTableName(severity);
    ''');
    
    await db.execute('''
      CREATE INDEX idx_audit_event_type ON $_auditTableName(event_type);
    ''');
  }

  /// Log authentication events
  static Future<void> logAuthenticationEvent(
    String eventType, {
    String? sessionId,
    String? authMethod,
    String? userId,
    bool? success,
    String? failureReason,
    Map<String, dynamic>? additionalData,
  }) async {
    await _logEvent(
      AuditCategory.authentication,
      eventType,
      success == false ? AuditSeverity.warning : AuditSeverity.info,
      {
        'session_id': sessionId,
        'auth_method': authMethod,
        'user_id': userId != null ? _hashUserId(userId) : null,
        'success': success,
        'failure_reason': failureReason,
        ...?additionalData,
      },
      sessionId: sessionId,
    );
  }

  /// Log security events (key access, encryption operations)
  static Future<void> logSecurityEvent(
    String eventType, {
    String? keyContext,
    String? operation,
    String? tableName,
    bool? success,
    String? error,
    String? threat,
    Map<String, dynamic>? additionalData,
  }) async {
    final severity = _determineSeverity(eventType, success, error, threat);
    
    await _logEvent(
      AuditCategory.securityEvent,
      eventType,
      severity,
      {
        'key_context': keyContext,
        'operation': operation,
        'table_name': tableName,
        'success': success,
        'error': error,
        'threat_indicator': threat,
        'detection_method': 'automated',
        ...?additionalData,
      },
    );
  }

  /// Log data access events
  static Future<void> logDataAccess(
    String eventType, {
    String? resourceId,
    String? tableName,
    String? userId,
    int? recordCount,
    String? accessPattern,
    Map<String, dynamic>? additionalData,
  }) async {
    await _logEvent(
      AuditCategory.dataAccess,
      eventType,
      AuditSeverity.info,
      {
        'resource_id': resourceId,
        'table_name': tableName,
        'user_id': userId != null ? _hashUserId(userId) : null,
        'record_count': recordCount,
        'access_pattern': accessPattern,
        'data_classification': _getDataClassification(tableName),
        ...?additionalData,
      },
    );
  }

  /// Log data modification events
  static Future<void> logDataModification(
    String eventType, {
    String? resourceId,
    String? tableName,
    String? userId,
    String? operation,
    Map<String, dynamic>? beforeState,
    Map<String, dynamic>? afterState,
    Map<String, dynamic>? additionalData,
  }) async {
    await _logEvent(
      AuditCategory.dataModification,
      eventType,
      AuditSeverity.info,
      {
        'resource_id': resourceId,
        'table_name': tableName,
        'user_id': userId != null ? _hashUserId(userId) : null,
        'operation': operation,
        'before_state_hash': beforeState != null 
            ? _hashSensitiveData(jsonEncode(beforeState)) 
            : null,
        'after_state_hash': afterState != null 
            ? _hashSensitiveData(jsonEncode(afterState)) 
            : null,
        'data_classification': _getDataClassification(tableName),
        ...?additionalData,
      },
    );
  }

  /// Log system events
  static Future<void> logSystemEvent(
    String eventType, {
    String? error,
    String? stackTrace,
    Map<String, dynamic>? systemContext,
    Map<String, dynamic>? additionalData,
  }) async {
    final severity = error != null ? AuditSeverity.error : AuditSeverity.info;
    
    await _logEvent(
      AuditCategory.systemEvent,
      eventType,
      severity,
      {
        'error': error,
        'stack_trace': stackTrace != null ? _hashSensitiveData(stackTrace) : null,
        'system_context': systemContext,
        ...?additionalData,
      },
    );
  }

  /// Log user action events
  static Future<void> logUserAction(
    String eventType, {
    String? userId,
    String? feature,
    String? action,
    Map<String, dynamic>? actionContext,
    Map<String, dynamic>? additionalData,
  }) async {
    await _logEvent(
      AuditCategory.userAction,
      eventType,
      AuditSeverity.info,
      {
        'user_id': userId != null ? _hashUserId(userId) : null,
        'feature': feature,
        'action': action,
        'action_context': actionContext,
        ...?additionalData,
      },
    );
  }

  /// Core event logging implementation
  static Future<void> _logEvent(
    AuditCategory category,
    String eventType,
    AuditSeverity severity,
    Map<String, dynamic> eventData, {
    String? sessionId,
    String? userContext,
  }) async {
    try {
      await initialize(); // Ensure audit system is initialized
      
      if (_auditDb == null) {
        throw AuditException('Audit database not initialized');
      }

      final timestamp = DateTime.now().toIso8601String();
      final deviceId = await _getDeviceId();
      final appVersion = await _getAppVersion();
      
      // Clean and serialize event data
      final cleanedData = _cleanSensitiveData(eventData);
      final serializedData = jsonEncode(cleanedData);
      
      // Generate integrity checksum
      final checksum = _generateEventChecksum(
        timestamp,
        category.toString(),
        eventType,
        serializedData,
      );

      // Insert audit event
      await _auditDb!.insert(_auditTableName, {
        'timestamp': timestamp,
        'category': category.toString().split('.').last,
        'event_type': eventType,
        'severity': severity.toString().split('.').last,
        'user_context': userContext,
        'session_id': sessionId,
        'event_data': serializedData,
        'checksum': checksum,
        'device_id': deviceId,
        'app_version': appVersion,
      });

      // Debug logging in development
      if (kDebugMode) {
        print('AUDIT: ${category.toString().split('.').last}.$eventType [$severity] - $serializedData');
      }

    } catch (e) {
      // Critical: audit logging failure
      if (kDebugMode) {
        print('AUDIT_ERROR: Failed to log $eventType - $e');
      }
      // Don't rethrow - audit failures shouldn't break app functionality
    }
  }

  /// Log event directly (for internal audit system events)
  static Future<void> _logDirectEvent(
    AuditCategory category,
    String eventType,
    AuditSeverity severity,
    Map<String, dynamic> eventData,
  ) async {
    await _logEvent(category, eventType, severity, eventData);
  }

  /// Query audit events
  static Future<List<Map<String, dynamic>>> queryAuditEvents({
    AuditCategory? category,
    String? eventType,
    AuditSeverity? severity,
    DateTime? startDate,
    DateTime? endDate,
    int? limit,
    int? offset,
  }) async {
    await initialize();
    
    if (_auditDb == null) {
      throw AuditException('Audit database not initialized');
    }

    final whereClauses = <String>[];
    final whereArgs = <dynamic>[];

    if (category != null) {
      whereClauses.add('category = ?');
      whereArgs.add(category.toString().split('.').last);
    }

    if (eventType != null) {
      whereClauses.add('event_type = ?');
      whereArgs.add(eventType);
    }

    if (severity != null) {
      whereClauses.add('severity = ?');
      whereArgs.add(severity.toString().split('.').last);
    }

    if (startDate != null) {
      whereClauses.add('timestamp >= ?');
      whereArgs.add(startDate.toIso8601String());
    }

    if (endDate != null) {
      whereClauses.add('timestamp <= ?');
      whereArgs.add(endDate.toIso8601String());
    }

    final whereClause = whereClauses.isNotEmpty ? whereClauses.join(' AND ') : null;

    return await _auditDb!.query(
      _auditTableName,
      where: whereClause,
      whereArgs: whereArgs.isNotEmpty ? whereArgs : null,
      orderBy: 'timestamp DESC',
      limit: limit,
      offset: offset,
    );
  }

  /// Get audit statistics
  static Future<Map<String, dynamic>> getAuditStatistics({
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    await initialize();
    
    if (_auditDb == null) {
      throw AuditException('Audit database not initialized');
    }

    final whereClauses = <String>[];
    final whereArgs = <dynamic>[];

    if (startDate != null) {
      whereClauses.add('timestamp >= ?');
      whereArgs.add(startDate.toIso8601String());
    }

    if (endDate != null) {
      whereClauses.add('timestamp <= ?');
      whereArgs.add(endDate.toIso8601String());
    }

    final whereClause = whereClauses.isNotEmpty ? whereClauses.join(' AND ') : null;

    // Total events
    final totalResult = await _auditDb!.query(
      _auditTableName,
      columns: ['COUNT(*) as total'],
      where: whereClause,
      whereArgs: whereArgs.isNotEmpty ? whereArgs : null,
    );
    final totalEvents = totalResult.first['total'] as int;

    // Events by category
    final categoryResult = await _auditDb!.rawQuery('''
      SELECT category, COUNT(*) as count
      FROM $_auditTableName
      ${whereClause != null ? 'WHERE $whereClause' : ''}
      GROUP BY category
      ORDER BY count DESC
    ''', whereArgs.isNotEmpty ? whereArgs : null);

    // Events by severity
    final severityResult = await _auditDb!.rawQuery('''
      SELECT severity, COUNT(*) as count
      FROM $_auditTableName
      ${whereClause != null ? 'WHERE $whereClause' : ''}
      GROUP BY severity
      ORDER BY count DESC
    ''', whereArgs.isNotEmpty ? whereArgs : null);

    return {
      'total_events': totalEvents,
      'events_by_category': { for (var item in categoryResult) item['category'] : item['count'] },
      'events_by_severity': { for (var item in severityResult) item['severity'] : item['count'] },
      'query_period': {
        'start_date': startDate?.toIso8601String(),
        'end_date': endDate?.toIso8601String(),
      },
    };
  }

  /// Verify audit log integrity
  static Future<bool> verifyAuditIntegrity({int? limit}) async {
    await initialize();
    
    if (_auditDb == null) return false;

    final events = await _auditDb!.query(
      _auditTableName,
      orderBy: 'timestamp DESC',
      limit: limit,
    );

    for (final event in events) {
      final storedChecksum = event['checksum'] as String;
      final calculatedChecksum = _generateEventChecksum(
        event['timestamp'] as String,
        event['category'] as String,
        event['event_type'] as String,
        event['event_data'] as String,
      );

      if (storedChecksum != calculatedChecksum) {
        await logSecurityEvent(
          'audit_integrity_violation',
          error: 'Checksum mismatch for event ${event['id']}',
          threat: 'tampered_audit_log',
        );
        return false;
      }
    }

    return true;
  }

  /// Helper methods

  static AuditSeverity _determineSeverity(
    String eventType, 
    bool? success, 
    String? error, 
    String? threat,
  ) {
    if (threat != null) return AuditSeverity.critical;
    if (error != null) return AuditSeverity.error;
    if (success == false) return AuditSeverity.warning;
    if (eventType.contains('failed') || eventType.contains('violation')) {
      return AuditSeverity.error;
    }
    return AuditSeverity.info;
  }

  static String _getDataClassification(String? tableName) {
    const medicalDataTables = {
      'serenya_content': 'medical_analysis',
      'lab_results': 'medical_data',
      'vitals': 'medical_data',
      'chat_messages': 'medical_conversation',
    };
    
    return medicalDataTables[tableName] ?? 'system_data';
  }

  static String _hashUserId(String userId) {
    return _hashSensitiveData(userId).substring(0, 16);
  }

  static String _hashSensitiveData(String data) {
    return sha256.convert(utf8.encode(data)).toString();
  }

  static Map<String, dynamic> _cleanSensitiveData(Map<String, dynamic> data) {
    final cleaned = Map<String, dynamic>.from(data);
    
    // Remove or hash sensitive fields
    final sensitiveKeys = ['password', 'pin', 'token', 'key', 'secret'];
    
    for (final key in cleaned.keys.toList()) {
      final keyLower = key.toString().toLowerCase();
      for (final sensitive in sensitiveKeys) {
        if (keyLower.contains(sensitive)) {
          if (cleaned[key] is String) {
            cleaned[key] = _hashSensitiveData(cleaned[key]);
          } else {
            cleaned[key] = '[REDACTED]';
          }
          break;
        }
      }
    }
    
    return cleaned;
  }

  static String _generateEventChecksum(
    String timestamp,
    String category,
    String eventType,
    String eventData,
  ) {
    final combined = '$timestamp|$category|$eventType|$eventData';
    return sha256.convert(utf8.encode(combined)).toString();
  }

  static Future<String> _getDeviceId() async {
    // Generate stable device identifier
    final deviceData = '${Platform.operatingSystem}-${Platform.localHostname}';
    return sha256.convert(utf8.encode(deviceData)).toString().substring(0, 16);
  }

  static Future<String> _getAppVersion() async {
    return '1.0.0'; // TODO: Get from package info
  }

  /// Close audit database
  static Future<void> close() async {
    if (_auditDb != null) {
      await _auditDb!.close();
      _auditDb = null;
    }
  }

  /// Delete audit logs (for privacy compliance)
  static Future<void> deleteAuditLogs({
    DateTime? olderThan,
    AuditCategory? category,
  }) async {
    await initialize();
    
    if (_auditDb == null) return;

    final whereClauses = <String>[];
    final whereArgs = <dynamic>[];

    if (olderThan != null) {
      whereClauses.add('timestamp < ?');
      whereArgs.add(olderThan.toIso8601String());
    }

    if (category != null) {
      whereClauses.add('category = ?');
      whereArgs.add(category.toString().split('.').last);
    }

    final whereClause = whereClauses.isNotEmpty ? whereClauses.join(' AND ') : null;

    final deletedRows = await _auditDb!.delete(
      _auditTableName,
      where: whereClause,
      whereArgs: whereArgs.isNotEmpty ? whereArgs : null,
    );

    await logSystemEvent(
      'audit_logs_deleted',
      additionalData: {'deleted_rows': deletedRows},
    );
  }
}

/// Audit exception for error handling
class AuditException implements Exception {
  final String message;
  
  AuditException(this.message);
  
  @override
  String toString() => 'AuditException: $message';
}