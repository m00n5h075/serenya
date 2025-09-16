import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/providers/health_data_provider.dart';
import '../widgets/upload_button.dart';
import '../services/notification_service.dart';
import '../widgets/timeline/timeline_container.dart';
import 'results_screen.dart';
import 'settings/settings_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
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


  // Refresh functionality handled by TimelineContainer directly

  void _navigateToResults(String documentId) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => ResultsScreen(documentId: documentId),
      ),
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
            icon: const Icon(Icons.settings, color: Colors.white),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const SettingsScreen()),
              );
            },
            tooltip: 'Settings',
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
        // Upload FAB for file uploads
        floatingActionButton: const UploadButton(
          onViewResults: null, // Disabled per CTO review
        ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
      ),
    );
  }
}