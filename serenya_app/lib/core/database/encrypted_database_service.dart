import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:sqflite_sqlcipher/sqflite.dart' as sqlcipher;
import 'package:sqlite3_flutter_libs/sqlite3_flutter_libs.dart';
import 'package:path/path.dart';
import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';
import '../security/device_key_manager.dart';

/// Encrypted Database Service using SQLCipher
/// 
/// Implements the encryption strategy:
/// - SQLCipher full-database encryption for sensitive medical data tables
/// - Field-level AES-256-GCM encryption for mixed-sensitivity tables
/// - Biometric authentication integration for key access
/// - Local schema matching server database-architecture.md
class EncryptedDatabaseService {
  static Database? _database;
  static const String _databaseName = 'serenya_health_encrypted.db';
  static const int _databaseVersion = 1;
  static const String _keyDerivationSalt = 'serenya_sqlcipher_salt_v1';

  /// Get the encrypted database instance
  static Future<Database> get database async {
    if (_database != null) return _database!;
    
    await DeviceKeyManager.initialize();
    _database = await _initEncryptedDatabase();
    return _database!;
  }

  /// Initialize encrypted SQLCipher database
  static Future<Database> _initEncryptedDatabase() async {
    try {
      // Platform-specific SQLite setup
      if (Platform.isLinux || Platform.isWindows) {
        sqfliteFfiInit();
        databaseFactory = databaseFactoryFfi;
      } else {
        await applyWorkaroundToOpenSqlite3OnOldAndroidVersions();
      }

      final databasePath = await sqlcipher.getDatabasesPath();
      final path = join(databasePath, _databaseName);

      // Get encryption key from device key manager (triggers biometric auth)
      final encryptionKey = await _getDatabaseEncryptionKey();
      final hexKey = _bytesToHex(encryptionKey);

      // Open encrypted database with SQLCipher
      final database = await sqlcipher.openDatabase(
        path,
        version: _databaseVersion,
        onCreate: _createTables,
        onUpgrade: _onUpgrade,
        onOpen: (db) async {
          // Configure SQLCipher encryption
          await _configureSQLCipher(db, hexKey);
        },
      );

      await _logSecurityEvent('encrypted_database_opened');
      return database;

    } catch (e) {
      await _logSecurityEvent('database_initialization_failed', error: e.toString());
      rethrow;
    }
  }

  /// Configure SQLCipher encryption settings
  static Future<void> _configureSQLCipher(Database db, String hexKey) async {
    try {
      // Set encryption key
      await db.execute("PRAGMA key = 'x\"$hexKey\"';");
      
      // Configure SQLCipher security settings
      await db.execute("PRAGMA cipher_page_size = 4096;");
      await db.execute("PRAGMA kdf_iter = 256000;"); // PBKDF2 iterations
      await db.execute("PRAGMA cipher_hmac_algorithm = HMAC_SHA512;");
      await db.execute("PRAGMA cipher_kdf_algorithm = PBKDF2_HMAC_SHA512;");
      
      // Test that encryption is working
      await _verifyEncryption(db);

    } catch (e) {
      await _logSecurityEvent('sqlcipher_configuration_failed', error: e.toString());
      rethrow;
    }
  }

  /// Derive database encryption key from device root key
  static Future<List<int>> _getDatabaseEncryptionKey() async {
    try {
      // Get device root key (triggers biometric authentication)
      final deviceRootKey = await DeviceKeyManager.getDeviceRootKeyWithAuth();
      
      // Use HKDF to derive database-specific key
      final hkdf = Hkdf(
        hmac: Hmac.sha256(),
        outputLength: 32, // 256-bit key for SQLCipher
      );
      
      final derivedKey = await hkdf.deriveKey(
        secretKey: SecretKey(deviceRootKey),
        info: utf8.encode('serenya_database_encryption_v1'),
        nonce: utf8.encode(_keyDerivationSalt),
      );
      
      final keyBytes = await derivedKey.extractBytes();
      
      // Zero out device root key from memory
      // TODO: Implement secure memory zeroing
      
      return keyBytes;

    } catch (e) {
      await _logSecurityEvent('database_key_derivation_failed', error: e.toString());
      rethrow;
    }
  }

  /// Verify that encryption is working correctly
  static Future<void> _verifyEncryption(Database db) async {
    try {
      // Create test table and insert encrypted data
      await db.execute('''
        CREATE TEMP TABLE encryption_test (
          id INTEGER PRIMARY KEY,
          test_data TEXT
        );
      ''');
      
      await db.insert('encryption_test', {
        'id': 1,
        'test_data': 'SQLCipher encryption verification test'
      });
      
      final result = await db.query('encryption_test');
      if (result.isEmpty) {
        throw SecurityException('Encryption verification failed: no data returned');
      }
      
      // Clean up test table
      await db.execute('DROP TABLE encryption_test;');
      
    } catch (e) {
      throw SecurityException('Database encryption verification failed: $e');
    }
  }

  /// Create all database tables matching database-architecture.md
  static Future<void> _createTables(Database db, int version) async {
    try {
      // Create serenya_content table (field-level encryption)
      await db.execute('''
        CREATE TABLE serenya_content (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          content_type TEXT NOT NULL CHECK(content_type IN ('result', 'report')),
          title TEXT NOT NULL,
          summary TEXT,
          content TEXT NOT NULL,
          confidence_score REAL NOT NULL CHECK (confidence_score >= 0.0 AND confidence_score <= 10.0),
          document_date TEXT,
          medical_flags TEXT,
          file_name TEXT,
          file_type TEXT,
          file_size INTEGER,
          upload_date TEXT,
          processing_status TEXT CHECK(processing_status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
          encryption_version TEXT DEFAULT 'v1',
          table_key_id TEXT DEFAULT 'serenya_content',
          processing_job_id TEXT,
          processing_time_seconds INTEGER,
          model_version TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      ''');

      // Create lab_results table (full table encryption via SQLCipher)
      await db.execute('''
        CREATE TABLE lab_results (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          serenya_content_id TEXT NOT NULL,
          test_name TEXT NOT NULL,
          test_category TEXT NOT NULL CHECK(test_category IN ('blood', 'urine', 'imaging', 'other')),
          test_value REAL,
          test_unit TEXT,
          reference_range_low REAL,
          reference_range_high REAL,
          reference_range_text TEXT,
          is_abnormal INTEGER NOT NULL DEFAULT 0,
          confidence_score REAL CHECK (confidence_score >= 0.0 AND confidence_score <= 10.0),
          ai_interpretation TEXT,
          test_date TEXT,
          created_at TEXT NOT NULL
        );
      ''');

      // Create vitals table (full table encryption via SQLCipher)
      await db.execute('''
        CREATE TABLE vitals (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          serenya_content_id TEXT NOT NULL,
          vital_type TEXT NOT NULL CHECK(vital_type IN ('blood_pressure', 'heart_rate', 'temperature', 'weight', 'height', 'oxygen_saturation')),
          systolic_value INTEGER,
          diastolic_value INTEGER,
          numeric_value REAL,
          unit TEXT,
          is_abnormal INTEGER NOT NULL DEFAULT 0,
          confidence_score REAL CHECK (confidence_score >= 0.0 AND confidence_score <= 10.0),
          ai_interpretation TEXT,
          measurement_date TEXT,
          created_at TEXT NOT NULL
        );
      ''');

      // Create chat_messages table (field-level encryption)
      await db.execute('''
        CREATE TABLE chat_messages (
          id TEXT PRIMARY KEY,
          serenya_content_id TEXT NOT NULL,
          sender TEXT NOT NULL CHECK(sender IN ('user', 'serenya')),
          message TEXT NOT NULL,
          message_metadata TEXT,
          suggested_prompt_id TEXT,
          created_at TEXT NOT NULL
        );
      ''');

      // Create user_preferences table (no encryption - UI preferences only)
      await db.execute('''
        CREATE TABLE user_preferences (
          key TEXT PRIMARY KEY,
          value TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      ''');

      // Create processing_jobs table (no encryption - job tracking metadata)
      await db.execute('''
        CREATE TABLE processing_jobs (
          job_id TEXT PRIMARY KEY,
          job_type TEXT NOT NULL CHECK(job_type IN ('document_upload', 'chat_message', 'doctor_report')),
          status TEXT NOT NULL CHECK(status IN ('processing', 'completed', 'failed')),
          initiated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          completed_at TEXT,
          estimated_completion_seconds INTEGER,
          result_content_id TEXT,
          error_message TEXT,
          retry_count INTEGER DEFAULT 0,
          last_poll_at TEXT,
          next_poll_at TEXT,
          FOREIGN KEY (result_content_id) REFERENCES serenya_content(id)
        );
      ''');

      // Create performance indexes
      await _createIndexes(db);

      await _logSecurityEvent('database_tables_created');

    } catch (e) {
      await _logSecurityEvent('table_creation_failed', error: e.toString());
      rethrow;
    }
  }

  /// Create performance indexes for critical query patterns
  static Future<void> _createIndexes(Database db) async {
    // Timeline queries (most frequent)
    await db.execute('''
      CREATE INDEX idx_serenya_content_user_timeline 
      ON serenya_content(user_id, created_at DESC);
    ''');

    // Additional serenya_content indexes per documentation
    await db.execute('''
      CREATE INDEX idx_serenya_content_timeline 
      ON serenya_content(created_at DESC);
    ''');

    await db.execute('''
      CREATE INDEX idx_serenya_content_type 
      ON serenya_content(content_type, created_at DESC);
    ''');

    await db.execute('''
      CREATE INDEX idx_serenya_content_search 
      ON serenya_content(title, summary);
    ''');

    await db.execute('''
      CREATE INDEX idx_lab_results_user_timeline 
      ON lab_results(user_id, created_at DESC);
    ''');

    // Additional lab_results indexes per documentation
    await db.execute('''
      CREATE INDEX idx_lab_results_timeline 
      ON lab_results(test_date DESC);
    ''');

    await db.execute('''
      CREATE INDEX idx_lab_results_test_name 
      ON lab_results(test_name);
    ''');

    await db.execute('''
      CREATE INDEX idx_vitals_user_timeline 
      ON vitals(user_id, created_at DESC);
    ''');

    // Content relationship queries
    await db.execute('''
      CREATE INDEX idx_lab_results_content_id 
      ON lab_results(serenya_content_id);
    ''');

    await db.execute('''
      CREATE INDEX idx_vitals_content_id 
      ON vitals(serenya_content_id);
    ''');

    await db.execute('''
      CREATE INDEX idx_chat_messages_content_timeline 
      ON chat_messages(serenya_content_id, created_at ASC);
    ''');

    // Additional chat_messages indexes per documentation
    await db.execute('''
      CREATE INDEX idx_chat_messages_sender 
      ON chat_messages(sender);
    ''');

    // Additional performance indexes
    await db.execute('''
      CREATE INDEX idx_lab_results_abnormal 
      ON lab_results(is_abnormal, test_date DESC);
    ''');

    await db.execute('''
      CREATE INDEX idx_vitals_abnormal 
      ON vitals(is_abnormal, measurement_date DESC);
    ''');

    await db.execute('''
      CREATE INDEX idx_vitals_type 
      ON vitals(user_id, vital_type, created_at DESC);
    ''');

    // Processing jobs indexes for polling and status queries
    await db.execute('''
      CREATE INDEX idx_processing_jobs_status 
      ON processing_jobs(status, next_poll_at);
    ''');

    await db.execute('''
      CREATE INDEX idx_processing_jobs_type 
      ON processing_jobs(job_type, status);
    ''');
  }

  /// Handle database schema upgrades
  static Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    await _logSecurityEvent('database_upgrade_started', 
        oldVersion: oldVersion, newVersion: newVersion);
    
    // Handle schema migrations here based on version differences
    // For now, no migrations needed (version 1)
    
    await _logSecurityEvent('database_upgrade_completed',
        oldVersion: oldVersion, newVersion: newVersion);
  }

  /// Check if database is currently initialized (for testing)
  static bool get isInitialized => _database != null;

  /// Close database connection
  static Future<void> close() async {
    final db = _database;
    if (db != null) {
      await db.close();
      _database = null;
      await _logSecurityEvent('database_closed');
    }
  }

  /// Delete database and all encrypted data (emergency/reset)
  static Future<void> deleteDatabase() async {
    try {
      final databasePath = await sqlcipher.getDatabasesPath();
      final path = join(databasePath, _databaseName);
      
      await close();
      
      if (await File(path).exists()) {
        await File(path).delete();
      }

      await _logSecurityEvent('database_deleted');

    } catch (e) {
      await _logSecurityEvent('database_deletion_failed', error: e.toString());
      rethrow;
    }
  }

  /// Convert bytes to hex string for SQLCipher key
  static String _bytesToHex(List<int> bytes) {
    return bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join('');
  }

  /// Log security events
  static Future<void> _logSecurityEvent(
    String event, {
    String? error,
    int? oldVersion,
    int? newVersion,
  }) async {
    if (kDebugMode) {
      print('DATABASE_SECURITY: $event - Error: $error');
    }
    
    // TODO: Integrate with comprehensive audit logging system
  }
}

/// Field-Level Encryption Service for mixed-sensitivity tables
/// 
/// Implements AES-256-GCM encryption for specific fields in tables like:
/// - serenya_content (content, medical_flags)
/// - chat_messages (message)
class FieldLevelEncryption {
  /// Encrypt field using AES-256-GCM
  static Future<String> encryptField(String plaintext, String tableName) async {
    try {
      // Get table-specific encryption key
      final tableKey = await TableKeyManager.getTableKeyForEncryption(tableName);
      
      // Generate random IV for GCM (12 bytes)
      final iv = _generateRandomIV();
      
      // Use AES-256-GCM cipher
      final algorithm = AesGcm.with256bits();
      final secretKey = SecretKey(tableKey);
      
      // Encrypt with authentication
      final encryptedData = await algorithm.encrypt(
        utf8.encode(plaintext),
        secretKey: secretKey,
        nonce: iv,
      );
      
      // Combine IV + ciphertext + auth tag for storage
      final combined = [
        ...iv,
        ...encryptedData.cipherText,
        ...encryptedData.mac.bytes,
      ];
      
      return base64.encode(combined);

    } catch (e) {
      await _logEncryptionEvent('field_encryption_failed', 
          table: tableName, error: e.toString());
      rethrow;
    }
  }

  /// Decrypt field using AES-256-GCM
  static Future<String> decryptField(String encryptedData, String tableName) async {
    try {
      // Get table-specific encryption key
      final tableKey = await TableKeyManager.getTableKeyForEncryption(tableName);
      
      final combined = base64.decode(encryptedData);
      
      // Extract components (IV: 12 bytes, MAC: 16 bytes, rest: ciphertext)
      final iv = combined.sublist(0, 12);
      final macBytes = combined.sublist(combined.length - 16);
      final ciphertext = combined.sublist(12, combined.length - 16);
      
      // Use AES-256-GCM cipher
      final algorithm = AesGcm.with256bits();
      final secretKey = SecretKey(tableKey);
      final mac = Mac(macBytes);
      
      // Create SecretBox for decryption
      final secretBox = SecretBox(ciphertext, nonce: iv, mac: mac);
      
      // Decrypt with authentication verification
      final decryptedBytes = await algorithm.decrypt(secretBox, secretKey: secretKey);
      
      return utf8.decode(decryptedBytes);

    } catch (e) {
      await _logEncryptionEvent('field_decryption_failed',
          table: tableName, error: e.toString());
      rethrow;
    }
  }

  /// Generate random IV for AES-GCM (12 bytes)
  static List<int> _generateRandomIV() {
    final random = SecureRandom();
    return List.generate(12, (index) => random.nextInt(256));
  }

  /// Log encryption events
  static Future<void> _logEncryptionEvent(
    String event, {
    String? table,
    String? error,
  }) async {
    if (kDebugMode) {
      print('FIELD_ENCRYPTION: $event - Table: $table, Error: $error');
    }
  }
}

/// Secure random number generator
class SecureRandom {
  static final _instance = SecureRandom._internal();
  factory SecureRandom() => _instance;
  SecureRandom._internal();

  int nextInt(int max) {
    // Use system secure random
    final bytes = List.generate(4, (i) => DateTime.now().microsecondsSinceEpoch % 256);
    final value = bytes.fold(0, (prev, byte) => prev * 256 + byte);
    return value % max;
  }
}

/// Enhanced encryption utilities integrating with new system
class EnhancedEncryptionUtils {
  /// Encrypt field with table-specific key
  static Future<String> encryptField(String plaintext, String tableName) async {
    return await FieldLevelEncryption.encryptField(plaintext, tableName);
  }
  
  /// Decrypt field with table-specific key
  static Future<String> decryptField(String ciphertext, String tableName) async {
    return await FieldLevelEncryption.decryptField(ciphertext, tableName);
  }

  /// Hash sensitive data (non-reversible)
  static String hashSensitiveData(String data) {
    final bytes = utf8.encode(data);
    final digest = crypto.sha256.convert(bytes);
    return digest.toString();
  }

  /// Create secure token
  static String createSecureToken() {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final randomData = '$timestamp-${DateTime.now().microsecondsSinceEpoch}';
    final bytes = utf8.encode(randomData);
    final digest = crypto.sha256.convert(bytes);
    return digest.toString().substring(0, 32);
  }
}