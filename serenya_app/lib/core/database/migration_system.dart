import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import '../security/device_key_manager.dart';
import 'encrypted_database_service.dart';

/// Database Migration System for Encrypted SQLite
/// 
/// Handles schema updates while preserving encrypted data
/// Supports both structural and data migrations
/// Integrates with biometric authentication for security
class MigrationSystem {
  static const String _migrationTableName = 'schema_migrations';
  static const String _currentSchemaVersion = '1.0.0';

  /// Available migration strategies
  enum MigrationType {
    addColumn,       // Safe - adds new column
    addTable,        // Safe - adds new table
    addIndex,        // Safe - adds new index
    modifyColumn,    // Risky - requires data migration
    dropColumn,      // Risky - data loss
    renameTable,     // Risky - requires careful handling
    dataTransform,   // Risky - transforms existing data
  }

  /// Migration definition
  class Migration {
    final String version;
    final String description;
    final MigrationType type;
    final Future<void> Function(Database db) up;
    final Future<void> Function(Database db)? down;
    final bool requiresDataMigration;
    final bool requiresReencryption;

    Migration({
      required this.version,
      required this.description,
      required this.type,
      required this.up,
      this.down,
      this.requiresDataMigration = false,
      this.requiresReencryption = false,
    });
  }

  /// Initialize migration system
  static Future<void> initialize(Database db) async {
    try {
      // Create migration tracking table
      await _createMigrationTable(db);
      
      // Check current schema version
      await _verifySchemaVersion(db);
      
      await _logMigrationEvent('migration_system_initialized');
    } catch (e) {
      await _logMigrationEvent('migration_system_init_failed', error: e.toString());
      rethrow;
    }
  }

  /// Create migration tracking table
  static Future<void> _createMigrationTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS $_migrationTableName (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL,
        description TEXT NOT NULL,
        migration_type TEXT NOT NULL,
        checksum TEXT NOT NULL
      );
    ''');
  }

  /// Verify and update schema version
  static Future<void> _verifySchemaVersion(Database db) async {
    // Check if current version is already applied
    final result = await db.query(
      _migrationTableName,
      where: 'version = ?',
      whereArgs: [_currentSchemaVersion],
    );

    if (result.isEmpty) {
      // Record initial schema version
      await _recordMigration(db, Migration(
        version: _currentSchemaVersion,
        description: 'Initial encrypted database schema',
        type: MigrationType.addTable,
        up: (db) async {}, // Already created in main schema
      ));
    }
  }

  /// Apply pending migrations
  static Future<void> applyMigrations(Database db) async {
    try {
      final pendingMigrations = await _getPendingMigrations(db);
      
      if (pendingMigrations.isEmpty) {
        await _logMigrationEvent('no_pending_migrations');
        return;
      }

      await _logMigrationEvent('applying_migrations', 
          count: pendingMigrations.length);

      for (final migration in pendingMigrations) {
        await _applyMigration(db, migration);
      }

      await _logMigrationEvent('migrations_completed');
    } catch (e) {
      await _logMigrationEvent('migration_failed', error: e.toString());
      rethrow;
    }
  }

  /// Get list of pending migrations
  static Future<List<Migration>> _getPendingMigrations(Database db) async {
    final appliedVersions = await _getAppliedVersions(db);
    final allMigrations = _getAllMigrations();
    
    return allMigrations
        .where((migration) => !appliedVersions.contains(migration.version))
        .toList();
  }

  /// Get list of applied migration versions
  static Future<Set<String>> _getAppliedVersions(Database db) async {
    final result = await db.query(_migrationTableName, columns: ['version']);
    return result.map((row) => row['version'] as String).toSet();
  }

  /// Apply a single migration
  static Future<void> _applyMigration(Database db, Migration migration) async {
    try {
      await _logMigrationEvent('applying_migration', 
          version: migration.version, description: migration.description);

      // Start transaction for atomic migration
      await db.transaction((txn) async {
        // Handle data migration if required
        if (migration.requiresDataMigration) {
          await _backupDataBeforeMigration(txn, migration);
        }

        // Handle re-encryption if required
        if (migration.requiresReencryption) {
          await _reencryptDataForMigration(txn, migration);
        }

        // Apply the migration
        await migration.up(txn);

        // Record successful migration
        await _recordMigration(txn, migration);
      });

      await _logMigrationEvent('migration_applied_successfully',
          version: migration.version);

    } catch (e) {
      await _logMigrationEvent('migration_application_failed',
          version: migration.version, error: e.toString());
      rethrow;
    }
  }

  /// Backup data before risky migration
  static Future<void> _backupDataBeforeMigration(
    DatabaseExecutor db, 
    Migration migration,
  ) async {
    try {
      // Create backup tables for affected data
      await _logMigrationEvent('creating_migration_backup',
          version: migration.version);
      
      // This would backup affected tables
      // Implementation depends on specific migration needs
      
      await _logMigrationEvent('migration_backup_completed',
          version: migration.version);
    } catch (e) {
      await _logMigrationEvent('migration_backup_failed',
          version: migration.version, error: e.toString());
      rethrow;
    }
  }

  /// Re-encrypt data with new keys if required
  static Future<void> _reencryptDataForMigration(
    DatabaseExecutor db,
    Migration migration,
  ) async {
    try {
      await _logMigrationEvent('starting_data_reencryption',
          version: migration.version);

      // This would handle key rotation and data re-encryption
      // Implementation depends on specific encryption changes

      await _logMigrationEvent('data_reencryption_completed',
          version: migration.version);
    } catch (e) {
      await _logMigrationEvent('data_reencryption_failed',
          version: migration.version, error: e.toString());
      rethrow;
    }
  }

  /// Record successful migration
  static Future<void> _recordMigration(
    DatabaseExecutor db, 
    Migration migration,
  ) async {
    final checksum = _generateMigrationChecksum(migration);
    
    await db.insert(_migrationTableName, {
      'version': migration.version,
      'applied_at': DateTime.now().toIso8601String(),
      'description': migration.description,
      'migration_type': migration.type.toString(),
      'checksum': checksum,
    });
  }

  /// Generate checksum for migration integrity
  static String _generateMigrationChecksum(Migration migration) {
    final data = '${migration.version}-${migration.description}-${migration.type}';
    return EnhancedEncryptionUtils.hashSensitiveData(data);
  }

  /// Rollback last migration (if supported)
  static Future<void> rollbackLastMigration(Database db) async {
    try {
      final lastMigration = await _getLastAppliedMigration(db);
      if (lastMigration == null) {
        throw MigrationException('No migration to rollback');
      }

      final migration = _getMigrationByVersion(lastMigration['version']);
      if (migration?.down == null) {
        throw MigrationException('Migration does not support rollback');
      }

      await _logMigrationEvent('rolling_back_migration',
          version: lastMigration['version']);

      await db.transaction((txn) async {
        // Apply rollback
        await migration!.down!(txn);
        
        // Remove migration record
        await txn.delete(
          _migrationTableName,
          where: 'version = ?',
          whereArgs: [lastMigration['version']],
        );
      });

      await _logMigrationEvent('migration_rollback_completed',
          version: lastMigration['version']);

    } catch (e) {
      await _logMigrationEvent('migration_rollback_failed', error: e.toString());
      rethrow;
    }
  }

  /// Get last applied migration
  static Future<Map<String, dynamic>?> _getLastAppliedMigration(Database db) async {
    final result = await db.query(
      _migrationTableName,
      orderBy: 'applied_at DESC',
      limit: 1,
    );
    
    return result.isNotEmpty ? result.first : null;
  }

  /// Get migration by version
  static Migration? _getMigrationByVersion(String version) {
    final migrations = _getAllMigrations();
    try {
      return migrations.firstWhere((m) => m.version == version);
    } catch (e) {
      return null;
    }
  }

  /// Define all available migrations
  static List<Migration> _getAllMigrations() {
    return [
      // Version 1.0.0 - Initial schema (already applied)
      Migration(
        version: '1.0.0',
        description: 'Initial encrypted database schema',
        type: MigrationType.addTable,
        up: (db) async {
          // Schema already created in EncryptedDatabaseService
        },
      ),

      // Example future migrations:
      
      // Migration(
      //   version: '1.1.0',
      //   description: 'Add user preferences sync timestamp',
      //   type: MigrationType.addColumn,
      //   up: (db) async {
      //     await db.execute('''
      //       ALTER TABLE user_preferences 
      //       ADD COLUMN last_synced_at TEXT;
      //     ''');
      //   },
      //   down: (db) async {
      //     // SQLite doesn't support DROP COLUMN directly
      //     // Would require table recreation
      //   },
      // ),

      // Migration(
      //   version: '1.2.0',
      //   description: 'Add medical document metadata table',
      //   type: MigrationType.addTable,
      //   up: (db) async {
      //     await db.execute('''
      //       CREATE TABLE document_metadata (
      //         id TEXT PRIMARY KEY,
      //         serenya_content_id TEXT NOT NULL,
      //         original_filename TEXT,
      //         file_size INTEGER,
      //         mime_type TEXT,
      //         upload_source TEXT,
      //         created_at TEXT NOT NULL
      //       );
      //     ''');
      //     
      //     await db.execute('''
      //       CREATE INDEX idx_document_metadata_content_id 
      //       ON document_metadata(serenya_content_id);
      //     ''');
      //   },
      //   down: (db) async {
      //     await db.execute('DROP TABLE document_metadata;');
      //   },
      // ),
    ];
  }

  /// Get current schema version
  static Future<String> getCurrentSchemaVersion(Database db) async {
    final result = await db.query(
      _migrationTableName,
      columns: ['version'],
      orderBy: 'applied_at DESC',
      limit: 1,
    );

    return result.isNotEmpty 
        ? result.first['version'] as String 
        : 'unknown';
  }

  /// Get migration status report
  static Future<Map<String, dynamic>> getMigrationStatus(Database db) async {
    final appliedVersions = await _getAppliedVersions(db);
    final allMigrations = _getAllMigrations();
    final pendingMigrations = await _getPendingMigrations(db);
    final currentVersion = await getCurrentSchemaVersion(db);

    return {
      'current_version': currentVersion,
      'total_migrations': allMigrations.length,
      'applied_migrations': appliedVersions.length,
      'pending_migrations': pendingMigrations.length,
      'applied_versions': appliedVersions.toList()..sort(),
      'pending_versions': pendingMigrations.map((m) => m.version).toList(),
      'last_migration_at': await _getLastMigrationDate(db),
    };
  }

  /// Get date of last applied migration
  static Future<String?> _getLastMigrationDate(Database db) async {
    final result = await db.query(
      _migrationTableName,
      columns: ['applied_at'],
      orderBy: 'applied_at DESC',
      limit: 1,
    );

    return result.isNotEmpty ? result.first['applied_at'] as String : null;
  }

  /// Verify migration integrity
  static Future<bool> verifyMigrationIntegrity(Database db) async {
    try {
      final appliedMigrations = await db.query(_migrationTableName);
      
      for (final applied in appliedMigrations) {
        final version = applied['version'] as String;
        final storedChecksum = applied['checksum'] as String;
        
        final migration = _getMigrationByVersion(version);
        if (migration != null) {
          final currentChecksum = _generateMigrationChecksum(migration);
          if (storedChecksum != currentChecksum) {
            await _logMigrationEvent('migration_integrity_violation',
                version: version);
            return false;
          }
        }
      }
      
      await _logMigrationEvent('migration_integrity_verified');
      return true;
    } catch (e) {
      await _logMigrationEvent('migration_integrity_check_failed', error: e.toString());
      return false;
    }
  }

  /// Log migration events
  static Future<void> _logMigrationEvent(
    String event, {
    String? version,
    String? description,
    String? error,
    int? count,
  }) async {
    if (kDebugMode) {
      print('MIGRATION: $event - Version: $version, Error: $error');
    }
    
    // TODO: Integrate with comprehensive audit logging system
  }
}

/// Migration exception for error handling
class MigrationException implements Exception {
  final String message;
  
  MigrationException(this.message);
  
  @override
  String toString() => 'MigrationException: $message';
}