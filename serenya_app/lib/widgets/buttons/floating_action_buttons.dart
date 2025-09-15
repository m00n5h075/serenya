import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../core/constants/design_tokens.dart';
import '../../core/providers/health_data_provider.dart';
import '../../api/offline/connectivity_service.dart';
import '../../models/local_database_models.dart';
import '../../services/premium_user_service.dart';
import '../../services/doctor_reports_service.dart';

/// Context-sensitive Floating Action Button system for Serenya
/// 
/// Provides different FAB configurations based on:
/// - Current screen context
/// - Connectivity status
/// - Processing state
/// - Available actions
class SerenyaFAB extends StatefulWidget {
  final FABContext context;
  final VoidCallback? onUpload;
  final VoidCallback? onViewResults;
  final VoidCallback? onRetry;
  final VoidCallback? onChat;
  final bool showLabels;

  const SerenyaFAB({
    Key? key,
    required this.context,
    this.onUpload,
    this.onViewResults,
    this.onRetry,
    this.onChat,
    this.showLabels = false,
  }) : super(key: key);

  @override
  State<SerenyaFAB> createState() => _SerenyaFABState();
}

class _SerenyaFABState extends State<SerenyaFAB>
    with TickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _scaleAnimation;
  late AnimationController _rotationController;
  
  bool _isConnected = true;
  bool _hasProcessingDocuments = false;
  bool _hasCompletedDocuments = false;
  bool _isPremiumUser = false;
  
  // Services
  final PremiumUserService _premiumService = PremiumUserService();
  final DoctorReportsService _doctorReportsService = DoctorReportsService();

  @override
  void initState() {
    super.initState();
    _setupAnimations();
    _checkConnectivity();
    _checkDocumentStatus();
    _checkPremiumStatus();
  }

  void _setupAnimations() {
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    _scaleAnimation = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(CurvedAnimation(
      parent: _animationController,
      curve: Curves.elasticOut,
    ));
    
    _rotationController = AnimationController(
      duration: const Duration(seconds: 2),
      vsync: this,
    );
    
    _animationController.forward();
  }

  Future<void> _checkConnectivity() async {
    final connectivityService = ConnectivityService();
    await connectivityService.initialize();
    
    if (mounted) {
      setState(() {
        _isConnected = connectivityService.isOnline;
      });
    }
    
    // Listen for connectivity changes
    connectivityService.connectivityStream.listen((status) {
      if (mounted) {
        setState(() {
          _isConnected = status == ConnectivityStatus.connected;
        });
      }
    });
  }

  void _checkDocumentStatus() {
    final dataProvider = context.read<HealthDataProvider>();
    final processingDocs = dataProvider.getDocumentsByStatus(ProcessingStatus.processing);
    final completedDocs = dataProvider.getDocumentsByStatus(ProcessingStatus.completed);
    
    setState(() {
      _hasProcessingDocuments = processingDocs.isNotEmpty;
      _hasCompletedDocuments = completedDocs.isNotEmpty;
    });
    
    if (_hasProcessingDocuments) {
      _rotationController.repeat();
    } else {
      _rotationController.stop();
    }
  }

  Future<void> _checkPremiumStatus() async {
    try {
      final isPremium = await _premiumService.isPremiumUser();
      if (mounted) {
        setState(() {
          _isPremiumUser = isPremium;
        });
      }
    } catch (e) {
      // Graceful degradation - assume non-premium on error
      if (mounted) {
        setState(() {
          _isPremiumUser = false;
        });
      }
    }
  }

  Future<void> _generateDoctorReport() async {
    try {
      // Provide haptic feedback
      HapticFeedback.mediumImpact();
      
      // Get health data provider
      final dataProvider = context.read<HealthDataProvider>();
      
      // Generate doctor report using the service
      final result = await _doctorReportsService.generateDoctorReport(
        dataProvider: dataProvider,
      );
      
      if (result.success) {
        // Show success feedback
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Doctor report generation started. You will be notified when it\'s ready.'),
              backgroundColor: HealthcareColors.serenyaGreenPrimary,
            ),
          );
        }
      } else {
        // Show detailed error dialog instead of simple snackbar
        await _showErrorDialog(result);
      }
    } catch (e) {
      // Handle unexpected errors with detailed dialog
      await _showGenericErrorDialog(e.toString());
    }
  }

  Future<void> _showErrorDialog(DoctorReportResult result) async {
    String title;
    String message;
    List<Widget> actions;

    switch (result.errorType) {
      case DoctorReportErrorType.premiumRequired:
        title = 'Premium Required';
        message = result.message;
        actions = [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).pop();
              _navigateToUpgrade();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: HealthcareColors.serenyaBluePrimary,
              foregroundColor: HealthcareColors.serenyaWhite,
            ),
            child: const Text('Upgrade'),
          ),
        ];
        break;
        
      case DoctorReportErrorType.insufficientHealthData:
        title = 'Insufficient Health Data';
        message = result.message;
        actions = [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).pop();
              widget.onUpload?.call();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: HealthcareColors.serenyaBluePrimary,
              foregroundColor: HealthcareColors.serenyaWhite,
            ),
            child: const Text('Upload Documents'),
          ),
        ];
        break;
        
      case DoctorReportErrorType.apiError:
        title = 'Network Error';
        message = 'Unable to connect to our servers. Please check your internet connection and try again.\\n\\nError: ${result.message}';
        actions = [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).pop();
              // Retry the doctor report generation
              Future.delayed(const Duration(milliseconds: 500), () {
                _generateDoctorReport();
              });
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: HealthcareColors.serenyaGreenPrimary,
              foregroundColor: HealthcareColors.serenyaWhite,
            ),
            child: const Text('Retry'),
          ),
        ];
        break;
        
      case DoctorReportErrorType.unexpected:
      default:
        title = 'Generation Failed';
        message = 'An unexpected error occurred while generating your doctor report. Please try again later.\\n\\nError: ${result.message}';
        actions = [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).pop();
              // Retry after a short delay
              Future.delayed(const Duration(milliseconds: 500), () {
                _generateDoctorReport();
              });
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: HealthcareColors.serenyaGreenPrimary,
              foregroundColor: HealthcareColors.serenyaWhite,
            ),
            child: const Text('Try Again'),
          ),
        ];
        break;
    }

    if (!mounted) return;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            Icon(
              _getErrorIcon(result.errorType),
              color: _getErrorColor(result.errorType),
            ),
            const SizedBox(width: 8),
            Expanded(child: Text(title)),
          ],
        ),
        content: Text(
          message,
          style: const TextStyle(fontSize: 14),
        ),
        actions: actions,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }

  IconData _getErrorIcon(DoctorReportErrorType? errorType) {
    switch (errorType) {
      case DoctorReportErrorType.premiumRequired:
        return Icons.star_border;
      case DoctorReportErrorType.insufficientHealthData:
        return Icons.data_usage;
      case DoctorReportErrorType.apiError:
        return Icons.wifi_off;
      case DoctorReportErrorType.unexpected:
      default:
        return Icons.error_outline;
    }
  }

  Color _getErrorColor(DoctorReportErrorType? errorType) {
    switch (errorType) {
      case DoctorReportErrorType.premiumRequired:
        return HealthcareColors.serenyaBluePrimary;
      case DoctorReportErrorType.insufficientHealthData:
        return HealthcareColors.cautionOrange;
      case DoctorReportErrorType.apiError:
        return HealthcareColors.textSecondary;
      case DoctorReportErrorType.unexpected:
      default:
        return HealthcareColors.emergencyRed;
    }
  }

  Future<void> _showGenericErrorDialog(String error) async {
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Error'),
        content: Text('An unexpected error occurred: $error'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  void _navigateToUpgrade() {
    // TODO: Navigate to upgrade screen
    // This should open the subscription/billing screen
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Navigate to upgrade screen - Not implemented yet'),
      ),
    );
  }

  @override
  void dispose() {
    _animationController.dispose();
    _rotationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<HealthDataProvider>(
      builder: (context, dataProvider, child) {
        _checkDocumentStatus(); // Update status when data changes
        
        return ScaleTransition(
          scale: _scaleAnimation,
          child: _buildFABForContext(),
        );
      },
    );
  }

  Widget _buildFABForContext() {
    switch (widget.context) {
      case FABContext.home:
        return _buildHomeFAB();
      case FABContext.timeline:
        return _buildTimelineFAB();
      case FABContext.results:
        return _buildResultsFAB();
      case FABContext.upload:
        return _buildUploadFAB();
      case FABContext.chat:
        return _buildChatFAB();
    }
  }

  Widget _buildHomeFAB() {
    if (!_isConnected) {
      return _buildDisconnectedFAB();
    }
    
    if (_hasCompletedDocuments) {
      return _buildResultsReadyFAB();
    }
    
    if (_hasProcessingDocuments) {
      return _buildProcessingFAB();
    }
    
    return _buildUploadFAB();
  }

  Widget _buildTimelineFAB() {
    if (!_isConnected) {
      return _buildDisconnectedFAB();
    }
    
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.showLabels) ...[
          _buildExpandedFABs(),
        ] else ...[
          FloatingActionButton(
            onPressed: widget.onUpload,
            backgroundColor: HealthcareColors.serenyaBluePrimary,
            heroTag: "timeline_upload",
            child: const Icon(
              Icons.add,
              color: HealthcareColors.serenyaWhite,
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildExpandedFABs() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (_hasCompletedDocuments)
          _buildMiniActionFAB(
            icon: Icons.assignment,
            label: 'View Results',
            onPressed: widget.onViewResults,
            backgroundColor: HealthcareColors.serenyaGreenPrimary,
            heroTag: "view_results",
          ),
        const SizedBox(height: HealthcareSpacing.sm),
        if (widget.onChat != null)
          _buildMiniActionFAB(
            icon: Icons.chat_bubble_outline,
            label: 'Ask AI',
            onPressed: widget.onChat,
            backgroundColor: HealthcareColors.serenyaBlueAccent,
            heroTag: "chat_ai",
          ),
        if (widget.onChat != null) const SizedBox(height: HealthcareSpacing.sm),
        if (_isPremiumUser)
          _buildMiniActionFAB(
            icon: Icons.medical_services,
            label: 'Generate Doctor Report',
            onPressed: _generateDoctorReport,
            backgroundColor: HealthcareColors.cautionOrange,
            heroTag: "doctor_report",
          ),
        if (_isPremiumUser) const SizedBox(height: HealthcareSpacing.sm),
        _buildMainActionFAB(
          icon: Icons.add,
          label: 'Upload Document',
          onPressed: widget.onUpload,
          backgroundColor: HealthcareColors.serenyaBluePrimary,
        ),
      ],
    );
  }

  Widget _buildResultsFAB() {
    if (!_isConnected) {
      return _buildDisconnectedFAB();
    }
    
    return FloatingActionButton.extended(
      onPressed: widget.onUpload,
      backgroundColor: HealthcareColors.serenyaBluePrimary,
      icon: const Icon(
        Icons.add,
        color: HealthcareColors.serenyaWhite,
      ),
      label: const Text(
        'Upload New',
        style: TextStyle(
          color: HealthcareColors.serenyaWhite,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _buildUploadFAB() {
    if (!_isConnected) {
      return _buildDisconnectedFAB();
    }
    
    return FloatingActionButton(
      onPressed: widget.onUpload,
      backgroundColor: HealthcareColors.serenyaBluePrimary,
      heroTag: "upload_main",
      child: const Icon(
        Icons.upload,
        color: HealthcareColors.serenyaWhite,
      ),
    );
  }

  Widget _buildChatFAB() {
    if (!_isConnected) {
      return _buildDisconnectedFAB();
    }
    
    return FloatingActionButton(
      onPressed: widget.onChat,
      backgroundColor: HealthcareColors.serenyaBlueAccent,
      heroTag: "chat_main",
      child: const Icon(
        Icons.send,
        color: HealthcareColors.serenyaWhite,
      ),
    );
  }

  Widget _buildResultsReadyFAB() {
    return FloatingActionButton(
      onPressed: () {
        HapticFeedback.lightImpact();
        widget.onViewResults?.call();
      },
      backgroundColor: HealthcareColors.serenyaGreenPrimary,
      heroTag: "results_ready",
      child: Stack(
        children: [
          const Icon(
            Icons.assignment,
            color: HealthcareColors.serenyaWhite,
          ),
          Positioned(
            right: 0,
            top: 0,
            child: Container(
              width: 8,
              height: 8,
              decoration: const BoxDecoration(
                color: HealthcareColors.emergencyRed,
                shape: BoxShape.circle,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProcessingFAB() {
    return FloatingActionButton(
      onPressed: null, // Disabled during processing
      backgroundColor: HealthcareColors.cautionOrange,
      heroTag: "processing",
      child: AnimatedBuilder(
        animation: _rotationController,
        builder: (context, child) {
          return Transform.rotate(
            angle: _rotationController.value * 2 * 3.14159,
            child: const Icon(
              Icons.sync,
              color: HealthcareColors.serenyaWhite,
            ),
          );
        },
      ),
    );
  }

  Widget _buildDisconnectedFAB() {
    return FloatingActionButton(
      onPressed: () {
        HapticFeedback.lightImpact();
        _showConnectivityMessage();
      },
      backgroundColor: HealthcareColors.textDisabled,
      heroTag: "disconnected",
      child: const Icon(
        Icons.wifi_off,
        color: HealthcareColors.serenyaWhite,
      ),
    );
  }

  Widget _buildMainActionFAB({
    required IconData icon,
    required String label,
    required VoidCallback? onPressed,
    required Color backgroundColor,
  }) {
    return FloatingActionButton.extended(
      onPressed: onPressed,
      backgroundColor: backgroundColor,
      icon: Icon(
        icon,
        color: HealthcareColors.serenyaWhite,
      ),
      label: Text(
        label,
        style: const TextStyle(
          color: HealthcareColors.serenyaWhite,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _buildMiniActionFAB({
    required IconData icon,
    required String label,
    required VoidCallback? onPressed,
    required Color backgroundColor,
    required String heroTag,
  }) {
    return FloatingActionButton.small(
      onPressed: onPressed,
      backgroundColor: backgroundColor,
      heroTag: heroTag,
      tooltip: label,
      child: Icon(
        icon,
        color: HealthcareColors.serenyaWhite,
        size: 20,
      ),
    );
  }

  void _showConnectivityMessage() {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Row(
          children: [
            Icon(
              Icons.wifi_off,
              color: HealthcareColors.serenyaWhite,
              size: 20,
            ),
            SizedBox(width: HealthcareSpacing.sm),
            Expanded(
              child: Text(
                'No internet connection. Upload will be available when connected.',
                style: TextStyle(color: HealthcareColors.serenyaWhite),
              ),
            ),
          ],
        ),
        backgroundColor: HealthcareColors.textSecondary,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 3),
        action: SnackBarAction(
          label: 'Retry',
          textColor: HealthcareColors.serenyaBlueAccent,
          onPressed: _checkConnectivity,
        ),
      ),
    );
  }
}

/// FAB context determines which actions are available
enum FABContext {
  home,      // Home screen - primary upload action
  timeline,  // Timeline view - upload + view results
  results,   // Results view - upload new document
  upload,    // Upload screen - confirm upload action
  chat,      // Chat screen - send message action
}

/// Extended FAB controller for managing multiple FAB states
class FABController extends ChangeNotifier {
  FABContext _currentContext = FABContext.home;
  bool _isExpanded = false;
  bool _isVisible = true;

  FABContext get currentContext => _currentContext;
  bool get isExpanded => _isExpanded;
  bool get isVisible => _isVisible;

  void setContext(FABContext context) {
    if (_currentContext != context) {
      _currentContext = context;
      _isExpanded = false; // Reset expansion when context changes
      notifyListeners();
    }
  }

  void toggleExpansion() {
    _isExpanded = !_isExpanded;
    notifyListeners();
  }

  void show() {
    if (!_isVisible) {
      _isVisible = true;
      notifyListeners();
    }
  }

  void hide() {
    if (_isVisible) {
      _isVisible = false;
      notifyListeners();
    }
  }

  void collapse() {
    if (_isExpanded) {
      _isExpanded = false;
      notifyListeners();
    }
  }
}