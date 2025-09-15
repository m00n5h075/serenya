import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/providers/app_state_provider.dart';
import '../core/providers/health_data_provider.dart';
import '../widgets/upload_button.dart';
import '../widgets/buttons/premium_fab.dart';
import '../widgets/dialogs/upload_dialog.dart';
import '../services/notification_service.dart';
import '../widgets/timeline/timeline_container.dart';
import 'login_screen.dart';
import 'results_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  _HomeScreenState createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final GlobalKey<ScaffoldMessengerState> _scaffoldKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // Set up notification service with scaffold key
      final notificationService = NotificationService();
      notificationService.setScaffoldMessengerKey(_scaffoldKey);
      
      // Load existing documents
      context.read<HealthDataProvider>().loadDocuments();
    });
  }

  Future<void> _handleSignOut() async {
    final appState = context.read<AppStateProvider>();
    await appState.logout();
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (context) => const LoginScreen()),
    );
  }

  // Refresh functionality handled by TimelineContainer directly

  void _navigateToResults(String documentId) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => ResultsScreen(documentId: documentId),
      ),
    );
  }

  void _handleUpload() {
    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => const UploadDialog(),
    );
  }

  // Document sorting handled by TimelineContainer provider

  @override
  Widget build(BuildContext context) {
    return ScaffoldMessenger(
      key: _scaffoldKey,
      child: Scaffold(
        backgroundColor: const Color(0xFFF8F9FA), // Timeline background
        appBar: AppBar(
        title: const Text(
          'Serenya',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        backgroundColor: Colors.blue[600],
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.white),
            onPressed: _handleSignOut,
            tooltip: 'Sign Out',
          ),
        ],
      ),
        body: Consumer<HealthDataProvider>(
          builder: (context, provider, child) {
            // TimelineContainer handles document sorting internally
            
            return TimelineContainer(
              provider: provider,
              onDocumentTap: (doc) => _navigateToResults(doc.id),
            );
          },
        ),
        // Premium FAB with expansion menu for premium users
        floatingActionButton: PremiumFAB(
          onUpload: _handleUpload,
          onViewResults: null, // Disabled per CTO review
        ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
      ),
    );
  }
}