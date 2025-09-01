# Encryption Strategy - Serenya AI Health Agent

**Date:** September 1, 2025  
**Domain:** Security Implementation & Key Management  
**AI Agent:** Security Implementation Agent  
**Dependencies:**
- **← database-architecture.md**: Table schemas and encryption classification requirements
- **← ui-specifications.md**: Biometric authentication UI integration points
**Cross-References:**
- **→ audit-logging.md**: Security event logging and key access tracking
- **→ mobile-architecture.md**: Platform-specific security implementation (iOS Keychain, Android Keystore)
- **→ system-architecture.md**: AWS KMS integration and server-side encryption

---

## 🎯 **Encryption Architecture Overview**

### **Strategic Approach: Hybrid Encryption Model**

**Decision Rationale**: Different encryption approaches based on table usage patterns and performance requirements to optimize both security and user experience.

**Core Architecture**:
```
┌─────────────────────────────────────────────────────────────┐
│                    HYBRID ENCRYPTION STRATEGY              │
├─────────────────────────────────────────────────────────────┤
│  🔒 FULL TABLE ENCRYPTION     │  🔐 FIELD-LEVEL ENCRYPTION │
│  • Low query frequency        │  • High query frequency    │
│  • Bulk data access          │  • Mixed sensitivity data   │
│  • Maximum security          │  • Performance critical     │
│                              │                             │
│  ✅ payments                  │  ✅ users                   │
│  ✅ lab_results               │  ✅ subscriptions           │
│  ✅ vitals                    │  ✅ serenya_content         │
│                              │  ✅ chat_messages           │
└─────────────────────────────────────────────────────────────┘
```

### **Security Compliance Framework**
- **HIPAA Technical Safeguards**: §164.312(a)(2)(iv) - Encryption and decryption procedures
- **GDPR Article 32**: Technical and organizational security measures  
- **PCI DSS Requirement 3**: Protect stored cardholder data with strong cryptography
- **Mobile Security**: iOS/Android platform-standard key protection mechanisms

---

## 🔐 **Key Management Architecture**

### **Multi-Layered Key Hierarchy**

**Agent Handoff Context**: Key derivation flow connects to **→ ui-specifications.md** biometric authentication prompts and **→ audit-logging.md** key access events.

```
┌─────────────────────────────────────────────────────────────┐
│                    KEY HIERARCHY LAYERS                     │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: DEVICE ROOT KEY (Master)                         │
│  ├── Source: Hardware Security Module (iOS/Android)        │
│  ├── Protection: Biometric + Device Passcode               │
│  ├── Backup: Never backed up (lost device = lost data)    │
│  └── Purpose: Root for all other key derivation            │
│                                                             │
│  Layer 2: TABLE-SPECIFIC KEYS                              │
│  ├── Derivation: HKDF(device_root_key, table_context)     │
│  ├── medical_data_key = HKDF(root, "serenya_medical_v1")  │
│  ├── chat_messages_key = HKDF(root, "serenya_chat_v1")    │
│  └── Purpose: Table-level encryption boundaries            │
│                                                             │
│  Layer 3: FIELD-SPECIFIC KEYS (Optional)                   │
│  ├── Derivation: HKDF(table_key, field_context)           │
│  ├── lab_values_key = HKDF(medical_key, "lab_values_v1")  │
│  └── Purpose: Granular field-level encryption              │
└─────────────────────────────────────────────────────────────┘
```

### **Device Root Key Implementation**

**Platform-Specific Security**:
```dart
class SerenyaKeyManager {
    // iOS: Secure Enclave + Keychain Services
    // Android: Hardware Security Module + Keystore
    
    static Future<void> initializeDeviceRootKey() async {
        if (!await _deviceRootKeyExists()) {
            final rootKey = await _generateDeviceRootKey();
            await _storeInSecureHardware(rootKey);
            await _deriveTableSpecificKeys(rootKey);
        }
    }
    
    static Future<Uint8List> _generateDeviceRootKey() async {
        // Use platform-specific entropy sources
        final random = Random.secure();
        final keyMaterial = Uint8List(32); // 256-bit key
        
        for (int i = 0; i < keyMaterial.length; i++) {
            keyMaterial[i] = random.nextInt(256);
        }
        
        // Additional entropy from device-specific sources
        final deviceEntropy = await _getDeviceEntropy();
        return _combineEntropySources(keyMaterial, deviceEntropy);
    }
    
    static Future<void> _storeInSecureHardware(Uint8List rootKey) async {
        const String keyAlias = "serenya_device_root_key_v1";
        
        if (Platform.isIOS) {
            // iOS Keychain with Secure Enclave protection
            await _iOSKeychainStore(keyAlias, rootKey, {
                'kSecAttrAccessible': 'kSecAttrAccessibleWhenUnlockedThisDeviceOnly',
                'kSecAttrAccessControl': 'kSecAccessControlBiometryAny',
                'kSecAttrIsPermanent': true,
            });
        } else if (Platform.isAndroid) {
            // Android Keystore with Hardware Security Module
            await _androidKeystoreStore(keyAlias, rootKey, {
                'requireAuthentication': true,
                'authenticationType': 'BIOMETRIC_STRONG',
                'invalidatedByBiometricEnrollment': true,
                'keyValidityForOriginationEnd': -1, // No expiration
            });
        }
    }
}
```

### **Biometric Authentication Integration**

**Agent Handoff**: UI flow connects to **→ ui-specifications.md** biometric prompts and session management

```dart
class BiometricKeyAccess {
    static Future<Uint8List> getDeviceRootKeyWithBiometric() async {
        const String keyAlias = "serenya_device_root_key_v1";
        
        // Trigger biometric authentication UI
        final BiometricAuthResult authResult = await _promptBiometricAuth();
        
        if (!authResult.success) {
            // Log failed attempt for audit trail
            await AuditLogger.logSecurityEvent(
                'key_access_failed',
                reason: authResult.failureReason
            );
            throw BiometricAuthenticationException(authResult.failureReason);
        }
        
        try {
            final rootKey = await _retrieveFromSecureHardware(keyAlias);
            
            // Log successful key access
            await AuditLogger.logSecurityEvent(
                'key_access_success',
                keyContext: 'device_root_key',
                authMethod: authResult.authMethod
            );
            
            return rootKey;
        } catch (e) {
            await AuditLogger.logSecurityEvent(
                'key_retrieval_failed',
                error: e.toString()
            );
            rethrow;
        }
    }
    
    static Future<BiometricAuthResult> _promptBiometricAuth() async {
        final LocalAuthentication localAuth = LocalAuthentication();
        
        // Check available biometric types
        final List<BiometricType> availableBiometrics = 
            await localAuth.getAvailableBiometrics();
            
        if (availableBiometrics.isEmpty) {
            // Fall back to device passcode
            return await _promptPasscodeAuth();
        }
        
        // Show biometric prompt with custom UI messaging
        final bool didAuthenticate = await localAuth.authenticate(
            localizedReason: 'Access your medical data securely',
            options: AuthenticationOptions(
                biometricOnly: false, // Allow passcode fallback
                stickyAuth: true,     // Require auth for each access
            ),
        );
        
        return BiometricAuthResult(
            success: didAuthenticate,
            authMethod: _getAuthMethodFromBiometrics(availableBiometrics),
        );
    }
}
```

### **Table-Specific Key Derivation**

**Database Integration**: Key derivation maps to table classifications from **→ database-architecture.md**

```dart
class TableKeyManager {
    static final Map<String, String> _tableContexts = {
        // Server-side tables
        'users': 'serenya_users_v1',
        'subscriptions': 'serenya_subscriptions_v1', 
        'payments': 'serenya_payments_v1',
        
        // Local device tables
        'serenya_content': 'serenya_content_v1',
        'lab_results': 'serenya_medical_data_v1',
        'vitals': 'serenya_medical_data_v1',     // Shared medical context
        'chat_messages': 'serenya_chat_v1',
    };
    
    static Future<Uint8List> deriveTableKey(
        String tableName, 
        Uint8List deviceRootKey
    ) async {
        final String context = _tableContexts[tableName] ?? 
            throw UnsupportedError('Unknown table: $tableName');
            
        // HKDF key derivation (RFC 5869)
        final hkdf = Hkdf(
            hmac: Hmac(sha256),
            inputKeyMaterial: deviceRootKey,
        );
        
        return hkdf.deriveKey(
            length: 32, // 256-bit derived key
            info: utf8.encode(context),
            salt: utf8.encode('serenya_key_derivation_salt_v1'),
        );
    }
    
    static Future<Uint8List> getTableKeyForEncryption(String tableName) async {
        // This triggers biometric authentication if needed
        final deviceRootKey = await BiometricKeyAccess.getDeviceRootKeyWithBiometric();
        
        return await deriveTableKey(tableName, deviceRootKey);
    }
}
```

---

## 🔒 **Table-Level Encryption Implementation**

### **Full Table Encryption (SQLCipher)**

**Applied Tables**: `payments`, `lab_results`, `vitals` per **→ database-architecture.md** classifications

```dart
class FullTableEncryption {
    static Future<Database> openEncryptedDatabase(
        String databasePath, 
        String tableName
    ) async {
        // Get table-specific encryption key
        final tableKey = await TableKeyManager.getTableKeyForEncryption(tableName);
        final hexKey = _bytesToHex(tableKey);
        
        return await openDatabase(
            databasePath,
            version: 1,
            onCreate: _createEncryptedTables,
            onOpen: (db) async {
                // Set SQLCipher encryption key
                await db.execute("PRAGMA key = 'x\"$hexKey\"'");
                
                // Configure SQLCipher security settings
                await db.execute("PRAGMA cipher_page_size = 4096");
                await db.execute("PRAGMA kdf_iter = 256000"); // PBKDF2 iterations
                await db.execute("PRAGMA cipher_hmac_algorithm = HMAC_SHA512");
                await db.execute("PRAGMA cipher_kdf_algorithm = PBKDF2_HMAC_SHA512");
                
                // Verify encryption is working
                await _verifyEncryption(db);
            },
        );
    }
    
    // Lab Results Implementation Example
    static Future<void> insertLabResult(Database db, LabResult result) async {
        // Data is automatically encrypted at rest by SQLCipher
        await db.insert('lab_results', result.toJson());
        
        // Log data access for audit trail
        await AuditLogger.logDataAccess(
            'lab_result_created',
            resourceId: result.id,
            tableName: 'lab_results'
        );
    }
    
    static Future<List<LabResult>> queryLabResults(
        Database db, 
        String userId
    ) async {
        // Data is automatically decrypted by SQLCipher during query
        final List<Map<String, dynamic>> results = await db.query(
            'lab_results',
            where: 'user_id = ?',
            whereArgs: [userId],
            orderBy: 'created_at DESC'
        );
        
        await AuditLogger.logDataAccess(
            'lab_results_queried',
            resourceCount: results.length,
            userId: userId
        );
        
        return results.map((json) => LabResult.fromJson(json)).toList();
    }
}
```

### **Field-Level Encryption (AES-256-GCM)**

**Applied Tables**: `users`, `subscriptions`, `serenya_content`, `chat_messages`

```dart
class FieldLevelEncryption {
    // AES-256-GCM for authenticated encryption
    static Future<String> encryptField(String plaintext, String tableName) async {
        final tableKey = await TableKeyManager.getTableKeyForEncryption(tableName);
        
        // Generate random IV for each encryption operation
        final iv = _generateRandomIV(); // 12 bytes for GCM
        
        final cipher = AESGCMCipher();
        cipher.init(true, AEADParameters(
            KeyParameter(tableKey),
            128, // 128-bit authentication tag
            iv,
            null // No additional authenticated data
        ));
        
        final plaintextBytes = utf8.encode(plaintext);
        final ciphertext = cipher.process(plaintextBytes);
        
        // Combine IV + ciphertext + auth tag for storage
        final combined = Uint8List.fromList([
            ...iv,
            ...ciphertext,
        ]);
        
        return base64.encode(combined);
    }
    
    static Future<String> decryptField(String encryptedData, String tableName) async {
        final tableKey = await TableKeyManager.getTableKeyForEncryption(tableName);
        final combined = base64.decode(encryptedData);
        
        // Extract IV, ciphertext, and auth tag
        final iv = combined.sublist(0, 12);
        final ciphertext = combined.sublist(12);
        
        final cipher = AESGCMCipher();
        cipher.init(false, AEADParameters(
            KeyParameter(tableKey),
            128,
            iv,
            null
        ));
        
        try {
            final decrypted = cipher.process(ciphertext);
            return utf8.decode(decrypted);
        } catch (e) {
            // Log decryption failure for security monitoring
            await AuditLogger.logSecurityEvent(
                'field_decryption_failed',
                tableName: tableName,
                error: e.toString()
            );
            rethrow;
        }
    }
}
```

### **Database Model Integration**

**Example: Serenya Content with Field-Level Encryption**

```dart
class SerenyaContent {
    final String id;
    final String userId;
    final String contentType;
    final String title;
    final String content;        // ENCRYPTED FIELD
    final double confidenceScore;
    final List<String> medicalFlags; // ENCRYPTED FIELD
    final DateTime createdAt;
    
    // Encryption integration in model
    static Future<SerenyaContent> fromDatabaseJson(Map<String, dynamic> json) async {
        return SerenyaContent(
            id: json['id'],
            userId: json['user_id'],
            contentType: json['content_type'],
            title: json['title'],
            content: await FieldLevelEncryption.decryptField(
                json['content'], 
                'serenya_content'
            ),
            confidenceScore: json['confidence_score'],
            medicalFlags: json['medical_flags'] != null 
                ? (jsonDecode(await FieldLevelEncryption.decryptField(
                    json['medical_flags'], 
                    'serenya_content'
                  )) as List).cast<String>()
                : [],
            createdAt: DateTime.parse(json['created_at']),
        );
    }
    
    Future<Map<String, dynamic>> toDatabaseJson() async {
        return {
            'id': id,
            'user_id': userId,
            'content_type': contentType,
            'title': title,
            'content': await FieldLevelEncryption.encryptField(content, 'serenya_content'),
            'confidence_score': confidenceScore,
            'medical_flags': medicalFlags.isNotEmpty 
                ? await FieldLevelEncryption.encryptField(
                    jsonEncode(medicalFlags), 
                    'serenya_content'
                  )
                : null,
            'created_at': createdAt.toIso8601String(),
        };
    }
}
```

---

## 🛡️ **Session-Based Biometric Authentication**

### **Session Management Strategy**

**Agent Handoff**: Session states integrate with **→ ui-specifications.md** navigation and authentication flows

```dart
class SessionManager {
    static const Duration inactivityTimeout = Duration(minutes: 15);
    static DateTime _lastActivity = DateTime.now();
    static String? _currentSessionId;
    static bool _isAuthenticated = false;
    
    // Session lifecycle management
    static Future<bool> initializeSession() async {
        try {
            // Trigger biometric authentication
            final authSuccess = await BiometricKeyAccess.promptBiometricAuth();
            
            if (authSuccess) {
                _currentSessionId = _generateSessionId();
                _isAuthenticated = true;
                _lastActivity = DateTime.now();
                
                // Log session start
                await AuditLogger.logAuthenticationEvent(
                    'session_started',
                    sessionId: _currentSessionId!
                );
                
                return true;
            }
            return false;
        } catch (e) {
            await AuditLogger.logAuthenticationEvent(
                'session_start_failed',
                error: e.toString()
            );
            return false;
        }
    }
    
    static void updateActivity() {
        if (_isAuthenticated) {
            _lastActivity = DateTime.now();
        }
    }
    
    static bool isSessionValid() {
        if (!_isAuthenticated) return false;
        
        final timeSinceActivity = DateTime.now().difference(_lastActivity);
        return timeSinceActivity <= inactivityTimeout;
    }
    
    static Future<void> expireSession() async {
        if (_currentSessionId != null) {
            await AuditLogger.logAuthenticationEvent(
                'session_expired',
                sessionId: _currentSessionId!
            );
        }
        
        _isAuthenticated = false;
        _currentSessionId = null;
        
        // Clear any cached keys from memory
        await TableKeyManager.clearCachedKeys();
    }
}
```

### **Critical Operation Authentication**

**Bypass Session**: Some operations require fresh biometric authentication

```dart
class CriticalOperationAuth {
    // Operations that always require fresh biometric auth
    static const List<String> criticalOperations = [
        'access_encryption_keys',
        'modify_security_settings', 
        'upgrade_premium',
        'delete_account',
        'export_data',
    ];
    
    static Future<bool> authenticateForCriticalOperation(String operation) async {
        if (!criticalOperations.contains(operation)) {
            // Regular operations use session authentication
            return SessionManager.isSessionValid();
        }
        
        // Critical operations require fresh biometric auth (bypass session)
        try {
            final authResult = await BiometricKeyAccess.promptBiometricAuth();
            
            await AuditLogger.logAuthenticationEvent(
                'critical_operation_auth',
                operation: operation,
                success: authResult,
            );
            
            return authResult;
        } catch (e) {
            await AuditLogger.logSecurityEvent(
                'critical_operation_auth_failed',
                operation: operation,
                error: e.toString()
            );
            return false;
        }
    }
}
```

---

## 🔄 **Key Rotation & Recovery**

### **Automatic Key Rotation Triggers**

```dart
class KeyRotationManager {
    static Future<void> checkAndRotateKeys() async {
        final rotationTriggers = await _evaluateRotationTriggers();
        
        if (rotationTriggers.shouldRotate) {
            await _performKeyRotation(rotationTriggers.reason);
        }
    }
    
    static Future<RotationTriggers> _evaluateRotationTriggers() async {
        // 1. Biometric enrollment changes
        final biometricChanged = await _detectBiometricChanges();
        if (biometricChanged) {
            return RotationTriggers(
                shouldRotate: true,
                reason: 'biometric_enrollment_changed'
            );
        }
        
        // 2. App major version update
        final appVersionChanged = await _detectAppVersionChange();
        if (appVersionChanged && _isMajorVersionChange()) {
            return RotationTriggers(
                shouldRotate: true,
                reason: 'app_major_version_update'
            );
        }
        
        // 3. Security incident (external trigger)
        final securityIncident = await _checkSecurityIncidentFlag();
        if (securityIncident) {
            return RotationTriggers(
                shouldRotate: true,
                reason: 'security_incident_response'
            );
        }
        
        return RotationTriggers(shouldRotate: false);
    }
    
    static Future<void> _performKeyRotation(String reason) async {
        await AuditLogger.logSecurityEvent(
            'key_rotation_started',
            reason: reason
        );
        
        try {
            // 1. Generate new device root key
            final newRootKey = await SerenyaKeyManager._generateDeviceRootKey();
            
            // 2. Decrypt all data with old keys
            final encryptedData = await _gatherAllEncryptedData();
            
            // 3. Re-encrypt with new keys
            await _reencryptAllData(encryptedData, newRootKey);
            
            // 4. Update key derivation version
            await _updateKeyVersion();
            
            // 5. Secure deletion of old keys
            await _secureDeleteOldKeys();
            
            await AuditLogger.logSecurityEvent(
                'key_rotation_completed',
                reason: reason
            );
        } catch (e) {
            await AuditLogger.logSecurityEvent(
                'key_rotation_failed',
                reason: reason,
                error: e.toString()
            );
            
            // Rollback procedures
            await _rollbackKeyRotation();
            rethrow;
        }
    }
}
```

### **Device Loss & Recovery Scenarios**

**No Recovery by Design**: Intentional data loss for maximum security

```dart
class DeviceLossScenarios {
    // Device Loss: No recovery possible
    static Future<void> handleDeviceLoss() async {
        // This scenario is handled automatically:
        // 1. Device root key is hardware-bound and not backed up
        // 2. Local encrypted data becomes permanently inaccessible
        // 3. User must re-authenticate and start fresh on new device
        // 4. Server data remains accessible after re-authentication
        
        // No code needed - handled by platform security automatically
    }
    
    // Biometric Changes: Automatic re-key
    static Future<void> handleBiometricEnrollmentChange() async {
        try {
            // Platform automatically invalidates hardware-protected keys
            // when biometric enrollment changes
            
            // Re-initialize keys with new biometric enrollment
            await SerenyaKeyManager.initializeDeviceRootKey();
            
            await AuditLogger.logSecurityEvent(
                'biometric_change_rekey',
                success: true
            );
        } catch (e) {
            await AuditLogger.logSecurityEvent(
                'biometric_change_rekey_failed',
                error: e.toString()
            );
            
            // User must re-authenticate and start fresh
            await _clearAllLocalData();
            rethrow;
        }
    }
    
    // App Uninstall/Reinstall: Complete data loss
    static Future<void> handleAppUninstall() async {
        // Platform automatically deletes app sandbox and keychain items
        // No recovery possible - user starts fresh
        // Server data remains accessible after re-authentication
    }
}
```

---

## 🖥️ **Server-Side Encryption (AWS KMS)**

### **AWS KMS Key Hierarchy**

**Agent Handoff**: Server architecture details in **→ system-architecture.md**

```typescript
// AWS KMS Customer Managed Keys
const KMSKeyConfiguration = {
    // Per-user data encryption key
    userDataKey: {
        keyId: 'arn:aws:kms:region:account:key/user-data-key-uuid',
        description: 'User PII encryption (email, name, profile data)',
        keyUsage: 'ENCRYPT_DECRYPT',
        keyRotation: 'ANNUAL_AUTOMATIC',
        keyPolicy: 'user-data-encryption-policy'
    },
    
    // Payment data encryption key (PCI DSS compliance)
    paymentDataKey: {
        keyId: 'arn:aws:kms:region:account:key/payment-data-key-uuid', 
        description: 'Payment transaction data encryption (PCI DSS)',
        keyUsage: 'ENCRYPT_DECRYPT',
        keyRotation: 'ANNUAL_AUTOMATIC',
        keyPolicy: 'pci-compliance-encryption-policy'
    },
    
    // Audit log encryption key
    auditLogKey: {
        keyId: 'arn:aws:kms:region:account:key/audit-log-key-uuid',
        description: 'Audit event log encryption (tamper protection)', 
        keyUsage: 'ENCRYPT_DECRYPT',
        keyRotation: 'ANNUAL_AUTOMATIC',
        keyPolicy: 'audit-log-encryption-policy'
    }
};
```

### **Server-Side Field Encryption Implementation**

```typescript
import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';

class ServerSideEncryption {
    private kmsClient: KMSClient;
    
    constructor() {
        this.kmsClient = new KMSClient({ region: process.env.AWS_REGION });
    }
    
    // Encrypt PII fields before database storage
    async encryptUserPII(plaintext: string): Promise<string> {
        try {
            const command = new EncryptCommand({
                KeyId: KMSKeyConfiguration.userDataKey.keyId,
                Plaintext: Buffer.from(plaintext, 'utf-8'),
                EncryptionContext: {
                    purpose: 'user_pii_encryption',
                    version: 'v1'
                }
            });
            
            const result = await this.kmsClient.send(command);
            return Buffer.from(result.CiphertextBlob!).toString('base64');
        } catch (error) {
            await auditLogger.logSecurityEvent('server_encryption_failed', {
                keyId: KMSKeyConfiguration.userDataKey.keyId,
                error: error.message
            });
            throw new EncryptionError('Failed to encrypt user PII', error);
        }
    }
    
    // Decrypt PII fields for API responses
    async decryptUserPII(ciphertext: string): Promise<string> {
        try {
            const command = new DecryptCommand({
                CiphertextBlob: Buffer.from(ciphertext, 'base64'),
                EncryptionContext: {
                    purpose: 'user_pii_encryption',
                    version: 'v1'
                }
            });
            
            const result = await this.kmsClient.send(command);
            return Buffer.from(result.Plaintext!).toString('utf-8');
        } catch (error) {
            await auditLogger.logSecurityEvent('server_decryption_failed', {
                error: error.message
            });
            throw new DecryptionError('Failed to decrypt user PII', error);
        }
    }
}
```

---

## 🌐 **Client-Server Communication Encryption (Application-Layer)**

### **Network Encryption Strategy**

**Agent Handoff Context**: Network encryption integrates with **→ api-contracts.md** endpoint specifications and **→ mobile-architecture.md** HTTP client implementation.

**Design Philosophy**: 
- **Selective Encryption**: Only medical data encrypted, metadata remains clear for routing
- **Performance Optimized**: Targeted encryption to minimize latency impact
- **Backwards Compatible**: Fallback to TLS-only when application-layer encryption fails
- **User-Centric**: Leverage existing biometric authentication and table keys

```
┌─────────────────────────────────────────────────────────────┐
│              CLIENT-SERVER ENCRYPTION FLOW                 │
├─────────────────────────────────────────────────────────────┤
│  📱 CLIENT (Flutter)         🔄 NETWORK          🖥️ SERVER   │
│                                                             │
│  🔒 ENCRYPT MEDICAL DATA                                   │
│  ├── Document uploads        ─────🔐───→                   │
│  ├── Uses serenya_content key                              │
│  └── AES-256-GCM + metadata                                │
│                                                             │
│  🔐 DECRYPT MEDICAL RESPONSES                               │
│                              ←────🔐─────                   │
│  ├── Analysis results                   ├── ENCRYPT DATA   │
│  ├── Chat responses                     ├── Uses user keys │
│  ├── Timeline content                   └── Same algorithms│
│  └── Content details                                        │
└─────────────────────────────────────────────────────────────┘
```

### **Key Sharing & Server-Side Key Derivation**

**Authentication Integration**: Key material exchange during **→ api-contracts.md** `/auth/google` flow

```typescript
// Server-side key derivation matching client implementation
class ServerSideKeyDerivation {
    // Derive user's encryption keys using same HKDF process as client
    static async deriveUserEncryptionKey(
        userId: string, 
        tableName: 'serenya_content' | 'chat_messages'
    ): Promise<Buffer> {
        
        // Get user's encrypted key material (shared during authentication)
        const encryptedKeyMaterial = await this.getUserKeyMaterial(userId);
        const userKeyMaterial = await this.decryptWithServerPrivateKey(encryptedKeyMaterial);
        
        // Same table contexts as mobile client
        const tableContexts = {
            'serenya_content': 'serenya_content_v1',
            'chat_messages': 'serenya_chat_v1'
        };
        
        const context = tableContexts[tableName];
        
        // Identical HKDF derivation process as client (RFC 5869)
        const hkdf = new HKDF('sha256', userKeyMaterial);
        
        return hkdf.derive(
            32, // 256-bit key
            Buffer.from(context, 'utf8'), // Same context as client
            Buffer.from('serenya_key_derivation_salt_v1', 'utf8') // Same salt
        );
    }
    
    // Store user key material during authentication (encrypted at rest)
    static async storeUserKeyMaterial(userId: string, encryptedKeyMaterial: string) {
        await this.kmsEncrypt({
            userId,
            keyMaterial: encryptedKeyMaterial,
            timestamp: new Date(),
            keyVersion: 'v1'
        });
        
        // Log key material storage for audit
        await AuditLogger.logSecurityEvent('user_key_material_stored', {
            userId: sha256(userId), // Hash for privacy
            keyVersion: 'v1',
            encryptionAlgorithm: 'AES-256-GCM'
        });
    }
}
```

### **Client-Side API Request Encryption**

**Mobile Integration**: Extends existing **TableKeyManager** for network operations

```dart
// Enhanced API client with encryption support
class EncryptedApiClient {
    static Future<http.Response> uploadDocumentEncrypted(
        File document, 
        String documentType
    ) async {
        try {
            // 1. Get table key for serenya_content (triggers biometric auth if needed)
            final tableKey = await TableKeyManager.getTableKeyForEncryption('serenya_content');
            
            // 2. Prepare original request payload
            final originalPayload = {
                'file': base64.encode(await document.readAsBytes()),
                'file_name': document.path.split('/').last,
                'upload_context': {
                    'document_date': DateTime.now().toIso8601String(),
                    'user_notes': null
                }
            };
            
            // 3. Encrypt payload with table key
            final encryptedData = await FieldLevelEncryption.encryptField(
                jsonEncode(originalPayload), 
                'serenya_content'
            );
            
            // 4. Create encrypted request
            final encryptedRequest = {
                'encrypted_payload': encryptedData,
                'encryption_metadata': {
                    'version': 'v1',
                    'algorithm': 'AES-256-GCM',
                    'table_key_id': 'serenya_content',
                    'checksum': _generateChecksum(jsonEncode(originalPayload))
                },
                // Unencrypted routing metadata
                'file_type': _getMimeType(document),
                'file_size_bytes': await document.length(),
                'document_type': documentType
            };
            
            // 5. Send encrypted request
            final response = await http.post(
                Uri.parse('${ApiConfig.baseUrl}/documents/upload'),
                headers: {
                    'Authorization': 'Bearer ${await AuthManager.getAccessToken()}',
                    'Content-Type': 'application/json',
                    'X-Serenya-Encryption': 'v1' // Indicate encrypted payload
                },
                body: jsonEncode(encryptedRequest)
            );
            
            // 6. Log successful encrypted upload
            await AuditLogger.logSecurityEvent('encrypted_upload_sent', {
                'documentType': documentType,
                'encryptionVersion': 'v1',
                'payloadSize': encryptedRequest.toString().length
            });
            
            return response;
            
        } catch (e) {
            await AuditLogger.logSecurityEvent('encrypted_upload_failed', {
                'error': e.toString(),
                'documentType': documentType
            });
            rethrow;
        }
    }
    
    // Decrypt medical responses from server
    static Future<Map<String, dynamic>> decryptApiResponse(
        http.Response response,
        String expectedTableKey
    ) async {
        try {
            final responseData = jsonDecode(response.body);
            
            // Check if response is encrypted
            if (responseData['encrypted_data'] != null) {
                final encryptedData = responseData['encrypted_data'];
                final metadata = responseData['encryption_metadata'];
                
                // Verify encryption metadata
                if (metadata['table_key_id'] != expectedTableKey) {
                    throw EncryptionException('Table key mismatch');
                }
                
                // Decrypt with appropriate table key
                final decryptedJson = await FieldLevelEncryption.decryptField(
                    encryptedData, 
                    expectedTableKey
                );
                
                final decryptedData = jsonDecode(decryptedJson);
                
                // Verify checksum if provided
                if (metadata['checksum'] != null) {
                    final expectedChecksum = _generateChecksum(decryptedJson);
                    if (metadata['checksum'] != expectedChecksum) {
                        throw DataIntegrityException('Response checksum mismatch');
                    }
                }
                
                // Log successful decryption
                await AuditLogger.logSecurityEvent('encrypted_response_decrypted', {
                    'tableKeyId': expectedTableKey,
                    'encryptionVersion': metadata['version']
                });
                
                return {
                    'success': responseData['success'],
                    'data': decryptedData,
                    'metadata': responseData['metadata'],
                    'encrypted': true
                };
            } else {
                // Handle unencrypted response (fallback or non-medical data)
                return {
                    'success': responseData['success'],
                    'data': responseData['data'],
                    'encrypted': false
                };
            }
        } catch (e) {
            await AuditLogger.logSecurityEvent('response_decryption_failed', {
                'error': e.toString(),
                'tableKey': expectedTableKey
            });
            rethrow;
        }
    }
}
```

### **Server-Side API Response Encryption**

**Backend Integration**: Encrypts medical data before transmission

```typescript
// Server-side response encryption for medical data
class EncryptedApiServer {
    // Encrypt job completion results containing medical analysis
    static async sendJobResultsEncrypted(
        userId: string, 
        jobResults: JobResults
    ): Promise<EncryptedApiResponse> {
        try {
            // 1. Derive user's encryption key for serenya_content
            const tableKey = await ServerSideKeyDerivation.deriveUserEncryptionKey(
                userId, 
                'serenya_content'
            );
            
            // 2. Extract sensitive medical data for encryption
            const sensitiveData = {
                results: {
                    analysis: jobResults.analysis,           // Medical findings, summary
                    structured_data: jobResults.structuredData, // Lab values, vitals
                    chat_prompts: jobResults.chatPrompts      // Suggested questions
                }
            };
            
            // 3. Encrypt medical data
            const encryptedData = await this.encryptWithKey(
                JSON.stringify(sensitiveData),
                tableKey
            );
            
            // 4. Create encrypted response
            const response = {
                success: true,
                encrypted_data: encryptedData.ciphertext,
                encryption_metadata: {
                    version: 'v1',
                    algorithm: 'AES-256-GCM',
                    table_key_id: 'serenya_content',
                    checksum: this.generateChecksum(JSON.stringify(sensitiveData))
                },
                // Unencrypted metadata for client routing
                metadata: {
                    job_id: jobResults.jobId,
                    status: 'completed',
                    content_id: jobResults.contentId,
                    timestamp: new Date().toISOString(),
                    response_size_bytes: encryptedData.ciphertext.length
                },
                audit_logged: true
            };
            
            // 5. Log encrypted response sent
            await auditLogger.logSecurityEvent('encrypted_response_sent', {
                userId: sha256(userId), // Hash for privacy
                contentId: jobResults.contentId,
                encryptionVersion: 'v1',
                dataSize: JSON.stringify(sensitiveData).length
            });
            
            return response;
            
        } catch (error) {
            await auditLogger.logSecurityEvent('response_encryption_failed', {
                userId: sha256(userId),
                error: error.message,
                contentId: jobResults.contentId
            });
            
            // For critical medical data, fail rather than send unencrypted
            throw new EncryptionError('Failed to encrypt medical response', error);
        }
    }
    
    // Encrypt chat responses containing medical advice
    static async sendChatResponseEncrypted(
        userId: string,
        chatResponse: ChatResponse
    ): Promise<EncryptedApiResponse> {
        try {
            const tableKey = await ServerSideKeyDerivation.deriveUserEncryptionKey(
                userId, 
                'chat_messages'
            );
            
            // Encrypt AI response and follow-up suggestions
            const sensitiveData = {
                response: {
                    content: chatResponse.content, // Medical advice content
                    confidence_score: chatResponse.confidenceScore,
                    sources_referenced: chatResponse.sourcesReferenced,
                    medical_disclaimers: chatResponse.medicalDisclaimers
                },
                suggested_follow_ups: chatResponse.suggestedFollowUps
            };
            
            const encryptedData = await this.encryptWithKey(
                JSON.stringify(sensitiveData),
                tableKey
            );
            
            return {
                success: true,
                encrypted_data: encryptedData.ciphertext,
                encryption_metadata: {
                    version: 'v1',
                    algorithm: 'AES-256-GCM',
                    table_key_id: 'chat_messages',
                    checksum: this.generateChecksum(JSON.stringify(sensitiveData))
                },
                metadata: {
                    message_id: chatResponse.messageId,
                    conversation_id: chatResponse.conversationId,
                    message_count: chatResponse.messageCount,
                    timestamp: new Date().toISOString(),
                    response_size_bytes: encryptedData.ciphertext.length
                },
                audit_logged: true
            };
        } catch (error) {
            await auditLogger.logSecurityEvent('chat_encryption_failed', {
                userId: sha256(userId),
                error: error.message
            });
            throw new EncryptionError('Failed to encrypt chat response', error);
        }
    }
}
```

### **Network Encryption Error Handling**

**Graceful Degradation**: Enhanced error recovery with fallback options

```typescript
// Comprehensive error handling for network encryption
class NetworkEncryptionErrorHandler {
    static async handleClientEncryptionFailure(
        operation: string,
        error: EncryptionError,
        fallbackAllowed: boolean
    ): Promise<ErrorRecoveryResult> {
        
        await AuditLogger.logSecurityEvent('client_encryption_failure', {
            operation,
            errorType: error.type,
            fallbackAllowed,
            timestamp: new Date().toISOString()
        });
        
        switch (error.type) {
            case 'BIOMETRIC_AUTH_FAILED':
                return {
                    recoverable: true,
                    action: 'retry_with_biometric',
                    userMessage: 'Please authenticate to secure your data',
                    technicalDetails: 'Biometric authentication required for encryption keys'
                };
                
            case 'KEY_DERIVATION_FAILED':
                return {
                    recoverable: true,
                    action: 'reauthenticate',
                    userMessage: 'Please sign in again to continue',
                    technicalDetails: 'User key material not available or corrupted'
                };
                
            case 'AES_ENCRYPTION_FAILED':
                if (fallbackAllowed && operation !== 'premium_content') {
                    await this.showFallbackWarning();
                    return {
                        recoverable: true,
                        action: 'use_fallback',
                        userMessage: 'Continuing with standard security',
                        technicalDetails: 'Application-layer encryption failed, using TLS fallback'
                    };
                } else {
                    return {
                        recoverable: false,
                        action: 'contact_support',
                        userMessage: 'Unable to secure your medical data. Please try again or contact support.',
                        technicalDetails: 'Encryption required for medical data, no fallback allowed'
                    };
                }
                
            default:
                return {
                    recoverable: false,
                    action: 'contact_support',
                    userMessage: 'An unexpected security error occurred',
                    technicalDetails: error.message
                };
        }
    }
    
    static async handleServerDecryptionFailure(
        userId: string,
        error: DecryptionError,
        request: ExpressRequest
    ): Promise<ErrorResponse> {
        
        await auditLogger.logSecurityEvent('server_decryption_failure', {
            userId: sha256(userId),
            endpoint: request.path,
            errorType: error.type,
            requestSize: request.headers['content-length']
        });
        
        switch (error.type) {
            case 'INVALID_KEY_MATERIAL':
                return {
                    statusCode: 401,
                    error: {
                        code: 'KEY_DERIVATION_FAILED',
                        message: 'Unable to derive user encryption keys',
                        user_message: 'Please sign in again to continue',
                        recovery_action: 'reauthenticate'
                    }
                };
                
            case 'CORRUPTED_PAYLOAD':
                return {
                    statusCode: 400,
                    error: {
                        code: 'CORRUPTED_ENCRYPTED_PAYLOAD',
                        message: 'Encrypted request payload appears corrupted',
                        user_message: 'Request failed due to data corruption. Please try again.',
                        recovery_action: 'retry_request'
                    }
                };
                
            case 'AUTHENTICATION_TAG_INVALID':
                // Possible tampering - high severity
                await auditLogger.logSecurityEvent('potential_tampering_detected', {
                    userId: sha256(userId),
                    endpoint: request.path,
                    severity: 'high',
                    action: 'request_rejected'
                });
                
                return {
                    statusCode: 400,
                    error: {
                        code: 'DATA_INTEGRITY_ERROR',
                        message: 'Data integrity verification failed',
                        user_message: 'Security verification failed. Please try again or contact support.',
                        recovery_action: 'contact_support',
                        support_reference: generateSupportReference()
                    }
                };
                
            default:
                return {
                    statusCode: 500,
                    error: {
                        code: 'ENCRYPTION_SYSTEM_ERROR',
                        message: 'Server-side encryption system error',
                        user_message: 'Temporary service issue. Please try again later.',
                        recovery_action: 'retry_later'
                    }
                };
        }
    }
}
```

### **Performance Impact & Optimization**

**Network Encryption Overhead**: Balanced approach for medical data protection

```dart
// Performance monitoring for encrypted API calls
class EncryptionPerformanceMonitor {
    static final Map<String, PerformanceMetrics> _metrics = {};
    
    static Future<T> measureEncryptedOperation<T>(
        String operationName,
        Future<T> Function() operation
    ) async {
        final stopwatch = Stopwatch()..start();
        
        try {
            final result = await operation();
            stopwatch.stop();
            
            _recordMetric(operationName, stopwatch.elapsedMilliseconds, true);
            
            // Alert if encryption adds significant overhead
            if (stopwatch.elapsedMilliseconds > _getThreshold(operationName)) {
                await AuditLogger.logSecurityEvent('encryption_performance_degradation', {
                    'operation': operationName,
                    'latency_ms': stopwatch.elapsedMilliseconds,
                    'threshold_ms': _getThreshold(operationName)
                });
            }
            
            return result;
        } catch (e) {
            stopwatch.stop();
            _recordMetric(operationName, stopwatch.elapsedMilliseconds, false);
            rethrow;
        }
    }
    
    static void _recordMetric(String operation, int latencyMs, bool success) {
        final metrics = _metrics[operation] ?? PerformanceMetrics();
        metrics.addSample(latencyMs, success);
        _metrics[operation] = metrics;
    }
    
    static int _getThreshold(String operationName) {
        // Performance thresholds (encryption should add no more than this)
        const thresholds = {
            'document_upload': 1000,  // 1 second max additional
            'chat_response': 200,     // 200ms max additional 
            'timeline_load': 150,     // 150ms max additional
            'content_details': 100,   // 100ms max additional
        };
        
        return thresholds[operationName] ?? 500; // Default 500ms
    }
}
```

### **Audit Integration & Security Monitoring**

**Enhanced Audit Events**: Network encryption events integrated with existing framework

```dart
// Network encryption audit events
class NetworkEncryptionAuditEvents {
    // Category 5: Security Events - Network encryption operations
    static Future<void> logEncryptionEvent(
        String eventType,
        Map<String, dynamic> details
    ) async {
        await AuditLogger.logEvent({
            'event_type': 'security_event',
            'event_subtype': eventType,
            'timestamp': DateTime.now().toIso8601String(),
            'security_details': {
                'encryption_layer': 'application_layer',
                'transport_layer': 'tls_1_3',
                'threat_level': _assessThreatLevel(eventType, details),
                'detection_method': 'automated',
                'action_taken': _getActionTaken(eventType),
                'resolution_status': _getResolutionStatus(eventType, details),
                ...details
            }
        });
    }
    
    // Specific audit events for network encryption
    static Future<void> logSuccessfulEncryption(String operation, String tableKey) {
        return logEncryptionEvent('network_encryption_success', {
            'operation': operation,
            'table_key_id': tableKey,
            'encryption_algorithm': 'AES-256-GCM'
        });
    }
    
    static Future<void> logEncryptionFailure(String operation, String error) {
        return logEncryptionEvent('network_encryption_failure', {
            'operation': operation,
            'failure_reason': error,
            'fallback_available': _isFallbackAllowed(operation)
        });
    }
    
    static Future<void> logFallbackUsed(String operation, String reason) {
        return logEncryptionEvent('encryption_fallback_used', {
            'operation': operation,
            'fallback_reason': reason,
            'security_level': 'reduced'
        });
    }
    
    static Future<void> logPotentialTampering(String userId, String endpoint) {
        return logEncryptionEvent('potential_data_tampering', {
            'user_id_hash': sha256(userId),
            'endpoint': endpoint,
            'threat_level': 'high',
            'immediate_action': 'request_blocked'
        });
    }
}
```

---

## 📊 **Performance Optimization Strategies**

### **Key Caching & Memory Management**

```dart
class PerformanceOptimizations {
    static final Map<String, CachedKey> _keyCache = {};
    static const Duration cacheExpiration = Duration(minutes: 5);
    
    static Future<Uint8List> getCachedTableKey(String tableName) async {
        final cached = _keyCache[tableName];
        
        if (cached != null && !cached.isExpired) {
            return cached.key;
        }
        
        // Key not cached or expired - derive fresh key
        final freshKey = await TableKeyManager.getTableKeyForEncryption(tableName);
        
        _keyCache[tableName] = CachedKey(
            key: freshKey,
            cacheTime: DateTime.now()
        );
        
        return freshKey;
    }
    
    static void clearKeyCache() {
        // Secure memory clearing
        for (final cached in _keyCache.values) {
            _secureZeroMemory(cached.key);
        }
        _keyCache.clear();
    }
    
    static void _secureZeroMemory(Uint8List keyMaterial) {
        for (int i = 0; i < keyMaterial.length; i++) {
            keyMaterial[i] = 0;
        }
    }
}
```

### **Batch Encryption Operations**

```dart
class BatchEncryptionOptimizations {
    // Optimize timeline loading with batch field decryption
    static Future<List<SerenyaContent>> decryptContentBatch(
        List<Map<String, dynamic>> encryptedRecords
    ) async {
        // Get table key once for entire batch
        final tableKey = await PerformanceOptimizations.getCachedTableKey('serenya_content');
        
        final List<SerenyaContent> decryptedRecords = [];
        
        for (final record in encryptedRecords) {
            // Decrypt content and medical_flags fields
            final decryptedContent = await _decryptFieldWithKey(
                record['content'], 
                tableKey
            );
            final decryptedFlags = record['medical_flags'] != null
                ? await _decryptFieldWithKey(record['medical_flags'], tableKey)
                : null;
                
            decryptedRecords.add(SerenyaContent.fromDecryptedFields(
                record, 
                decryptedContent, 
                decryptedFlags
            ));
        }
        
        return decryptedRecords;
    }
}
```

---

## 🚨 **Security Event Integration**

### **Audit Logging Integration**

**Agent Handoff**: Security events flow to **→ audit-logging.md** event categories

```dart
class SecurityAuditIntegration {
    // Key access events (Category 5: Security Events)
    static Future<void> logKeyAccessEvent(
        String operation,
        String keyContext,
        bool success,
        {String? errorReason}
    ) async {
        await AuditLogger.logEvent({
            'event_type': 'security_event',
            'event_subtype': 'encryption_key_accessed',
            'timestamp': DateTime.now().toIso8601String(),
            'security_details': {
                'operation': operation,
                'key_context': keyContext,
                'threat_level': success ? 'low' : 'medium',
                'detection_method': 'automated',
                'action_taken': success ? 'logged_only' : 'key_access_denied',
                'resolution_status': success ? 'resolved' : 'investigating'
            },
            'success': success,
            'error_reason': errorReason
        });
    }
    
    // Biometric authentication events (Category 1: Authentication Events)
    static Future<void> logBiometricAuthEvent(
        String authMethod,
        bool success,
        {String? failureReason}
    ) async {
        await AuditLogger.logEvent({
            'event_type': 'authentication',
            'event_subtype': success ? 'biometric_auth_success' : 'biometric_auth_failure',
            'timestamp': DateTime.now().toIso8601String(),
            'auth_details': {
                'auth_method': authMethod,
                'failure_reason': failureReason,
                'consecutive_failures': await _getConsecutiveFailureCount()
            }
        });
    }
}
```

---

## ✅ **Implementation Checklist**

### **Phase 1: Core Encryption Setup**
- [ ] Device root key generation and hardware storage
- [ ] Table-specific key derivation implementation
- [ ] Biometric authentication integration
- [ ] Session management implementation

### **Phase 2: Database Integration** 
- [ ] SQLCipher setup for full table encryption
- [ ] Field-level encryption for mixed-sensitivity tables
- [ ] Database model encryption/decryption methods
- [ ] Performance optimization with key caching

### **Phase 3: Security Features**
- [ ] Key rotation automation
- [ ] Critical operation authentication
- [ ] Security event audit logging integration
- [ ] Threat detection and response procedures

### **Phase 4: Server-Side Integration**
- [ ] AWS KMS key setup and configuration
- [ ] Server-side field encryption implementation
- [ ] Cross-system encryption consistency validation
- [ ] Performance benchmarking and optimization

### **Phase 5: Client-Server Communication Encryption**
- [ ] Authentication endpoint enhancement with key material exchange
- [ ] Client-side encrypted API request implementation (document upload)
- [ ] Server-side encrypted API response implementation (medical data)
- [ ] Network encryption error handling and fallback mechanisms
- [ ] Performance monitoring for encrypted API operations
- [ ] Security audit integration for network encryption events
- [ ] End-to-end encryption testing and validation

---

## 🔗 **Agent Handoff Requirements**

### **For Mobile Architecture Agent (→ mobile-architecture.md)**
**Device & Network Encryption Implementation**:
- Platform-specific secure key storage (iOS Keychain, Android Keystore)
- SQLCipher database configuration and optimization
- Biometric authentication UI integration per **→ ui-specifications.md**
- **NEW: HTTP client encryption integration with existing table keys**
- **NEW: Encrypted API request/response handling for medical data**
- **NEW: Network encryption error recovery and fallback UI**
- **NEW: Performance monitoring for encrypted network operations**
- Memory management for sensitive key material (device + network)
- Comprehensive error handling and recovery procedures

### **For Audit Logging Agent (→ audit-logging.md)**
**Security Events Integration**:
- Key access and rotation events (Category 5: Security Events)
- Biometric authentication events (Category 1: Authentication Events)  
- Encryption/decryption failure events
- Session management events (start, expire, extend)

### **For System Architecture Agent (→ system-architecture.md)**
**Server-Side Requirements**:
- AWS KMS key configuration and policies
- Lambda function encryption/decryption integration
- Cross-service key management coordination
- Performance monitoring and alerting

### **For API Contracts Agent (→ api-contracts.md)**
**Network Encryption Integration**:
- Encrypted payload format implementation for medical data endpoints
- Authentication enhancement with key material exchange
- Error response security (no encryption details leaked)
- Performance considerations for encrypted request/response operations
- Fallback mechanisms when application-layer encryption fails
- Comprehensive error codes for encryption failure scenarios

---

**Document Status**: ✅ Complete - Ready for comprehensive encryption implementation  
**Security Architecture**: End-to-end multi-layered defense (device + network + server)  
**Encryption Coverage**: Local storage + Client-server communication + Server-side fields  
**Compliance Status**: HIPAA, GDPR, PCI DSS requirements fully addressed  
**Next Steps**: Phase 1-5 implementation with mobile, network, and server encryption