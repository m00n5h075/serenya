import 'dart:convert';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import '../core/constants/app_constants.dart';
import '../core/utils/encryption_utils.dart';

class AuthService {
  static const _storage = FlutterSecureStorage();
  
  final GoogleSignIn _googleSignIn = GoogleSignIn(
    scopes: ['email', 'profile'],
  );

  // Check if user is logged in
  Future<bool> isLoggedIn() async {
    final token = await _storage.read(key: AppConstants.userTokenKey);
    if (token == null || token.isEmpty) return false;
    
    return !SecurityUtils.isTokenExpired(token);
  }

  // Google Sign In
  Future<bool> signInWithGoogle({Map<String, dynamic>? consentData}) async {
    try {
      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
      if (googleUser == null) return false;

      final GoogleSignInAuthentication googleAuth = await googleUser.authentication;
      
      // Prepare request body
      final requestBody = {
        'google_token': googleAuth.accessToken,
        'id_token': googleAuth.idToken,
        'device_id': await _getDeviceId(),
      };
      
      // Include consent data if provided
      if (consentData != null) {
        requestBody['consent_data'] = consentData;
      }
      
      // Send Google token to our backend for verification and JWT creation
      final response = await http.post(
        Uri.parse('${AppConstants.baseApiUrl}${AppConstants.authEndpoint}/google'),
        headers: SecurityUtils.getSecureHeaders(null),
        body: jsonEncode(requestBody),
      ).timeout(Duration(seconds: ApiConstants.connectTimeoutSeconds));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        await _storage.write(key: AppConstants.userTokenKey, value: data['token']);
        return true;
      }
      
      return false;
    } catch (e) {
      print('Sign in error: $e');
      return false;
    }
  }

  // Sign out
  Future<void> signOut() async {
    await _googleSignIn.signOut();
    await _storage.delete(key: AppConstants.userTokenKey);
  }

  // Get stored token
  Future<String?> getToken() async {
    final token = await _storage.read(key: AppConstants.userTokenKey);
    if (token != null && SecurityUtils.isTokenExpired(token)) {
      await _storage.delete(key: AppConstants.userTokenKey);
      return null;
    }
    return token;
  }

  Future<String> _getDeviceId() async {
    final deviceId = await EncryptionUtils.getEncryptionKey('device_id') ?? 
                     await EncryptionUtils.generateEncryptionKey('device_id');
    return deviceId.substring(0, 16);
  }

  // Get user info (placeholder for future implementation)
  Future<Map<String, dynamic>?> getUserInfo() async {
    final token = await getToken();
    if (token == null) return null;

    try {
      final response = await http.get(
        Uri.parse('${AppConstants.baseApiUrl}/user/profile'),
        headers: SecurityUtils.getSecureHeaders(token),
      ).timeout(Duration(seconds: ApiConstants.connectTimeoutSeconds));

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (e) {
      print('Get user info error: $e');
    }
    
    return null;
  }
}