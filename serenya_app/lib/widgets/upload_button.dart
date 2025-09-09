import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import '../core/constants/app_constants.dart';
import '../core/providers/health_data_provider.dart';
import '../core/utils/encryption_utils.dart';
import '../services/processing_service.dart';
import '../services/notification_service.dart';
import '../models/local_database_models.dart';

class UploadButton extends StatefulWidget {
  final VoidCallback? onViewResults;

  const UploadButton({
    Key? key,
    this.onViewResults,
  }) : super(key: key);

  @override
  _UploadButtonState createState() => _UploadButtonState();
}

class _UploadButtonState extends State<UploadButton>
    with TickerProviderStateMixin {
  final ProcessingService _processingService = ProcessingService();
  final NotificationService _notificationService = NotificationService();
  final ImagePicker _imagePicker = ImagePicker();
  
  late AnimationController _spinController;
  late Animation<double> _spinAnimation;
  
  UploadButtonState _currentState = UploadButtonState.idle;
  bool _hasUnviewedResults = false;

  @override
  void initState() {
    super.initState();
    _spinController = AnimationController(
      duration: Duration(milliseconds: 1000),
      vsync: this,
    );
    _spinAnimation = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(_spinController);
    
    _checkForUnviewedResults();
  }

  @override
  void dispose() {
    _spinController.dispose();
    super.dispose();
  }

  void _checkForUnviewedResults() {
    final dataProvider = context.read<HealthDataProvider>();
    
    // Check if there are completed documents that haven't been viewed
    final completedDocs = dataProvider.getDocumentsByStatus(ProcessingStatus.completed);
    _hasUnviewedResults = completedDocs.isNotEmpty;
    
    if (_hasUnviewedResults) {
      setState(() {
        _currentState = UploadButtonState.resultsReady;
      });
    }
  }

  Future<void> _handleButtonPress() async {
    if (_currentState == UploadButtonState.loading) return;
    
    if (_currentState == UploadButtonState.resultsReady) {
      _handleViewResults();
      return;
    }

    // Start upload process
    setState(() {
      _currentState = UploadButtonState.loading;
    });
    _spinController.repeat();

    try {
      final source = await _showFileSourceDialog();
      if (source == null) {
        _resetToIdle();
        return;
      }

      final file = await _selectFile(source);
      if (file == null) {
        _resetToIdle();
        return;
      }

      // Validate file
      final validation = await _validateFile(file.file, file.fileName);
      if (!validation.isValid) {
        _resetToIdle();
        _showValidationError(validation.errorMessage!);
        return;
      }

      // Start processing
      final dataProvider = context.read<HealthDataProvider>();
      final result = await _processingService.processDocument(
        file: file.file,
        fileName: file.fileName,
        dataProvider: dataProvider,
      );

      if (result.success) {
        _startMonitoringProcessing(result.document!.id);
      } else {
        _handleUploadError(result.message, UploadErrorType.communication);
      }
    } catch (e) {
      _handleUploadError(e.toString(), UploadErrorType.communication);
    }
  }

  Future<FileSource?> _showFileSourceDialog() async {
    return showModalBottomSheet<FileSource>(
      context: context,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => Container(
        padding: EdgeInsets.all(AppConstants.defaultPadding),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Select Document Source',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: Colors.grey[800],
              ),
            ),
            SizedBox(height: AppConstants.defaultPadding),
            _buildSourceOption(
              icon: Icons.camera_alt,
              title: 'Take Photo',
              subtitle: 'Capture lab results with camera',
              onTap: () => Navigator.pop(context, FileSource.camera),
            ),
            _buildSourceOption(
              icon: Icons.photo_library,
              title: 'Choose from Gallery',
              subtitle: 'Select existing photo',
              onTap: () => Navigator.pop(context, FileSource.gallery),
            ),
            _buildSourceOption(
              icon: Icons.description,
              title: 'Browse Files',
              subtitle: 'Select PDF or image file',
              onTap: () => Navigator.pop(context, FileSource.files),
            ),
            SizedBox(height: AppConstants.smallPadding),
          ],
        ),
      ),
    );
  }

  Widget _buildSourceOption({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return ListTile(
      leading: Container(
        padding: EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: Colors.blue[50],
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(
          icon,
          color: Colors.blue[600],
          size: 24,
        ),
      ),
      title: Text(
        title,
        style: TextStyle(
          fontWeight: FontWeight.w600,
          color: Colors.grey[800],
        ),
      ),
      subtitle: Text(
        subtitle,
        style: TextStyle(
          color: Colors.grey[600],
          fontSize: 13,
        ),
      ),
      onTap: onTap,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
      ),
    );
  }

  void _startMonitoringProcessing(String documentId) {
    final dataProvider = context.read<HealthDataProvider>();
    
    Timer.periodic(Duration(seconds: 5), (timer) async {
      try {
        await dataProvider.loadDocuments();
        final document = dataProvider.documents
            .where((doc) => doc.id == documentId)
            .firstOrNull;

        if (document == null) {
          timer.cancel();
          _resetToIdle();
          return;
        }

        if (document.processingStatus == ProcessingStatus.completed) {
          timer.cancel();
          _handleProcessingSuccess();
        } else if (document.processingStatus == ProcessingStatus.failed) {
          timer.cancel();
          _handleProcessingFailure();
        }
      } catch (e) {
        print('Error monitoring document: $e');
      }
    });
  }

  void _handleProcessingSuccess() {
    HapticFeedback.mediumImpact();
    setState(() {
      _currentState = UploadButtonState.resultsReady;
    });
    _spinController.stop();
    _notificationService.showResultsReadyNotification(
      // Will pass actual document when implemented
      SerenyaContent(
        id: 'placeholder',
        userId: 'current_user',
        contentType: ContentType.result,
        title: 'Results Ready',
        content: 'Your analysis is complete',
        confidenceScore: 0.0,
        medicalFlags: [],
        fileName: 'results',
        fileType: 'pdf',
        fileSize: 0,
        uploadDate: DateTime.now(),
        processingStatus: ProcessingStatus.completed,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      ),
    );
  }

  void _handleProcessingFailure() {
    HapticFeedback.mediumImpact();
    _resetToIdle();
    _notificationService.showProcessingErrorNotification(
      'We were unable to process your file',
    );
  }

  Future<_FileSelectionResult?> _selectFile(FileSource source) async {
    try {
      switch (source) {
        case FileSource.camera:
          return await _selectFromCamera();
        case FileSource.gallery:
          return await _selectFromGallery();
        case FileSource.files:
          return await _selectFromFiles();
      }
    } catch (e) {
      _showValidationError('Failed to select file: ${e.toString()}');
      return null;
    }
  }

  Future<_FileSelectionResult?> _selectFromCamera() async {
    final cameraStatus = await Permission.camera.request();
    if (cameraStatus != PermissionStatus.granted) {
      _showValidationError('Camera permission required to take photos');
      return null;
    }

    final XFile? image = await _imagePicker.pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
      maxWidth: 2048,
      maxHeight: 2048,
    );

    if (image == null) return null;

    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final fileName = 'health_document_$timestamp.jpg';

    return _FileSelectionResult(
      file: File(image.path),
      fileName: fileName,
    );
  }

  Future<_FileSelectionResult?> _selectFromGallery() async {
    final XFile? image = await _imagePicker.pickImage(
      source: ImageSource.gallery,
    );

    if (image == null) return null;

    final originalName = image.name;
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final extension = originalName.split('.').last;
    final fileName = 'health_document_$timestamp.$extension';

    return _FileSelectionResult(
      file: File(image.path),
      fileName: fileName,
    );
  }

  Future<_FileSelectionResult?> _selectFromFiles() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: AppConstants.supportedFileTypes,
      allowMultiple: false,
    );

    if (result == null || result.files.isEmpty) return null;

    final platformFile = result.files.first;
    if (platformFile.path == null) return null;

    return _FileSelectionResult(
      file: File(platformFile.path!),
      fileName: platformFile.name,
    );
  }

  Future<_ValidationResult> _validateFile(File file, String fileName) async {
    if (!EncryptionUtils.isValidFileType(fileName)) {
      return _ValidationResult(
        isValid: false,
        errorMessage: 'File type not supported. Please use PDF, JPG, JPEG, or PNG files.',
      );
    }

    final fileSize = await file.length();
    if (!EncryptionUtils.isValidFileSize(fileSize)) {
      final maxSizeMB = AppConstants.maxFileSizeBytes / (1024 * 1024);
      return _ValidationResult(
        isValid: false,
        errorMessage: 'File too large. Maximum size is ${maxSizeMB.toInt()}MB.',
      );
    }

    if (!await file.exists()) {
      return _ValidationResult(
        isValid: false,
        errorMessage: 'Selected file could not be accessed.',
      );
    }

    return _ValidationResult(isValid: true);
  }

  void _showValidationError(String message) {
    HapticFeedback.lightImpact();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(Icons.error, color: Colors.red[600]),
            SizedBox(width: 8),
            Expanded(child: Text(message)),
          ],
        ),
        backgroundColor: Colors.red[50],
        behavior: SnackBarBehavior.floating,
        duration: Duration(seconds: 3),
      ),
    );
  }

  void _handleUploadError(String message, UploadErrorType errorType) {
    HapticFeedback.lightImpact();
    _resetToIdle();
    
    if (errorType == UploadErrorType.communication) {
      _notificationService.showCommunicationErrorNotification();
    } else {
      _notificationService.showProcessingErrorNotification(message);
    }
  }

  void _handleViewResults() {
    setState(() {
      _currentState = UploadButtonState.idle;
      _hasUnviewedResults = false;
    });
    
    if (widget.onViewResults != null) {
      widget.onViewResults!();
    }
  }

  void _resetToIdle() {
    setState(() {
      _currentState = UploadButtonState.idle;
    });
    _spinController.stop();
    _spinController.reset();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 64,
      height: 64,
      child: FloatingActionButton(
        onPressed: _handleButtonPress,
        backgroundColor: _getButtonColor(),
        elevation: 4,
        child: AnimatedSwitcher(
          duration: AppConstants.shortAnimation,
          child: _buildButtonIcon(),
        ),
      ),
    );
  }

  Widget _buildButtonIcon() {
    switch (_currentState) {
      case UploadButtonState.idle:
        return Icon(
          Icons.upload,
          color: Colors.white,
          size: 28,
          key: ValueKey('upload'),
        );
      case UploadButtonState.loading:
        return AnimatedBuilder(
          animation: _spinAnimation,
          builder: (context, child) {
            return Transform.rotate(
              angle: _spinAnimation.value * 2 * 3.14159,
              child: Icon(
                Icons.sync,
                color: Colors.white,
                size: 28,
                key: ValueKey('loading'),
              ),
            );
          },
        );
      case UploadButtonState.resultsReady:
        return Icon(
          Icons.assignment,
          color: Colors.white,
          size: 28,
          key: ValueKey('results'),
        );
    }
  }

  Color _getButtonColor() {
    switch (_currentState) {
      case UploadButtonState.idle:
        return Colors.blue[600]!;
      case UploadButtonState.loading:
        return Colors.orange[600]!;
      case UploadButtonState.resultsReady:
        return Colors.green[600]!;
    }
  }
}

enum UploadButtonState {
  idle,
  loading,
  resultsReady,
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

class _FileSelectionResult {
  final File file;
  final String fileName;

  _FileSelectionResult({required this.file, required this.fileName});
}

class _ValidationResult {
  final bool isValid;
  final String? errorMessage;

  _ValidationResult({required this.isValid, this.errorMessage});
}