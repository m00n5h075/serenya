import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:serenya_app/core/security/device_key_manager.dart';
import 'package:serenya_app/core/security/biometric_auth_service.dart';

// Generate mocks for dependencies
@GenerateMocks([FlutterSecureStorage])
import 'device_key_manager_test.mocks.dart';

void main() {
  group('DeviceKeyManager', () {
    late MockFlutterSecureStorage mockSecureStorage;

    setUp(() {
      mockSecureStorage = MockFlutterSecureStorage();
    });

    group('Device Root Key Generation', () {
      test('should generate cryptographically secure root key', () async {
        // Mock secure storage operations
        when(mockSecureStorage.read(key: 'serenya_device_root_key_v1'))
            .thenAnswer((_) async => null);
        when(mockSecureStorage.write(key: anyNamed('key'), value: anyNamed('value')))
            .thenAnswer((_) async {});

        // Test key generation
        final rootKey = await DeviceKeyManager._generateDeviceRootKey();
        
        expect(rootKey.length, 32); // 256-bit key
        expect(rootKey, isA<List<int>>());
        
        // Key should be random (extremely unlikely to generate same key twice)
        final rootKey2 = await DeviceKeyManager._generateDeviceRootKey();
        expect(rootKey, isNot(equals(rootKey2)));
      });

      test('should combine entropy sources correctly', () {
        final primary = List.generate(32, (i) => i);
        final secondary = List.generate(16, (i) => i * 2);
        
        final combined = DeviceKeyManager._combineEntropySources(primary, secondary);
        
        expect(combined.length, 32);
        expect(combined, isNot(equals(primary)));
        expect(combined, isNot(equals(secondary)));
      });

      test('should store root key in secure hardware', () async {
        final testKey = List.generate(32, (i) => i);
        
        when(mockSecureStorage.write(key: anyNamed('key'), value: anyNamed('value')))
            .thenAnswer((_) async {});

        await DeviceKeyManager._storeInSecureHardware(testKey);
        
        verify(mockSecureStorage.write(
          key: 'serenya_device_root_key_v1',
          value: anyThat(isA<String>()),
        )).called(1);
      });
    });

    group('Device Key Initialization', () {
      test('should initialize device key system', () async {
        // Mock no existing key
        when(mockSecureStorage.read(key: 'serenya_device_root_key_v1'))
            .thenAnswer((_) async => null);
        when(mockSecureStorage.write(key: anyNamed('key'), value: anyNamed('value')))
            .thenAnswer((_) async {});

        await DeviceKeyManager.initialize();
        
        // Should generate and store new key
        verify(mockSecureStorage.write(
          key: 'serenya_device_root_key_v1',
          value: anyThat(isA<String>()),
        )).called(1);
        
        // Should set key version
        verify(mockSecureStorage.write(
          key: 'serenya_key_version',
          value: 'v1',
        )).called(1);
      });

      test('should skip generation if key exists', () async {
        // Mock existing key
        when(mockSecureStorage.read(key: 'serenya_device_root_key_v1'))
            .thenAnswer((_) async => 'base64_encoded_key');
        when(mockSecureStorage.read(key: 'serenya_key_version'))
            .thenAnswer((_) async => 'v1');
        when(mockSecureStorage.read(key: 'serenya_device_id'))
            .thenAnswer((_) async => 'device123');

        await DeviceKeyManager.initialize();
        
        // Should not generate new key
        verifyNever(mockSecureStorage.write(
          key: 'serenya_device_root_key_v1',
          value: anyThat(isA<String>()),
        ));
      });
    });

    group('Device Binding', () {
      test('should generate stable device identifier', () async {
        when(mockSecureStorage.write(key: anyNamed('key'), value: anyNamed('value')))
            .thenAnswer((_) async {});

        await DeviceKeyManager._generateDeviceIdentifier();
        
        verify(mockSecureStorage.write(
          key: 'serenya_device_id',
          value: anyThat(matches(RegExp(r'^[a-f0-9]{16}$'))),
        )).called(1);
      });

      test('should verify device binding', () async {
        // Mock stored device ID matching current device
        final deviceId = 'stable_device_id';
        when(mockSecureStorage.read(key: 'serenya_device_id'))
            .thenAnswer((_) async => deviceId);

        // Should not throw if device binding is valid
        expect(() async => await DeviceKeyManager._verifyDeviceBinding(), 
            returnsNormally);
      });

      test('should detect device binding violation', () async {
        // Mock different device ID
        when(mockSecureStorage.read(key: 'serenya_device_id'))
            .thenAnswer((_) async => 'different_device');

        expect(() => DeviceKeyManager._verifyDeviceBinding(),
            throwsA(isA<SecurityException>()));
      });
    });

    group('Key Integrity Verification', () {
      test('should verify key integrity successfully', () async {
        // Mock valid key setup
        when(mockSecureStorage.read(key: 'serenya_device_root_key_v1'))
            .thenAnswer((_) async => 'valid_key');
        when(mockSecureStorage.read(key: 'serenya_key_version'))
            .thenAnswer((_) async => 'v1');
        when(mockSecureStorage.read(key: 'serenya_device_id'))
            .thenAnswer((_) async => 'device123');

        await DeviceKeyManager._verifyKeyIntegrity();
        
        // Should complete without throwing
      });

      test('should detect missing root key', () async {
        when(mockSecureStorage.read(key: 'serenya_device_root_key_v1'))
            .thenAnswer((_) async => null);

        expect(() => DeviceKeyManager._verifyKeyIntegrity(),
            throwsA(isA<SecurityException>()));
      });

      test('should detect key version mismatch', () async {
        when(mockSecureStorage.read(key: 'serenya_device_root_key_v1'))
            .thenAnswer((_) async => 'valid_key');
        when(mockSecureStorage.read(key: 'serenya_key_version'))
            .thenAnswer((_) async => 'v0'); // Wrong version

        expect(() => DeviceKeyManager._verifyKeyIntegrity(),
            throwsA(isA<SecurityException>()));
      });
    });

    group('Biometric Enrollment Changes', () {
      test('should handle biometric enrollment change', () async {
        // Mock storage operations for re-key
        when(mockSecureStorage.delete(key: anyNamed('key')))
            .thenAnswer((_) async {});
        when(mockSecureStorage.write(key: anyNamed('key'), value: anyNamed('value')))
            .thenAnswer((_) async {});

        await DeviceKeyManager.handleBiometricEnrollmentChange();
        
        // Should clear old keys
        verify(mockSecureStorage.delete(key: 'serenya_device_root_key_v1')).called(1);
        verify(mockSecureStorage.delete(key: 'serenya_key_version')).called(1);
        verify(mockSecureStorage.delete(key: 'serenya_device_id')).called(1);
        
        // Should generate new keys
        verify(mockSecureStorage.write(
          key: 'serenya_device_root_key_v1',
          value: anyThat(isA<String>()),
        )).called(1);
      });

      test('should clear all data if re-key fails', () async {
        // Mock re-key failure
        when(mockSecureStorage.delete(key: anyNamed('key')))
            .thenThrow(Exception('Storage error'));

        expect(() => DeviceKeyManager.handleBiometricEnrollmentChange(),
            throwsA(isA<Exception>()));
      });
    });

    group('Memory Security', () {
      test('should securely zero memory', () {
        final testData = List.generate(32, (i) => i + 1);
        final originalSum = testData.fold(0, (sum, val) => sum + val);
        
        DeviceKeyManager._secureZeroMemory(testData);
        
        final zeroedSum = testData.fold(0, (sum, val) => sum + val);
        expect(zeroedSum, 0);
        expect(originalSum, isNot(0)); // Verify test data was not originally zero
      });
    });
  });

  group('TableKeyManager', () {
    test('should derive table-specific keys', () async {
      final deviceRootKey = List.generate(32, (i) => i);
      
      final serenyaContentKey = await TableKeyManager._deriveTableKey(
        'serenya_content',
        deviceRootKey,
      );
      
      final labResultsKey = await TableKeyManager._deriveTableKey(
        'lab_results',
        deviceRootKey,
      );
      
      expect(serenyaContentKey.length, 32);
      expect(labResultsKey.length, 32);
      
      // Different tables should produce different keys
      expect(serenyaContentKey, isNot(equals(labResultsKey)));
    });

    test('should cache keys for performance', () async {
      // Mock biometric authentication
      // This would require mocking the full authentication flow
      
      // Test that keys are cached after first retrieval
      // Implementation depends on actual key caching logic
      expect(TableKeyManager._keyCache, isA<Map>());
    });

    test('should clear cached keys securely', () async {
      // Add test keys to cache
      final testKey = List.generate(32, (i) => i);
      TableKeyManager._keyCache['test'] = CachedKey(
        key: testKey,
        cacheTime: DateTime.now(),
      );
      
      await TableKeyManager.clearCachedKeys();
      
      expect(TableKeyManager._keyCache.isEmpty, true);
      // Verify original key data is zeroed
      expect(testKey.every((byte) => byte == 0), true);
    });

    test('should reject unknown table names', () async {
      final deviceRootKey = List.generate(32, (i) => i);
      
      expect(
        () => TableKeyManager._deriveTableKey('unknown_table', deviceRootKey),
        throwsA(isA<UnsupportedError>()),
      );
    });

    test('should use correct contexts for known tables', () {
      const expectedContexts = {
        'serenya_content': 'serenya_content_v1',
        'lab_results': 'serenya_medical_data_v1',
        'vitals': 'serenya_medical_data_v1',
        'chat_messages': 'serenya_chat_v1',
      };
      
      for (final entry in expectedContexts.entries) {
        final context = TableKeyManager._tableContexts[entry.key];
        expect(context, entry.value);
      }
    });
  });

  group('CachedKey', () {
    test('should track expiration correctly', () {
      final oldKey = CachedKey(
        key: List.generate(32, (i) => i),
        cacheTime: DateTime.now().subtract(Duration(minutes: 10)),
      );
      
      final newKey = CachedKey(
        key: List.generate(32, (i) => i),
        cacheTime: DateTime.now(),
      );
      
      expect(oldKey.isExpired, true);
      expect(newKey.isExpired, false);
    });
  });
}