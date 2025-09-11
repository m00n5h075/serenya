import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import '../../models/local_database_models.dart';
import 'encrypted_database_service.dart';

/// Health Data Repository - Migrated to use EncryptedDatabaseService
/// 
/// This repository now provides access to medical data stored locally
/// using the encrypted database system following the architecture:
/// - serenya_content: AI analysis results and reports
/// - lab_results: Structured laboratory data
/// - vitals: Vital sign measurements
/// - chat_messages: Chat conversation history
/// - user_preferences: UI and app preferences (unencrypted)
class HealthDataRepository {
  /// Get all medical content (results and reports) in timeline order
  /// Enhanced with pagination support for infinite scroll
  Future<List<SerenyaContent>> getAllContent({
    int? limit,
    int? offset,
    String? lastContentId,
  }) async {
    final db = await EncryptedDatabaseService.database;
    
    List<Object?> whereArgs = [];
    String? whereClause;
    
    // Use cursor-based pagination if lastContentId is provided (more efficient)
    if (lastContentId != null) {
      // Get the created_at timestamp of the last content for cursor pagination
      final lastContentResults = await db.query(
        'serenya_content',
        columns: ['created_at'],
        where: 'id = ?',
        whereArgs: [lastContentId],
        limit: 1,
      );
      
      if (lastContentResults.isNotEmpty) {
        final lastCreatedAt = lastContentResults.first['created_at'] as String;
        whereClause = 'created_at < ?';
        whereArgs.add(lastCreatedAt);
      }
    }
    
    final results = await db.query(
      'serenya_content',
      where: whereClause,
      whereArgs: whereArgs.isNotEmpty ? whereArgs : null,
      orderBy: 'created_at DESC',
      limit: limit,
      offset: offset,
    );
    
    final List<SerenyaContent> content = [];
    for (final result in results) {
      content.add(await SerenyaContent.fromDatabaseJson(result));
    }
    return content;
  }

  /// Get medical content by ID
  Future<SerenyaContent?> getContentById(String id) async {
    final db = await EncryptedDatabaseService.database;
    final results = await db.query(
      'serenya_content',
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );
    
    if (results.isNotEmpty) {
      return await SerenyaContent.fromDatabaseJson(results.first);
    }
    return null;
  }

  /// Get content by type (results vs reports)
  /// Enhanced with pagination support for infinite scroll
  Future<List<SerenyaContent>> getContentByType(
    ContentType contentType, {
    int? limit,
    int? offset,
    String? lastContentId,
  }) async {
    final db = await EncryptedDatabaseService.database;
    
    List<Object?> whereArgs = [contentType.value];
    String whereClause = 'content_type = ?';
    
    // Use cursor-based pagination if lastContentId is provided
    if (lastContentId != null) {
      final lastContentResults = await db.query(
        'serenya_content',
        columns: ['created_at'],
        where: 'id = ?',
        whereArgs: [lastContentId],
        limit: 1,
      );
      
      if (lastContentResults.isNotEmpty) {
        final lastCreatedAt = lastContentResults.first['created_at'] as String;
        whereClause = 'content_type = ? AND created_at < ?';
        whereArgs.add(lastCreatedAt);
      }
    }
    
    final results = await db.query(
      'serenya_content',
      where: whereClause,
      whereArgs: whereArgs,
      orderBy: 'created_at DESC',
      limit: limit,
      offset: offset,
    );
    
    final List<SerenyaContent> content = [];
    for (final result in results) {
      content.add(await SerenyaContent.fromDatabaseJson(result));
    }
    return content;
  }

  /// Get total count of content for pagination calculations
  Future<int> getContentCount({ContentType? contentType}) async {
    final db = await EncryptedDatabaseService.database;
    
    String query = 'SELECT COUNT(*) as count FROM serenya_content';
    List<Object?> whereArgs = [];
    
    if (contentType != null) {
      query += ' WHERE content_type = ?';
      whereArgs.add(contentType.value);
    }
    
    final result = await db.rawQuery(query, whereArgs.isNotEmpty ? whereArgs : null);
    return result.first['count'] as int;
  }

  /// Check if there are more items available for pagination
  Future<bool> hasMoreContent({
    ContentType? contentType,
    String? lastContentId,
    int currentCount = 0,
  }) async {
    final totalCount = await getContentCount(contentType: contentType);
    return currentCount < totalCount;
  }

  /// Insert new medical content
  Future<void> insertContent(SerenyaContent content) async {
    final db = await EncryptedDatabaseService.database;
    final dbData = await content.toDatabaseJson();
    await db.insert('serenya_content', dbData);
  }

  /// Update existing medical content
  Future<void> updateContent(SerenyaContent content) async {
    final db = await EncryptedDatabaseService.database;
    final dbData = await content.toDatabaseJson();
    await db.update(
      'serenya_content',
      {...dbData, 'updated_at': DateTime.now().toIso8601String()},
      where: 'id = ?',
      whereArgs: [content.id],
    );
  }

  /// Delete medical content and related data
  Future<void> deleteContent(String contentId) async {
    final db = await EncryptedDatabaseService.database;
    await db.transaction((txn) async {
      // Delete related lab results
      await txn.delete('lab_results', where: 'serenya_content_id = ?', whereArgs: [contentId]);
      // Delete related vitals
      await txn.delete('vitals', where: 'serenya_content_id = ?', whereArgs: [contentId]);
      // Delete related chat messages
      await txn.delete('chat_messages', where: 'serenya_content_id = ?', whereArgs: [contentId]);
      // Delete the content itself
      await txn.delete('serenya_content', where: 'id = ?', whereArgs: [contentId]);
    });
  }

  /// Get lab results for content
  Future<List<LabResult>> getLabResultsForContent(String contentId) async {
    final db = await EncryptedDatabaseService.database;
    final results = await db.query(
      'lab_results',
      where: 'serenya_content_id = ?',
      whereArgs: [contentId],
      orderBy: 'created_at DESC',
    );
    
    final List<LabResult> labResults = [];
    for (final result in results) {
      labResults.add(LabResult.fromJson(result));
    }
    return labResults;
  }

  /// Get vitals for content
  Future<List<Vital>> getVitalsForContent(String contentId) async {
    final db = await EncryptedDatabaseService.database;
    final results = await db.query(
      'vitals',
      where: 'serenya_content_id = ?',
      whereArgs: [contentId],
      orderBy: 'created_at DESC',
    );
    
    final List<Vital> vitals = [];
    for (final result in results) {
      vitals.add(Vital.fromJson(result));
    }
    return vitals;
  }

  /// Get chat messages for content
  Future<List<ChatMessage>> getChatMessagesForContent(String contentId) async {
    final db = await EncryptedDatabaseService.database;
    final results = await db.query(
      'chat_messages',
      where: 'serenya_content_id = ?',
      whereArgs: [contentId],
      orderBy: 'created_at ASC',
    );
    
    final List<ChatMessage> messages = [];
    for (final result in results) {
      messages.add(await ChatMessage.fromDatabaseJson(result));
    }
    return messages;
  }

  /// Insert chat message
  Future<void> insertChatMessage(ChatMessage message) async {
    final db = await EncryptedDatabaseService.database;
    final dbData = await message.toDatabaseJson();
    await db.insert('chat_messages', dbData);
  }

  /// Get user preferences
  Future<UserPreference?> getPreference(String key) async {
    final db = await EncryptedDatabaseService.database;
    final results = await db.query(
      'user_preferences',
      where: 'preference_key = ?',
      whereArgs: [key],
      limit: 1,
    );
    
    if (results.isNotEmpty) {
      return UserPreference.fromJson(results.first);
    }
    return null;
  }

  /// Set user preference
  Future<void> setPreference(UserPreference preference) async {
    final db = await EncryptedDatabaseService.database;
    final dbData = preference.toJson();
    
    await db.insert(
      'user_preferences', 
      dbData,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Get database statistics
  Future<Map<String, dynamic>> getDatabaseStats() async {
    final db = await EncryptedDatabaseService.database;
    
    final contentCount = await db.rawQuery('SELECT COUNT(*) as count FROM serenya_content');
    final labResultsCount = await db.rawQuery('SELECT COUNT(*) as count FROM lab_results');
    final vitalsCount = await db.rawQuery('SELECT COUNT(*) as count FROM vitals');
    final chatMessagesCount = await db.rawQuery('SELECT COUNT(*) as count FROM chat_messages');
    
    final averageConfidence = await db.rawQuery(
      'SELECT AVG(confidence_score) as avg_confidence FROM serenya_content WHERE confidence_score IS NOT NULL'
    );
    
    return {
      'total_content': contentCount.first['count'],
      'total_lab_results': labResultsCount.first['count'],
      'total_vitals': vitalsCount.first['count'],
      'total_chat_messages': chatMessagesCount.first['count'],
      'average_confidence': averageConfidence.isNotEmpty ? averageConfidence.first['avg_confidence'] : 0.0,
    };
  }

  /// Clear all medical data (for testing/reset)
  Future<void> clearAllData() async {
    final db = await EncryptedDatabaseService.database;
    await db.transaction((txn) async {
      await txn.delete('chat_messages');
      await txn.delete('vitals');
      await txn.delete('lab_results');
      await txn.delete('serenya_content');
      await txn.delete('user_preferences');
    });
  }
}