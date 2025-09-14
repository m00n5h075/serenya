import 'dart:convert';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/app_constants.dart';

class EncryptionUtils {
  static const _secureStorage = FlutterSecureStorage();
  static const _encryptionKeyPrefix = 'serenya_encryption_';

  static Future<String> generateEncryptionKey(String keyName) async {
    final fullKeyName = '$_encryptionKeyPrefix$keyName';
    
    String? existingKey = await _secureStorage.read(key: fullKeyName);
    if (existingKey != null) {
      return existingKey;
    }
    
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final randomData = '$timestamp-$keyName-${DateTime.now().microsecondsSinceEpoch}';
    final bytes = utf8.encode(randomData);
    final digest = sha256.convert(bytes);
    final newKey = digest.toString();
    
    await _secureStorage.write(key: fullKeyName, value: newKey);
    return newKey;
  }

  static Future<String?> getEncryptionKey(String keyName) async {
    final fullKeyName = '$_encryptionKeyPrefix$keyName';
    return await _secureStorage.read(key: fullKeyName);
  }

  static Future<void> deleteEncryptionKey(String keyName) async {
    final fullKeyName = '$_encryptionKeyPrefix$keyName';
    await _secureStorage.delete(key: fullKeyName);
  }

  static String hashSensitiveData(String data) {
    final bytes = utf8.encode(data);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }

  static String createSecureToken() {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final randomData = '$timestamp-${DateTime.now().microsecondsSinceEpoch}';
    final bytes = utf8.encode(randomData);
    final digest = sha256.convert(bytes);
    return digest.toString().substring(0, 32);
  }

  static bool isValidFileType(String fileName) {
    final extension = fileName.toLowerCase().split('.').last;
    return AppConstants.supportedFileTypes.contains(extension);
  }

  static bool isValidFileSize(int sizeInBytes) {
    return sizeInBytes <= AppConstants.maxFileSizeBytes;
  }

  static String formatFileSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  static Future<void> clearAllEncryptionKeys() async {
    await _secureStorage.deleteAll();
  }

  /// Encrypt data using AES-256-GCM
  static Future<Uint8List> encryptAES256GCM(Uint8List data, Uint8List key) async {
    final algorithm = AesGcm.with256bits();
    final secretKey = SecretKey(key);
    
    final secretBox = await algorithm.encrypt(
      data,
      secretKey: secretKey,
    );
    
    // Combine nonce, encrypted data, and MAC
    final result = Uint8List(
      secretBox.nonce.length + secretBox.cipherText.length + secretBox.mac.bytes.length,
    );
    
    var offset = 0;
    result.setRange(offset, offset + secretBox.nonce.length, secretBox.nonce);
    offset += secretBox.nonce.length;
    
    result.setRange(offset, offset + secretBox.cipherText.length, secretBox.cipherText);
    offset += secretBox.cipherText.length;
    
    result.setRange(offset, offset + secretBox.mac.bytes.length, secretBox.mac.bytes);
    
    return result;
  }

  /// Decrypt data using AES-256-GCM
  static Future<Uint8List> decryptAES256GCM(Uint8List encryptedData, Uint8List key) async {
    final algorithm = AesGcm.with256bits();
    final secretKey = SecretKey(key);
    
    // Extract nonce (first 12 bytes), MAC (last 16 bytes), and ciphertext (middle)
    const nonceLength = 12;
    const macLength = 16;
    
    if (encryptedData.length < nonceLength + macLength) {
      throw ArgumentError('Encrypted data is too short');
    }
    
    final nonce = encryptedData.sublist(0, nonceLength);
    final cipherText = encryptedData.sublist(nonceLength, encryptedData.length - macLength);
    final macBytes = encryptedData.sublist(encryptedData.length - macLength);
    
    final secretBox = SecretBox(
      cipherText,
      nonce: nonce,
      mac: Mac(macBytes),
    );
    
    final decryptedData = await algorithm.decrypt(
      secretBox,
      secretKey: secretKey,
    );
    
    return Uint8List.fromList(decryptedData);
  }
}

class SecurityUtils {
  static String sanitizeFileName(String fileName) {
    return fileName.replaceAll(RegExp(r'[^\w\-_.]'), '_');
  }

  static bool isSecureConnection(String url) {
    return url.startsWith('https://');
  }

  static Map<String, String> getSecureHeaders(String? authToken) {
    final headers = Map<String, String>.from(ApiConstants.defaultHeaders);
    
    if (authToken != null) {
      headers['Authorization'] = 'Bearer $authToken';
    }
    
    headers['X-App-Version'] = AppConstants.appVersion;
    headers['X-Platform'] = 'flutter';
    
    return headers;
  }

  static bool isTokenExpired(String? token) {
    if (token == null) return true;
    
    try {
      final parts = token.split('.');
      if (parts.length != 3) return true;
      
      final payload = parts[1];
      final normalized = base64.normalize(payload);
      final decoded = utf8.decode(base64.decode(normalized));
      final data = jsonDecode(decoded);
      
      final exp = data['exp'] as int?;
      if (exp == null) return true;
      
      final expirationDate = DateTime.fromMillisecondsSinceEpoch(exp * 1000);
      return DateTime.now().isAfter(expirationDate);
    } catch (e) {
      return true;
    }
  }
}