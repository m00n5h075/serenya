import 'dart:convert';
import 'package:crypto/crypto.dart';
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