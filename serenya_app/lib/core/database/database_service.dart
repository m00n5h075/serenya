import 'dart:io';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:sqlite3_flutter_libs/sqlite3_flutter_libs.dart';
import 'package:path/path.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:crypto/crypto.dart';

class DatabaseService {
  static Database? _database;
  static const _databaseName = 'serenya_health.db';
  static const _databaseVersion = 1;
  static const _secureStorage = FlutterSecureStorage();

  static Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  static Future<Database> _initDatabase() async {
    if (Platform.isLinux || Platform.isWindows) {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    } else {
      await applyWorkaroundToOpenSqlite3OnOldAndroidVersions();
    }
    
    final databasePath = await getDatabasesPath();
    final path = join(databasePath, _databaseName);
    
    final password = await _getDatabasePassword();
    
    return await openDatabase(
      path,
      version: _databaseVersion,
      onCreate: _onCreate,
      onUpgrade: _onUpgrade,
      onOpen: (db) async {
        await db.execute("PRAGMA key = '$password'");
      },
    );
  }

  static Future<String> _getDatabasePassword() async {
    const passwordKey = 'database_encryption_key';
    
    String? password = await _secureStorage.read(key: passwordKey);
    
    if (password == null) {
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final deviceId = Platform.localHostname;
      final rawPassword = '$timestamp-$deviceId-serenya-health';
      
      final bytes = sha256.convert(rawPassword.codeUnits);
      password = bytes.toString();
      
      await _secureStorage.write(key: passwordKey, value: password);
    }
    
    return password;
  }

  static Future<void> _onCreate(Database db, int version) async {
    await db.execute('''
      CREATE TABLE health_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        upload_date INTEGER NOT NULL,
        processing_status TEXT NOT NULL DEFAULT 'pending',
        ai_confidence_score REAL,
        interpretation_text TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE interpretations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        interpretation_type TEXT NOT NULL,
        confidence_score REAL NOT NULL,
        interpretation_text TEXT NOT NULL,
        medical_flags TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (document_id) REFERENCES health_documents (id) ON DELETE CASCADE
      )
    ''');

    await db.execute('''
      CREATE TABLE user_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        preference_key TEXT UNIQUE NOT NULL,
        preference_value TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE consent_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        consent_type TEXT NOT NULL,
        consent_given INTEGER NOT NULL,
        consent_date INTEGER NOT NULL,
        version TEXT NOT NULL
      )
    ''');

    await db.execute('''
      CREATE INDEX idx_documents_upload_date ON health_documents(upload_date);
    ''');

    await db.execute('''
      CREATE INDEX idx_interpretations_document_id ON interpretations(document_id);
    ''');
  }

  static Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    // Handle database migrations here
  }

  static Future<void> close() async {
    final db = _database;
    if (db != null) {
      await db.close();
      _database = null;
    }
  }

  static Future<void> deleteDatabase() async {
    final databasePath = await getDatabasesPath();
    final path = join(databasePath, _databaseName);
    
    await close();
    
    if (await File(path).exists()) {
      await File(path).delete();
    }
    
    await _secureStorage.delete(key: 'database_encryption_key');
  }
}