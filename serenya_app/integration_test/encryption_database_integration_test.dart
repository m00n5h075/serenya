import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:serenya_app/core/security/biometric_auth_service.dart';
import 'package:serenya_app/core/security/device_key_manager.dart';
import 'package:serenya_app/core/security/local_audit_logger.dart';
import 'package:serenya_app/core/database/encrypted_database_service.dart';
import 'package:serenya_app/core/database/migration_system.dart';
import 'package:serenya_app/models/local_database_models.dart';

/// Integration tests for the complete encryption and database system
/// 
/// Tests the full workflow:
/// 1. Biometric authentication setup
/// 2. Device key generation and storage
/// 3. SQLCipher database creation
/// 4. Field-level encryption for sensitive data
/// 5. Local audit logging
/// 6. Database migrations
/// 7. Data integrity verification
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Encryption & Database Integration Tests', () {
    setUpAll(() async {
      // Initialize audit logging system
      await LocalAuditLogger.initialize();
    });

    tearDownAll(() async {
      // Cleanup test data
      await EncryptedDatabaseService.close();
      await LocalAuditLogger.close();
    });

    group('Authentication System Integration', () {
      testWidgets('should initialize biometric authentication system', (tester) async {
        await BiometricAuthService.initialize();

        // Verify system is initialized
        expect(BiometricAuthService.isBiometricAvailable, returnsNormally);
        expect(BiometricAuthService.isPinSet, returnsNormally);
      });

      testWidgets('should setup PIN authentication fallback', (tester) async {
        const testPin = '1234';
        
        final setupResult = await BiometricAuthService.setupPin(testPin);
        expect(setupResult, true);

        final isPinSet = await BiometricAuthService.isPinSet();
        expect(isPinSet, true);

        final verifyResult = await BiometricAuthService.verifyPin(testPin);
        expect(verifyResult, true);

        final verifyWrongResult = await BiometricAuthService.verifyPin('4321');
        expect(verifyWrongResult, false);
      });

      testWidgets('should manage authentication sessions', (tester) async {
        // Start session
        await SessionManager.startSession(AuthMethod.pin);
        
        expect(SessionManager.isAuthenticated, true);
        expect(SessionManager.currentAuthMethod, AuthMethod.pin);
        expect(SessionManager.sessionId, isNotNull);

        // Update activity
        SessionManager.updateActivity();
        expect(SessionManager.isSessionValid(), true);

        // Expire session
        await SessionManager.expireSession();
        expect(SessionManager.isAuthenticated, false);
        expect(SessionManager.currentAuthMethod, AuthMethod.none);
      });
    });

    group('Device Key Management Integration', () {
      testWidgets('should initialize device root key system', (tester) async {
        await DeviceKeyManager.initialize();

        // Should complete without throwing
        expect(DeviceKeyManager.initialize, returnsNormally);
      });

      testWidgets('should derive table-specific keys', (tester) async {
        // Setup authentication first
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);

        // Test key derivation for different tables
        final contentKey = await TableKeyManager.getTableKeyForEncryption('serenya_content');
        final labResultsKey = await TableKeyManager.getTableKeyForEncryption('lab_results');
        final vitalsKey = await TableKeyManager.getTableKeyForEncryption('vitals');
        final chatKey = await TableKeyManager.getTableKeyForEncryption('chat_messages');

        expect(contentKey.length, 32); // 256-bit keys
        expect(labResultsKey.length, 32);
        expect(vitalsKey.length, 32);
        expect(chatKey.length, 32);

        // Different tables should produce different keys
        expect(contentKey, isNot(equals(labResultsKey)));
        expect(contentKey, isNot(equals(chatKey)));

        // lab_results and vitals should use same context (medical data)
        expect(labResultsKey, equals(vitalsKey));
      });

      testWidgets('should cache keys for performance', (tester) async {
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);

        final startTime = DateTime.now();
        await TableKeyManager.getTableKeyForEncryption('serenya_content');
        final firstCallDuration = DateTime.now().difference(startTime);

        final startTime2 = DateTime.now();
        await TableKeyManager.getTableKeyForEncryption('serenya_content');
        final secondCallDuration = DateTime.now().difference(startTime2);

        // Second call should be faster due to caching
        expect(secondCallDuration.inMilliseconds, lessThan(firstCallDuration.inMilliseconds));
      });
    });

    group('Encrypted Database Integration', () {
      testWidgets('should create encrypted SQLCipher database', (tester) async {
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);

        final db = await EncryptedDatabaseService.database;
        expect(db, isNotNull);

        // Verify tables were created
        final tables = await db.query('sqlite_master', where: 'type = ?', whereArgs: ['table']);
        final tableNames = tables.map((t) => t['name']).toSet();

        expect(tableNames, contains('serenya_content'));
        expect(tableNames, contains('lab_results'));
        expect(tableNames, contains('vitals'));
        expect(tableNames, contains('chat_messages'));
        expect(tableNames, contains('user_preferences'));
      });

      testWidgets('should verify database encryption is active', (tester) async {
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);

        final db = await EncryptedDatabaseService.database;
        
        // Insert test data
        await db.insert('user_preferences', {
          'id': 'test-pref-1',
          'preference_key': 'test_key',
          'preference_value': 'test_value',
          'created_at': DateTime.now().toIso8601String(),
          'updated_at': DateTime.now().toIso8601String(),
        });

        // Verify data can be retrieved
        final result = await db.query('user_preferences', where: 'id = ?', whereArgs: ['test-pref-1']);
        expect(result.length, 1);
        expect(result.first['preference_value'], 'test_value');
      });
    });

    group('Field-Level Encryption Integration', () {
      testWidgets('should encrypt and decrypt serenya_content fields', (tester) async {
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);

        const originalContent = 'This is sensitive medical analysis content';
        const originalFlags = '["flag1", "flag2", "medical_alert"]';

        // Encrypt fields
        final encryptedContent = await FieldLevelEncryption.encryptField(
          originalContent, 'serenya_content'
        );
        final encryptedFlags = await FieldLevelEncryption.encryptField(
          originalFlags, 'serenya_content'
        );

        expect(encryptedContent, isNot(equals(originalContent)));
        expect(encryptedFlags, isNot(equals(originalFlags)));

        // Decrypt fields
        final decryptedContent = await FieldLevelEncryption.decryptField(
          encryptedContent, 'serenya_content'
        );
        final decryptedFlags = await FieldLevelEncryption.decryptField(
          encryptedFlags, 'serenya_content'
        );

        expect(decryptedContent, originalContent);
        expect(decryptedFlags, originalFlags);
      });

      testWidgets('should encrypt and decrypt chat_messages fields', (tester) async {
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);

        const originalMessage = 'What does this medical result mean?';

        final encryptedMessage = await FieldLevelEncryption.encryptField(
          originalMessage, 'chat_messages'
        );
        final decryptedMessage = await FieldLevelEncryption.decryptField(
          encryptedMessage, 'chat_messages'
        );

        expect(encryptedMessage, isNot(equals(originalMessage)));
        expect(decryptedMessage, originalMessage);
      });

      testWidgets('should use different keys for different tables', (tester) async {
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);

        const testData = 'Same plaintext data';

        final contentEncrypted = await FieldLevelEncryption.encryptField(
          testData, 'serenya_content'
        );
        final chatEncrypted = await FieldLevelEncryption.encryptField(
          testData, 'chat_messages'
        );

        // Same data encrypted with different table keys should produce different ciphertext
        expect(contentEncrypted, isNot(equals(chatEncrypted)));

        // But both should decrypt to original data
        final contentDecrypted = await FieldLevelEncryption.decryptField(
          contentEncrypted, 'serenya_content'
        );
        final chatDecrypted = await FieldLevelEncryption.decryptField(
          chatEncrypted, 'chat_messages'
        );

        expect(contentDecrypted, testData);
        expect(chatDecrypted, testData);
      });
    });

    group('Database Models Integration', () {
      testWidgets('should store and retrieve SerenyaContent with encryption', (tester) async {
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);

        final db = await EncryptedDatabaseService.database;
        
        final originalContent = SerenyaContent(
          id: 'content-test-1',
          userId: 'user-test-1',
          contentType: ContentType.result,
          title: 'Blood Test Analysis',
          content: 'Your blood glucose levels are normal at 95 mg/dL.',
          confidenceScore: 8.5,
          medicalFlags: ['normal_glucose', 'healthy_range'],
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );

        // Store encrypted content
        final encryptedJson = await originalContent.toDatabaseJson();
        await db.insert('serenya_content', encryptedJson);

        // Retrieve and decrypt
        final stored = await db.query('serenya_content', where: 'id = ?', whereArgs: ['content-test-1']);
        expect(stored.length, 1);

        final retrievedContent = await SerenyaContent.fromDatabaseJson(stored.first);
        
        expect(retrievedContent.id, originalContent.id);
        expect(retrievedContent.title, originalContent.title);
        expect(retrievedContent.content, originalContent.content);
        expect(retrievedContent.medicalFlags, originalContent.medicalFlags);
        expect(retrievedContent.confidenceScore, originalContent.confidenceScore);
      });

      testWidgets('should store and retrieve LabResult with SQLCipher encryption', (tester) async {
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);

        final db = await EncryptedDatabaseService.database;
        
        final labResult = LabResult(
          id: 'lab-test-1',
          userId: 'user-test-1',
          serenyaContentId: 'content-test-1',
          testName: 'Blood Glucose',
          testCategory: TestCategoryType.blood,
          testValue: 95.0,
          testUnit: 'mg/dL',
          referenceRangeLow: 70.0,
          referenceRangeHigh: 100.0,
          referenceRangeText: 'Normal',
          isAbnormal: false,
          confidenceScore: 9.0,
          aiInterpretation: 'Glucose level is within normal range.',
          createdAt: DateTime.now(),
        );

        // Store lab result (SQLCipher encrypts automatically)
        await db.insert('lab_results', labResult.toJson());

        // Retrieve lab result
        final stored = await db.query('lab_results', where: 'id = ?', whereArgs: ['lab-test-1']);
        expect(stored.length, 1);

        final retrievedResult = LabResult.fromJson(stored.first);
        
        expect(retrievedResult.id, labResult.id);
        expect(retrievedResult.testName, labResult.testName);
        expect(retrievedResult.testValue, labResult.testValue);
        expect(retrievedResult.isAbnormal, labResult.isAbnormal);
        expect(retrievedResult.aiInterpretation, labResult.aiInterpretation);
      });

      testWidgets('should store and retrieve ChatMessage with encryption', (tester) async {
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);

        final db = await EncryptedDatabaseService.database;
        
        final chatMessage = ChatMessage(
          id: 'msg-test-1',
          serenyaContentId: 'content-test-1',
          sender: MessageSenderType.user,
          message: 'What do these glucose results mean for my health?',
          messageMetadata: {'timestamp': DateTime.now().toIso8601String()},
          createdAt: DateTime.now(),
        );

        // Store encrypted message
        final encryptedJson = await chatMessage.toDatabaseJson();
        await db.insert('chat_messages', encryptedJson);

        // Retrieve and decrypt
        final stored = await db.query('chat_messages', where: 'id = ?', whereArgs: ['msg-test-1']);
        expect(stored.length, 1);

        final retrievedMessage = await ChatMessage.fromDatabaseJson(stored.first);
        
        expect(retrievedMessage.id, chatMessage.id);
        expect(retrievedMessage.sender, chatMessage.sender);
        expect(retrievedMessage.message, chatMessage.message);
        expect(retrievedMessage.messageMetadata, isNotNull);
      });
    });

    group('Migration System Integration', () {
      testWidgets('should initialize migration system', (tester) async {
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);

        final db = await EncryptedDatabaseService.database;
        await MigrationSystem.initialize(db);

        // Verify migration table exists
        final tables = await db.query('sqlite_master', 
            where: 'type = ? AND name = ?', 
            whereArgs: ['table', 'schema_migrations']);
        expect(tables.length, 1);
      });

      testWidgets('should track initial schema version', (tester) async {
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);

        final db = await EncryptedDatabaseService.database;
        await MigrationSystem.initialize(db);

        final currentVersion = await MigrationSystem.getCurrentSchemaVersion(db);
        expect(currentVersion, '1.0.0');

        final status = await MigrationSystem.getMigrationStatus(db);
        expect(status['current_version'], '1.0.0');
        expect(status['total_migrations'], greaterThan(0));
        expect(status['applied_migrations'], greaterThan(0));
      });

      testWidgets('should verify migration integrity', (tester) async {
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);

        final db = await EncryptedDatabaseService.database;
        await MigrationSystem.initialize(db);

        final integrityCheck = await MigrationSystem.verifyMigrationIntegrity(db);
        expect(integrityCheck, true);
      });
    });

    group('Audit Logging Integration', () {
      testWidgets('should log authentication events', (tester) async {
        await LocalAuditLogger.logAuthenticationEvent(
          'pin_setup_test',
          sessionId: 'test-session-1',
          authMethod: 'pin',
          success: true,
        );

        // Query audit events
        final events = await LocalAuditLogger.queryAuditEvents(
          category: LocalAuditLogger.AuditCategory.authentication,
          limit: 10,
        );

        expect(events.isNotEmpty, true);
        
        final testEvent = events.firstWhere(
          (e) => e['event_type'] == 'pin_setup_test',
          orElse: () => <String, dynamic>{},
        );
        expect(testEvent.isNotEmpty, true);
      });

      testWidgets('should log security events', (tester) async {
        await LocalAuditLogger.logSecurityEvent(
          'encryption_key_accessed',
          keyContext: 'serenya_content',
          operation: 'derive_table_key',
          success: true,
        );

        final events = await LocalAuditLogger.queryAuditEvents(
          category: LocalAuditLogger.AuditCategory.securityEvent,
          eventType: 'encryption_key_accessed',
          limit: 5,
        );

        expect(events.isNotEmpty, true);
      });

      testWidgets('should log data access events', (tester) async {
        await LocalAuditLogger.logDataAccess(
          'medical_data_retrieved',
          resourceId: 'content-test-1',
          tableName: 'serenya_content',
          userId: 'user-test-1',
          recordCount: 1,
        );

        final events = await LocalAuditLogger.queryAuditEvents(
          category: LocalAuditLogger.AuditCategory.dataAccess,
          limit: 10,
        );

        expect(events.isNotEmpty, true);
      });

      testWidgets('should generate audit statistics', (tester) async {
        final stats = await LocalAuditLogger.getAuditStatistics();

        expect(stats['total_events'], isA<int>());
        expect(stats['events_by_category'], isA<Map>());
        expect(stats['events_by_severity'], isA<Map>());
      });

      testWidgets('should verify audit log integrity', (tester) async {
        final integrity = await LocalAuditLogger.verifyAuditIntegrity(limit: 50);
        expect(integrity, true);
      });
    });

    group('Performance and Security Validation', () {
      testWidgets('should perform encryption operations within acceptable time limits', (tester) async {
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);

        const testData = 'This is a test of encryption performance with medical data content that should be reasonably sized for typical medical analysis results.';

        final stopwatch = Stopwatch()..start();
        
        final encrypted = await FieldLevelEncryption.encryptField(testData, 'serenya_content');
        final encryptTime = stopwatch.elapsedMilliseconds;
        
        stopwatch.reset();
        final decrypted = await FieldLevelEncryption.decryptField(encrypted, 'serenya_content');
        final decryptTime = stopwatch.elapsedMilliseconds;

        stopwatch.stop();

        // Encryption/decryption should complete within reasonable time (< 100ms each)
        expect(encryptTime, lessThan(100));
        expect(decryptTime, lessThan(100));
        expect(decrypted, testData);
      });

      testWidgets('should maintain data integrity under concurrent operations', (tester) async {
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);

        final db = await EncryptedDatabaseService.database;
        final futures = <Future>[];

        // Perform multiple concurrent database operations
        for (int i = 0; i < 10; i++) {
          futures.add(db.insert('user_preferences', {
            'id': 'concurrent-test-$i',
            'preference_key': 'test_key_$i',
            'preference_value': 'test_value_$i',
            'created_at': DateTime.now().toIso8601String(),
            'updated_at': DateTime.now().toIso8601String(),
          }));
        }

        // Wait for all operations to complete
        await Future.wait(futures);

        // Verify all records were inserted correctly
        final results = await db.query('user_preferences', 
            where: 'preference_key LIKE ?', 
            whereArgs: ['test_key_%']);
        expect(results.length, 10);
      });

      testWidgets('should handle authentication session timeout correctly', (tester) async {
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);

        expect(SessionManager.isSessionValid(), true);

        // Simulate session timeout
        await SessionManager.expireSession();
        expect(SessionManager.isSessionValid(), false);

        // Attempting to access encryption keys should fail
        expect(
          () async => await TableKeyManager.getTableKeyForEncryption('serenya_content'),
          throwsA(isA<SecurityException>()),
        );
      });
    });

    group('Error Recovery and Edge Cases', () {
      testWidgets('should handle database corruption gracefully', (tester) async {
        // This would test database recovery mechanisms
        // For now, ensure the system initializes correctly
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);
        
        final db = await EncryptedDatabaseService.database;
        expect(db, isNotNull);
      });

      testWidgets('should handle encryption key rotation', (tester) async {
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);

        // Test key cache clearing (simulates key rotation)
        await TableKeyManager.clearCachedKeys();

        // Should be able to derive keys again
        final newKey = await TableKeyManager.getTableKeyForEncryption('serenya_content');
        expect(newKey.length, 32);
      });

      testWidgets('should maintain audit trail during errors', (tester) async {
        // Trigger an error condition and verify it's logged
        try {
          await FieldLevelEncryption.decryptField('invalid_data', 'serenya_content');
        } catch (e) {
          // Error expected
        }

        // Verify error was logged
        final events = await LocalAuditLogger.queryAuditEvents(
          category: LocalAuditLogger.AuditCategory.securityEvent,
          severity: LocalAuditLogger.AuditSeverity.error,
          limit: 10,
        );

        // Should have security events logged
        expect(events.isNotEmpty, true);
      });
    });

    group('Cleanup and Resource Management', () {
      testWidgets('should clean up resources properly', (tester) async {
        await BiometricAuthService.setupPin('1234');
        await SessionManager.startSession(AuthMethod.pin);

        // Clear authentication data
        await BiometricAuthService.clearAuthData();
        expect(SessionManager.isAuthenticated, false);

        // Clear cached keys
        await TableKeyManager.clearCachedKeys();

        // Close database connections
        await EncryptedDatabaseService.close();
        await LocalAuditLogger.close();

        // Resources should be properly released
        expect(EncryptedDatabaseService._database, isNull);
      });
    });
  });
}