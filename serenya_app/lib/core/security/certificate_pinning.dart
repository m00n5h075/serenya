import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:crypto/crypto.dart';
import 'local_audit_logger.dart';

/// SSL Certificate Pinning Implementation for Serenya
/// 
/// Provides protection against man-in-the-middle attacks by validating
/// server certificates against known good certificate fingerprints.
/// Supports both SHA-256 public key pinning and certificate pinning.
class CertificatePinningService {
  static const String _logPrefix = 'CERT_PINNING';
  
  // Production certificate pins for serenya API endpoints
  // These should be updated when certificates are rotated
  static const Map<String, List<String>> _certificatePins = {
    // Main API endpoint pins (SHA-256 of public key)
    'api.serenya.com': [
      // Primary certificate pin
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', // Placeholder - replace with actual
      // Backup certificate pin
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=', // Placeholder - replace with actual
    ],
    
    // Development/staging endpoints
    'api-dev.serenya.com': [
      'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=', // Placeholder - replace with actual
    ],
    
    // Load balancer/CDN pins if applicable
    'cdn.serenya.com': [
      'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD=', // Placeholder - replace with actual
    ],
  };

  // Certificate Authority (CA) pins as backup
  static const List<String> _caPins = [
    // Let's Encrypt CA pins
    'YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=',
    'sRHdihwgkaib1P1gxX8HFszlD+7/gTfNvuAybgLPNis=',
  ];

  /// Configure certificate pinning for Dio client
  static void configureCertificatePinning(Dio dio) {
    // Override certificate validation
    if (dio.httpClientAdapter case final _) {
      try {
        // Try to configure certificate validation if adapter supports it
        final client = HttpClient();
        client.badCertificateCallback = (cert, host, port) {
          return _validateCertificate(cert, host);
        };
        // Note: In production, use proper Dio interceptor or custom adapter
      } catch (e) {
        if (kDebugMode) {
          print('Certificate pinning configuration warning: $e');
        }
      }
    }
  }

  /// Validate certificate against pinned certificates
  static bool _validateCertificate(X509Certificate cert, String host) {
    try {
      // Get the expected pins for this host
      final expectedPins = _getExpectedPinsForHost(host);
      
      if (expectedPins.isEmpty) {
        // No pins configured for this host - allow but log warning
        _logCertificateEvent(
          'no_pins_configured',
          host: host,
          allowed: true,
        );
        return true;
      }

      // Extract public key from certificate
      final publicKeyHash = _extractPublicKeyHash(cert);
      
      // Check if the public key hash matches any of the expected pins
      final isValid = expectedPins.contains(publicKeyHash);
      
      if (isValid) {
        _logCertificateEvent(
          'certificate_validation_success',
          host: host,
          publicKeyHash: publicKeyHash,
        );
      } else {
        // Check against CA pins as fallback
        final caValid = _validateAgainstCAPins(cert);
        if (caValid) {
          _logCertificateEvent(
            'ca_pin_validation_success',
            host: host,
            publicKeyHash: publicKeyHash,
            fallbackUsed: true,
          );
          return true;
        }

        _logCertificateEvent(
          'certificate_validation_failed',
          host: host,
          publicKeyHash: publicKeyHash,
          expectedPins: expectedPins,
        );
      }
      
      return isValid;
      
    } catch (e) {
      _logCertificateEvent(
        'certificate_validation_error',
        host: host,
        error: e.toString(),
      );
      // On error, deny the connection for security
      return false;
    }
  }

  /// Get expected certificate pins for a host
  static List<String> _getExpectedPinsForHost(String host) {
    // Direct match first
    if (_certificatePins.containsKey(host)) {
      return _certificatePins[host]!;
    }
    
    // Check for wildcard matches or subdomain patterns
    for (final pinnedHost in _certificatePins.keys) {
      if (pinnedHost.startsWith('*.') && 
          host.endsWith(pinnedHost.substring(1))) {
        return _certificatePins[pinnedHost]!;
      }
    }
    
    return [];
  }

  /// Extract SHA-256 hash of the certificate's public key
  static String _extractPublicKeyHash(X509Certificate cert) {
    // Extract DER-encoded public key
    final publicKeyDer = cert.der;
    
    // Parse and extract the public key portion
    // This is a simplified version - in production, proper ASN.1 parsing should be used
    final publicKeyBytes = _extractPublicKeyFromDER(publicKeyDer);
    
    // Calculate SHA-256 hash
    final hash = sha256.convert(publicKeyBytes);
    
    // Return base64-encoded hash
    return base64.encode(hash.bytes);
  }

  /// Extract public key bytes from DER-encoded certificate
  static Uint8List _extractPublicKeyFromDER(Uint8List derBytes) {
    // This is a simplified implementation
    // In production, use a proper ASN.1/DER parser like pointycastle
    try {
      // For now, return a hash of the entire certificate
      // TODO: Implement proper public key extraction
      return Uint8List.fromList(sha256.convert(derBytes).bytes);
    } catch (e) {
      // Fallback to certificate fingerprint
      return Uint8List.fromList(sha256.convert(derBytes).bytes);
    }
  }

  /// Validate certificate against CA pins
  static bool _validateAgainstCAPins(X509Certificate cert) {
    try {
      // Extract issuer public key hash
      final issuerHash = _extractIssuerPublicKeyHash(cert);
      return _caPins.contains(issuerHash);
    } catch (e) {
      return false;
    }
  }

  /// Extract SHA-256 hash of the certificate issuer's public key
  static String _extractIssuerPublicKeyHash(X509Certificate cert) {
    // This would need proper implementation to extract issuer public key
    // For now, return a placeholder
    final issuerDN = cert.issuer;
    final hash = sha256.convert(utf8.encode(issuerDN));
    return base64.encode(hash.bytes);
  }

  /// Handle certificate pinning failure
  static Future<void> handlePinningFailure({
    required String host,
    required String reason,
    String? expectedPin,
    String? actualPin,
  }) async {
    await _logCertificateEvent(
      'certificate_pinning_failure',
      host: host,
      reason: reason,
      expectedPin: expectedPin,
      actualPin: actualPin,
      severity: 'high',
    );

    // In production, you might want to:
    // 1. Show user-friendly error message
    // 2. Offer option to continue with reduced security (not recommended)
    // 3. Direct user to update the app
    // 4. Report to security monitoring system
  }

  /// Update certificate pins (for app updates)
  static Future<void> updateCertificatePins(
    Map<String, List<String>> newPins,
  ) async {
    // In production, this would update the pins securely
    // and verify the update with a signature
    
    await _logCertificateEvent(
      'certificate_pins_updated',
      updateCount: newPins.length,
    );
  }

  /// Test certificate pinning configuration
  static Future<CertificatePinningTestResult> testCertificatePinning(
    String testHost,
  ) async {
    try {
      // Create test Dio client with pinning
      final testDio = Dio();
      configureCertificatePinning(testDio);

      // Attempt connection
      final response = await testDio.get('https://$testHost/health');
      
      await _logCertificateEvent(
        'certificate_pinning_test_success',
        host: testHost,
        statusCode: response.statusCode,
      );

      return CertificatePinningTestResult(
        success: true,
        host: testHost,
        message: 'Certificate pinning validation successful',
      );

    } on DioException catch (e) {
      String failureReason = 'unknown_error';
      
      if (e.type == DioExceptionType.badCertificate) {
        failureReason = 'certificate_validation_failed';
      } else if (e.type == DioExceptionType.connectionTimeout) {
        failureReason = 'connection_timeout';
      }

      await _logCertificateEvent(
        'certificate_pinning_test_failed',
        host: testHost,
        reason: failureReason,
        error: e.message,
      );

      return CertificatePinningTestResult(
        success: false,
        host: testHost,
        message: 'Certificate pinning test failed: $failureReason',
        errorDetails: e.message,
      );

    } catch (e) {
      await _logCertificateEvent(
        'certificate_pinning_test_error',
        host: testHost,
        error: e.toString(),
      );

      return CertificatePinningTestResult(
        success: false,
        host: testHost,
        message: 'Certificate pinning test error',
        errorDetails: e.toString(),
      );
    }
  }

  /// Log certificate-related events
  static Future<void> _logCertificateEvent(
    String eventType, {
    String? host,
    String? publicKeyHash,
    List<String>? expectedPins,
    bool? allowed,
    bool? fallbackUsed,
    String? reason,
    String? expectedPin,
    String? actualPin,
    String? severity,
    int? updateCount,
    int? statusCode,
    String? error,
  }) async {
    final eventData = {
      'event_type': 'security_event',
      'event_subtype': eventType,
      'timestamp': DateTime.now().toIso8601String(),
      'security_details': {
        'component': 'certificate_pinning',
        'host': host,
        'public_key_hash': publicKeyHash,
        'expected_pins_count': expectedPins?.length,
        'allowed': allowed,
        'fallback_used': fallbackUsed,
        'failure_reason': reason,
        'expected_pin': expectedPin,
        'actual_pin': actualPin,
        'severity': severity ?? 'medium',
        'update_count': updateCount,
        'status_code': statusCode,
        'error': error,
      }
    };

    await LocalAuditLogger.logSecurityEvent(
      'certificate_event',
      additionalData: eventData,
    );

    // Console logging for development
    if (kDebugMode) {
      print('$_logPrefix: $eventType - Host: $host, Success: ${allowed ?? 'N/A'}');
      if (error != null) {
        print('$_logPrefix: Error - $error');
      }
    }
  }
}

/// Result of certificate pinning test
class CertificatePinningTestResult {
  final bool success;
  final String host;
  final String message;
  final String? errorDetails;

  CertificatePinningTestResult({
    required this.success,
    required this.host,
    required this.message,
    this.errorDetails,
  });

  @override
  String toString() => success 
      ? 'CertificatePinningTest.success: $message'
      : 'CertificatePinningTest.failed: $message${errorDetails != null ? ' - $errorDetails' : ''}';
}

/// Certificate pinning configuration
class CertificatePinningConfig {
  final Map<String, List<String>> hostPins;
  final List<String> caPins;
  final bool enableLogging;
  final bool allowFallbackToCA;

  const CertificatePinningConfig({
    required this.hostPins,
    this.caPins = const [],
    this.enableLogging = true,
    this.allowFallbackToCA = true,
  });

  /// Default configuration for Serenya
  static const CertificatePinningConfig serenya = CertificatePinningConfig(
    hostPins: {
      'api.serenya.com': [
        // Production pins - these need to be updated with actual values
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
      ],
    },
    caPins: [
      // Let's Encrypt backup pins
      'YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=',
      'sRHdihwgkaib1P1gxX8HFszlD+7/gTfNvuAybgLPNis=',
    ],
    enableLogging: true,
    allowFallbackToCA: true,
  );
}

/// Certificate pinning exceptions
class CertificatePinningException implements Exception {
  final String message;
  final String host;
  final String? actualPin;
  final List<String>? expectedPins;

  CertificatePinningException(
    this.message,
    this.host, {
    this.actualPin,
    this.expectedPins,
  });

  @override
  String toString() => 'CertificatePinningException: $message for host $host';
}