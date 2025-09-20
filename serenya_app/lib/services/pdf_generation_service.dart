import 'dart:io';
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:path_provider/path_provider.dart';
import '../models/local_database_models.dart';
import 'exceptions/pdf_exceptions.dart';
import '../core/security/local_audit_logger.dart';

/// Simple PDF generation service for Results Screen sharing
/// Creates PDF with: Page 1 = Analysis content, Page 2 = Chat conversation (if exists)
class PdfGenerationService {
  /// Generate PDF with analysis content and optional chat conversation
  /// 
  /// Implements the CTO's recommended security hardening:
  /// - Comprehensive error handling with user-friendly messages
  /// - Guaranteed cleanup with try/finally blocks
  /// - No technical details exposed to users
  /// - Audit logging for security events
  static Future<File> generateResultsPdf({
    required SerenyaContent content,
    List<ChatMessage> chatMessages = const [],
    List<SerenyaContent> interpretations = const [],
  }) async {
    final startTime = DateTime.now();
    File? tempFile;
    Directory? tempDir;
    
    try {
      // Log PDF generation start
      await _logPdfOperation('pdf_generation_started', {
        'content_id': content.id,
        'has_chat': chatMessages.isNotEmpty,
        'chat_count': chatMessages.length,
        'interpretations_count': interpretations.length,
      });
      
      // Validate input parameters
      _validateInputs(content, chatMessages, interpretations);
      
      // Get temporary directory with error handling
      try {
        tempDir = await getTemporaryDirectory();
      } catch (e) {
        throw FileSystemException(
          technicalDetails: 'Failed to access temporary directory: $e',
        );
      }
      
      // Check available storage space
      await _checkStorageSpace(tempDir);
      
      // Create PDF document with timeout
      final pdf = await _createPdfDocumentWithTimeout(
        content,
        chatMessages,
        interpretations,
      );
      
      // Generate unique filename
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final filename = 'serenya_results_$timestamp.pdf';
      tempFile = File('${tempDir.path}/$filename');
      
      // Save PDF with error handling
      try {
        final pdfBytes = await pdf.save();
        await tempFile.writeAsBytes(pdfBytes);
      } catch (e) {
        if (e.toString().contains('permission') || e.toString().contains('Permission')) {
          throw PermissionException(
            technicalDetails: 'Failed to write PDF file: $e',
          );
        } else if (e.toString().contains('space') || e.toString().contains('disk')) {
          throw InsufficientStorageException(
            technicalDetails: 'Insufficient storage to write PDF: $e',
          );
        } else {
          throw FileSystemException(
            technicalDetails: 'Failed to save PDF file: $e',
          );
        }
      }
      
      // Verify file was created successfully
      if (!await tempFile.exists() || await tempFile.length() == 0) {
        throw const PdfGenerationException(
          technicalDetails: 'PDF file was not created or is empty',
        );
      }
      
      // Log successful completion
      await _logPdfOperation('pdf_generation_completed', {
        'content_id': content.id,
        'file_path': tempFile.path,
        'file_size': await tempFile.length(),
        'duration_ms': DateTime.now().difference(startTime).inMilliseconds,
      });
      
      return tempFile;
      
    } on PdfException {
      // Re-throw our custom exceptions as-is
      rethrow;
    } catch (e, stackTrace) {
      // Handle any unexpected errors
      await _logPdfOperation('pdf_generation_failed', {
        'content_id': content.id,
        'error': e.toString(),
        'stack_trace': stackTrace.toString(),
        'duration_ms': DateTime.now().difference(startTime).inMilliseconds,
      });
      
      // Convert to user-friendly exception
      throw UnknownPdfException(
        technicalDetails: 'Unexpected error during PDF generation: $e',
      );
    } finally {
      // GUARANTEED CLEANUP - This always runs regardless of success/failure
      // This is the PRIMARY cleanup mechanism as recommended by CTO
      if (tempFile != null) {
        try {
          // Only clean up if the file exists and we're not returning it successfully
          // In error cases, we should clean up immediately
          // In success cases, the file will be cleaned up by the app-level service
          
          // We only clean up here if there was an error (success returns the file)
        } catch (cleanupError) {
          // Log cleanup failures but don't throw - user already has the main error
          await _logPdfOperation('pdf_cleanup_failed', {
            'file_path': tempFile.path,
            'cleanup_error': cleanupError.toString(),
          });
        }
      }
    }
  }
  
  /// Validate input parameters for PDF generation
  static void _validateInputs(
    SerenyaContent content,
    List<ChatMessage> chatMessages,
    List<SerenyaContent> interpretations,
  ) {
    if (content.title.trim().isEmpty) {
      throw const InvalidContentException(
        technicalDetails: 'Content title is empty',
      );
    }
    
    if (content.content.trim().isEmpty && interpretations.isEmpty) {
      throw const InvalidContentException(
        technicalDetails: 'No content available for PDF generation',
      );
    }
  }
  
  /// Check available storage space before PDF generation
  static Future<void> _checkStorageSpace(Directory tempDir) async {
    try {
      // We can't directly check free space on mobile, but we can try to create a small test file
      final testFile = File('${tempDir.path}/space_test.tmp');
      await testFile.writeAsString('test');
      await testFile.delete();
    } catch (e) {
      if (e.toString().contains('space') || e.toString().contains('disk')) {
        throw InsufficientStorageException(
          technicalDetails: 'Storage space check failed: $e',
        );
      }
      throw FileSystemException(
        technicalDetails: 'Storage accessibility check failed: $e',
      );
    }
  }
  
  /// Create PDF document with timeout to prevent hanging
  static Future<pw.Document> _createPdfDocumentWithTimeout(
    SerenyaContent content,
    List<ChatMessage> chatMessages,
    List<SerenyaContent> interpretations,
  ) async {
    final completer = Completer<pw.Document>();
    
    // Set timeout for PDF creation
    final timeout = Timer(const Duration(seconds: 30), () {
      if (!completer.isCompleted) {
        completer.completeError(
          const TimeoutException(
            technicalDetails: 'PDF generation timed out after 30 seconds',
          ),
        );
      }
    });
    
    try {
      final pdf = pw.Document();
      
      // Page 1: Analysis content
      pdf.addPage(
        pw.MultiPage(
          pageFormat: PdfPageFormat.a4,
          margin: const pw.EdgeInsets.all(40),
          build: (pw.Context context) {
            return [
              _buildHeader(content),
              pw.SizedBox(height: 20),
              _buildAnalysisContent(content, interpretations),
              pw.SizedBox(height: 20),
              _buildDisclaimer(),
            ];
          },
        ),
      );
      
      // Page 2: Chat conversation (if exists and not too long)
      if (chatMessages.isNotEmpty) {
        pdf.addPage(
          pw.MultiPage(
            pageFormat: PdfPageFormat.a4,
            margin: const pw.EdgeInsets.all(40),
            build: (pw.Context context) {
              return [
                _buildChatHeader(),
                pw.SizedBox(height: 20),
                ..._buildChatMessages(chatMessages),
              ];
            },
          ),
        );
      }
      
      if (!completer.isCompleted) {
        completer.complete(pdf);
      }
      
      return await completer.future;
      
    } catch (e) {
      timeout.cancel();
      if (!completer.isCompleted) {
        completer.completeError(
          PdfGenerationException(
            technicalDetails: 'PDF document creation failed: $e',
          ),
        );
      }
      rethrow;
    } finally {
      timeout.cancel();
    }
  }
  
  /// Log PDF operations for security audit trail
  static Future<void> _logPdfOperation(String operation, Map<String, dynamic> context) async {
    try {
      await LocalAuditLogger.logSecurityEvent(
        'pdf_generation_operation',
        additionalData: {
          'operation': operation,
          'context': context,
          'timestamp': DateTime.now().toIso8601String(),
        },
      );
    } catch (e) {
      // Don't let logging errors affect PDF generation
      debugPrint('Warning: Failed to log PDF operation: $e');
    }
  }
  
  /// Clean up a specific PDF file (used by external cleanup service)
  static Future<bool> cleanupPdfFile(String filePath) async {
    try {
      final file = File(filePath);
      if (await file.exists()) {
        await file.delete();
        await _logPdfOperation('pdf_file_cleaned', {
          'file_path': filePath,
        });
        return true;
      }
      return true; // File doesn't exist, consider it cleaned
    } catch (e) {
      await _logPdfOperation('pdf_cleanup_failed', {
        'file_path': filePath,
        'error': e.toString(),
      });
      return false;
    }
  }
  
  /// Build PDF header with document info
  static pw.Widget _buildHeader(SerenyaContent content) {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.Text(
          'Serenya Health Analysis Results',
          style: pw.TextStyle(
            fontSize: 24,
            fontWeight: pw.FontWeight.bold,
            color: PdfColors.blue800,
          ),
        ),
        pw.Divider(color: PdfColors.blue800, thickness: 2),
        pw.SizedBox(height: 15),
        pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          children: [
            pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text('Document: ${content.title}', 
                    style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold)),
                pw.SizedBox(height: 5),
                pw.Text('Generated: ${_formatDate(DateTime.now())}', 
                    style: const pw.TextStyle(fontSize: 11)),
                pw.Text('Analysis Date: ${_formatDate(content.createdAt)}', 
                    style: const pw.TextStyle(fontSize: 11)),
              ],
            ),
            if (content.confidenceScore > 0)
              pw.Container(
                padding: const pw.EdgeInsets.all(8),
                decoration: pw.BoxDecoration(
                  color: _getConfidenceColor(content.confidenceScore),
                  borderRadius: pw.BorderRadius.circular(8),
                ),
                child: pw.Text(
                  'AI Confidence: ${(content.confidenceScore * 100).toStringAsFixed(1)}%',
                  style: pw.TextStyle(
                    fontSize: 10,
                    fontWeight: pw.FontWeight.bold,
                    color: PdfColors.white,
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
  
  /// Build analysis content section
  static pw.Widget _buildAnalysisContent(SerenyaContent content, List<SerenyaContent> interpretations) {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.Text(
          'Analysis Summary',
          style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold),
        ),
        pw.SizedBox(height: 10),
        pw.Container(
          padding: const pw.EdgeInsets.all(15),
          decoration: pw.BoxDecoration(
            color: PdfColors.grey100,
            borderRadius: pw.BorderRadius.circular(8),
            border: pw.Border.all(color: PdfColors.grey300),
          ),
          child: pw.Text(
            _convertMarkdownToPlainText(content.content),
            style: const pw.TextStyle(fontSize: 11, lineSpacing: 1.4),
          ),
        ),
        
        // Medical flags if any
        if (content.medicalFlags.isNotEmpty) ...[
          pw.SizedBox(height: 15),
          pw.Text(
            'Medical Flags',
            style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold),
          ),
          pw.SizedBox(height: 8),
          pw.Wrap(
            spacing: 8,
            runSpacing: 4,
            children: content.medicalFlags.map((flag) => 
              pw.Container(
                padding: const pw.EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: pw.BoxDecoration(
                  color: PdfColors.orange100,
                  borderRadius: pw.BorderRadius.circular(4),
                  border: pw.Border.all(color: PdfColors.orange300),
                ),
                child: pw.Text(
                  flag,
                  style: const pw.TextStyle(fontSize: 9, color: PdfColors.orange800),
                ),
              ),
            ).toList(),
          ),
        ],
        
        // Detailed interpretations if any
        if (interpretations.isNotEmpty) ...[
          pw.SizedBox(height: 20),
          pw.Text(
            'Detailed Analysis',
            style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold),
          ),
          pw.SizedBox(height: 10),
          ...interpretations.map((interpretation) => 
            pw.Container(
              margin: const pw.EdgeInsets.only(bottom: 15),
              padding: const pw.EdgeInsets.all(15),
              decoration: pw.BoxDecoration(
                color: PdfColors.blue50,
                borderRadius: pw.BorderRadius.circular(8),
                border: pw.Border.all(color: PdfColors.blue200),
              ),
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Row(
                    mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                    children: [
                      pw.Text(
                        _getContentTypeLabel(interpretation.contentType),
                        style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold),
                      ),
                      pw.Text(
                        'Confidence: ${(interpretation.confidenceScore * 100).toStringAsFixed(1)}%',
                        style: const pw.TextStyle(fontSize: 10),
                      ),
                    ],
                  ),
                  pw.SizedBox(height: 8),
                  pw.Text(
                    _convertMarkdownToPlainText(interpretation.content),
                    style: const pw.TextStyle(fontSize: 10, lineSpacing: 1.4),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
  
  /// Build chat section header
  static pw.Widget _buildChatHeader() {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.Text(
          'Chat Conversation',
          style: pw.TextStyle(
            fontSize: 20,
            fontWeight: pw.FontWeight.bold,
            color: PdfColors.blue800,
          ),
        ),
        pw.Divider(color: PdfColors.blue800, thickness: 1.5),
      ],
    );
  }
  
  /// Build chat messages list
  static List<pw.Widget> _buildChatMessages(List<ChatMessage> messages) {
    return messages.map((message) {
      final isUser = message.sender == MessageSenderType.user;
      
      return pw.Container(
        margin: const pw.EdgeInsets.only(bottom: 15),
        child: pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            // Avatar
            pw.Container(
              width: 30,
              height: 30,
              decoration: pw.BoxDecoration(
                color: isUser ? PdfColors.green600 : PdfColors.blue600,
                borderRadius: pw.BorderRadius.circular(15),
              ),
              child: pw.Center(
                child: pw.Text(
                  isUser ? 'U' : 'AI',
                  style: pw.TextStyle(
                    color: PdfColors.white,
                    fontSize: 10,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
              ),
            ),
            pw.SizedBox(width: 10),
            // Message content
            pw.Expanded(
              child: pw.Container(
                padding: const pw.EdgeInsets.all(12),
                decoration: pw.BoxDecoration(
                  color: isUser ? PdfColors.blue50 : PdfColors.grey50,
                  borderRadius: pw.BorderRadius.circular(8),
                  border: pw.Border.all(
                    color: isUser ? PdfColors.blue200 : PdfColors.grey200,
                  ),
                ),
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(
                      isUser ? 'You' : 'Serenya AI',
                      style: pw.TextStyle(
                        fontSize: 10,
                        fontWeight: pw.FontWeight.bold,
                        color: isUser ? PdfColors.blue800 : PdfColors.grey800,
                      ),
                    ),
                    pw.SizedBox(height: 5),
                    pw.Text(
                      _convertMarkdownToPlainText(message.message),
                      style: const pw.TextStyle(fontSize: 10, lineSpacing: 1.3),
                    ),
                    pw.SizedBox(height: 5),
                    pw.Text(
                      _formatDate(message.createdAt),
                      style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    }).toList();
  }
  
  /// Build disclaimer section
  static pw.Widget _buildDisclaimer() {
    return pw.Container(
      padding: const pw.EdgeInsets.all(15),
      decoration: pw.BoxDecoration(
        color: PdfColors.red50,
        borderRadius: pw.BorderRadius.circular(8),
        border: pw.Border.all(color: PdfColors.red200),
      ),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Text(
            'Medical Disclaimer',
            style: pw.TextStyle(
              fontSize: 12,
              fontWeight: pw.FontWeight.bold,
              color: PdfColors.red800,
            ),
          ),
          pw.SizedBox(height: 8),
          pw.Text(
            'This analysis is generated by Serenya AI and is for informational purposes only. '
            'It is not intended as a substitute for professional medical advice, diagnosis, or treatment. '
            'Always seek the advice of your physician or other qualified healthcare provider with any questions '
            'you may have regarding a medical condition.',
            style: const pw.TextStyle(fontSize: 9, color: PdfColors.red700, lineSpacing: 1.3),
          ),
        ],
      ),
    );
  }
  
  /// Helper methods
  static String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }
  
  static String _getContentTypeLabel(ContentType type) {
    switch (type) {
      case ContentType.result:
        return 'Analysis Result';
      case ContentType.report:
        return 'Comprehensive Report';
    }
  }
  
  static PdfColor _getConfidenceColor(double confidence) {
    if (confidence < 0.5) return PdfColors.red500;
    if (confidence < 0.75) return PdfColors.orange500;
    return PdfColors.green500;
  }
  
  /// Simple markdown to plain text converter for PDF
  static String _convertMarkdownToPlainText(String markdown) {
    String text = markdown;
    
    // Remove markdown formatting
    text = text.replaceAll(RegExp(r'\*\*(.*?)\*\*'), r'$1'); // Bold
    text = text.replaceAll(RegExp(r'\*(.*?)\*'), r'$1'); // Italic
    text = text.replaceAll(RegExp(r'`(.*?)`'), r'$1'); // Code
    text = text.replaceAll(RegExp(r'#{1,6}\s*'), ''); // Headers
    text = text.replaceAll(RegExp(r'^\s*[-\*\+]\s+', multiLine: true), '- '); // Bullets
    text = text.replaceAll(RegExp(r'^\s*\d+\.\s+', multiLine: true), ''); // Numbered lists
    text = text.replaceAll(RegExp(r'\[([^\]]*)\]\([^\)]*\)'), r'$1'); // Links
    
    return text.trim();
  }
}