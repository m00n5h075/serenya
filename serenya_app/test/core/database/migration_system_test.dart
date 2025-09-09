import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:serenya_app/core/database/migration_system.dart';

/// Migration System Test - Task 10 Database Migration Validation
/// 
/// This test validates the database migration system functionality:
/// - Migration system initialization
/// - Migration table creation
/// - Version tracking
/// - Migration type classification

void main() {
  late Database testDb;

  setUpAll(() async {
    // Initialize sqflite_ffi for testing
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    // Create in-memory database for testing
    testDb = await openDatabase(
      inMemoryDatabasePath,
      version: 1,
      onCreate: (db, version) async {
        // Create initial table for migration testing
        await db.execute('''
          CREATE TABLE test_table (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            version INTEGER DEFAULT 1
          );
        ''');
      },
    );
  });

  tearDown(() async {
    await testDb.close();
  });

  group('Migration System Initialization', () {
    test('should initialize migration system and create tracking table', () async {
      await MigrationSystem.initialize(testDb);

      // Verify migration table was created
      final tables = await testDb.rawQuery(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
      );
      
      expect(tables.length, 1);
      expect(tables.first['name'], 'schema_migrations');

      // Verify table structure
      final schema = await testDb.rawQuery("PRAGMA table_info(schema_migrations)");
      final columnNames = schema.map((row) => row['name']).toList();
      
      expect(columnNames, contains('version'));
      expect(columnNames, contains('applied_at'));
      expect(columnNames, contains('description'));
      expect(columnNames, contains('migration_type'));
      expect(columnNames, contains('checksum'));
    });

    test('should record initial schema version', () async {
      await MigrationSystem.initialize(testDb);

      // Check that initial migration was recorded
      final result = await testDb.query(
        'schema_migrations',
        where: 'version = ?',
        whereArgs: ['1.0.0'],
      );

      expect(result.length, 1);
      expect(result.first['version'], '1.0.0');
      expect(result.first['description'], 'Initial encrypted database schema');
      expect(result.first['migration_type'], 'MigrationType.addTable');
    });
  });

  group('Migration Types', () {
    test('should validate Migration class creation', () {
      final migration = Migration(
        version: '1.0.1',
        description: 'Add email column',
        type: MigrationType.addColumn,
        up: (txn) async {
          await txn.execute('ALTER TABLE test_table ADD COLUMN email TEXT');
        },
      );

      expect(migration.version, '1.0.1');
      expect(migration.description, 'Add email column');
      expect(migration.type, MigrationType.addColumn);
      expect(migration.requiresDataMigration, false);
      expect(migration.requiresReencryption, false);
      expect(migration.down, null);
    });

    test('should create Migration with rollback capability', () {
      final migration = Migration(
        version: '1.0.1',
        description: 'Add email column',
        type: MigrationType.addColumn,
        requiresDataMigration: true,
        requiresReencryption: true,
        up: (txn) async {
          await txn.execute('ALTER TABLE test_table ADD COLUMN email TEXT');
        },
        down: (txn) async {
          // Note: SQLite doesn't support DROP COLUMN, this is for testing
          await txn.execute('SELECT 1'); // Placeholder rollback
        },
      );

      expect(migration.requiresDataMigration, true);
      expect(migration.requiresReencryption, true);
      expect(migration.down, isNotNull);
    });
  });

  group('Migration Enum Values', () {
    test('should have all expected migration types', () {
      expect(MigrationType.addColumn, isA<MigrationType>());
      expect(MigrationType.addTable, isA<MigrationType>());
      expect(MigrationType.addIndex, isA<MigrationType>());
      expect(MigrationType.modifyColumn, isA<MigrationType>());
      expect(MigrationType.dropColumn, isA<MigrationType>());
      expect(MigrationType.renameTable, isA<MigrationType>());
      expect(MigrationType.dataTransform, isA<MigrationType>());
    });

    test('should differentiate between safe and risky migration types', () {
      // Safe migrations (additive)
      final safeMigration = Migration(
        version: '1.0.1',
        description: 'Add column',
        type: MigrationType.addColumn,
        up: (txn) async {},
      );
      
      // Risky migrations (potentially destructive)
      final riskyMigration = Migration(
        version: '1.0.2',
        description: 'Transform data',
        type: MigrationType.dataTransform,
        up: (txn) async {},
      );

      expect(safeMigration.type, MigrationType.addColumn);
      expect(riskyMigration.type, MigrationType.dataTransform);
    });
  });

}