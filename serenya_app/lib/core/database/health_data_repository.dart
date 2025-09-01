import '../../models/health_document.dart';
import '../constants/app_constants.dart';
import 'database_service.dart';

class HealthDataRepository {
  Future<List<HealthDocument>> getAllDocuments() async {
    final db = await DatabaseService.database;
    final results = await db.query(
      DatabaseConstants.healthDocumentsTable,
      orderBy: 'upload_date DESC',
    );
    
    return results.map((map) => HealthDocument.fromMap(map)).toList();
  }

  Future<HealthDocument?> getDocumentById(int id) async {
    final db = await DatabaseService.database;
    final results = await db.query(
      DatabaseConstants.healthDocumentsTable,
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );
    
    if (results.isNotEmpty) {
      return HealthDocument.fromMap(results.first);
    }
    return null;
  }

  Future<List<HealthDocument>> getDocumentsByStatus(ProcessingStatus status) async {
    final db = await DatabaseService.database;
    final statusString = status.toString().split('.').last;
    
    final results = await db.query(
      DatabaseConstants.healthDocumentsTable,
      where: 'processing_status = ?',
      whereArgs: [statusString],
      orderBy: 'upload_date DESC',
    );
    
    return results.map((map) => HealthDocument.fromMap(map)).toList();
  }

  Future<List<HealthDocument>> getRecentDocuments({int limit = 10}) async {
    final db = await DatabaseService.database;
    final results = await db.query(
      DatabaseConstants.healthDocumentsTable,
      orderBy: 'upload_date DESC',
      limit: limit,
    );
    
    return results.map((map) => HealthDocument.fromMap(map)).toList();
  }

  Future<int> insertDocument(HealthDocument document) async {
    final db = await DatabaseService.database;
    return await db.insert(
      DatabaseConstants.healthDocumentsTable,
      document.toMap(),
    );
  }

  Future<void> updateDocument(HealthDocument document) async {
    if (document.id == null) throw ArgumentError('Document ID cannot be null for update');
    
    final db = await DatabaseService.database;
    await db.update(
      DatabaseConstants.healthDocumentsTable,
      document.copyWith(updatedAt: DateTime.now()).toMap(),
      where: 'id = ?',
      whereArgs: [document.id],
    );
  }

  Future<void> deleteDocument(int id) async {
    final db = await DatabaseService.database;
    await db.delete(
      DatabaseConstants.healthDocumentsTable,
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<List<Interpretation>> getInterpretationsForDocument(int documentId) async {
    final db = await DatabaseService.database;
    final results = await db.query(
      DatabaseConstants.interpretationsTable,
      where: 'document_id = ?',
      whereArgs: [documentId],
      orderBy: 'created_at DESC',
    );
    
    return results.map((map) => Interpretation.fromMap(map)).toList();
  }

  Future<int> insertInterpretation(Interpretation interpretation) async {
    final db = await DatabaseService.database;
    return await db.insert(
      DatabaseConstants.interpretationsTable,
      interpretation.toMap(),
    );
  }

  Future<void> deleteInterpretationsForDocument(int documentId) async {
    final db = await DatabaseService.database;
    await db.delete(
      DatabaseConstants.interpretationsTable,
      where: 'document_id = ?',
      whereArgs: [documentId],
    );
  }

  Future<Map<String, dynamic>> getDatabaseStats() async {
    final db = await DatabaseService.database;
    
    final documentCountResult = await db.rawQuery('SELECT COUNT(*) as count FROM ${DatabaseConstants.healthDocumentsTable}');
    final documentCount = documentCountResult.first['count'] as int;
    
    final interpretationCountResult = await db.rawQuery('SELECT COUNT(*) as count FROM ${DatabaseConstants.interpretationsTable}');
    final interpretationCount = interpretationCountResult.first['count'] as int;
    
    final averageConfidence = await db.rawQuery(
      'SELECT AVG(ai_confidence_score) as avg_confidence FROM ${DatabaseConstants.healthDocumentsTable} WHERE ai_confidence_score IS NOT NULL'
    );
    
    return {
      'total_documents': documentCount,
      'total_interpretations': interpretationCount,
      'average_confidence': averageConfidence.isNotEmpty ? averageConfidence.first['avg_confidence'] : 0.0,
    };
  }

  Future<void> clearAllData() async {
    final db = await DatabaseService.database;
    await db.delete(DatabaseConstants.interpretationsTable);
    await db.delete(DatabaseConstants.healthDocumentsTable);
    await db.delete(DatabaseConstants.userPreferencesTable);
    await db.delete(DatabaseConstants.consentRecordsTable);
  }
}