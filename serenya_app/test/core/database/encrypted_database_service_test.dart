import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:serenya_app/core/database/encrypted_database_service.dart';

void main() {
  group('EncryptedDatabaseService Public API', () {
    setUpAll(() {
      // Initialize FFI for testing
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    });

    setUp(() async {
      // Clean up any existing database state
      await EncryptedDatabaseService.close();
    });

    tearDown(() async {
      // Clean up database after each test
      await EncryptedDatabaseService.close();
    });

    group('Database Connection', () {
      test('should get database instance', () async {
        final database = await EncryptedDatabaseService.database;
        expect(database, isNotNull);
      });

      test('should return same instance on multiple calls', () async {
        final db1 = await EncryptedDatabaseService.database;
        final db2 = await EncryptedDatabaseService.database;
        expect(identical(db1, db2), isTrue);
      });

      test('should close database properly', () async {
        // Get database instance
        final database = await EncryptedDatabaseService.database;
        expect(database, isNotNull);
        
        // Close database
        await EncryptedDatabaseService.close();
        
        // Getting database again should create new instance
        final newDatabase = await EncryptedDatabaseService.database;
        expect(newDatabase, isNotNull);
        expect(identical(database, newDatabase), isFalse);
      });
    });

    group('Database Schema', () {
      test('should have all required tables', () async {
        final database = await EncryptedDatabaseService.database;
        
        // Query master table to check if tables exist
        final tables = await database.query('sqlite_master', 
          where: 'type = ?', 
          whereArgs: ['table']);
        
        final tableNames = tables.map((table) => table['name']).toSet();
        
        // Verify all required tables exist
        expect(tableNames.contains('serenya_content'), isTrue);
        expect(tableNames.contains('lab_results'), isTrue);
        expect(tableNames.contains('vitals'), isTrue);
        expect(tableNames.contains('chat_messages'), isTrue);
        expect(tableNames.contains('user_preferences'), isTrue);
      });

      test('should have proper indexes', () async {
        final database = await EncryptedDatabaseService.database;
        
        // Query indexes
        final indexes = await database.query('sqlite_master', 
          where: 'type = ?', 
          whereArgs: ['index']);
        
        final indexNames = indexes.map((index) => index['name']).toSet();
        
        // Verify key indexes exist
        expect(indexNames.contains('idx_serenya_content_created_at'), isTrue);
        expect(indexNames.contains('idx_lab_results_serenya_content_id'), isTrue);
        expect(indexNames.contains('idx_vitals_serenya_content_id'), isTrue);
        expect(indexNames.contains('idx_chat_messages_serenya_content_id'), isTrue);
      });
    });

    group('Database Operations', () {
      test('should perform basic CRUD operations', () async {
        final database = await EncryptedDatabaseService.database;
        
        // Test insert
        const testPreference = {
          'id': 'test-pref-1',
          'preference_key': 'test_key',
          'preference_value': 'test_value',
          'created_at': '2024-01-01T00:00:00.000Z',
          'updated_at': '2024-01-01T00:00:00.000Z',
        };
        
        await database.insert('user_preferences', testPreference);
        
        // Test select
        final results = await database.query('user_preferences', 
          where: 'preference_key = ?', 
          whereArgs: ['test_key']);
        
        expect(results, hasLength(1));
        expect(results.first['preference_key'], 'test_key');
        expect(results.first['preference_value'], 'test_value');
        
        // Test update
        await database.update('user_preferences', 
          {'preference_value': 'updated_value'},
          where: 'id = ?', 
          whereArgs: ['test-pref-1']);
        
        final updatedResults = await database.query('user_preferences', 
          where: 'id = ?', 
          whereArgs: ['test-pref-1']);
        
        expect(updatedResults.first['preference_value'], 'updated_value');
        
        // Test delete
        await database.delete('user_preferences', 
          where: 'id = ?', 
          whereArgs: ['test-pref-1']);
        
        final deletedResults = await database.query('user_preferences', 
          where: 'id = ?', 
          whereArgs: ['test-pref-1']);
        
        expect(deletedResults, isEmpty);
      });

      test('should handle transactions', () async {
        final database = await EncryptedDatabaseService.database;
        
        await database.transaction((txn) async {
          await txn.insert('user_preferences', {
            'id': 'test-pref-txn',
            'preference_key': 'txn_key',
            'preference_value': 'txn_value',
            'created_at': '2024-01-01T00:00:00.000Z',
            'updated_at': '2024-01-01T00:00:00.000Z',
          });
        });
        
        final results = await database.query('user_preferences', 
          where: 'preference_key = ?', 
          whereArgs: ['txn_key']);
        
        expect(results, hasLength(1));
        expect(results.first['preference_value'], 'txn_value');
      });
    });
  });
}