import 'dart:async';
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import '../models/local_database_models.dart';
import '../core/constants/app_constants.dart';
import '../core/utils/encryption_utils.dart';
import '../core/providers/health_data_provider.dart';
import '../core/database/health_data_repository.dart';
import 'processing_service.dart';
import 'notification_service.dart';

class UploadService {
  final ProcessingService _processingService = ProcessingService();
  final NotificationService _notificationService = NotificationService();
  final HealthDataRepository _repository = HealthDataRepository();
  final ImagePicker _imagePicker = ImagePicker();

  Future<UploadResult> selectAndUploadFile(HealthDataProvider dataProvider) async {
    try {
      // Show file selection options
      final source = await _showFileSourceDialog();
      if (source == null) {
        return UploadResult(
          success: false,
          message: 'Upload cancelled by user',
          cancelled: true,
        );
      }

      File? selectedFile;
      String? fileName;

      // Handle file selection based on source
      switch (source) {
        case FileSource.camera:
          final result = await _selectFromCamera();
          selectedFile = result.file;
          fileName = result.fileName;
          break;
        case FileSource.gallery:
          final result = await _selectFromGallery();
          selectedFile = result.file;
          fileName = result.fileName;
          break;
        case FileSource.files:
          final result = await _selectFromFiles();
          selectedFile = result.file;
          fileName = result.fileName;
          break;
      }

      if (selectedFile == null) {
        return UploadResult(
          success: false,
          message: 'No file selected',
          cancelled: true,
        );
      }

      // Validate file
      final validationResult = await _validateFile(selectedFile, fileName!);
      if (!validationResult.isValid) {
        return UploadResult(
          success: false,
          message: validationResult.errorMessage!,
          error: UploadErrorType.validation,
        );
      }

      // Start processing
      final processingResult = await _processingService.processDocument(
        file: selectedFile,
        fileName: fileName,
        dataProvider: dataProvider,
      );

      if (processingResult.success) {
        // Start monitoring for completion
        _startProcessingMonitor(
          processingResult.jobId!,
          processingResult.document!,
          dataProvider,
        );

        return UploadResult(
          success: true,
          message: 'Upload started successfully',
          jobId: processingResult.jobId,
          document: processingResult.document,
        );
      } else {
        return UploadResult(
          success: false,
          message: processingResult.message,
          error: UploadErrorType.communication,
        );
      }
    } catch (e) {
      return UploadResult(
        success: false,
        message: 'Unexpected error: ${e.toString()}',
        error: UploadErrorType.communication,
      );
    }
  }

  Future<FileSource?> _showFileSourceDialog() async {
    // This will be implemented in the UI layer
    // For now, return camera as default
    return FileSource.camera;
  }

  Future<_FileResult> _selectFromCamera() async {
    try {
      final cameraStatus = await Permission.camera.request();
      if (cameraStatus != PermissionStatus.granted) {
        throw Exception('Camera permission not granted');
      }

      final XFile? image = await _imagePicker.pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
        maxWidth: 2048,
        maxHeight: 2048,
      );

      if (image == null) {
        return _FileResult(file: null, fileName: null);
      }

      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final fileName = 'health_document_$timestamp.jpg';

      return _FileResult(
        file: File(image.path),
        fileName: fileName,
      );
    } catch (e) {
      throw Exception('Failed to capture photo: ${e.toString()}');
    }
  }

  Future<_FileResult> _selectFromGallery() async {
    try {
      final storageStatus = await Permission.storage.request();
      if (storageStatus != PermissionStatus.granted) {
        throw Exception('Storage permission not granted');
      }

      final XFile? image = await _imagePicker.pickImage(
        source: ImageSource.gallery,
      );

      if (image == null) {
        return _FileResult(file: null, fileName: null);
      }

      final originalName = image.name;
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final extension = originalName.split('.').last;
      final fileName = 'health_document_$timestamp.$extension';

      return _FileResult(
        file: File(image.path),
        fileName: fileName,
      );
    } catch (e) {
      throw Exception('Failed to select from gallery: ${e.toString()}');
    }
  }

  Future<_FileResult> _selectFromFiles() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: AppConstants.supportedFileTypes,
        allowMultiple: false,
      );

      if (result == null || result.files.isEmpty) {
        return _FileResult(file: null, fileName: null);
      }

      final platformFile = result.files.first;
      if (platformFile.path == null) {
        throw Exception('Invalid file selected');
      }

      return _FileResult(
        file: File(platformFile.path!),
        fileName: platformFile.name,
      );
    } catch (e) {
      throw Exception('Failed to select file: ${e.toString()}');
    }
  }

  Future<_ValidationResult> _validateFile(File file, String fileName) async {
    // Check file type
    if (!EncryptionUtils.isValidFileType(fileName)) {
      return _ValidationResult(
        isValid: false,
        errorMessage: 'File type not supported. Please use PDF, JPG, JPEG, or PNG files.',
      );
    }

    // Check file size
    final fileSize = await file.length();
    if (!EncryptionUtils.isValidFileSize(fileSize)) {
      final maxSizeMB = AppConstants.maxFileSizeBytes / (1024 * 1024);
      return _ValidationResult(
        isValid: false,
        errorMessage: 'File too large. Maximum size is ${maxSizeMB.toInt()}MB.',
      );
    }

    // Check if file exists and is readable
    if (!await file.exists()) {
      return _ValidationResult(
        isValid: false,
        errorMessage: 'Selected file could not be accessed.',
      );
    }

    return _ValidationResult(isValid: true);
  }

  void _startProcessingMonitor(
    String jobId,
    SerenyaContent document,
    HealthDataProvider dataProvider,
  ) {
    Timer.periodic(Duration(seconds: 15), (timer) async {
      try {
        // Check if document is still processing
        final currentDoc = await _repository.getContentById(document.id);
        if (currentDoc == null) {
          timer.cancel();
          return;
        }

        // Stop monitoring if processing is complete or failed
        if (currentDoc.processingStatus == ProcessingStatus.completed ||
            currentDoc.processingStatus == ProcessingStatus.failed) {
          timer.cancel();
          
          // Trigger notifications and vibration
          await _handleProcessingComplete(currentDoc);
        }

        // Check for timeout (3 minutes)
        if (currentDoc.uploadDate != null) {
          final processingDuration = DateTime.now().difference(currentDoc.uploadDate!);
          if (processingDuration.inMinutes >= AppConstants.processingTimeoutMinutes) {
            timer.cancel();
            await _handleProcessingTimeout(currentDoc, dataProvider);
          }
        }
      } catch (e) {
        print('Error monitoring processing: $e');
      }
    });
  }

  Future<void> _handleProcessingComplete(SerenyaContent document) async {
    // Trigger vibration
    HapticFeedback.mediumImpact();

    // Send notification based on status
    if (document.processingStatus == ProcessingStatus.completed) {
      await _notificationService.showResultsReadyNotification(document);
    } else {
      await _notificationService.showProcessingErrorNotification(
        'We were unable to process your file',
      );
    }
  }

  Future<void> _handleProcessingTimeout(
    SerenyaContent document,
    HealthDataProvider dataProvider,
  ) async {
    // Mark document as failed due to timeout
    final timeoutDocument = document.copyWith(
      processingStatus: ProcessingStatus.failed,
      content: 'Processing timeout after ${AppConstants.processingTimeoutMinutes} minutes',
      updatedAt: DateTime.now(),
    );

    await dataProvider.updateDocument(timeoutDocument);

    // Trigger vibration and notification
    HapticFeedback.mediumImpact();
    await _notificationService.showProcessingErrorNotification(
      'We were unable to process your file - timeout',
    );
  }

  void dispose() {
    _processingService.dispose();
  }
}

class UploadResult {
  final bool success;
  final String message;
  final String? jobId;
  final SerenyaContent? document;
  final UploadErrorType? error;
  final bool cancelled;

  UploadResult({
    required this.success,
    required this.message,
    this.jobId,
    this.document,
    this.error,
    this.cancelled = false,
  });
}

enum FileSource {
  camera,
  gallery,
  files,
}

enum UploadErrorType {
  communication,
  processing,
  validation,
}

class _FileResult {
  final File? file;
  final String? fileName;

  _FileResult({required this.file, required this.fileName});
}

class _ValidationResult {
  final bool isValid;
  final String? errorMessage;

  _ValidationResult({required this.isValid, this.errorMessage});
}