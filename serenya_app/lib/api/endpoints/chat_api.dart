import 'package:dio/dio.dart';
import '../api_client.dart';
import '../error_handler.dart';
import '../../core/security/local_audit_logger.dart';

/// Chat API endpoints implementation
/// 
/// Handles all chat and messaging-related API calls including:
/// - Chat conversations management
/// - Message sending and retrieval
/// - Real-time message updates
/// - Message history and pagination
/// - Medical chat audit logging
class ChatApi {
  final Dio _dio;
  final ApiErrorHandler _errorHandler;

  ChatApi(this._dio, this._errorHandler);

  /// POST /chat/messages
  /// Send a message to the AI assistant
  Future<ApiResult<ChatMessageResponse>> sendMessage({
    required String conversationId,
    required String message,
    List<String>? attachedDocumentIds,
    Map<String, dynamic>? context,
  }) async {
    try {
      final requestData = {
        'conversation_id': conversationId,
        'message': message,
        if (attachedDocumentIds != null && attachedDocumentIds.isNotEmpty)
          'attached_document_ids': attachedDocumentIds,
        if (context != null) 'context': context,
      };

      final response = await _dio.post(
        '/chat/messages',
        data: requestData,
      );

      await _logChatOperation('message_sent', {
        'conversation_id': conversationId,
        'message_length': message.length,
        'has_attachments': attachedDocumentIds?.isNotEmpty ?? false,
        'attachment_count': attachedDocumentIds?.length ?? 0,
      });

      return ApiResult.success(
        ChatMessageResponse.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Send chat message');
    } catch (e) {
      return ApiResult.failed('Unexpected error sending message: $e');
    }
  }

  /// GET /chat/conversations
  /// List user's chat conversations
  Future<ApiResult<ConversationListResponse>> listConversations({
    int? limit,
    String? cursor,
    DateTime? createdAfter,
    DateTime? createdBefore,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (limit != null) queryParams['limit'] = limit;
      if (cursor != null) queryParams['cursor'] = cursor;
      if (createdAfter != null) queryParams['created_after'] = createdAfter.toIso8601String();
      if (createdBefore != null) queryParams['created_before'] = createdBefore.toIso8601String();

      final response = await _dio.get(
        '/chat/conversations',
        queryParameters: queryParams,
      );

      await _logChatOperation('conversations_listed', {
        'query_params': queryParams,
      });

      return ApiResult.success(
        ConversationListResponse.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'List conversations');
    } catch (e) {
      return ApiResult.failed('Unexpected error listing conversations: $e');
    }
  }

  /// GET /chat/conversations/{conversation_id}
  /// Get conversation details and recent messages
  Future<ApiResult<ConversationDetails>> getConversation({
    required String conversationId,
    int? messageLimit,
    String? messageCursor,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (messageLimit != null) queryParams['message_limit'] = messageLimit;
      if (messageCursor != null) queryParams['message_cursor'] = messageCursor;

      final response = await _dio.get(
        '/chat/conversations/$conversationId',
        queryParameters: queryParams,
      );

      await _logChatOperation('conversation_fetched', {
        'conversation_id': conversationId,
        'query_params': queryParams,
      });

      return ApiResult.success(
        ConversationDetails.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Get conversation');
    } catch (e) {
      return ApiResult.failed('Unexpected error getting conversation: $e');
    }
  }

  /// PUT /chat/conversations/{conversation_id}
  /// Update conversation metadata
  Future<ApiResult<ConversationDetails>> updateConversation({
    required String conversationId,
    String? title,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final requestData = <String, dynamic>{};
      if (title != null) requestData['title'] = title;
      if (metadata != null) requestData['metadata'] = metadata;

      if (requestData.isEmpty) {
        return ApiResult.failed('No conversation data to update');
      }

      final response = await _dio.put(
        '/chat/conversations/$conversationId',
        data: requestData,
      );

      await _logChatOperation('conversation_updated', {
        'conversation_id': conversationId,
        'updated_fields': requestData.keys.toList(),
      });

      return ApiResult.success(
        ConversationDetails.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Update conversation');
    } catch (e) {
      return ApiResult.failed('Unexpected error updating conversation: $e');
    }
  }

  /// DELETE /chat/conversations/{conversation_id}
  /// Delete a conversation and all its messages
  Future<ApiResult<void>> deleteConversation(String conversationId) async {
    try {
      final response = await _dio.delete('/chat/conversations/$conversationId');

      await _logChatOperation('conversation_deleted', {
        'conversation_id': conversationId,
      });

      return ApiResult.success(
        null,
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Delete conversation');
    } catch (e) {
      return ApiResult.failed('Unexpected error deleting conversation: $e');
    }
  }

  /// GET /chat/conversations/{conversation_id}/messages
  /// Get messages from a conversation with pagination
  Future<ApiResult<MessageListResponse>> getMessages({
    required String conversationId,
    int? limit,
    String? cursor,
    DateTime? createdAfter,
    DateTime? createdBefore,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (limit != null) queryParams['limit'] = limit;
      if (cursor != null) queryParams['cursor'] = cursor;
      if (createdAfter != null) queryParams['created_after'] = createdAfter.toIso8601String();
      if (createdBefore != null) queryParams['created_before'] = createdBefore.toIso8601String();

      final response = await _dio.get(
        '/chat/conversations/$conversationId/messages',
        queryParameters: queryParams,
      );

      await _logChatOperation('messages_fetched', {
        'conversation_id': conversationId,
        'query_params': queryParams,
      });

      return ApiResult.success(
        MessageListResponse.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Get messages');
    } catch (e) {
      return ApiResult.failed('Unexpected error getting messages: $e');
    }
  }

  /// PUT /chat/messages/{message_id}/feedback
  /// Provide feedback on AI assistant's response
  Future<ApiResult<void>> provideFeedback({
    required String messageId,
    required String feedbackType, // 'helpful', 'not_helpful', 'inappropriate'
    String? comment,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final requestData = {
        'feedback_type': feedbackType,
        if (comment != null) 'comment': comment,
        if (metadata != null) 'metadata': metadata,
      };

      final response = await _dio.put(
        '/chat/messages/$messageId/feedback',
        data: requestData,
      );

      await _logChatOperation('feedback_provided', {
        'message_id': messageId,
        'feedback_type': feedbackType,
        'has_comment': comment != null,
      });

      return ApiResult.success(
        null,
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Provide feedback');
    } catch (e) {
      return ApiResult.failed('Unexpected error providing feedback: $e');
    }
  }

  /// POST /chat/conversations
  /// Create a new conversation
  Future<ApiResult<ConversationDetails>> createConversation({
    String? title,
    String? initialMessage,
    List<String>? attachedDocumentIds,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final requestData = <String, dynamic>{};
      if (title != null) requestData['title'] = title;
      if (initialMessage != null) requestData['initial_message'] = initialMessage;
      if (attachedDocumentIds != null && attachedDocumentIds.isNotEmpty) {
        requestData['attached_document_ids'] = attachedDocumentIds;
      }
      if (metadata != null) requestData['metadata'] = metadata;

      final response = await _dio.post(
        '/chat/conversations',
        data: requestData,
      );

      await _logChatOperation('conversation_created', {
        'has_title': title != null,
        'has_initial_message': initialMessage != null,
        'has_attachments': attachedDocumentIds?.isNotEmpty ?? false,
        'attachment_count': attachedDocumentIds?.length ?? 0,
      });

      return ApiResult.success(
        ConversationDetails.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Create conversation');
    } catch (e) {
      return ApiResult.failed('Unexpected error creating conversation: $e');
    }
  }

  /// GET /chat/prompts?content_type={type}
  /// Get predefined chat prompts for specific content type
  Future<ApiResult<ChatPromptsResponse>> getChatPrompts({
    required String contentType,
  }) async {
    try {
      final response = await _dio.get(
        '/chat/prompts',
        queryParameters: {
          'content_type': contentType,
        },
      );

      await _logChatOperation('prompts_fetched', {
        'content_type': contentType,
      });

      return ApiResult.success(
        ChatPromptsResponse.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Get chat prompts');
    } catch (e) {
      return ApiResult.failed('Unexpected error getting chat prompts: $e');
    }
  }

  /// Log chat operation for audit trail
  Future<void> _logChatOperation(String operation, Map<String, dynamic> context) async {
    await LocalAuditLogger.logSecurityEvent(
      'chat_api_operation',
      additionalData: {
        'operation': operation,
        'context': context,
        'timestamp': DateTime.now().toIso8601String(),
      },
    );
  }

  /// Reset API state
  Future<void> reset() async {
    // No persistent state to reset for chat API
  }
}

/// Chat message response model
class ChatMessageResponse {
  final String messageId;
  final String conversationId;
  final String role; // 'user' or 'assistant'
  final String content;
  final DateTime createdAt;
  final List<String>? attachedDocumentIds;
  final Map<String, dynamic>? metadata;
  final String? status;

  ChatMessageResponse({
    required this.messageId,
    required this.conversationId,
    required this.role,
    required this.content,
    required this.createdAt,
    this.attachedDocumentIds,
    this.metadata,
    this.status,
  });

  factory ChatMessageResponse.fromJson(Map<String, dynamic> json) {
    return ChatMessageResponse(
      messageId: json['message_id'] as String,
      conversationId: json['conversation_id'] as String,
      role: json['role'] as String,
      content: json['content'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      attachedDocumentIds: (json['attached_document_ids'] as List?)?.cast<String>(),
      metadata: json['metadata'] as Map<String, dynamic>?,
      status: json['status'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'message_id': messageId,
      'conversation_id': conversationId,
      'role': role,
      'content': content,
      'created_at': createdAt.toIso8601String(),
      if (attachedDocumentIds != null) 'attached_document_ids': attachedDocumentIds,
      if (metadata != null) 'metadata': metadata,
      if (status != null) 'status': status,
    };
  }
}

/// Conversation list response model
class ConversationListResponse {
  final List<ConversationSummary> conversations;
  final String? nextCursor;
  final bool hasMore;
  final int totalCount;

  ConversationListResponse({
    required this.conversations,
    this.nextCursor,
    required this.hasMore,
    required this.totalCount,
  });

  factory ConversationListResponse.fromJson(Map<String, dynamic> json) {
    return ConversationListResponse(
      conversations: (json['conversations'] as List)
          .map((item) => ConversationSummary.fromJson(item))
          .toList(),
      nextCursor: json['next_cursor'] as String?,
      hasMore: json['has_more'] as bool,
      totalCount: json['total_count'] as int,
    );
  }
}

/// Conversation summary model
class ConversationSummary {
  final String conversationId;
  final String? title;
  final DateTime createdAt;
  final DateTime lastMessageAt;
  final int messageCount;
  final String? lastMessagePreview;
  final Map<String, dynamic>? metadata;

  ConversationSummary({
    required this.conversationId,
    this.title,
    required this.createdAt,
    required this.lastMessageAt,
    required this.messageCount,
    this.lastMessagePreview,
    this.metadata,
  });

  factory ConversationSummary.fromJson(Map<String, dynamic> json) {
    return ConversationSummary(
      conversationId: json['conversation_id'] as String,
      title: json['title'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
      lastMessageAt: DateTime.parse(json['last_message_at'] as String),
      messageCount: json['message_count'] as int,
      lastMessagePreview: json['last_message_preview'] as String?,
      metadata: json['metadata'] as Map<String, dynamic>?,
    );
  }
}

/// Conversation details model
class ConversationDetails {
  final String conversationId;
  final String? title;
  final DateTime createdAt;
  final DateTime lastMessageAt;
  final int messageCount;
  final List<ChatMessageResponse> recentMessages;
  final Map<String, dynamic>? metadata;

  ConversationDetails({
    required this.conversationId,
    this.title,
    required this.createdAt,
    required this.lastMessageAt,
    required this.messageCount,
    required this.recentMessages,
    this.metadata,
  });

  factory ConversationDetails.fromJson(Map<String, dynamic> json) {
    return ConversationDetails(
      conversationId: json['conversation_id'] as String,
      title: json['title'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
      lastMessageAt: DateTime.parse(json['last_message_at'] as String),
      messageCount: json['message_count'] as int,
      recentMessages: (json['recent_messages'] as List)
          .map((item) => ChatMessageResponse.fromJson(item))
          .toList(),
      metadata: json['metadata'] as Map<String, dynamic>?,
    );
  }
}

/// Message list response model
class MessageListResponse {
  final List<ChatMessageResponse> messages;
  final String? nextCursor;
  final String? prevCursor;
  final bool hasMore;
  final int totalCount;

  MessageListResponse({
    required this.messages,
    this.nextCursor,
    this.prevCursor,
    required this.hasMore,
    required this.totalCount,
  });

  factory MessageListResponse.fromJson(Map<String, dynamic> json) {
    return MessageListResponse(
      messages: (json['messages'] as List)
          .map((item) => ChatMessageResponse.fromJson(item))
          .toList(),
      nextCursor: json['next_cursor'] as String?,
      prevCursor: json['prev_cursor'] as String?,
      hasMore: json['has_more'] as bool,
      totalCount: json['total_count'] as int,
    );
  }
}

/// Chat prompts response model
class ChatPromptsResponse {
  final bool success;
  final String contentType;
  final List<ChatPrompt> prompts;
  final int ttlSeconds;
  final DateTime generatedAt;

  ChatPromptsResponse({
    required this.success,
    required this.contentType,
    required this.prompts,
    required this.ttlSeconds,
    required this.generatedAt,
  });

  factory ChatPromptsResponse.fromJson(Map<String, dynamic> json) {
    return ChatPromptsResponse(
      success: json['success'] as bool,
      contentType: json['content_type'] as String,
      prompts: (json['prompts'] as List)
          .map((item) => ChatPrompt.fromJson(item))
          .toList(),
      ttlSeconds: json['ttl_seconds'] as int,
      generatedAt: DateTime.parse(json['generated_at'] as String),
    );
  }
}

/// Chat prompt model
class ChatPrompt {
  final String id;
  final String contentType;
  final String category;
  final String promptText;
  final int displayOrder;
  final bool hasSubOptions;

  ChatPrompt({
    required this.id,
    required this.contentType,
    required this.category,
    required this.promptText,
    required this.displayOrder,
    required this.hasSubOptions,
  });

  factory ChatPrompt.fromJson(Map<String, dynamic> json) {
    return ChatPrompt(
      id: json['id'] as String,
      contentType: json['content_type'] as String,
      category: json['category'] as String,
      promptText: json['prompt_text'] as String,
      displayOrder: json['display_order'] as int,
      hasSubOptions: json['has_sub_options'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'content_type': contentType,
      'category': category,
      'prompt_text': promptText,
      'display_order': displayOrder,
      'has_sub_options': hasSubOptions,
    };
  }
}