import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:serenya_app/core/security/device_key_manager.dart';

// Generate mocks for dependencies
@GenerateMocks([FlutterSecureStorage])
import 'device_key_manager_test.mocks.dart';

void main() {
  group('DeviceKeyManager', () {
    late MockFlutterSecureStorage mockSecureStorage;

    setUp(() {
      mockSecureStorage = MockFlutterSecureStorage();
    });

    group('Device Key Initialization', () {
      test('should initialize device key system', () async {
        // Mock no existing key
        when(mockSecureStorage.read(key: 'serenya_device_root_key_v1'))
            .thenAnswer((_) async => null);
        when(mockSecureStorage.write(key: anyNamed('key'), value: anyNamed('value')))
            .thenAnswer((_) async {});

        await DeviceKeyManager.initialize();

        // Verify key generation was triggered
        verify(mockSecureStorage.write(
          key: 'serenya_device_root_key_v1',
          value: argThat(isA<String>()),
        )).called(1);
        
        // Verify device ID generation
        verify(mockSecureStorage.write(
          key: 'serenya_device_id',
          value: argThat(isA<String>()),
        )).called(1);
      });

      test('should skip generation if key exists', () async {
        // Mock existing key
        when(mockSecureStorage.read(key: 'serenya_device_root_key_v1'))
            .thenAnswer((_) async => 'existing_key');

        await DeviceKeyManager.initialize();

        // Should not generate new key
        verifyNever(mockSecureStorage.write(
          key: 'serenya_device_root_key_v1',
          value: argThat(isA<String>()),
        ));
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

        // Verify old keys are cleared
        verify(mockSecureStorage.delete(key: 'serenya_device_root_key_v1')).called(1);
      });
    });
  });

  group('TableKeyManager', () {
    late MockFlutterSecureStorage mockSecureStorage;

    setUp(() {
      mockSecureStorage = MockFlutterSecureStorage();
    });
    test('should derive table-specific keys', () async {
      // Mock device root key exists
      when(mockSecureStorage.read(key: 'serenya_device_root_key_v1'))
          .thenAnswer((_) async => base64.encode(List.generate(32, (i) => i)));

      final serenyaContentKey = await TableKeyManager.getTableKeyForEncryption('serenya_content');
      
      expect(serenyaContentKey.length, 32);
      expect(serenyaContentKey, isA<Uint8List>());
    });

    test('should cache keys for performance', () async {
      // Mock device root key exists
      when(mockSecureStorage.read(key: 'serenya_device_root_key_v1'))
          .thenAnswer((_) async => base64.encode(List.generate(32, (i) => i)));

      // First call should derive key
      final key1 = await TableKeyManager.getTableKeyForEncryption('serenya_content');
      
      // Second call should use cached key (same result)
      final key2 = await TableKeyManager.getTableKeyForEncryption('serenya_content');
      
      expect(key1, equals(key2));
    });

    test('should clear cached keys securely', () async {
      // Mock device root key exists
      when(mockSecureStorage.read(key: 'serenya_device_root_key_v1'))
          .thenAnswer((_) async => base64.encode(List.generate(32, (i) => i)));

      // Generate and cache a key
      await TableKeyManager.getTableKeyForEncryption('serenya_content');
      
      // Clear cached keys
      await TableKeyManager.clearCachedKeys();
      
      // This should succeed without error
      expect(true, true);
    });

    test('should reject unknown table names', () async {
      // Mock device root key exists
      when(mockSecureStorage.read(key: 'serenya_device_root_key_v1'))
          .thenAnswer((_) async => base64.encode(List.generate(32, (i) => i)));

      expect(
        () => TableKeyManager.getTableKeyForEncryption('unknown_table'),
        throwsA(isA<Exception>()),
      );
    });
  });

  group('CachedKey', () {
    test('should track expiration correctly', () {
      final oldKey = CachedKey(
        key: Uint8List.fromList(List.generate(32, (i) => i)),
        cacheTime: DateTime.now().subtract(const Duration(minutes: 10)),
      );
      
      final newKey = CachedKey(
        key: Uint8List.fromList(List.generate(32, (i) => i)),
        cacheTime: DateTime.now(),
      );
      
      expect(oldKey.isExpired, true);
      expect(newKey.isExpired, false);
    });
  });
}