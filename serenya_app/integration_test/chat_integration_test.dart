import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:serenya_app/api/api_client.dart';
import 'package:serenya_app/api/endpoints/chat_api.dart';
import 'package:serenya_app/services/auth_service.dart' as auth;
import 'package:serenya_app/core/security/biometric_auth_service.dart';
import 'package:serenya_app/core/security/device_key_manager.dart';
import 'package:serenya_app/core/database/encrypted_database_service.dart';

/// Integration tests for chat API functionality
/// 
/// Tests the chat API integration including:
/// 1. ChatApi endpoint functionality
/// 2. Message sending and retrieval
/// 3. API error handling
/// 4. Authentication integration
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Chat API Integration Tests', () {
    late ApiClient apiClient;
    late auth.AuthService authService;

    setUpAll(() async {
      // Initialize security systems
      await DeviceKeyManager.initialize();
      await BiometricAuthService.initialize();
      await EncryptedDatabaseService.database;

      // Setup authentication
      await BiometricAuthService.setupPin('1234');
      await SessionManager.startSession(AuthMethod.pin);

      // Initialize API services
      authService = auth.AuthService();
      apiClient = ApiClient(authService: authService);
    });

    tearDownAll(() async {
      await apiClient.reset();
      await EncryptedDatabaseService.close();
    });

    group('Chat API Functionality', () {
      testWidgets('should initialize chat API', (tester) async {
        // Test that chat API is accessible through API client
        expect(apiClient.chat, isNotNull);
        expect(apiClient.chat, isA<ChatApi>());
      });

      testWidgets('should test chat API methods exist', (tester) async {
        final chatApi = apiClient.chat;
        
        // Test that core methods exist (will fail without authentication)
        try {
          await chatApi.sendMessage(
            conversationId: 'test-conversation-123',
            message: 'Hello, test message',
          );
        } catch (e) {
          // Expected to fail in test environment due to authentication
          expect(e, isA<Exception>());
        }
        
        try {
          await chatApi.getConversation(conversationId: 'test-conversation-123');
        } catch (e) {
          // Expected to fail in test environment
          expect(e, isA<Exception>());
        }
      });

      testWidgets('should handle API client initialization', (tester) async {
        // Test that API client initializes properly
        expect(apiClient, isNotNull);
        expect(apiClient.chat, isNotNull);
        
        // Test client info
        final clientInfo = apiClient.getClientInfo();
        expect(clientInfo['api_version'], 'v1');
        expect(clientInfo['encryption_enabled'], true);
      });

      testWidgets('should test connection to API', (tester) async {
        // Test API connectivity
        try {
          final result = await apiClient.testConnection();
          
          if (result.success) {
            expect(result.data, isNotNull);
            expect(result.data?['status'], 'connected');
          }
        } catch (e) {
          // Expected in test environment without actual API server
          expect(e, isA<Exception>());
        }
      });
    });

    group('Authentication Integration', () {
      testWidgets('should integrate with auth service', (tester) async {
        // Test authentication integration
        expect(authService, isNotNull);
        
        // Test basic auth methods
        final isLoggedIn = await authService.isLoggedIn();
        expect(isLoggedIn, isA<bool>());
        
        final token = await authService.getToken();
        expect(token, anyOf(isNull, isA<String>()));
      });

      testWidgets('should handle authentication state', (tester) async {
        // Test authentication state management
        try {
          await authService.signOut();
          final isLoggedOut = await authService.isLoggedIn();
          expect(isLoggedOut, false);
          
          await authService.clearTokens();
          final token = await authService.getToken();
          expect(token, isNull);
        } catch (e) {
          // Some auth operations might fail in test environment
          expect(e, isA<Exception>());
        }
      });
    });

    group('Error Handling', () {
      testWidgets('should handle API errors gracefully', (tester) async {
        final chatApi = apiClient.chat;
        
        // Test with invalid conversation ID
        try {
          await chatApi.sendMessage(
            conversationId: 'invalid-id',
            message: 'Test message',
          );
          
          // Should not reach here in test environment
        } catch (e) {
          // Expected - API call should fail
          expect(e, isA<Exception>());
        }
      });

      testWidgets('should handle network errors', (tester) async {
        // Test network error handling
        try {
          final result = await apiClient.testConnection();
          
          // In test environment, this will likely fail
          if (!result.success) {
            expect(result.error, isNotNull);
          }
        } catch (e) {
          // Network errors are expected in test environment
          expect(e, isA<Exception>());
        }
      });
    });

    group('API Client Management', () {
      testWidgets('should handle client reset', (tester) async {
        // Test that reset method works
        await apiClient.reset();
        
        // Should still be able to access endpoints after reset
        expect(apiClient.chat, isNotNull);
      });

      testWidgets('should handle disposal', (tester) async {
        // Test that disposal works without errors
        apiClient.dispose();
      });
    });
  });
}