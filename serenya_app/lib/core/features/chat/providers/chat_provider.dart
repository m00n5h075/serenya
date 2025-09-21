import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import '../../../api/endpoints/chat_api.dart';
import '../../../core/database/health_data_repository.dart';
import '../../../services/chat_integration_service.dart';
import '../../../services/unified_polling_service.dart';
import '../../../services/chat_data_export_service.dart';
import '../../../core/providers/health_data_provider.dart';
import '../../../models/local_database_models.dart';

/// Chat provider that manages conversation state and integrates with polling service
/// Addresses CTO architectural fixes #2 and #3: Real-time integration and state management
class ChatProvider extends ChangeNotifier {
  final ChatApi _chatApi;
  final HealthDataRepository _repository;
  final UnifiedPollingService _pollingService;
  final ChatIntegrationService _integrationService;
  final ChatDataExportService _dataExportService;
  final HealthDataProvider _healthDataProvider;

  // Chat state
  List<ChatMessage> _messages = [];
  bool _isLoading = false;
  bool _isSending = false;
  String? _error;
  String? _currentContentId;

  // Two-level prompt state
  PromptLevel _promptLevel = PromptLevel.main;
  List<MetricOption> _availableMetrics = [];
  bool _isLoadingMetrics = false;

  // Chat prompts state
  List<ChatPrompt> _availableChatPrompts = [];
  bool _isLoadingChatPrompts = false;
  DateTime? _chatPromptsLoadedAt;
  String? _chatPromptsContentType;

  // Resource tracking for cleanup
  final Set<String> _activeMessageIds = <String>{};

  ChatProvider({
    required ChatApi chatApi,
    required HealthDataRepository repository,
    required UnifiedPollingService pollingService,
    required HealthDataProvider healthDataProvider,
  }) : _chatApi = chatApi,
       _repository = repository,
       _pollingService = pollingService,
       _healthDataProvider = healthDataProvider,
       _integrationService = ChatIntegrationService(repository),
       _dataExportService = ChatDataExportService(repository: repository);

  // Getters
  List<ChatMessage> get messages => List.unmodifiable(_messages);
  bool get isLoading => _isLoading;
  bool get isSending => _isSending;
  String? get error => _error;
  PromptLevel get promptLevel => _promptLevel;
  List<MetricOption> get availableMetrics => List.unmodifiable(_availableMetrics);
  bool get isLoadingMetrics => _isLoadingMetrics;
  List<ChatPrompt> get availableChatPrompts => List.unmodifiable(_availableChatPrompts);
  bool get isLoadingChatPrompts => _isLoadingChatPrompts;

  /// Load chat history for a specific content item
  Future<void> loadConversation(String contentId) async {
    if (_isLoading && _currentContentId == contentId) return;
    
    _isLoading = true;
    _currentContentId = contentId;
    _error = null;
    notifyListeners();

    try {
      // Load from local database first
      final localMessages = await _repository.getChatMessagesForContent(contentId);
      _messages = localMessages;
      notifyListeners();

      // Check if we need to fetch from server
      // Note: Removed message limit as per CTO recommendation - user confirmed they don't expect long conversations
      final serverResult = await _chatApi.getConversation(
        conversationId: contentId,
        // messageLimit: removed - no artificial limits on chat messages
      );

      if (serverResult.data != null) {
        // Convert and save server messages
        await _integrationService.saveConversation(
          contentId, 
          serverResult.data!.recentMessages
        );
        
        // Reload from database to get updated messages
        final updatedMessages = await _repository.getChatMessagesForContent(contentId);
        _messages = updatedMessages;
      }
      
    } catch (e) {
      _error = 'Failed to load chat history: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Send a message with predefined prompt
  Future<void> sendMessage({
    required String contentId,
    required String prompt,
    String? suggestedPromptId,
    Map<String, dynamic>? context,
    ChatPrompt? chatPrompt,
  }) async {
    if (_isSending) return;

    _isSending = true;
    _error = null;
    notifyListeners();

    try {
      // Step 1: Create and save user message locally immediately (no status field)
      final userMessage = ChatIntegrationService.createUserMessage(
        contentId: contentId,
        message: prompt,
        suggestedPromptId: suggestedPromptId,
      );
      
      await _repository.insertChatMessage(userMessage);
      _messages.add(userMessage);
      notifyListeners();

      // Step 2: Prepare API request data
      Map<String, dynamic> apiContext = context ?? {};
      
      // Step 3: Check if we need to include structured health data
      if (chatPrompt?.requiresHealthData == true) {
        final structuredDataResult = await _extractStructuredDataForPrompt(contentId, chatPrompt!);
        
        if (structuredDataResult.success && structuredDataResult.structuredData != null) {
          apiContext['health_data'] = structuredDataResult.structuredData;
          apiContext['data_type'] = structuredDataResult.dataType?.name;
        } else {
          // Log warning but continue without structured data
          debugPrint('WARNING: Failed to extract structured data for chat prompt: ${structuredDataResult.errorMessage}');
        }
      }

      // Step 4: Prepare final prompt for backend
      String finalPrompt = prompt;
      
      // If we have a ChatPrompt with fullPromptText, use that for backend
      if (chatPrompt?.fullPromptText != null && chatPrompt!.fullPromptText!.isNotEmpty) {
        finalPrompt = chatPrompt.fullPromptText!;
        
        // Handle metric substitution if this prompt has sub-options
        if (chatPrompt.hasSubOptions && context != null && context['metric_name'] != null) {
          final metricName = context['metric_name'] as String;
          finalPrompt = finalPrompt.replaceAll('[METRIC]', metricName);
        }
      }

      // Step 5: Send to API
      final result = await _chatApi.sendMessage(
        conversationId: contentId,
        message: finalPrompt,
        context: apiContext,
      );

      if (result.success && result.data != null) {
        // Step 6: Handle API response
        if (result.data!.status == 'processing') {
          // Track active message for cleanup
          _activeMessageIds.add(result.data!.messageId);
          
          // Register callbacks before starting monitoring
          _pollingService.registerJobCallbacks(
            result.data!.messageId,
            onCompletion: onPollingComplete,
            onFailure: onPollingFailure,
          );
          
          await _pollingService.startMonitoringJob(result.data!.messageId);
        } else {
          // Immediate response - create and save AI message locally
          final aiMessage = ChatIntegrationService.fromApiResponse(result.data!, contentId);
          await _repository.insertChatMessage(aiMessage);
          _messages.add(aiMessage);
          
          // Provide haptic feedback for success
          await HapticFeedback.lightImpact();
        }
      } else {
        _error = result.error ?? 'Failed to send message';
        
        // Provide haptic feedback for error
        await HapticFeedback.heavyImpact();
      }

    } catch (e) {
      _error = 'Failed to send message: $e';
      await HapticFeedback.heavyImpact();
    } finally {
      _isSending = false;
      // Reset prompt level after sending
      _promptLevel = PromptLevel.main;
      notifyListeners();
    }
  }

  /// Load metrics for two-level prompt system
  Future<void> loadMetrics(String contentId) async {
    if (_isLoadingMetrics) return;
    
    _isLoadingMetrics = true;
    notifyListeners();

    try {
      final metrics = await _integrationService.getMetricsForContent(contentId);
      _availableMetrics = metrics;
      _promptLevel = PromptLevel.metrics;
    } catch (e) {
      _error = 'Failed to load metrics: $e';
    } finally {
      _isLoadingMetrics = false;
      notifyListeners();
    }
  }

  /// Navigate back to main prompts
  void backToMainPrompts() {
    _promptLevel = PromptLevel.main;
    _availableMetrics.clear();
    notifyListeners();
  }

  /// Load chat prompts for content type with 24-hour caching
  Future<void> loadChatPrompts(String contentType) async {
    // Check if we have cached prompts for this content type (24-hour TTL)
    final now = DateTime.now();
    if (_chatPromptsContentType == contentType && 
        _chatPromptsLoadedAt != null &&
        now.difference(_chatPromptsLoadedAt!).inHours < 24 &&
        _availableChatPrompts.isNotEmpty) {
      return; // Use cached prompts
    }

    if (_isLoadingChatPrompts) return;
    
    _isLoadingChatPrompts = true;
    notifyListeners();

    try {
      final result = await _chatApi.getChatPrompts(contentType: contentType);
      
      if (result.success && result.data != null) {
        _availableChatPrompts = result.data!.prompts;
        _chatPromptsContentType = contentType;
        _chatPromptsLoadedAt = now;
      } else {
        _error = 'Failed to load chat prompts: ${result.error ?? 'Unknown error'}';
      }
    } catch (e) {
      _error = 'Failed to load chat prompts: $e';
    } finally {
      _isLoadingChatPrompts = false;
      notifyListeners();
    }
  }

  /// Extract structured data for chat prompt based on content type
  Future<ChatDataResult> _extractStructuredDataForPrompt(String contentId, ChatPrompt chatPrompt) async {
    try {
      // Determine extraction mode based on content type
      if (chatPrompt.contentType == 'result') {
        // Results chat: Extract from specific document
        return await _dataExportService.extractResultsChatData(contentId);
      } else if (chatPrompt.contentType == 'report') {
        // Report chat: Extract from full health history
        return await _dataExportService.extractReportChatData(_healthDataProvider);
      } else {
        return ChatDataResult(
          success: false,
          errorMessage: 'Unknown content type: ${chatPrompt.contentType}',
        );
      }
    } catch (e) {
      return ChatDataResult(
        success: false,
        errorMessage: 'Failed to extract structured data: $e',
      );
    }
  }

  /// Handle polling completion (called by polling service)
  Future<void> onPollingComplete(String messageId, dynamic result) async {
    try {
      // Remove from active tracking
      _activeMessageIds.remove(messageId);
      
      if (result is ChatMessageResponse && _currentContentId != null) {
        // Create and save AI response as separate local chat record (no status field)
        final aiMessage = ChatIntegrationService.fromApiResponse(result, _currentContentId!);
        await _repository.insertChatMessage(aiMessage);
        _messages.add(aiMessage);
        
        // Provide success haptic feedback
        await HapticFeedback.lightImpact();
        notifyListeners();
      }
    } catch (e) {
      _error = 'Failed to process AI response: $e';
      await HapticFeedback.heavyImpact();
      notifyListeners();
    }
  }

  /// Handle polling failure
  Future<void> onPollingFailure(String messageId, String error) async {
    // Remove from active tracking
    _activeMessageIds.remove(messageId);
    
    _error = 'AI response failed: $error';
    await HapticFeedback.heavyImpact();
    notifyListeners();
  }

  /// Clear error state
  void clearError() {
    _error = null;
    notifyListeners();
  }

  /// Reset chat state
  void reset() {
    _messages.clear();
    _isLoading = false;
    _isSending = false;
    _error = null;
    _currentContentId = null;
    _promptLevel = PromptLevel.main;
    _availableMetrics.clear();
    _isLoadingMetrics = false;
    _availableChatPrompts.clear();
    _isLoadingChatPrompts = false;
    _chatPromptsLoadedAt = null;
    _chatPromptsContentType = null;
    _activeMessageIds.clear();
    notifyListeners();
  }

  /// Dispose method to clean up resources properly
  @override
  void dispose() {
    try {
      // Unregister all active polling callbacks to prevent memory leaks
      for (final messageId in _activeMessageIds) {
        _pollingService.unregisterJobCallbacks(messageId);
      }
      _activeMessageIds.clear();
      
      // Clear all state
      _messages.clear();
      _availableMetrics.clear();
      _availableChatPrompts.clear();
      _currentContentId = null;
      
      if (kDebugMode) {
        print('ChatProvider disposed successfully');
      }
    } catch (e) {
      if (kDebugMode) {
        print('Error disposing ChatProvider: $e');
      }
    } finally {
      // Always call super.dispose() to clean up ChangeNotifier
      super.dispose();
    }
  }
}

/// Enum for two-level prompt system
enum PromptLevel {
  main,    // Main prompt categories
  metrics, // Specific metrics selection
}

