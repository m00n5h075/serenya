import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'dart:async';
import 'package:provider/provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:sqflite_sqlcipher/sqflite.dart' as sqlcipher;
import 'package:go_router/go_router.dart';
import 'dart:io';
import 'core/providers/app_state_provider.dart';
import 'core/providers/health_data_provider.dart';
import 'core/theme/healthcare_theme.dart';
import 'core/navigation/app_router.dart';
import 'services/auth_service.dart';
import 'services/unified_polling_service.dart';
import 'services/pdf_cleanup_service.dart';
import 'api/api_client.dart';
import 'widgets/serenya_spinner.dart';

void main() async {
  // Set up error handling for the entire app
  FlutterError.onError = (FlutterErrorDetails details) {
    if (kDebugMode) {
      print('🔥 FLUTTER_ERROR: ${details.exception}');
      print('🔥 FLUTTER_ERROR_STACK: ${details.stack}');
    }
    FlutterError.presentError(details);
  };

  runZonedGuarded(
    () async {
      if (kDebugMode) {
        print('🚀 MAIN: Starting Serenya app initialization...');
      }
      
      WidgetsFlutterBinding.ensureInitialized();
      
      if (kDebugMode) {
        print('✅ MAIN: Flutter binding initialized');
      }
      
      try {
        // Initialize database factory for Android
        if (Platform.isAndroid) {
          if (kDebugMode) {
            print('📱 MAIN: Initializing Android SQLCipher database...');
          }
          // Use sqflite_sqlcipher for Android
          databaseFactory = sqlcipher.databaseFactory;
        } else {
          if (kDebugMode) {
            print('💻 MAIN: Initializing FFI database for ${Platform.operatingSystem}...');
          }
          // Use sqflite_common_ffi for other platforms
          sqfliteFfiInit();
          databaseFactory = databaseFactoryFfi;
        }
        
        if (kDebugMode) {
          print('✅ MAIN: Database factory initialized successfully');
        }
        
      } catch (e, stackTrace) {
        if (kDebugMode) {
          print('❌ MAIN: Database initialization failed: $e');
          print('❌ MAIN: Stack trace: $stackTrace');
        }
        // Continue with app initialization even if database fails
        // The app should still be able to show error screens
      }
      
      if (kDebugMode) {
        print('🚀 MAIN: Starting MyApp widget...');
      }
      
      runApp(const MyApp());
      
      if (kDebugMode) {
        print('✅ MAIN: MyApp widget started successfully');
      }
    },
    (error, stackTrace) {
      if (kDebugMode) {
        print('💥 MAIN: Unhandled error in main: $error');
        print('💥 MAIN: Stack trace: $stackTrace');
      }
      // In production, you might want to log this to a crash reporting service
    },
  );
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> with WidgetsBindingObserver {
  // CRITICAL FIX: Create single AuthService instance that will be shared
  late final AuthService _authService;
  late final ApiClient _apiClient;
  late final UnifiedPollingService _pollingService;
  late final PdfCleanupService _pdfCleanupService;
  late final AppStateProvider _appStateProvider;
  late final HealthDataProvider _healthDataProvider;
  
  // STRATEGIC FIX: Cache router to prevent recreation during authentication
  GoRouter? _cachedRouter;
  
  bool _isInitialized = false;
  String? _initializationError;
  
  @override
  void initState() {
    super.initState();
    if (kDebugMode) {
      print('🏠 MyApp: initState() called');
    }
    
    try {
      WidgetsBinding.instance.addObserver(this);
      if (kDebugMode) {
        print('✅ MyApp: Added lifecycle observer');
      }
      
      _initializeServices();
      
    } catch (e, stackTrace) {
      if (kDebugMode) {
        print('❌ MyApp: Failed to initialize in initState: $e');
        print('❌ MyApp: Stack trace: $stackTrace');
      }
      _initializationError = 'Failed to initialize app: $e';
      setState(() {});
    }
  }
  
  void _initializeServices() {
    if (kDebugMode) {
      print('🔧 MyApp: Initializing core services...');
    }
    
    try {
      // CRITICAL FIX: Create single AuthService instance
      _authService = AuthService();
      if (kDebugMode) {
        print('✅ MyApp: AuthService created');
      }
      
      // CRITICAL FIX: Initialize ApiClient with AuthService
      _apiClient = ApiClient(authService: _authService);
      if (kDebugMode) {
        print('✅ MyApp: ApiClient created with shared AuthService');
      }
      
      // CRITICAL FIX: Pass AuthService instance to AppStateProvider to avoid circular dependency
      _appStateProvider = AppStateProvider(authService: _authService);
      if (kDebugMode) {
        print('✅ MyApp: AppStateProvider created with shared AuthService');
      }
      
      _healthDataProvider = HealthDataProvider();
      if (kDebugMode) {
        print('✅ MyApp: HealthDataProvider created');
      }
      
      _pollingService = UnifiedPollingService();
      if (kDebugMode) {
        print('✅ MyApp: UnifiedPollingService created');
      }
      
      _pdfCleanupService = PdfCleanupService();
      if (kDebugMode) {
        print('✅ MyApp: PdfCleanupService created');
      }
      
      _isInitialized = true;
      
      if (kDebugMode) {
        print('✅ MyApp: All core services initialized successfully');
      }
      
      // Start app initialization after services are ready
      _initializeApp();
      
    } catch (e, stackTrace) {
      if (kDebugMode) {
        print('❌ MyApp: Service initialization failed: $e');
        print('❌ MyApp: Stack trace: $stackTrace');
      }
      _initializationError = 'Failed to initialize core services: $e';
      setState(() {});
    }
  }
  
  @override
  void dispose() {
    if (kDebugMode) {
      print('🧺 MyApp: dispose() called');
    }
    
    try {
      WidgetsBinding.instance.removeObserver(this);
      if (kDebugMode) {
        print('✅ MyApp: Removed lifecycle observer');
      }
    } catch (e) {
      if (kDebugMode) {
        print('⚠️ MyApp: Failed to remove observer: $e');
      }
    }
    
    if (_isInitialized) {
      try {
        _pollingService.dispose();
        if (kDebugMode) {
          print('✅ MyApp: UnifiedPollingService disposed');
        }
      } catch (e) {
        if (kDebugMode) {
          print('⚠️ MyApp: Failed to dispose polling service: $e');
        }
      }
      
      try {
        _pdfCleanupService.dispose();
        if (kDebugMode) {
          print('✅ MyApp: PdfCleanupService disposed');
        }
      } catch (e) {
        if (kDebugMode) {
          print('⚠️ MyApp: Failed to dispose PDF cleanup service: $e');
        }
      }
      
      try {
        _cachedRouter?.dispose();
        if (kDebugMode) {
          print('✅ MyApp: Cached router disposed');
        }
      } catch (e) {
        if (kDebugMode) {
          print('⚠️ MyApp: Failed to dispose cached router: $e');
        }
      }
    }
    
    super.dispose();
    
    if (kDebugMode) {
      print('✅ MyApp: dispose() completed');
    }
  }
  
  Future<void> _initializeApp() async {
    if (!_isInitialized) {
      if (kDebugMode) {
        print('⚠️ MyApp: Cannot initialize app - core services not ready');
      }
      return;
    }
    
    if (kDebugMode) {
      print('🚀 MyApp: Starting app initialization...');
    }
    
    try {
      // DEBUGGING: Add basic auth state debugging
      if (kDebugMode) {
        print('🔍 DEBUG: About to initialize AppStateProvider...');
      }
      
      // Start initialization in background - don't await it here
      // This allows the UI to render immediately with loading state
      _appStateProvider.initialize().catchError((error, stackTrace) {
        if (kDebugMode) {
          print('❌ MyApp: AppStateProvider initialization failed: $error');
          print('❌ MyApp: Stack trace: $stackTrace');
        }
        // Don't crash the app - let the UI handle the error state
      });
      
      if (kDebugMode) {
        print('✅ MyApp: AppStateProvider initialization started');
      }
      
      // Only initialize polling service after user is authenticated and has jobs to monitor
      // This will be called later when user logs in
      
      // Only initialize PDF cleanup service after user is authenticated
      // No PDFs to clean during onboarding flow
      
    } catch (e, stackTrace) {
      if (kDebugMode) {
        print('❌ MyApp: App initialization failed: $e');
        print('❌ MyApp: Stack trace: $stackTrace');
      }
      _initializationError = 'Failed to initialize app: $e';
      setState(() {});
    }
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
    if (kDebugMode) {
      print('🎨 MyApp: build() called - isInitialized: $_isInitialized, error: $_initializationError');
    }
    
    // Show error screen if initialization failed
    if (_initializationError != null) {
      return MaterialApp(
        title: 'Serenya',
        theme: HealthcareTheme.lightTheme.copyWith(
          extensions: <ThemeExtension<dynamic>>[
            HealthcareThemeExtensions.confidenceTheme,
            HealthcareThemeExtensions.medicalSafetyTheme,
          ],
        ),
        home: _buildErrorScreen(_initializationError!),
        debugShowCheckedModeBanner: false,
      );
    }
    
    // Show loading screen if services not initialized
    if (!_isInitialized) {
      return MaterialApp(
        title: 'Serenya',
        theme: HealthcareTheme.lightTheme.copyWith(
          extensions: <ThemeExtension<dynamic>>[
            HealthcareThemeExtensions.confidenceTheme,
            HealthcareThemeExtensions.medicalSafetyTheme,
          ],
        ),
        home: _buildLoadingScreen(message: 'Initializing services...'),
        debugShowCheckedModeBanner: false,
      );
    }
    
    return MultiProvider(
      providers: [
        // CRITICAL FIX: Provide the single AuthService instance
        Provider<AuthService>.value(value: _authService),
        // Provide the ApiClient instance with authentication
        Provider<ApiClient>.value(value: _apiClient),
        ChangeNotifierProvider.value(value: _appStateProvider),
        ChangeNotifierProvider.value(value: _healthDataProvider),
      ],
      child: Consumer<AppStateProvider>(
        builder: (context, appState, child) {
          if (kDebugMode) {
            print('🎨 MyApp: Consumer builder - isInitialized: ${appState.isInitialized}, isLoading: ${appState.isLoading}, error: ${appState.error}');
          }
          
          // Show immediate loading screen if not initialized
          if (!appState.isInitialized) {
            return MaterialApp(
              title: 'Serenya',
              theme: HealthcareTheme.lightTheme.copyWith(
                extensions: <ThemeExtension<dynamic>>[
                  HealthcareThemeExtensions.confidenceTheme,
                  HealthcareThemeExtensions.medicalSafetyTheme,
                ],
              ),
              home: _buildLoadingScreen(message: 'Loading Serenya...'),
              debugShowCheckedModeBanner: false,
            );
          }
          
          // Show main app once initialized
          if (kDebugMode) {
            print('✅ MyApp: Creating router with initialized AppStateProvider');
          }
          
          // STRATEGIC FIX: Prevent router recreation during authentication
          if (_cachedRouter == null || !appState.isAuthenticating) {
            if (kDebugMode) {
              if (appState.isAuthenticating) {
                print('🔐 MyApp: Authentication in progress - using cached router to prevent widget disposal');
              } else {
                print('✅ MyApp: Creating new router (authentication not in progress)');
                if (_cachedRouter != null) {
                  print('🔄 MyApp: Authentication completed - invalidating cached router for fresh redirects');
                }
              }
            }
            
            // Only create new router when NOT authenticating
            if (!appState.isAuthenticating) {
              _cachedRouter = AppRouter.createRouter(_appStateProvider);
            }
          }
          
          return MaterialApp.router(
            title: 'Serenya',
            theme: HealthcareTheme.lightTheme.copyWith(
              extensions: <ThemeExtension<dynamic>>[
                HealthcareThemeExtensions.confidenceTheme,
                HealthcareThemeExtensions.medicalSafetyTheme,
              ],
            ),
            routerConfig: _cachedRouter!,
            debugShowCheckedModeBanner: false,
          );
        },
      ),
    );
  }
  
  Widget _buildLoadingScreen({String message = 'Loading Serenya...'}) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const SerenyaSpinnerStatic(
              size: 40,
              color: Color(0xFF2196F3),
            ),
            const SizedBox(height: 24),
            Text(
              message,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w500,
                color: Color(0xFF2196F3),
              ),
              textAlign: TextAlign.center,
            ),
            if (kDebugMode) ...[
              const SizedBox(height: 16),
              Text(
                'Debug: Services initialized: $_isInitialized',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey[600],
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ],
        ),
      ),
    );
  }
  
  Widget _buildErrorScreen(String error) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.error_outline,
                size: 64,
                color: Colors.red,
              ),
              const SizedBox(height: 24),
              const Text(
                'Startup Error',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: Colors.red,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              Text(
                error,
                style: const TextStyle(
                  fontSize: 16,
                  color: Colors.black87,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () {
                  if (kDebugMode) {
                    print('🔄 MyApp: Retrying initialization...');
                  }
                  setState(() {
                    _initializationError = null;
                    _isInitialized = false;
                  });
                  _initializeServices();
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2196F3),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 32,
                    vertical: 12,
                  ),
                ),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

