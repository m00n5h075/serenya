import '../api/endpoints/chat_api.dart';
import '../models/local_database_models.dart';
import '../core/database/health_data_repository.dart';

/// Service to bridge API responses and local database models for chat functionality
/// Addresses CTO architectural fix #1: API-Database model disconnect
class ChatIntegrationService {
  final HealthDataRepository _repository;
  
  ChatIntegrationService(this._repository);

  /// Transform API ChatMessageResponse to local ChatMessage model
  static ChatMessage fromApiResponse(ChatMessageResponse apiMessage, String contentId) {
    return ChatMessage(
      id: apiMessage.messageId,
      serenyaContentId: contentId, // Use the local content ID
      sender: MessageSenderType.fromString(apiMessage.role),
      message: apiMessage.content,
      messageMetadata: apiMessage.metadata,
      suggestedPromptId: null, // Will be set separately for user messages
      createdAt: apiMessage.createdAt,
    );
  }

  /// Transform local ChatMessage to API format for sending
  static Map<String, dynamic> toApiRequest({
    required String contentId,
    required String message,
    String? suggestedPromptId,
    Map<String, dynamic>? context,
  }) {
    return {
      'conversation_id': contentId,
      'message': message,
      if (suggestedPromptId != null) 'suggested_prompt_id': suggestedPromptId,
      if (context != null) 'context': context,
    };
  }

  /// Create user message for local storage before API call
  static ChatMessage createUserMessage({
    required String contentId,
    required String message,
    String? suggestedPromptId,
  }) {
    return ChatMessage(
      id: _generateUuid(),
      serenyaContentId: contentId,
      sender: MessageSenderType.user,
      message: message,
      messageMetadata: null,
      suggestedPromptId: suggestedPromptId,
      createdAt: DateTime.now(),
    );
  }

  /// Save chat conversation to local database
  Future<void> saveConversation(String contentId, List<ChatMessageResponse> apiMessages) async {
    final localMessages = apiMessages.map((apiMsg) => 
      fromApiResponse(apiMsg, contentId)
    ).toList();

    for (final message in localMessages) {
      await _repository.insertChatMessage(message);
    }
  }

  /// Get metrics available for a specific content item (for two-level prompts)
  Future<List<MetricOption>> getMetricsForContent(String contentId) async {
    final labResults = await _repository.getLabResultsForContent(contentId);
    final vitals = await _repository.getVitalsForContent(contentId);
    
    final metrics = <MetricOption>[];
    
    // Add lab results as metrics
    for (final lab in labResults) {
      metrics.add(MetricOption(
        name: lab.testName,
        type: 'lab',
        unit: lab.testUnit ?? '',
        value: lab.testValue?.toString() ?? '',
      ));
    }
    
    // Add vitals as metrics
    for (final vital in vitals) {
      metrics.add(MetricOption(
        name: vital.vitalType.toString().split('.').last,
        type: 'vital', 
        unit: vital.unit ?? '',
        value: vital.numericValue?.toString() ?? '',
      ));
    }
    
    // Sort alphabetically and return
    metrics.sort((a, b) => a.name.compareTo(b.name));
    return metrics;
  }

  /// Generate UUID for local messages
  static String _generateUuid() {
    return DateTime.now().millisecondsSinceEpoch.toString() + 
           (DateTime.now().microsecond % 1000).toString();
  }
}

/// Model for metric selection in two-level prompts
class MetricOption {
  final String name;
  final String type; // 'lab' or 'vital'
  final String? unit;
  final String? value;

  const MetricOption({
    required this.name,
    required this.type,
    this.unit,
    this.value,
  });

  @override
  String toString() => name;
}