import 'package:flutter/foundation.dart';
import '../../models/health_document.dart';
import '../database/database_service.dart';

class HealthDataProvider extends ChangeNotifier {
  List<HealthDocument> _documents = [];
  List<Interpretation> _interpretations = [];
  bool _isLoading = false;
  String? _error;

  List<HealthDocument> get documents => List.unmodifiable(_documents);
  List<Interpretation> get interpretations => List.unmodifiable(_interpretations);
  bool get isLoading => _isLoading;
  String? get error => _error;

  Future<void> loadDocuments() async {
    _setLoading(true);
    _clearError();

    try {
      final db = await DatabaseService.database;
      final results = await db.query(
        'health_documents',
        orderBy: 'upload_date DESC',
      );

      _documents = results.map((map) => HealthDocument.fromMap(map)).toList();
      notifyListeners();
    } catch (e) {
      _setError('Failed to load documents: $e');
    } finally {
      _setLoading(false);
    }
  }

  Future<void> addDocument(HealthDocument document) async {
    _setLoading(true);
    _clearError();

    try {
      final db = await DatabaseService.database;
      final id = await db.insert('health_documents', document.toMap());
      
      final newDocument = document.copyWith(id: id);
      _documents.insert(0, newDocument);
      notifyListeners();
    } catch (e) {
      _setError('Failed to add document: $e');
    } finally {
      _setLoading(false);
    }
  }

  Future<void> updateDocument(HealthDocument document) async {
    if (document.id == null) return;

    _setLoading(true);
    _clearError();

    try {
      final db = await DatabaseService.database;
      await db.update(
        'health_documents',
        document.copyWith(updatedAt: DateTime.now()).toMap(),
        where: 'id = ?',
        whereArgs: [document.id],
      );

      final index = _documents.indexWhere((d) => d.id == document.id);
      if (index != -1) {
        _documents[index] = document.copyWith(updatedAt: DateTime.now());
        notifyListeners();
      }
    } catch (e) {
      _setError('Failed to update document: $e');
    } finally {
      _setLoading(false);
    }
  }

  Future<void> deleteDocument(int documentId) async {
    _setLoading(true);
    _clearError();

    try {
      final db = await DatabaseService.database;
      await db.delete(
        'health_documents',
        where: 'id = ?',
        whereArgs: [documentId],
      );

      _documents.removeWhere((d) => d.id == documentId);
      _interpretations.removeWhere((i) => i.documentId == documentId);
      notifyListeners();
    } catch (e) {
      _setError('Failed to delete document: $e');
    } finally {
      _setLoading(false);
    }
  }

  Future<void> loadInterpretations(int documentId) async {
    _setLoading(true);
    _clearError();

    try {
      final db = await DatabaseService.database;
      final results = await db.query(
        'interpretations',
        where: 'document_id = ?',
        whereArgs: [documentId],
        orderBy: 'created_at DESC',
      );

      _interpretations = results.map((map) => Interpretation.fromMap(map)).toList();
      notifyListeners();
    } catch (e) {
      _setError('Failed to load interpretations: $e');
    } finally {
      _setLoading(false);
    }
  }

  Future<void> addInterpretation(Interpretation interpretation) async {
    _setLoading(true);
    _clearError();

    try {
      final db = await DatabaseService.database;
      final id = await db.insert('interpretations', interpretation.toMap());
      
      final newInterpretation = Interpretation(
        id: id,
        documentId: interpretation.documentId,
        interpretationType: interpretation.interpretationType,
        confidenceScore: interpretation.confidenceScore,
        interpretationText: interpretation.interpretationText,
        medicalFlags: interpretation.medicalFlags,
        createdAt: interpretation.createdAt,
      );
      
      _interpretations.insert(0, newInterpretation);
      notifyListeners();
    } catch (e) {
      _setError('Failed to add interpretation: $e');
    } finally {
      _setLoading(false);
    }
  }

  List<HealthDocument> getDocumentsByStatus(ProcessingStatus status) {
    return _documents.where((doc) => doc.processingStatus == status).toList();
  }

  List<HealthDocument> getRecentDocuments({int limit = 10}) {
    return _documents.take(limit).toList();
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

  @override
  void dispose() {
    DatabaseService.close();
    super.dispose();
  }
}