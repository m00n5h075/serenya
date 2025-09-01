# Security Architecture Discussion - Work in Progress

**Date:** September 1, 2025  
**Context:** CTO and Backend Engineer review findings  
**Status:** Technical architecture planning phase

---

## Overview

This document captures the ongoing discussion and planning for Serenya's security architecture, encryption strategy, audit logging, and FHIR R4 compliance based on agent reviews.

**Key Context:**
- DynamoDB will be removed from production (using local storage only for medical data)
- No backup/recovery functionality planned (user responsibility)
- **Medical Data Storage**: Normalized relational tables (no FHIR initially)
- **Data Flow**: Single server round-trip with complete response package
- Focus on encryption, audit logging, and performance optimization

---

## 1. Encryption Strategy

### Local Device Storage Encryption

#### Selected Approach: Hybrid Encryption Strategy

**Decision**: Use different encryption approaches based on table usage patterns and performance requirements.

**Hybrid Strategy:**
```dart
// Table-specific encryption decisions:
// Option A: Full table encryption (SQLCipher) for low-query tables
// Option B: Field-level encryption for performance-critical tables
// Decision criteria: Query frequency, performance impact, data sensitivity
```

**Implementation Framework:**
- **Full Table Encryption**: For tables accessed infrequently or in bulk
- **Field-Level Encryption**: For tables with frequent queries and mixed sensitivity
- **Device keychain/keystore** for key management across both approaches
- **Biometric authentication gate** for all medical data access
- **AES-256 encryption** standard for both approaches

**Table Classification Process:**
1. ✅ **Define all table schemas** first
2. ✅ **Analyze query patterns** for each table (timeline, reports, search)
3. ✅ **Assess performance requirements** (frequent vs. infrequent access)
4. ✅ **Determine encryption approach** per table based on usage
5. ✅ **Identify specific fields** for field-level encryption tables

---

#### **Table Encryption Classification**

**Server-Side Tables:**

**`users`** - **Field-Level Encryption**
- **Encrypt**: `email, name, given_name, family_name` (PII compliance)
- **Unencrypted**: `external_id, auth_provider` (login queries), `account_status, timestamps`

**`consent_records`** - **No Encryption** 
- All fields unencrypted (procedural compliance records, not personal data)

**`subscriptions`** - **Field-Level Encryption**
- **Encrypt**: `user_id, subscription_status, subscription_type` (user behavior data)
- **Unencrypted**: `provider, external_subscription_id` (operational queries), `timestamps`

**`payments`** - **Full Table Encryption** (PCI DSS compliance, infrequent access)

**`chat_options`** - **No Encryption** (public reference data)

**Local Device Tables:**

**`lab_results`** - **Full Table Encryption** (sensitive medical data, only used for server transmission)

**`vitals`** - **Full Table Encryption** (sensitive medical data, only used for server transmission)

**`serenya_content`** - **Field-Level Encryption**
- **Encrypt**: `content, medical_flags` (sensitive medical content)
- **Unencrypted**: `user_id, title, content_type, confidence_score, timestamps` (timeline queries)

**`chat_messages`** - **Field-Level Encryption**
- **Encrypt**: `message` (conversation content)
- **Unencrypted**: `serenya_content_id, sender, timestamps` (chat display queries)

**Encryption Summary:**
- **Full Table**: `payments, lab_results, vitals` (3 tables)
- **Field-Level**: `users, subscriptions, serenya_content, chat_messages` (4 tables)  
- **No Encryption**: `consent_records, chat_options` (2 tables)

**Questions to Resolve:**
- [x] ✅ **RESOLVED**: Hybrid approach (table-specific decisions)
- [x] ✅ **RESOLVED**: Key management strategy (see detailed section below)
- [x] ✅ **RESOLVED**: Biometric authentication integration points (see detailed section below)
- [x] ✅ **RESOLVED**: Table encryption classification (see detailed classification above)

### Server-Side Data Encryption

**Data Classification & Encryption Requirements:**

| Data Type | Encryption Required | Reason |
|-----------|-------------------|---------|
| User PII (email, name) | ✅ **Required** | GDPR/Privacy compliance |
| Consent records versions | 🤔 **Optional** | Recommended for integrity |
| Payment data (amounts, transaction IDs) | ✅ **Required** | PCI DSS compliance |
| Chat option text | ❌ **Not needed** | Public reference data |
| Audit logs | ✅ **Required** | Tampering protection |

**Implementation Notes:**
- Use AWS KMS for server-side encryption
- Separate encryption keys for different data types
- Field-level encryption for sensitive columns

---

### **Encryption Key Management Strategy**

#### **Multi-Layered Key Architecture**

**Layer 1: Device Root Key (Master Key)**
- **Source**: Device-specific hardware security module (iOS Keychain/Android Keystore)
- **Generation**: Created on first app launch using device entropy
- **Purpose**: Root key for deriving all other encryption keys
- **Protection**: Hardware-backed, biometric-protected
- **Backup**: Never backed up - lost device = lost data (per requirements)

**Layer 2: Table-Specific Keys**
```dart
// Key derivation for different tables
device_root_key → PBKDF2/HKDF → table_specific_keys

Examples:
- medical_data_key = HKDF(device_root_key, "serenya_medical_v1")
- chat_messages_key = HKDF(device_root_key, "serenya_chat_v1") 
- audit_log_key = HKDF(device_root_key, "serenya_audit_v1")
```

**Layer 3: Field-Level Keys (When Needed)**
```dart
// For field-level encryption tables
lab_results_value_key = HKDF(medical_data_key, "lab_values_v1")
vitals_data_key = HKDF(medical_data_key, "vitals_data_v1")
```

#### **Key Management Implementation**

**Key Generation & Storage**
```dart
class SerenyaKeyManager {
  // Generate master key on first launch
  static Future<void> initializeKeys() async {
    if (!await _masterKeyExists()) {
      final masterKey = await _generateMasterKey();
      await _storeInDeviceKeychain(masterKey);
      await _deriveAndStoreTableKeys(masterKey);
    }
  }
  
  // Biometric-protected key access
  static Future<Uint8List> getTableKey(String tableName) async {
    final masterKey = await _getMasterKeyWithBiometric();
    return _deriveTableKey(masterKey, tableName);
  }
}
```

**Biometric Integration**
```dart
// Key access requires biometric authentication
BiometricType: FaceID | TouchID | Fingerprint | PIN
AuthPolicy: BiometricAny + DevicePasscode fallback
InvalidationPolicy: New biometric enrollment invalidates keys
```

#### **Key Rotation Strategy**

**Planned Rotation Events**
1. **App major version updates** (v1.x → v2.x)
2. **Security incident response** (emergency rotation)
3. **Biometric enrollment changes** (automatic)
4. **Annual rotation** (optional, user-initiated)

**Rotation Process**
```dart
// Key rotation workflow
1. Generate new master key
2. Decrypt all data with old keys
3. Re-encrypt with new keys
4. Update key derivation version
5. Secure deletion of old keys
```

#### **Server-Side Key Management**

**AWS KMS Integration**
```typescript
// Server-side encryption keys
UserDataKey: AWS KMS Customer Managed Key (per-user)
AuditLogKey: AWS KMS Customer Managed Key (shared)
PaymentDataKey: AWS KMS Customer Managed Key (PCI compliance)

// Key rotation
Automatic: Annual AWS KMS key rotation
Manual: On-demand via admin console
```

**Key Hierarchy**
```
AWS KMS Master Key
  ├── User PII Encryption Key
  ├── Payment Data Encryption Key  
  ├── Audit Log Encryption Key
  └── Chat Options Key (if needed)
```

#### **Security Considerations**

**Key Protection Mechanisms**
- **Hardware Security**: iOS Secure Enclave, Android Hardware Security Module
- **Biometric Binding**: Keys inaccessible without biometric verification
- **App Sandboxing**: Keys isolated within app container
- **Memory Protection**: Keys cleared from memory after use
- **Anti-Debug**: Key access disabled in debug builds

**Attack Mitigation**
```dart
// Security measures
- Key derivation uses device-unique identifiers
- Failed biometric attempts lock key access
- App backgrounding clears keys from memory
- Jailbreak/root detection prevents key access
- Certificate pinning for server key exchange
```

#### **Key Recovery & Loss Scenarios**

**Device Loss/Replacement**
- ❌ **No recovery possible** (by design)
- ✅ **User re-authenticates** and starts fresh
- ✅ **Server data** remains accessible with new device

**Biometric Changes**
- ✅ **Automatic re-key** on biometric enrollment changes
- ✅ **Seamless user experience** with PIN fallback
- ❌ **Old biometrics** cannot access data

**App Uninstall/Reinstall**
- ❌ **All local data lost** (keys deleted)
- ✅ **Server data** remains accessible after re-authentication

#### **Compliance & Audit**

**Key Audit Trail**
```json
{
  "event_type": "key_operation",
  "operation": "derive|access|rotate|delete",
  "table_name": "medical_data",
  "key_version": "v1",
  "timestamp": "2025-09-01T10:30:00Z",
  "biometric_method": "face_id",
  "success": true
}
```

**Regulatory Compliance**
- **HIPAA**: Encryption key management procedures documented
- **GDPR**: Right to erasure through key deletion
- **SOC 2**: Annual key rotation and access logging
- **Mobile Security**: Platform-standard key protection

---

### **Biometric Authentication Integration Points**

#### **Authentication Strategy: Session-Based with Critical Operation Protection**

**Primary Authentication Gate: App Launch Only**
```dart
// Single session-based authentication
AuthenticationRequired:
- App launch (cold start)
- App return from background (after session expires)
- Session timeout (15 minutes of INACTIVITY)

SessionCovers:
- Timeline viewing
- Document uploads  
- Report viewing
- Chat interactions
- Requesting medical reports
- All normal app functionality
```

**Critical Security Operations (Always Require Fresh Biometric)**
```dart
// Additional biometric required for security-critical actions
SecurityCriticalOperations:
- Encryption key derivation/access (every time)
- Premium subscription changes
- Account deletion
- Data export (GDPR compliance)
- Security settings modifications
```

#### **Session Management Implementation**

**Activity-Based Session Extension**
```dart
class SessionManager {
  static const Duration inactivityTimeout = Duration(minutes: 15);
  static DateTime _lastActivity = DateTime.now();
  
  // Session extends with each user interaction
  static void updateActivity() {
    _lastActivity = DateTime.now();
  }
  
  // Only expires after 15 minutes of NO activity
  static bool isSessionExpired() {
    final timeSinceActivity = DateTime.now().difference(_lastActivity);
    return timeSinceActivity > inactivityTimeout;
  }
  
  // Every user action resets the inactivity timer
  static void trackUserActivity(UserAction action) {
    updateActivity();
    
    // Log activity for session management
    _logActivityEvent(action);
  }
}
```

**Authentication Decision Logic**
```dart
class SecurityAuthManager {
  static bool requiresBiometric(UserAction action) {
    return switch (action) {
      // Session-level auth (once per session)
      AppLaunch() => true,
      SessionExpired() => true,
      
      // Security-critical (always required, bypass session)
      AccessEncryptionKeys() => true,
      ModifySecuritySettings() => true,
      UpgradePremium() => true,
      DeleteAccount() => true,
      ExportData() => true,
      
      // Covered by active session
      ViewTimeline() => false,
      UploadDocument() => false,
      ViewResults() => false,
      ChatWithSerenya() => false,
      RequestMedicalReport() => false,
      BrowseHistory() => false,
      _ => false,
    };
  }
}
```

#### **Session Lifecycle**

**Session States**
```dart
enum SessionState {
  unauthenticated,    // Requires biometric authentication
  authenticated,      // Valid session, all normal operations allowed
  expired,           // Session expired, re-authentication required
  locked             // Security lockout active (too many failures)
}
```

**Session Behavior**
- ✅ **Active use for hours**: Session never expires if user keeps interacting
- ✅ **15 min inactive**: Session expires, requires re-auth on next action  
- ✅ **Background/foreground**: Session continues unless expired
- ✅ **Key access**: Always requires fresh biometric (bypasses session)
- ✅ **Critical operations**: Always require fresh biometric (bypasses session)

**User Activity Tracking**
```dart
// Actions that reset the 15-minute inactivity timer
ActivityEvents:
- UI interactions (taps, scrolls, swipes)
- Timeline browsing
- Document uploads
- Chat messages
- Report requests
- Settings navigation
- Any user-initiated action
```

#### **Security Benefits**

**User Experience**
- 🎯 **Minimal friction**: Single auth at app launch
- ⚡ **Fast access**: No interruptions during normal use
- 🔄 **Smart timeout**: Only after actual inactivity

**Security Assurance**
- 🔐 **Key protection**: Encryption keys always require fresh biometric
- ⚠️ **Critical operations**: High-value actions always protected
- 📱 **Session security**: Reasonable timeout prevents unauthorized access
- 🛡️ **Defense in depth**: Multiple authentication layers for different risk levels

---

## 2. GDPR/HIPAA Compliant Audit Logging

### **Decision: Server-Side Only Audit Storage**

**Storage Strategy**: All audit logs stored server-side only for centralized compliance management, tamper-proof storage, and regulatory audit requirements.

**Rationale**:
- ✅ **HIPAA/GDPR Compliance**: Centralized audit trails required for regulatory audits
- ✅ **Tamper Protection**: Server-side logs cannot be modified by client applications
- ✅ **Data Integrity**: AWS CloudTrail integration for immutable audit records
- ✅ **Retention Management**: Automated compliance with 7-year healthcare retention requirements
- ✅ **Analytics Capability**: Security incident detection and compliance reporting

---

### **Comprehensive Audit Event Categories**

#### **Category 1: Authentication & Authorization Events**
**Compliance Requirement**: HIPAA Technical Safeguards (§164.312(a))

```json
{
  "event_type": "authentication",
  "event_subtype": "login_success|login_failure|logout|session_expired|account_locked",
  "user_id_hash": "sha256(user_id)",
  "session_id": "uuid-v4",
  "timestamp": "2025-09-01T10:30:00.000Z",
  "source_ip_hash": "sha256(ip_address)",
  "device_info": {
    "platform": "ios|android",
    "app_version": "1.2.3",
    "device_model_hash": "sha256(device_model)"
  },
  "auth_details": {
    "auth_method": "biometric_face_id|biometric_touch_id|device_pin|social_oauth",
    "auth_provider": "apple|google|local",
    "failure_reason": "invalid_credentials|biometric_failed|account_locked|null",
    "consecutive_failures": 0
  },
  "geo_context": {
    "country_code": "US",
    "timezone": "America/New_York"
  },
  "compliance_metadata": {
    "gdpr_lawful_basis": "legitimate_interest",
    "data_classification": "authentication_log",
    "retention_period_years": 7
  }
}
```

#### **Category 2: Data Access & Processing Events**
**Compliance Requirement**: HIPAA Administrative Safeguards (§164.308(a)(1))

```json
{
  "event_type": "data_access",
  "event_subtype": "medical_document_upload|ai_analysis_request|result_viewed|report_generated|data_export",
  "user_id_hash": "sha256(user_id)",
  "session_id": "uuid-v4",
  "timestamp": "2025-09-01T10:30:00.000Z",
  "resource_details": {
    "resource_type": "medical_document|lab_results|vitals|serenya_content|chat_messages",
    "resource_id_hash": "sha256(resource_id)",
    "operation": "CREATE|READ|UPDATE|DELETE|PROCESS",
    "data_classification": "phi|pii|public",
    "processing_duration_ms": 1250
  },
  "ai_processing": {
    "ai_model_version": "claude-3-sonnet-20240229",
    "confidence_score": 8.5,
    "flags_detected": ["ELEVATED_CHOLESTEROL"],
    "processing_successful": true
  },
  "compliance_metadata": {
    "gdpr_lawful_basis": "consent",
    "hipaa_minimum_necessary": true,
    "data_classification": "protected_health_information",
    "retention_period_years": 7
  }
}
```

#### **Category 3: Consent Management Events**
**Compliance Requirement**: GDPR Article 7 (Conditions for consent)

```json
{
  "event_type": "consent_management",
  "event_subtype": "consent_given|consent_withdrawn|consent_updated|privacy_policy_accepted",
  "user_id_hash": "sha256(user_id)",
  "timestamp": "2025-09-01T10:30:00.000Z",
  "consent_details": {
    "consent_type": "data_processing|ai_analysis|marketing|research",
    "consent_version": "v2.1.0",
    "consent_method": "explicit_opt_in|granular_consent|bundled_consent",
    "consent_withdrawn": false,
    "lawful_basis": "consent|legitimate_interest|contract|legal_obligation"
  },
  "data_subject_rights": {
    "right_exercised": "access|rectification|erasure|portability|restrict_processing|null",
    "request_fulfilled": true,
    "fulfillment_date": "2025-09-01T10:30:00.000Z"
  },
  "compliance_metadata": {
    "gdpr_article_basis": "article_6_1_a",
    "data_classification": "consent_record",
    "retention_period_years": 7
  }
}
```

#### **Category 4: Financial & Subscription Events**
**Compliance Requirement**: PCI DSS Requirement 10 (Log and monitor access)

```json
{
  "event_type": "financial_transaction",
  "event_subtype": "subscription_created|subscription_upgraded|payment_processed|subscription_cancelled|refund_issued",
  "user_id_hash": "sha256(user_id)",
  "timestamp": "2025-09-01T10:30:00.000Z",
  "transaction_details": {
    "transaction_id_hash": "sha256(transaction_id)",
    "amount_cents": 999,
    "currency": "USD",
    "payment_method": "apple_pay|google_pay|credit_card",
    "subscription_type": "premium_monthly|premium_annual",
    "transaction_successful": true,
    "failure_reason": "insufficient_funds|card_declined|payment_method_expired|null"
  },
  "pci_compliance": {
    "payment_processor": "apple|google|stripe",
    "card_last_four_hash": "sha256(last_four_digits)",
    "avs_result": "Y|N|U",
    "cvv_result": "M|N|P"
  },
  "compliance_metadata": {
    "gdpr_lawful_basis": "contract",
    "data_classification": "payment_data",
    "retention_period_years": 7
  }
}
```

#### **Category 5: Security & Administrative Events**
**Compliance Requirement**: HIPAA Physical Safeguards (§164.310)

```json
{
  "event_type": "security_event",
  "event_subtype": "suspicious_activity|rate_limit_exceeded|encryption_key_accessed|admin_action|security_setting_changed",
  "user_id_hash": "sha256(user_id)",
  "admin_user_id_hash": "sha256(admin_user_id)",
  "timestamp": "2025-09-01T10:30:00.000Z",
  "security_details": {
    "threat_level": "low|medium|high|critical",
    "detection_method": "automated|manual|user_reported",
    "action_taken": "logged_only|rate_limited|account_locked|investigation_initiated",
    "affected_resources": ["user_account", "payment_methods"],
    "resolution_status": "open|investigating|resolved|false_positive"
  },
  "admin_action": {
    "action_type": "account_status_change|data_export|manual_refund|security_reset",
    "justification": "user_request|security_incident|compliance_audit|data_correction",
    "authorization_level": "support|admin|super_admin"
  },
  "compliance_metadata": {
    "gdpr_lawful_basis": "legitimate_interest",
    "data_classification": "security_log",
    "retention_period_years": 7
  }
}
```

---

### **Server-Side Audit Log Database Schema**

#### **Primary Audit Log Table**
```sql
audit_events: {
  -- Primary identifiers
  id: UUID (primary key, server-generated),
  event_timestamp: TIMESTAMP WITH TIME ZONE (indexed),
  event_type: ENUM ('authentication', 'data_access', 'consent_management', 'financial_transaction', 'security_event'),
  event_subtype: STRING (specific event within category),
  
  -- User context (hashed for privacy)
  user_id_hash: STRING (sha256, indexed),
  session_id: UUID (indexed),
  admin_user_id_hash: STRING (nullable, for admin actions),
  
  -- Request context
  source_ip_hash: STRING (sha256 of IP address),
  user_agent_hash: STRING (sha256 of user agent),
  request_id: UUID (for request correlation),
  
  -- Event details (encrypted JSON)
  event_details: JSONB (encrypted, contains specific event data),
  
  -- Compliance metadata
  gdpr_lawful_basis: ENUM ('consent', 'contract', 'legal_obligation', 'vital_interests', 'public_task', 'legitimate_interest'),
  data_classification: ENUM ('public', 'internal', 'confidential', 'phi', 'pii', 'payment_data'),
  retention_period_years: INTEGER (default 7),
  retention_expiry_date: DATE (computed field),
  
  -- Data integrity
  event_hash: STRING (sha256 of event content for tamper detection),
  created_at: TIMESTAMP WITH TIME ZONE (server timestamp),
  
  -- Indexes for compliance queries
  INDEX idx_user_timeline (user_id_hash, event_timestamp DESC),
  INDEX idx_event_type_time (event_type, event_timestamp DESC),
  INDEX idx_retention_expiry (retention_expiry_date),
  INDEX idx_compliance_audit (data_classification, event_timestamp DESC),
  
  -- Encryption: Full table encryption (most sensitive audit data)
  ENCRYPTION: AWS_KMS_AUDIT_LOG_KEY
}
```

#### **Audit Log Summary Table** (for performance)
```sql
audit_event_summaries: {
  -- Aggregated daily summaries for performance
  summary_date: DATE (primary key),
  user_id_hash: STRING (primary key),
  
  -- Event counts by category
  authentication_events_count: INTEGER,
  data_access_events_count: INTEGER,
  consent_events_count: INTEGER,
  financial_events_count: INTEGER,
  security_events_count: INTEGER,
  
  -- Risk indicators
  failed_authentication_count: INTEGER,
  suspicious_activity_count: INTEGER,
  data_export_count: INTEGER,
  
  -- Compliance metrics
  gdpr_requests_count: INTEGER,
  hipaa_access_count: INTEGER,
  
  created_at: TIMESTAMP WITH TIME ZONE,
  updated_at: TIMESTAMP WITH TIME ZONE,
  
  INDEX idx_date_user (summary_date, user_id_hash),
  INDEX idx_risk_indicators (failed_authentication_count, suspicious_activity_count)
}
```

---

### **Audit Event Processing & Storage**

#### **Real-Time Event Processing**
```typescript
class AuditLogger {
  // Critical events logged immediately
  static async logCriticalEvent(event: AuditEvent): Promise<void> {
    // Events requiring immediate logging:
    // - Authentication failures
    // - Security incidents
    // - Data export requests
    // - Consent withdrawals
    
    await this.storeEventImmediate(event);
    await this.notifySecurityTeam(event);
  }
  
  // Standard events batched for performance
  static async logStandardEvent(event: AuditEvent): Promise<void> {
    await this.addToBatch(event);
    
    // Batch processing every 60 seconds
    if (this.batchShouldFlush()) {
      await this.flushBatchToDatabase();
    }
  }
}
```

#### **Event Validation & Integrity**
```typescript
class AuditEventValidator {
  static validateEvent(event: AuditEvent): ValidationResult {
    return {
      hasRequiredFields: this.checkRequiredFields(event),
      gdprCompliant: this.validateGDPRRequirements(event),
      hipaaCompliant: this.validateHIPAARequirements(event),
      eventHashValid: this.verifyEventIntegrity(event),
      retentionPeriodValid: this.validateRetentionPeriod(event)
    };
  }
  
  static generateEventHash(event: AuditEvent): string {
    // Tamper detection hash
    const eventContent = JSON.stringify({
      timestamp: event.timestamp,
      event_type: event.event_type,
      user_id_hash: event.user_id_hash,
      event_details: event.event_details
    });
    
    return crypto.createHash('sha256').update(eventContent).digest('hex');
  }
}
```

---

### **Compliance & Retention Policies**

#### **Data Retention Matrix**

| Event Category | HIPAA Requirement | GDPR Requirement | Serenya Policy | Business Justification |
|----------------|-------------------|------------------|----------------|----------------------|
| **Authentication** | 6 years minimum | Until consent withdrawn | **7 years** | Security incident investigation |
| **Data Access** | 6 years minimum | Until consent withdrawn | **7 years** | HIPAA audit requirements |
| **Consent Records** | Not specified | 3 years after withdrawal | **7 years** | Proof of consent compliance |
| **Payment Data** | Not specified | Until consent withdrawn | **7 years** | PCI DSS + tax requirements |
| **Security Events** | 6 years minimum | Until consent withdrawn | **7 years** | Security forensics |

#### **Automated Retention Management**
```sql
-- Daily cleanup job for expired audit logs
DELETE FROM audit_events 
WHERE retention_expiry_date < CURRENT_DATE
AND event_type NOT IN ('security_event')  -- Security events kept longer
AND data_classification != 'legal_hold';  -- Legal holds exempt from deletion
```

#### **GDPR Right to Erasure Implementation**
```typescript
class GDPRCompliance {
  static async processErasureRequest(userIdHash: string): Promise<void> {
    // 1. Anonymize user data in audit logs (cannot delete for regulatory compliance)
    await this.anonymizeUserAuditEvents(userIdHash);
    
    // 2. Update retention policy to remove personal identifiers
    await this.applyAnonymizationMask(userIdHash);
    
    // 3. Maintain compliance audit trail
    await this.logErasureCompliance(userIdHash);
  }
  
  private static async anonymizeUserAuditEvents(userIdHash: string): Promise<void> {
    // Replace user_id_hash with anonymized value
    const anonymousHash = crypto.createHash('sha256')
      .update(`ANONYMIZED_${Date.now()}_${Math.random()}`)
      .digest('hex');
      
    await database.query(`
      UPDATE audit_events 
      SET user_id_hash = $1,
          event_details = jsonb_set(event_details, '{user_id_hash}', to_jsonb($1::text))
      WHERE user_id_hash = $2
    `, [anonymousHash, userIdHash]);
  }
}
```

#### **Compliance Reporting**
```typescript
class ComplianceReporting {
  // Generate HIPAA audit report
  static async generateHIPAAAuditReport(dateRange: DateRange): Promise<HIPAAAuditReport> {
    return {
      period: dateRange,
      totalAccessEvents: await this.countDataAccessEvents(dateRange),
      userAuthenticationMetrics: await this.getAuthenticationStats(dateRange),
      securityIncidents: await this.getSecurityEvents(dateRange),
      dataIntegrityVerification: await this.verifyAuditLogIntegrity(dateRange),
      retentionCompliance: await this.validateRetentionCompliance()
    };
  }
  
  // Generate GDPR compliance report
  static async generateGDPRComplianceReport(): Promise<GDPRComplianceReport> {
    return {
      consentWithdrawalEvents: await this.getConsentWithdrawals(),
      dataExportRequests: await this.getDataExportEvents(),
      erasureRequests: await this.getErasureEvents(),
      lawfulBasisBreakdown: await this.getLawfulBasisStats(),
      retentionPolicyCompliance: await this.getRetentionStats()
    };
  }
}
```

---

### **Implementation Priority & Next Steps**

#### **Phase 1: Core Audit Infrastructure** (Week 1)
- ✅ **Server-side audit log table schema** (defined above)
- ✅ **Event categories and JSON structures** (defined above)
- [ ] Implement audit event collection in Lambda functions
- [ ] Set up encrypted database storage with proper indexing

#### **Phase 2: Event Processing** (Week 2)  
- [ ] Implement real-time vs batch event processing
- [ ] Build event validation and integrity checking
- [ ] Create audit event APIs for compliance reporting

#### **Phase 3: Compliance Features** (Week 3)
- [ ] Implement GDPR right to erasure for audit logs
- [ ] Build automated retention policy management
- [ ] Create compliance reporting dashboards

#### **Immediate Integration Points**
- **Authentication Lambda**: Log all auth events with session tracking
- **Process Lambda**: Log AI processing events with medical data access
- **Payment Lambda**: Log all financial transactions with PCI compliance
- **User Management**: Log consent changes and account modifications

---

## 3. Medical Data Storage Strategy - Normalized Tables

### Decision: Start with Normalized Relational Tables

**Approach Selected**: Option 2 (Normalized relational tables) for initial implementation
**Future Evolution**: Add FHIR resources later as hybrid approach (Option 3)

**Rationale:**
- ✅ Reduced complexity and faster implementation
- ✅ Optimal query performance for medical reports  
- ✅ Minimal network transmission overhead
- ✅ Clear upgrade path to FHIR compliance later

### Core Medical Data Tables

#### Lab Results (Blood Tests, Urine Tests, etc.)
```sql
lab_results: {
  id: UUID (primary key),
  user_id: UUID (foreign key → users.id),
  serenya_content_id: UUID (foreign key → serenya_content.id),
  test_name: STRING,
  test_value: FLOAT,
  test_unit: STRING,
  reference_range_low: FLOAT,
  reference_range_high: FLOAT,
  is_abnormal: BOOLEAN,
  test_category: ENUM ('blood', 'urine', 'other'),
  confidence_score: FLOAT (0.0-10.0),
  created_at: TIMESTAMP,
  
  -- Indexes for performance
  INDEX idx_user_timeline (user_id, created_at DESC),
  INDEX idx_test_name (test_name),
  INDEX idx_abnormal_results (user_id, is_abnormal)
}
```

#### Vital Signs
```sql
vitals: {
  id: UUID (primary key),
  user_id: UUID (foreign key → users.id),
  serenya_content_id: UUID (foreign key → serenya_content.id),
  vital_type: ENUM ('blood_pressure', 'heart_rate', 'temperature', 'weight', 'height'),
  systolic_value: INTEGER,
  diastolic_value: INTEGER,
  numeric_value: FLOAT,
  unit: STRING,
  is_abnormal: BOOLEAN,
  confidence_score: FLOAT (0.0-10.0),
  created_at: TIMESTAMP,
  
  -- Indexes for performance  
  INDEX idx_user_vitals (user_id, vital_type, created_at DESC),
  INDEX idx_vital_timeline (user_id, created_at DESC)
}
```

### Data Relationships
```
users (1) ←→ (many) serenya_content
serenya_content (1) ←→ (many) lab_results
serenya_content (1) ←→ (many) vitals  
serenya_content (1) ←→ (many) chat_messages
```

### Data Flow & Workflow

**Single Server Round-Trip Process:**
1. **User uploads document** → sent to server
2. **Server processes everything** (OCR + extraction + AI analysis) in one operation
3. **Server returns complete package** with all UUIDs and relationships established:

```json
{
  "analysis": {
    "id": "uuid-123",
    "user_id": "user-uuid",
    "content_type": "result",
    "content": "Your glucose levels are normal...",
    "confidence_score": 8.5,
    "medical_flags": ["NORMAL_RESULTS"]
  },
  "lab_results": [
    {
      "id": "uuid-456",
      "user_id": "user-uuid", 
      "serenya_content_id": "uuid-123",
      "test_name": "Blood Glucose",
      "test_value": 95,
      "test_unit": "mg/dL",
      "reference_range_low": 70,
      "reference_range_high": 100,
      "is_abnormal": false,
      "confidence_score": 9.2
    }
  ],
  "vitals": [
    {
      "id": "uuid-789",
      "user_id": "user-uuid",
      "serenya_content_id": "uuid-123",
      "vital_type": "blood_pressure", 
      "systolic_value": 120,
      "diastolic_value": 80,
      "is_abnormal": false,
      "confidence_score": 8.8
    }
  ]
}
```

4. **Phone stores complete package locally** - no additional server calls needed

#### **Serenya Content (AI Analyses & Reports)**
```sql
serenya_content: {
  id: UUID (primary key, from server),
  user_id: UUID (foreign key → users.id),
  content_type: ENUM ('result', 'report'),
  title: STRING (AI-generated, constrained length/format),
  content: TEXT (markdown formatted AI response),
  confidence_score: FLOAT (0.0-10.0),
  medical_flags: JSON (AI-generated alerts array),
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
  
  -- Indexes for timeline queries
  INDEX idx_user_timeline (user_id, created_at DESC),
  INDEX idx_content_type (user_id, content_type)
}
```

**Content Types:**
- **`result`**: AI analysis of specific medical documents (free tier)
- **`report`**: Comprehensive reports derived from user's complete medical history (premium tier)

**Timeline Integration:** All timeline items come from this table, ordered by `created_at DESC`

#### **Chat Messages**
```sql
chat_messages: {
  id: UUID (primary key, from server),
  serenya_content_id: UUID (foreign key → serenya_content.id),
  sender: ENUM ('user', 'serenya'),
  message: TEXT (the actual message content),
  created_at: TIMESTAMP,
  
  -- Index for chat retrieval
  INDEX idx_content_messages (serenya_content_id, created_at ASC)
}
```

**Purpose:** Direct conversation messages linked to specific results or reports (no intermediate conversation table needed)

---

### **Server-Side Reference Data**

#### **Chat Options (Server-Side)**
```sql
chat_options: {
  id: UUID (primary key, server-generated),
  content_type: ENUM ('result', 'report'),
  category: STRING (grouping - e.g., 'explanation', 'doctor_prep', 'clarification'),
  option_text: TEXT (the suggested question/prompt),
  display_order: INTEGER (for consistent ordering in UI),
  is_active: BOOLEAN (enable/disable options without deletion),
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
  
  -- Indexes
  INDEX idx_content_type_active (content_type, is_active, display_order),
  INDEX idx_category (category)
}
```

**Purpose:** Reference data for predefined chat prompts/questions users can select from

**Example Options:**
- **Results**: "Can you explain this in simpler terms?", "What should I ask my doctor?"
- **Reports**: "How should I present this to my doctor?", "What are the key points?"

### Future Enhancement: FHIR Compliance
- **Phase 2**: Add FHIR resource columns to existing tables
- **Maintain**: Current normalized structure for performance
- **Enable**: Healthcare system integration and data export
- **Timeline**: After core functionality is complete and tested

---

## 4. Proposed Course of Action

### Phase 1: Schema Finalization (1 day)
- [x] ✅ **COMPLETED**: Medical data storage strategy (normalized tables)
- [ ] Complete remaining local device table definitions
- [ ] Finalize server-side tables with encryption requirements  
- [ ] Update Streamlined App Structure document with final schemas

### Phase 2: Security Architecture (2 days)
- [x] ✅ **COMPLETED**: Encryption strategy decisions (hybrid approach)
- [x] ✅ **COMPLETED**: Encryption key management strategy
- [x] ✅ **COMPLETED**: Biometric authentication integration points
- [x] ✅ **COMPLETED**: Complete all table schema definitions
- [x] ✅ **COMPLETED**: Classify tables by encryption approach (full vs field-level)
- [ ] Define audit logging table structures (server + local)

### Phase 3: Compliance Framework (1 day)
- [ ] Specify audit log retention and compliance policies
- [ ] Create security implementation guidelines
- [ ] Document GDPR/HIPAA compliance procedures
- [ ] Create data flow diagrams showing encryption/decryption points

---

## Current Questions & Decisions Needed

### Encryption Strategy Decisions
1. [x] ✅ **RESOLVED**: Hybrid approach (table-specific encryption decisions)
2. [x] ✅ **RESOLVED**: Key management strategy (multi-layered with biometric protection)
3. [x] ✅ **RESOLVED**: Biometric authentication (session-based with critical operation protection)
4. [x] ✅ **RESOLVED**: Table classification (see detailed classification above)

### Audit Logging Decisions  
1. **Storage Location**: Local only, server only, or hybrid approach?
2. **Retention Policy**: How long to keep audit logs?
3. **Transmission**: Real-time vs batch upload to server?

### Implementation Priority
1. **Next Focus**: Encryption strategy decisions (highest priority)
2. **Dependencies**: Encryption approach affects audit logging design
3. **Timeline**: ~4 days total for security architecture completion

---

## Next Steps

**Immediate Priorities (Next Session):**
1. **📋 Audit Logging**: Define comprehensive audit event structures  
2. **🔄 Schema Updates**: Add all final tables to Streamlined App Structure document
3. **📋 Implementation Guidelines**: Create security implementation documentation

**Completed This Session:**
- ✅ Medical data storage approach (normalized relational tables)
- ✅ Data workflow clarification (single server round-trip)
- ✅ Table relationship structure (serenya_content ←→ medical_data)
- ✅ **Encryption strategy** (hybrid approach based on table usage)
- ✅ **Key management strategy** (multi-layered with biometric protection)
- ✅ **Biometric authentication** (session-based with 15-minute inactivity timeout)
- ✅ **Table encryption classification** (9 tables classified: 3 full, 4 field-level, 2 none)
- ✅ Timeline vs medical data query pattern clarification

**This document will be updated as we work through each decision point and implementation phase.**

---

## References

- [FHIR R4 Specification](https://hl7.org/fhir/R4/)
- [GDPR Audit Requirements](https://gdpr.eu/article-30-records-processing-activities/)
- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/)
- [SQLCipher Documentation](https://www.zetetic.net/sqlcipher/)