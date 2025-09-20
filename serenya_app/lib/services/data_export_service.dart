import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../core/database/encrypted_database_service.dart';
import 'api_service.dart';

/// GDPR-compliant data export service
/// 
/// Provides comprehensive data export functionality that combines local
/// SQLite data with server-side data for GDPR Article 15 compliance.
/// Exports data in human-readable JSON format with structured organization.
class DataExportService {
  static final DataExportService _instance = DataExportService._internal();
  factory DataExportService() => _instance;
  DataExportService._internal();

  final ApiService _apiService = ApiService();

  /// Export all user data in GDPR-compliant format
  Future<DataExportResult> exportAllUserData() async {
    try {
      // Collect data from both local and server sources
      final localData = await _collectLocalData();
      final serverData = await _collectServerData();
      
      // Combine into comprehensive export
      final exportData = _formatExportData(localData, serverData);
      
      // Create export file
      final file = await _createExportFile(exportData);
      
      return DataExportResult.success(
        file: file,
        message: 'Data export completed successfully',
        recordsCount: _calculateTotalRecords(exportData),
      );
      
    } catch (e) {
      return DataExportResult.failed('Data export failed: $e');
    }
  }

  /// Share exported data file via platform sharing
  Future<void> shareExportFile(File file) async {
    await SharePlus.instance.share(ShareParams(
      files: [XFile(file.path)],
      text: 'Your Serenya data export - ${DateTime.now().toString()}',
      subject: 'Serenya Data Export',
    ));
  }

  /// Collect all local SQLite data
  Future<LocalDataExport> _collectLocalData() async {
    final database = await EncryptedDatabaseService.database;
    
    // Get all local data following the database architecture
    final documents = await database.rawQuery('''
      SELECT * FROM serenya_content 
      ORDER BY created_at DESC
    ''');
    
    final processingJobs = await database.rawQuery('''
      SELECT * FROM processing_jobs 
      ORDER BY created_at DESC
    ''');
    
    final chatMessages = await database.rawQuery('''
      SELECT * FROM chat_messages 
      ORDER BY timestamp DESC
    ''');
    
    final userPreferences = await database.rawQuery('''
      SELECT * FROM user_preferences 
      ORDER BY created_at DESC
    ''');
    
    return LocalDataExport(
      documents: documents,
      processingJobs: processingJobs,
      chatMessages: chatMessages,
      userPreferences: userPreferences,
      exportGeneratedAt: DateTime.now(),
    );
  }

  /// Collect server-side data via API
  Future<ServerDataExport> _collectServerData() async {
    try {
      // Get user profile data
      final profileResult = await _apiService.getUserProfile();
      Map<String, dynamic>? profileData;
      
      if (profileResult.success) {
        profileData = profileResult.data;
      }
      
      // Note: Additional server endpoints would be called here
      // when available (subscription history, audit logs, etc.)
      
      return ServerDataExport(
        userProfile: profileData,
        serverDataAvailable: profileResult.success,
        exportGeneratedAt: DateTime.now(),
      );
      
    } catch (e) {
      // Return partial export with local data only if server fails
      return ServerDataExport(
        userProfile: null,
        serverDataAvailable: false,
        exportGeneratedAt: DateTime.now(),
        serverError: e.toString(),
      );
    }
  }

  /// Format combined data for GDPR compliance
  Map<String, dynamic> _formatExportData(
    LocalDataExport localData,
    ServerDataExport serverData,
  ) {
    return {
      'export_metadata': {
        'generated_at': DateTime.now().toIso8601String(),
        'export_format_version': '1.0.0',
        'data_sources': {
          'local_database': true,
          'server_database': serverData.serverDataAvailable,
        },
        'gdpr_compliance': {
          'article_15_access_request': true,
          'human_readable_format': true,
          'structured_data_export': true,
        },
      },
      
      'personal_information': {
        'profile_data': serverData.userProfile,
        'user_preferences': localData.userPreferences.map((pref) => {
          'setting': pref['key'],
          'value': pref['value'],
          'last_updated': pref['updated_at'],
        }).toList(),
      },
      
      'medical_documents': {
        'total_documents': localData.documents.length,
        'documents': localData.documents.map((doc) => {
          'document_id': doc['id'],
          'upload_date': doc['created_at'],
          'document_type': doc['document_type'],
          'file_name': doc['original_filename'],
          'analysis_status': doc['status'],
          'has_analysis_results': doc['analysis_result'] != null,
          'has_doctor_report': doc['doctor_report'] != null,
          'last_updated': doc['updated_at'],
        }).toList(),
      },
      
      'conversation_history': {
        'total_messages': localData.chatMessages.length,
        'conversations': _groupChatMessagesByDocument(localData.chatMessages),
      },
      
      'processing_history': {
        'total_jobs': localData.processingJobs.length,
        'jobs': localData.processingJobs.map((job) => {
          'job_id': job['id'],
          'document_id': job['document_id'],
          'job_type': job['job_type'],
          'status': job['status'],
          'created_at': job['created_at'],
          'completed_at': job['completed_at'],
        }).toList(),
      },
      
      'data_retention_info': {
        'local_storage_policy': 'Data stored locally on device until manually deleted',
        'server_storage_policy': 'Health data retained as per privacy policy',
        'your_rights': [
          'Right to access your data (this export)',
          'Right to rectification (update incorrect data)',
          'Right to erasure (delete all data)',
          'Right to data portability (this export)',
          'Right to object to processing',
        ],
      },
      
      'export_completeness': {
        'local_data_included': true,
        'server_data_included': serverData.serverDataAvailable,
        'server_error': serverData.serverError,
        'data_categories_exported': [
          'Personal profile information',
          'Medical document metadata',
          'Analysis results and interpretations',
          'Chat conversation history',
          'User preferences and settings',
          'Processing job history',
        ],
      },
    };
  }

  /// Group chat messages by document for better organization
  List<Map<String, dynamic>> _groupChatMessagesByDocument(List<Map<String, dynamic>> messages) {
    final Map<String?, List<Map<String, dynamic>>> grouped = {};
    
    for (final message in messages) {
      final docId = message['document_id'] as String?;
      grouped.putIfAbsent(docId, () => []).add({
        'timestamp': message['timestamp'],
        'message_content': message['content'],
        'sender': message['sender'],
        'message_type': message['message_type'],
      });
    }
    
    return grouped.entries.map((entry) => {
      'document_id': entry.key ?? 'general_conversation',
      'message_count': entry.value.length,
      'messages': entry.value,
    }).toList();
  }

  /// Create export file in downloads directory
  Future<File> _createExportFile(Map<String, dynamic> exportData) async {
    final directory = await getApplicationDocumentsDirectory();
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final fileName = 'serenya_data_export_$timestamp.json';
    final file = File('${directory.path}/$fileName');
    
    // Write formatted JSON with indentation for readability
    final jsonString = const JsonEncoder.withIndent('  ').convert(exportData);
    await file.writeAsString(jsonString);
    
    return file;
  }

  /// Calculate total records exported for user feedback
  int _calculateTotalRecords(Map<String, dynamic> exportData) {
    int total = 0;
    
    final documents = exportData['medical_documents']['documents'] as List?;
    final messages = exportData['conversation_history']['conversations'] as List?;
    final jobs = exportData['processing_history']['jobs'] as List?;
    final preferences = exportData['personal_information']['user_preferences'] as List?;
    
    total += documents?.length ?? 0;
    total += messages?.fold<int>(0, (sum, conv) => sum + (conv['message_count'] as int? ?? 0)) ?? 0;
    total += jobs?.length ?? 0;
    total += preferences?.length ?? 0;
    
    return total;
  }
}

/// Local database export data structure
class LocalDataExport {
  final List<Map<String, dynamic>> documents;
  final List<Map<String, dynamic>> processingJobs;
  final List<Map<String, dynamic>> chatMessages;
  final List<Map<String, dynamic>> userPreferences;
  final DateTime exportGeneratedAt;

  LocalDataExport({
    required this.documents,
    required this.processingJobs,
    required this.chatMessages,
    required this.userPreferences,
    required this.exportGeneratedAt,
  });
}

/// Server database export data structure
class ServerDataExport {
  final Map<String, dynamic>? userProfile;
  final bool serverDataAvailable;
  final DateTime exportGeneratedAt;
  final String? serverError;

  ServerDataExport({
    this.userProfile,
    required this.serverDataAvailable,
    required this.exportGeneratedAt,
    this.serverError,
  });
}

/// Data export operation result
class DataExportResult {
  final bool success;
  final File? file;
  final String message;
  final int? recordsCount;

  const DataExportResult._({
    required this.success,
    this.file,
    required this.message,
    this.recordsCount,
  });

  factory DataExportResult.success({
    required File file,
    required String message,
    required int recordsCount,
  }) {
    return DataExportResult._(
      success: true,
      file: file,
      message: message,
      recordsCount: recordsCount,
    );
  }

  factory DataExportResult.failed(String message) {
    return DataExportResult._(
      success: false,
      message: message,
    );
  }
}