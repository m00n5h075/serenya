import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../core/constants/app_constants.dart';
import '../core/utils/encryption_utils.dart';
import 'auth_service.dart';

class ApiService {
  final AuthService _authService = AuthService();

  Future<Map<String, dynamic>> uploadDocument({
    required File file,
    required String fileName,
    required String fileType,
  }) async {
    try {
      final token = await _authService.getToken();
      if (token == null) {
        throw ApiException('Authentication token not found', 401);
      }

      if (!EncryptionUtils.isValidFileType(fileName)) {
        throw ApiException('Unsupported file type', 400);
      }

      if (!EncryptionUtils.isValidFileSize(await file.length())) {
        throw ApiException('File size exceeds ${AppConstants.maxFileSizeBytes} bytes', 400);
      }

      final request = http.MultipartRequest(
        'POST',
        Uri.parse('${AppConstants.baseApiUrl}${AppConstants.processingEndpoint}/upload'),
      );

      request.headers.addAll(SecurityUtils.getSecureHeaders(token));
      
      request.files.add(await http.MultipartFile.fromPath(
        'file',
        file.path,
        filename: SecurityUtils.sanitizeFileName(fileName),
      ));

      request.fields['file_type'] = fileType;
      request.fields['file_size'] = (await file.length()).toString();
      request.fields['upload_timestamp'] = DateTime.now().millisecondsSinceEpoch.toString();

      final streamedResponse = await request.send()
          .timeout(Duration(seconds: ApiConstants.connectTimeoutSeconds));

      final response = await http.Response.fromStream(streamedResponse);

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        final errorData = jsonDecode(response.body);
        throw ApiException(
          errorData['message'] ?? 'Upload failed',
          response.statusCode,
        );
      }
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Upload failed: $e', 500);
    }
  }

  Future<Map<String, dynamic>> getProcessingStatus(String jobId) async {
    try {
      final token = await _authService.getToken();
      if (token == null) {
        throw ApiException('Authentication token not found', 401);
      }

      final response = await http.get(
        Uri.parse('${AppConstants.baseApiUrl}${AppConstants.processingEndpoint}/status/$jobId'),
        headers: SecurityUtils.getSecureHeaders(token),
      ).timeout(Duration(seconds: ApiConstants.connectTimeoutSeconds));

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        final errorData = jsonDecode(response.body);
        throw ApiException(
          errorData['message'] ?? 'Failed to get processing status',
          response.statusCode,
        );
      }
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Status check failed: $e', 500);
    }
  }

  Future<Map<String, dynamic>> getInterpretation(String jobId) async {
    try {
      final token = await _authService.getToken();
      if (token == null) {
        throw ApiException('Authentication token not found', 401);
      }

      final response = await http.get(
        Uri.parse('${AppConstants.baseApiUrl}${AppConstants.processingEndpoint}/result/$jobId'),
        headers: SecurityUtils.getSecureHeaders(token),
      ).timeout(Duration(seconds: ApiConstants.receiveTimeoutSeconds));

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        final errorData = jsonDecode(response.body);
        throw ApiException(
          errorData['message'] ?? 'Failed to get interpretation',
          response.statusCode,
        );
      }
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Interpretation retrieval failed: $e', 500);
    }
  }

  Future<Map<String, dynamic>> generateDoctorReport(int documentId) async {
    try {
      final token = await _authService.getToken();
      if (token == null) {
        throw ApiException('Authentication token not found', 401);
      }

      final response = await http.post(
        Uri.parse('${AppConstants.baseApiUrl}${AppConstants.processingEndpoint}/doctor-report'),
        headers: SecurityUtils.getSecureHeaders(token),
        body: jsonEncode({
          'document_id': documentId,
          'report_type': 'medical_summary',
          'timestamp': DateTime.now().millisecondsSinceEpoch,
        }),
      ).timeout(Duration(seconds: ApiConstants.receiveTimeoutSeconds));

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        final errorData = jsonDecode(response.body);
        throw ApiException(
          errorData['message'] ?? 'Failed to generate doctor report',
          response.statusCode,
        );
      }
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Doctor report generation failed: $e', 500);
    }
  }

  Future<bool> retryProcessing(String jobId) async {
    try {
      final token = await _authService.getToken();
      if (token == null) {
        throw ApiException('Authentication token not found', 401);
      }

      final response = await http.post(
        Uri.parse('${AppConstants.baseApiUrl}${AppConstants.processingEndpoint}/retry/$jobId'),
        headers: SecurityUtils.getSecureHeaders(token),
        body: jsonEncode({
          'retry_timestamp': DateTime.now().millisecondsSinceEpoch,
        }),
      ).timeout(Duration(seconds: ApiConstants.connectTimeoutSeconds));

      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }
}

class ApiException implements Exception {
  final String message;
  final int statusCode;

  ApiException(this.message, this.statusCode);

  @override
  String toString() => 'ApiException: $message (Status: $statusCode)';
}

class ProcessingRetryManager {
  static const List<Duration> retryDelays = [
    Duration(seconds: 30),   // First retry after 30s
    Duration(minutes: 2),    // Second retry after 2m
    Duration(minutes: 5),    // Third retry after 5m
  ];

  static Future<void> scheduleRetry(String jobId, int attemptNumber) async {
    if (attemptNumber >= AppConstants.maxRetryAttempts) {
      return;
    }

    final delay = retryDelays[attemptNumber];
    await Future.delayed(delay);

    final apiService = ApiService();
    await apiService.retryProcessing(jobId);
  }

  static String getRetryMessage(int attemptNumber) {
    if (attemptNumber == 0) {
      return 'Processing failed. Retrying in 30 seconds...';
    } else if (attemptNumber == 1) {
      return 'Still processing. Retrying in 2 minutes...';
    } else if (attemptNumber == 2) {
      return 'Final retry in 5 minutes...';
    } else {
      return 'Processing failed after maximum retry attempts.';
    }
  }
}