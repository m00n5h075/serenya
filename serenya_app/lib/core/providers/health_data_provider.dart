import 'package:flutter/foundation.dart';
import '../../models/local_database_models.dart';
import '../database/health_data_repository.dart';

/// Health Data Provider - Migrated to use EncryptedDatabaseService
/// 
/// Provides state management for medical data stored locally:
/// - Medical content (AI analyses and reports)
/// - Lab results and vital signs
/// - Chat conversations
/// - User preferences
class HealthDataProvider extends ChangeNotifier {
  final HealthDataRepository _repository = HealthDataRepository();
  
  List<SerenyaContent> _content = [];
  Map<String, List<LabResult>> _labResults = {};
  Map<String, List<Vital>> _vitals = {};
  Map<String, List<ChatMessage>> _chatMessages = {};
  bool _isLoading = false;
  String? _error;

  List<SerenyaContent> get content => List.unmodifiable(_content);
  Map<String, List<LabResult>> get labResults => Map.unmodifiable(_labResults);
  Map<String, List<Vital>> get vitals => Map.unmodifiable(_vitals);
  Map<String, List<ChatMessage>> get chatMessages => Map.unmodifiable(_chatMessages);
  bool get isLoading => _isLoading;
  String? get error => _error;

  /// Load all medical content (results and reports)
  Future<void> loadContent({int? limit}) async {
    _setLoading(true);
    _clearError();

    try {
      _content = await _repository.getAllContent(limit: limit);
      notifyListeners();
    } catch (e) {
      _setError('Failed to load content: $e');
    } finally {
      _setLoading(false);
    }
  }

  /// Load content by type (results vs reports)
  Future<void> loadContentByType(ContentType contentType, {int? limit}) async {
    _setLoading(true);
    _clearError();

    try {
      _content = await _repository.getContentByType(contentType, limit: limit);
      notifyListeners();
    } catch (e) {
      _setError('Failed to load content by type: $e');
    } finally {
      _setLoading(false);
    }
  }

  /// Add new medical content
  Future<void> addContent(SerenyaContent content) async {
    _setLoading(true);
    _clearError();

    try {
      await _repository.insertContent(content);
      _content.insert(0, content);
      notifyListeners();
    } catch (e) {
      _setError('Failed to add content: $e');
    } finally {
      _setLoading(false);
    }
  }

  /// Update existing medical content
  Future<void> updateContent(SerenyaContent content) async {
    _setLoading(true);
    _clearError();

    try {
      await _repository.updateContent(content);
      final index = _content.indexWhere((c) => c.id == content.id);
      if (index != -1) {
        _content[index] = content;
        notifyListeners();
      }
    } catch (e) {
      _setError('Failed to update content: $e');
    } finally {
      _setLoading(false);
    }
  }

  /// Delete medical content and related data
  Future<void> deleteContent(String contentId) async {
    _setLoading(true);
    _clearError();

    try {
      await _repository.deleteContent(contentId);
      _content.removeWhere((c) => c.id == contentId);
      _labResults.remove(contentId);
      _vitals.remove(contentId);
      _chatMessages.remove(contentId);
      notifyListeners();
    } catch (e) {
      _setError('Failed to delete content: $e');
    } finally {
      _setLoading(false);
    }
  }

  /// Load lab results for specific content
  Future<void> loadLabResultsForContent(String contentId) async {
    try {
      final results = await _repository.getLabResultsForContent(contentId);
      _labResults[contentId] = results;
      notifyListeners();
    } catch (e) {
      _setError('Failed to load lab results: $e');
    }
  }

  /// Load vitals for specific content
  Future<void> loadVitalsForContent(String contentId) async {
    try {
      final vitalsData = await _repository.getVitalsForContent(contentId);
      _vitals[contentId] = vitalsData;
      notifyListeners();
    } catch (e) {
      _setError('Failed to load vitals: $e');
    }
  }

  /// Load chat messages for specific content
  Future<void> loadChatMessagesForContent(String contentId) async {
    try {
      final messages = await _repository.getChatMessagesForContent(contentId);
      _chatMessages[contentId] = messages;
      notifyListeners();
    } catch (e) {
      _setError('Failed to load chat messages: $e');
    }
  }

  /// Add chat message
  Future<void> addChatMessage(ChatMessage message) async {
    try {
      await _repository.insertChatMessage(message);
      if (!_chatMessages.containsKey(message.serenyaContentId)) {
        _chatMessages[message.serenyaContentId] = [];
      }
      _chatMessages[message.serenyaContentId]!.add(message);
      notifyListeners();
    } catch (e) {
      _setError('Failed to add chat message: $e');
    }
  }

  /// Get user preference
  Future<UserPreference?> getPreference(String key) async {
    try {
      return await _repository.getPreference(key);
    } catch (e) {
      _setError('Failed to get preference: $e');
      return null;
    }
  }

  /// Set user preference
  Future<void> setPreference(UserPreference preference) async {
    try {
      await _repository.setPreference(preference);
    } catch (e) {
      _setError('Failed to set preference: $e');
    }
  }

  /// Get database statistics
  Future<Map<String, dynamic>> getDatabaseStats() async {
    try {
      return await _repository.getDatabaseStats();
    } catch (e) {
      _setError('Failed to get stats: $e');
      return {};
    }
  }

  /// Clear all medical data
  Future<void> clearAllData() async {
    _setLoading(true);
    _clearError();

    try {
      await _repository.clearAllData();
      _content.clear();
      _labResults.clear();
      _vitals.clear();
      _chatMessages.clear();
      notifyListeners();
    } catch (e) {
      _setError('Failed to clear data: $e');
    } finally {
      _setLoading(false);
    }
  }

  // Legacy HealthDocument compatibility methods
  // These map to SerenyaContent operations for backward compatibility

  /// Get content by ID (maps to getContentById)
  Future<SerenyaContent?> getDocumentById(String id) async {
    try {
      return await _repository.getContentById(id);
    } catch (e) {
      _setError('Failed to get document: $e');
      return null;
    }
  }

  /// Add document (maps to addContent)
  Future<void> addDocument(SerenyaContent document) async {
    await addContent(document);
  }

  /// Update document (maps to updateContent)
  Future<void> updateDocument(SerenyaContent document) async {
    await updateContent(document);
  }

  /// Get all documents (maps to content getter)
  List<SerenyaContent> get documents => content;

  /// Load all documents (maps to loadContent)
  Future<void> loadDocuments({int? limit}) async {
    await loadContent(limit: limit);
  }

  /// Get documents by processing status
  List<SerenyaContent> getDocumentsByStatus(ProcessingStatus status) {
    return _content.where((doc) => doc.processingStatus == status).toList();
  }

  /// Get interpretations for specific content (maps to content field)
  List<SerenyaContent> get interpretations => _content;

  /// Load interpretations (maps to loadContent)
  Future<void> loadInterpretations() async {
    await loadContent();
  }

  void _setLoading(bool loading) {
    _isLoading = loading;
    notifyListeners();
  }

  void _setError(String error) {
    _error = error;
    notifyListeners();
  }

  void _clearError() {
    _error = null;
  }
}