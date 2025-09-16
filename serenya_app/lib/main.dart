import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/providers/app_state_provider.dart';
import 'core/providers/health_data_provider.dart';
import 'core/theme/healthcare_theme.dart';
import 'core/navigation/app_router.dart';
import 'services/auth_service.dart';
import 'services/unified_polling_service.dart';
import 'services/pdf_cleanup_service.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> with WidgetsBindingObserver {
  final AuthService _authService = AuthService();
  final UnifiedPollingService _pollingService = UnifiedPollingService();
  final PdfCleanupService _pdfCleanupService = PdfCleanupService();
  late AppStateProvider _appStateProvider;
  late HealthDataProvider _healthDataProvider;
  
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _appStateProvider = AppStateProvider();
    _healthDataProvider = HealthDataProvider();
    _initializeApp();
  }
  
  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pollingService.dispose();
    _pdfCleanupService.dispose(); // Clean up PDF cleanup service
    super.dispose();
  }
  
  Future<void> _initializeApp() async {
    await _appStateProvider.initialize();
    
    // Initialize the unified polling service for job monitoring
    await _pollingService.initialize(_healthDataProvider);
    
    // Initialize PDF cleanup service for security hardening (CTO recommendation)
    await _pdfCleanupService.onAppStartup();
  }
  
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    
    switch (state) {
      case AppLifecycleState.resumed:
        _handleAppResumed();
        break;
      case AppLifecycleState.paused:
        _handleAppPaused();
        break;
      case AppLifecycleState.detached:
        _handleAppDetached();
        break;
      default:
        break;
    }
  }
  
  Future<void> _handleAppResumed() async {
    // Check if biometric re-authentication is required
    if (await _authService.isLoggedIn()) {
      final requiresReauth = await _authService.requiresBiometricReauth();
      if (requiresReauth) {
        // Trigger biometric re-authentication through app state
        _appStateProvider.setLoggedIn(false);
      } else {
        // Refresh authentication state silently
        final isStillLoggedIn = await _authService.isLoggedIn();
        _appStateProvider.setLoggedIn(isStillLoggedIn);
      }
    }
    
    // Trigger PDF cleanup when app resumes (CTO security hardening)
    await _pdfCleanupService.onAppResume();
  }
  
  Future<void> _handleAppPaused() async {
    // Healthcare compliance: Clear sensitive data from memory when app goes to background
    // This is handled automatically by the secure storage and biometric auth services
  }
  
  Future<void> _handleAppDetached() async {
    // App is being terminated - ensure cleanup
    await _authService.signOut();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: _appStateProvider),
        ChangeNotifierProvider.value(value: _healthDataProvider),
      ],
      child: MaterialApp.router(
        title: 'Serenya',
        theme: HealthcareTheme.lightTheme.copyWith(
          extensions: <ThemeExtension<dynamic>>[
            HealthcareThemeExtensions.confidenceTheme,
            HealthcareThemeExtensions.medicalSafetyTheme,
          ],
        ),
        routerConfig: AppRouter.router,
        debugShowCheckedModeBanner: false,
      ),
    );
  }
}

