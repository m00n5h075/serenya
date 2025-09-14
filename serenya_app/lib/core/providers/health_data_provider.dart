import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
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
  final Map<String, List<LabResult>> _labResults = {};
  final Map<String, List<Vital>> _vitals = {};
  final Map<String, List<ChatMessage>> _chatMessages = {};
  bool _isLoading = false;
  String? _error;
  
  // Pagination state
  bool _isLoadingMore = false;
  bool _hasMoreData = true;
  int _currentPage = 0;
  static const int _defaultPageSize = 20;
  int _pageSize = _defaultPageSize;
  String? _lastContentId;
  
  // Performance optimization
  final Map<String, SerenyaContent> _contentCache = {};
  DateTime? _lastCacheRefresh;
  final List<SerenyaContent> _preloadedContent = [];

  List<SerenyaContent> get content => List.unmodifiable(_content);
  Map<String, List<LabResult>> get labResults => Map.unmodifiable(_labResults);
  Map<String, List<Vital>> get vitals => Map.unmodifiable(_vitals);
  Map<String, List<ChatMessage>> get chatMessages => Map.unmodifiable(_chatMessages);
  bool get isLoading => _isLoading;
  String? get error => _error;
  
  // Pagination getters
  bool get isLoadingMore => _isLoadingMore;
  bool get hasMoreData => _hasMoreData;
  int get currentPage => _currentPage;
  int get pageSize => _pageSize;
  int get totalContentCount => _content.length;

  /// Load all medical content (results and reports)
  /// Enhanced with pagination support and caching
  Future<void> loadContent({
    int? limit,
    bool refresh = false,
    bool resetPagination = true,
  }) async {
    if (resetPagination) {
      _resetPaginationState();
    }
    
    _setLoading(true);
    _clearError();

    try {
      final pageLimit = limit ?? _pageSize;
      final newContent = await _repository.getAllContent(
        limit: pageLimit,
        lastContentId: _lastContentId,
      );
      
      if (refresh || _content.isEmpty) {
        _content = newContent;
        _contentCache.clear();
      } else {
        _content.addAll(newContent);
      }
      
      // Update cache
      for (final content in newContent) {
        _contentCache[content.id] = content;
      }
      
      // Update pagination state
      _hasMoreData = newContent.length == pageLimit;
      if (newContent.isNotEmpty) {
        _lastContentId = newContent.last.id;
        _currentPage++;
      }
      _lastCacheRefresh = DateTime.now();
      
      notifyListeners();
    } catch (e) {
      _setError('Failed to load content: $e');
    } finally {
      _setLoading(false);
    }
  }

  /// Load more content for infinite scroll
  /// This is the key method for pagination preloading
  Future<void> loadMoreContent({ContentType? contentType}) async {
    if (_isLoadingMore || !_hasMoreData) return;
    
    _isLoadingMore = true;
    notifyListeners();
    
    try {
      List<SerenyaContent> newContent;
      if (contentType != null) {
        newContent = await _repository.getContentByType(
          contentType,
          limit: _pageSize,
          lastContentId: _lastContentId,
        );
      } else {
        newContent = await _repository.getAllContent(
          limit: _pageSize,
          lastContentId: _lastContentId,
        );
      }
      
      // Add new content to existing list
      _content.addAll(newContent);
      
      // Update cache
      for (final content in newContent) {
        _contentCache[content.id] = content;
      }
      
      // Update pagination state
      _hasMoreData = newContent.length == _pageSize;
      if (newContent.isNotEmpty) {
        _lastContentId = newContent.last.id;
        _currentPage++;
      }
      
      notifyListeners();
    } catch (e) {
      _setError('Failed to load more content: $e');
    } finally {
      _isLoadingMore = false;
      notifyListeners();
    }
  }

  /// Load content by type (results vs reports)
  /// Enhanced with pagination support
  Future<void> loadContentByType(
    ContentType contentType, {
    int? limit,
    bool refresh = false,
    bool resetPagination = true,
  }) async {
    if (resetPagination) {
      _resetPaginationState();
    }
    
    _setLoading(true);
    _clearError();

    try {
      final pageLimit = limit ?? _pageSize;
      final newContent = await _repository.getContentByType(
        contentType,
        limit: pageLimit,
        lastContentId: _lastContentId,
      );
      
      if (refresh || _content.isEmpty) {
        _content = newContent;
        _contentCache.clear();
      } else {
        _content.addAll(newContent);
      }
      
      // Update cache
      for (final content in newContent) {
        _contentCache[content.id] = content;
      }
      
      // Update pagination state
      _hasMoreData = newContent.length == pageLimit;
      if (newContent.isNotEmpty) {
        _lastContentId = newContent.last.id;
        _currentPage++;
      }
      
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

  /// Reset pagination state for fresh loading
  void _resetPaginationState() {
    _currentPage = 0;
    _lastContentId = null;
    _hasMoreData = true;
    _isLoadingMore = false;
  }

  /// Set page size for pagination (useful for performance tuning)
  void setPageSize(int size) {
    _pageSize = size;
  }

  /// Check if content is cached and fresh
  bool _isContentCached(String contentId) {
    if (!_contentCache.containsKey(contentId)) return false;
    
    final cacheAge = _lastCacheRefresh != null 
        ? DateTime.now().difference(_lastCacheRefresh!)
        : const Duration(hours: 1);
    
    // Cache is considered fresh for 30 minutes
    return cacheAge.inMinutes < 30;
  }

  /// Get content from cache if available
  SerenyaContent? getCachedContent(String contentId) {
    if (_isContentCached(contentId)) {
      return _contentCache[contentId];
    }
    return null;
  }

  /// Preload next batch in background
  /// This is triggered when user scrolls to 80% of current content
  Future<void> preloadNextBatch({ContentType? contentType}) async {
    if (_isLoadingMore || !_hasMoreData) return;
    
    // Perform background loading without UI indicators
    try {
      List<SerenyaContent> newContent;
      if (contentType != null) {
        newContent = await _repository.getContentByType(
          contentType,
          limit: _pageSize,
          lastContentId: _lastContentId,
        );
      } else {
        newContent = await _repository.getAllContent(
          limit: _pageSize,
          lastContentId: _lastContentId,
        );
      }
      
      // Pre-cache the content but don't add to main list yet
      for (final content in newContent) {
        _contentCache[content.id] = content;
      }
      
      // Update pagination state quietly
      if (newContent.isNotEmpty) {
        // Store preloaded data temporarily
        _preloadedContent.addAll(newContent);
      }
    } catch (e) {
      // Silent failure for preloading - user won't see this
      debugPrint('Preload failed: $e');
    }
  }

  /// Apply preloaded content to main list
  void applyPreloadedContent() {
    if (_preloadedContent.isNotEmpty) {
      _content.addAll(_preloadedContent);
      
      // Update pagination state
      _hasMoreData = _preloadedContent.length == _pageSize;
      if (_preloadedContent.isNotEmpty) {
        _lastContentId = _preloadedContent.last.id;
        _currentPage++;
      }
      
      _preloadedContent.clear();
      notifyListeners();
    }
  }
}