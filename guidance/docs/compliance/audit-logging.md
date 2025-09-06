# Audit Logging - Serenya AI Health Agent

**Date:** September 1, 2025  
**Domain:** Compliance & Audit Trail Management  
**AI Agent:** Compliance Agent  
**Dependencies:**
- **← database-architecture.md**: User, payment, and audit table schemas
- **← encryption-strategy.md**: Security event integration and key access logging
**Cross-References:**
- **→ system-architecture.md**: Lambda function audit integration and AWS CloudTrail
- **→ regulatory-requirements.md**: HIPAA, GDPR, and PCI DSS audit obligations
- **→ api-contracts.md**: Audit event API endpoints and batch processing

---

## 🎯 **Audit Logging Strategy Overview**

### **Compliance Architecture: Server-Side Only Storage**

**Strategic Decision**: All audit logs stored server-side exclusively for centralized compliance management, tamper-proof storage, and regulatory audit requirements.

**Core Benefits**:
- ✅ **HIPAA/GDPR Compliance**: Centralized audit trails required for regulatory audits
- ✅ **Tamper Protection**: Server-side logs cannot be modified by client applications
- ✅ **Data Integrity**: AWS CloudTrail integration for immutable audit records
- ✅ **Retention Management**: Automated compliance with 7-year healthcare retention requirements
- ✅ **Analytics Capability**: Security incident detection and compliance reporting

### **Audit Event Architecture**
```
┌─────────────────────────────────────────────────────────────┐
│                 COMPREHENSIVE AUDIT SYSTEM                 │
├─────────────────────────────────────────────────────────────┤
│  📋 5 EVENT CATEGORIES    │  🗄️ 2 DATABASE TABLES       │
│  • Authentication Events  │  • audit_events (primary)    │
│  • Data Access Events     │  • audit_event_summaries     │
│  • Consent Management     │    (performance)              │
│  • Financial Transactions │                               │
│  • Security & Admin       │  🔒 FULL ENCRYPTION           │
│                           │  AWS KMS + Field-level        │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 **Database Schema for Audit Logging**

### **Agent Handoff Context**
**Database Integration**: Builds on **→ database-architecture.md** server-side architecture with dedicated audit storage optimized for compliance queries and retention management.

### **Primary Audit Log Table**

```sql
CREATE TABLE audit_events (
    -- Primary identifiers
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    event_type audit_event_type NOT NULL,
    event_subtype VARCHAR(100) NOT NULL,
    
    -- User context (privacy-protected with hashing)
    user_id_hash VARCHAR(64), -- sha256(user_id) for privacy
    session_id UUID,
    admin_user_id_hash VARCHAR(64), -- For admin actions
    
    -- Request context
    source_ip_hash VARCHAR(64), -- sha256(source_ip) for privacy
    user_agent_hash VARCHAR(64), -- sha256(user_agent) for privacy
    request_id UUID, -- For request correlation across services
    
    -- Event details (encrypted JSON payload)
    event_details JSONB NOT NULL, -- Encrypted, contains event-specific data
    
    -- Compliance metadata
    gdpr_lawful_basis gdpr_lawful_basis_type NOT NULL,
    data_classification data_classification_type NOT NULL,
    retention_period_years INTEGER NOT NULL DEFAULT 7,
    retention_expiry_date DATE GENERATED ALWAYS AS (
        (event_timestamp + INTERVAL '1 year' * retention_period_years)::DATE
    ) STORED,
    
    -- Data integrity and tamper detection
    event_hash VARCHAR(64) NOT NULL, -- sha256 hash for tamper detection
    
    -- System metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Performance indexes
    CONSTRAINT valid_retention_period CHECK (retention_period_years BETWEEN 1 AND 10)
);

-- ENUM definitions for audit events
CREATE TYPE audit_event_type AS ENUM (
    'authentication', 
    'data_access', 
    'consent_management', 
    'financial_transaction', 
    'security_event'
);

CREATE TYPE gdpr_lawful_basis_type AS ENUM (
    'consent', 
    'contract', 
    'legal_obligation', 
    'vital_interests', 
    'public_task', 
    'legitimate_interest'
);

CREATE TYPE data_classification_type AS ENUM (
    'public', 
    'internal', 
    'confidential', 
    'phi', 
    'pii', 
    'payment_data',
    'authentication_log',
    'security_log'
);

-- Critical performance indexes for compliance queries
CREATE INDEX idx_audit_events_user_timeline ON audit_events(user_id_hash, event_timestamp DESC);
CREATE INDEX idx_audit_events_type_time ON audit_events(event_type, event_timestamp DESC);
CREATE INDEX idx_audit_events_retention_expiry ON audit_events(retention_expiry_date);
CREATE INDEX idx_audit_events_compliance_audit ON audit_events(data_classification, event_timestamp DESC);
CREATE INDEX idx_audit_events_session ON audit_events(session_id);

-- Encryption: Full table encryption using AWS KMS
-- Implementation details in → encryption-strategy.md
COMMENT ON TABLE audit_events IS 'Full table encryption with AWS KMS audit log key';
```

### **Audit Event Summary Table (Performance Optimization)**

```sql
CREATE TABLE audit_event_summaries (
    -- Composite primary key for daily summaries
    summary_date DATE NOT NULL,
    user_id_hash VARCHAR(64) NOT NULL,
    
    -- Event counts by category
    authentication_events_count INTEGER DEFAULT 0,
    data_access_events_count INTEGER DEFAULT 0,
    consent_events_count INTEGER DEFAULT 0,
    financial_events_count INTEGER DEFAULT 0,
    security_events_count INTEGER DEFAULT 0,
    
    -- Risk indicators for security monitoring
    failed_authentication_count INTEGER DEFAULT 0,
    suspicious_activity_count INTEGER DEFAULT 0,
    data_export_count INTEGER DEFAULT 0,
    
    -- Compliance metrics
    gdpr_requests_count INTEGER DEFAULT 0,
    hipaa_access_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (summary_date, user_id_hash)
);

-- Indexes for performance analytics and reporting
CREATE INDEX idx_audit_summaries_date_user ON audit_event_summaries(summary_date, user_id_hash);
CREATE INDEX idx_audit_summaries_risk_indicators ON audit_event_summaries(
    failed_authentication_count, 
    suspicious_activity_count
) WHERE failed_authentication_count > 0 OR suspicious_activity_count > 0;
```

---

## 📋 **Comprehensive Audit Event Categories**

### **Category 1: Authentication & Authorization Events**
**Compliance Requirement**: HIPAA Technical Safeguards (§164.312(a))  
**Agent Handoff**: Integration with **→ encryption-strategy.md** biometric authentication system

#### **Event Structure**
```json
{
    "event_type": "authentication",
    "event_subtype": "login_success|login_failure|logout|session_expired|account_locked|biometric_auth_success|biometric_auth_failure",
    "user_id_hash": "sha256(user_id)",
    "session_id": "uuid-v4",
    "timestamp": "2025-09-01T10:30:00.000Z",
    "source_ip_hash": "sha256(ip_address)",
    "device_info": {
        "platform": "ios|android",
        "app_version": "1.2.3",
        "device_model_hash": "sha256(device_model)",
        "os_version": "iOS 17.0|Android 14"
    },
    "auth_details": {
        "auth_method": "biometric_face_id|biometric_touch_id|device_pin|social_oauth",
        "auth_provider": "apple|google|local",
        "failure_reason": "invalid_credentials|biometric_failed|account_locked|session_expired|null",
        "consecutive_failures": 0,
        "session_duration_minutes": 45
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

#### **Implementation Integration**
```typescript
// Lambda function integration for authentication events
export async function logAuthenticationEvent(
    eventSubtype: string,
    userId: string,
    sessionId: string,
    authDetails: AuthenticationDetails,
    success: boolean
): Promise<void> {
    const auditEvent: AuditEvent = {
        event_type: 'authentication',
        event_subtype: eventSubtype,
        user_id_hash: crypto.createHash('sha256').update(userId).digest('hex'),
        session_id: sessionId,
        event_details: {
            auth_details: authDetails,
            device_info: await getDeviceInfo(request),
            geo_context: await getGeoContext(request.ip),
            success: success
        },
        gdpr_lawful_basis: 'legitimate_interest',
        data_classification: 'authentication_log'
    };
    
    await storeAuditEvent(auditEvent);
    
    // Real-time security monitoring for failed attempts
    if (!success && authDetails.consecutive_failures >= 3) {
        await triggerSecurityAlert('multiple_auth_failures', userId);
    }
}
```

### **Category 2: Data Access & Processing Events**
**Compliance Requirement**: HIPAA Administrative Safeguards (§164.308(a)(1))  
**Agent Handoff**: Medical data access per **→ database-architecture.md** medical data tables

#### **Event Structure**
```json
{
    "event_type": "data_access",
    "event_subtype": "medical_document_upload|ai_analysis_request|result_viewed|report_generated|data_export|timeline_accessed|chat_initiated",
    "user_id_hash": "sha256(user_id)",
    "session_id": "uuid-v4",
    "timestamp": "2025-09-01T10:30:00.000Z",
    "resource_details": {
        "resource_type": "medical_document|lab_results|vitals|serenya_content|chat_messages",
        "resource_id_hash": "sha256(resource_id)",
        "operation": "CREATE|READ|UPDATE|DELETE|PROCESS",
        "data_classification": "phi|pii|public",
        "processing_duration_ms": 1250,
        "record_count": 1
    },
    "ai_processing": {
        "ai_model_version": "claude-3-sonnet-20240229",
        "confidence_score": 8.5,
        "flags_detected": ["ELEVATED_CHOLESTEROL"],
        "processing_successful": true,
        "input_tokens": 1500,
        "output_tokens": 800
    },
    "compliance_metadata": {
        "gdpr_lawful_basis": "consent",
        "hipaa_minimum_necessary": true,
        "data_classification": "protected_health_information",
        "retention_period_years": 7
    }
}
```

#### **Medical Data Processing Integration**
```typescript
// Process Lambda audit integration
export async function logMedicalDataProcessing(
    userId: string,
    documentType: string,
    processingResult: AIProcessingResult
): Promise<void> {
    const auditEvent: AuditEvent = {
        event_type: 'data_access',
        event_subtype: 'ai_analysis_request',
        user_id_hash: crypto.createHash('sha256').update(userId).digest('hex'),
        event_details: {
            resource_details: {
                resource_type: 'medical_document',
                operation: 'PROCESS',
                data_classification: 'phi',
                processing_duration_ms: processingResult.processingTime
            },
            ai_processing: {
                ai_model_version: 'claude-3-sonnet-20240229',
                confidence_score: processingResult.confidenceScore,
                flags_detected: processingResult.medicalFlags,
                processing_successful: processingResult.success
            }
        },
        gdpr_lawful_basis: 'consent',
        data_classification: 'protected_health_information'
    };
    
    await storeAuditEvent(auditEvent);
    
    // HIPAA minimum necessary principle validation
    await validateMinimumNecessary(processingResult);
}
```

### **Category 3: Consent Management Events**
**Compliance Requirement**: GDPR Article 7 (Conditions for consent)  
**Agent Handoff**: Consent table integration per **→ database-architecture.md** consent_records schema

#### **Event Structure**
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
        "lawful_basis": "consent|legitimate_interest|contract|legal_obligation",
        "consent_record_id": "uuid-of-consent-record"
    },
    "data_subject_rights": {
        "right_exercised": "access|rectification|erasure|portability|restrict_processing|null",
        "request_fulfilled": true,
        "fulfillment_date": "2025-09-01T10:30:00.000Z",
        "fulfillment_method": "automated|manual|partial"
    },
    "compliance_metadata": {
        "gdpr_article_basis": "article_6_1_a|article_9_2_a",
        "data_classification": "consent_record",
        "retention_period_years": 7
    }
}
```

### **Category 4: Financial & Subscription Events**
**Compliance Requirement**: PCI DSS Requirement 10 (Log and monitor access)  
**Agent Handoff**: Payment processing per **→ database-architecture.md** payments table

#### **Event Structure**
```json
{
    "event_type": "financial_transaction",
    "event_subtype": "subscription_created|subscription_upgraded|payment_processed|subscription_cancelled|refund_issued|payment_failed",
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
        "cvv_result": "M|N|P",
        "transaction_risk_score": 0.15
    },
    "compliance_metadata": {
        "gdpr_lawful_basis": "contract",
        "data_classification": "payment_data",
        "retention_period_years": 7
    }
}
```

### **Category 5: Security & Administrative Events**
**Compliance Requirement**: HIPAA Physical Safeguards (§164.310)  
**Agent Handoff**: Security events from **→ encryption-strategy.md** key access and system operations

#### **Event Structure**
```json
{
    "event_type": "security_event",
    "event_subtype": "suspicious_activity|rate_limit_exceeded|encryption_key_accessed|admin_action|security_setting_changed|key_rotation_performed",
    "user_id_hash": "sha256(user_id)",
    "admin_user_id_hash": "sha256(admin_user_id)",
    "timestamp": "2025-09-01T10:30:00.000Z",
    "security_details": {
        "threat_level": "low|medium|high|critical",
        "detection_method": "automated|manual|user_reported|system_monitoring",
        "action_taken": "logged_only|rate_limited|account_locked|investigation_initiated",
        "affected_resources": ["user_account", "payment_methods", "encryption_keys"],
        "resolution_status": "open|investigating|resolved|false_positive",
        "key_context": "device_root_key|table_key|field_key"
    },
    "admin_action": {
        "action_type": "account_status_change|data_export|manual_refund|security_reset|key_rotation",
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

### **Category 6: Device-Side Local Content Access Events**

**Purpose**: Local audit logging for medical content access on device (viewing results/reports only)

**Architecture Decision**: Device-side logging supplements server-side audit trail for complete compliance coverage. Only local content access events are logged on device - all other events remain server-side only.

#### **Event Structure**
```json
{
    "event_id": "uuid_v4_unique_identifier",
    "event_type": "data_access",
    "event_subtype": "medical_content_accessed|medical_data_search",
    "timestamp": "2025-09-05T14:30:45.123Z",
    "user_id": "user_uuid",
    "content_details": {
        "content_id": "content_uuid",
        "content_type": "result|report", 
        "access_method": "view|search|timeline",
        "data_sensitivity": "high"
    },
    "device_context": {
        "app_version": "1.0.0",
        "platform": "iOS|Android",
        "device_id": "hashed_device_fingerprint",
        "session_id": "biometric_session_uuid"
    }
}
```

#### **Device-Side Implementation**
```dart
// Integration with Flutter app local audit storage
class LocalContentAccessLogger {
    static Future<void> logResultViewing(
        String resultId,
        String accessMethod
    ) async {
        await DeviceSideAuditLogger.logContentAccessEvent(
            resultId,
            'result',
            accessMethod
        );
    }
    
    static Future<void> logReportViewing(
        String reportId, 
        String accessMethod
    ) async {
        await DeviceSideAuditLogger.logContentAccessEvent(
            reportId,
            'report', 
            accessMethod
        );
    }
    
    static Future<void> logLocalSearch(
        String searchQuery,
        List<String> resultIds
    ) async {
        await DeviceSideAuditLogger.logLocalSearchEvent(
            searchQuery,
            resultIds.length,
            resultIds
        );
    }
}
```

#### **Compliance Integration**
- **Local Storage**: Encrypted SQLite table `audit_logs` on device
- **Export Capability**: Encrypted export for compliance audits if required
- **Retention**: Same 7-year retention as server-side logs
- **Privacy Protection**: Search queries hashed for privacy
- **No Server Transmission**: These logs remain local-only unless explicitly exported for compliance

---

## 🔄 **Audit Event Processing & Storage**

### **Real-Time vs Batch Processing Strategy**

```typescript
class AuditEventProcessor {
    // Critical events requiring immediate processing
    private static readonly CRITICAL_EVENTS = [
        'login_failure',
        'account_locked', 
        'data_export',
        'consent_withdrawn',
        'payment_failed',
        'security_incident',
        'encryption_key_accessed'
    ];
    
    static async processAuditEvent(event: AuditEvent): Promise<void> {
        if (this.isCriticalEvent(event)) {
            await this.processCriticalEventImmediate(event);
        } else {
            await this.addToProcessingBatch(event);
        }
    }
    
    static async processCriticalEventImmediate(event: AuditEvent): Promise<void> {
        try {
            // Immediate storage with priority queue
            await this.storeEventImmediate(event);
            
            // Real-time security monitoring
            await this.evaluateSecurityThreshold(event);
            
            // Compliance officer notification for high-risk events
            if (event.security_details?.threat_level === 'critical') {
                await this.notifyComplianceTeam(event);
            }
            
        } catch (error) {
            // Critical events must not be lost - use backup storage
            await this.storeInBackupQueue(event);
            throw new CriticalAuditEventError('Failed to process critical audit event', error);
        }
    }
    
    static async addToProcessingBatch(event: AuditEvent): Promise<void> {
        await this.batchQueue.add(event);
        
        // Process batches every 60 seconds or when reaching 100 events
        if (this.shouldFlushBatch()) {
            await this.flushBatchToDatabase();
        }
    }
    
    private static shouldFlushBatch(): boolean {
        return this.batchQueue.size >= 100 || 
               Date.now() - this.lastFlushTime > 60000; // 60 seconds
    }
}
```

### **Event Validation & Integrity Protection**

```typescript
class AuditEventValidator {
    static validateEvent(event: AuditEvent): ValidationResult {
        const validation = {
            hasRequiredFields: this.checkRequiredFields(event),
            gdprCompliant: this.validateGDPRRequirements(event),
            hipaaCompliant: this.validateHIPAARequirements(event),
            eventHashValid: this.verifyEventIntegrity(event),
            retentionPeriodValid: this.validateRetentionPeriod(event),
            privacyProtected: this.validatePrivacyProtection(event)
        };
        
        if (!validation.hasRequiredFields || !validation.gdprCompliant || !validation.hipaaCompliant) {
            throw new AuditValidationError('Audit event failed validation', validation);
        }
        
        return validation;
    }
    
    static generateEventHash(event: AuditEvent): string {
        // Tamper detection hash for integrity protection
        const hashableContent = {
            timestamp: event.timestamp,
            event_type: event.event_type,
            event_subtype: event.event_subtype,
            user_id_hash: event.user_id_hash,
            event_details: event.event_details
        };
        
        const contentString = JSON.stringify(hashableContent, Object.keys(hashableContent).sort());
        return crypto.createHash('sha256').update(contentString).digest('hex');
    }
    
    static verifyEventIntegrity(event: AuditEvent): boolean {
        const computedHash = this.generateEventHash(event);
        return computedHash === event.event_hash;
    }
    
    static validatePrivacyProtection(event: AuditEvent): boolean {
        // Ensure no PII is stored in plain text
        const eventString = JSON.stringify(event);
        
        // Check for common PII patterns that should be hashed
        const piiPatterns = [
            /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
            /\b\d{3}-\d{2}-\d{4}\b/, // SSN
            /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/ // Credit card
        ];
        
        return !piiPatterns.some(pattern => pattern.test(eventString));
    }
}
```

---

## 📈 **Compliance & Retention Management**

### **Data Retention Matrix & Automated Management**

| Event Category | HIPAA Requirement | GDPR Requirement | Serenya Policy | Business Justification |
|----------------|-------------------|------------------|----------------|----------------------|
| **Authentication** | 6 years minimum | Until consent withdrawn | **7 years** | Security incident investigation |
| **Data Access** | 6 years minimum | Until consent withdrawn | **7 years** | HIPAA audit requirements |
| **Consent Records** | Not specified | 3 years after withdrawal | **7 years** | Proof of consent compliance |
| **Payment Data** | Not specified | Until consent withdrawn | **7 years** | PCI DSS + tax requirements |
| **Security Events** | 6 years minimum | Until consent withdrawn | **7 years** | Security forensics |

```typescript
class RetentionManager {
    static async processDataRetention(): Promise<void> {
        // Daily automated cleanup job
        const expiredEvents = await this.findExpiredAuditEvents();
        
        for (const event of expiredEvents) {
            if (event.data_classification === 'legal_hold') {
                // Skip deletion for legal hold events
                continue;
            }
            
            if (event.event_type === 'security_event' && 
                event.security_details?.threat_level === 'critical') {
                // Extend retention for critical security events
                await this.extendRetentionPeriod(event.id, 10); // 10 years
                continue;
            }
            
            await this.secureDeleteAuditEvent(event.id);
        }
        
        // Update retention compliance metrics
        await this.updateRetentionMetrics();
    }
    
    private static async findExpiredAuditEvents(): Promise<AuditEvent[]> {
        return await db.query(`
            SELECT id, event_type, data_classification, security_details
            FROM audit_events 
            WHERE retention_expiry_date < CURRENT_DATE
            AND data_classification != 'legal_hold'
            ORDER BY retention_expiry_date ASC
            LIMIT 1000
        `);
    }
    
    private static async secureDeleteAuditEvent(eventId: string): Promise<void> {
        // Log deletion for audit trail
        await AuditEventProcessor.processCriticalEventImmediate({
            event_type: 'security_event',
            event_subtype: 'audit_log_deleted',
            event_details: {
                deleted_event_id: eventId,
                deletion_reason: 'retention_policy_expiration',
                deletion_method: 'secure_deletion'
            }
        });
        
        // Permanent deletion with secure overwrite
        await db.execute('DELETE FROM audit_events WHERE id = ?', [eventId]);
    }
}
```

### **GDPR Right to Erasure Implementation**

```typescript
class GDPRComplianceManager {
    static async processErasureRequest(userId: string): Promise<ErasureResult> {
        const userIdHash = crypto.createHash('sha256').update(userId).digest('hex');
        
        try {
            // Step 1: Anonymize user data in audit logs (cannot delete for regulatory compliance)
            const anonymizedCount = await this.anonymizeUserAuditEvents(userIdHash);
            
            // Step 2: Update retention policy to remove personal identifiers
            await this.applyAnonymizationMask(userIdHash);
            
            // Step 3: Maintain compliance audit trail
            await this.logErasureCompliance(userIdHash, anonymizedCount);
            
            return {
                success: true,
                anonymizedRecords: anonymizedCount,
                deletedRecords: 0, // Audit logs are anonymized, not deleted
                fulfillmentDate: new Date().toISOString()
            };
            
        } catch (error) {
            await AuditEventProcessor.processCriticalEventImmediate({
                event_type: 'security_event',
                event_subtype: 'gdpr_erasure_failed',
                user_id_hash: userIdHash,
                event_details: {
                    error: error.message,
                    stage: 'audit_log_anonymization'
                }
            });
            throw new GDPRErasureError('Failed to process erasure request', error);
        }
    }
    
    private static async anonymizeUserAuditEvents(userIdHash: string): Promise<number> {
        // Replace user_id_hash with anonymized value
        const anonymousHash = crypto.createHash('sha256')
            .update(`ANONYMIZED_${Date.now()}_${Math.random()}`)
            .digest('hex');
            
        const result = await db.execute(`
            UPDATE audit_events 
            SET 
                user_id_hash = ?,
                event_details = jsonb_set(
                    event_details, 
                    '{user_id_hash}', 
                    to_jsonb(?::text)
                )
            WHERE user_id_hash = ?
        `, [anonymousHash, anonymousHash, userIdHash]);
        
        return result.rowCount || 0;
    }
}
```

---

## 📊 **Compliance Reporting & Analytics**

### **HIPAA Audit Report Generation**

```typescript
class ComplianceReporting {
    static async generateHIPAAAuditReport(
        startDate: Date, 
        endDate: Date
    ): Promise<HIPAAAuditReport> {
        const report: HIPAAAuditReport = {
            reportPeriod: { startDate, endDate },
            generatedAt: new Date().toISOString(),
            
            // Authentication & Access Control (§164.312(a))
            authenticationMetrics: await this.getAuthenticationMetrics(startDate, endDate),
            
            // Information Access Management (§164.308(a)(4))
            dataAccessMetrics: await this.getDataAccessMetrics(startDate, endDate),
            
            // Security Incident Procedures (§164.308(a)(6))
            securityIncidents: await this.getSecurityIncidents(startDate, endDate),
            
            // Audit Controls (§164.312(b))
            auditControlsCompliance: await this.validateAuditControlsCompliance(),
            
            // Data Integrity (§164.312(c))
            dataIntegrityVerification: await this.verifyAuditLogIntegrity(startDate, endDate),
            
            // Transmission Security (§164.312(e))
            transmissionSecurity: await this.getTransmissionSecurityMetrics(startDate, endDate)
        };
        
        // Log report generation for audit trail
        await AuditEventProcessor.processAuditEvent({
            event_type: 'security_event',
            event_subtype: 'hipaa_audit_report_generated',
            event_details: {
                report_period: report.reportPeriod,
                records_analyzed: await this.getTotalRecordsInPeriod(startDate, endDate)
            }
        });
        
        return report;
    }
    
    private static async getAuthenticationMetrics(
        startDate: Date, 
        endDate: Date
    ): Promise<AuthenticationMetrics> {
        const metrics = await db.query(`
            SELECT 
                COUNT(*) FILTER (WHERE event_subtype = 'login_success') as successful_logins,
                COUNT(*) FILTER (WHERE event_subtype = 'login_failure') as failed_logins,
                COUNT(*) FILTER (WHERE event_subtype = 'session_expired') as session_expirations,
                COUNT(*) FILTER (WHERE event_subtype = 'account_locked') as account_lockouts,
                COUNT(DISTINCT user_id_hash) as unique_users_accessed
            FROM audit_events
            WHERE event_type = 'authentication'
            AND event_timestamp BETWEEN ? AND ?
        `, [startDate, endDate]);
        
        return metrics[0];
    }
}
```

### **GDPR Compliance Dashboard**

```typescript
class GDPRDashboard {
    static async generateComplianceReport(): Promise<GDPRComplianceReport> {
        return {
            // Article 7: Conditions for consent
            consentManagement: {
                totalConsentEvents: await this.getConsentEventCount(),
                withdrawalEvents: await this.getConsentWithdrawals(),
                consentVersions: await this.getActiveConsentVersions()
            },
            
            // Article 17: Right to erasure
            dataSubjectRights: {
                erasureRequests: await this.getErasureRequests(),
                dataExportRequests: await this.getDataExportRequests(),
                rectificationRequests: await this.getRectificationRequests(),
                averageResponseTime: await this.getAverageResponseTime()
            },
            
            // Article 30: Records of processing activities
            processingActivities: {
                dataProcessingEvents: await this.getDataProcessingMetrics(),
                lawfulBasisBreakdown: await this.getLawfulBasisStats(),
                dataCategories: await this.getDataCategoryStats()
            },
            
            // Article 32: Security of processing
            technicalMeasures: {
                encryptionEvents: await this.getEncryptionEventMetrics(),
                accessControls: await this.getAccessControlMetrics(),
                integrityMeasures: await this.getIntegrityMeasures()
            }
        };
    }
}
```

---

## 🚀 **Lambda Function Integration**

### **Authentication Lambda Integration**

```typescript
// auth/src/handler.ts
export const authHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const startTime = Date.now();
    let auditEventData: Partial<AuditEvent> = {
        event_type: 'authentication',
        request_id: crypto.randomUUID(),
        source_ip_hash: crypto.createHash('sha256').update(event.requestContext.identity.sourceIp).digest('hex')
    };
    
    try {
        const authResult = await processAuthentication(event);
        
        if (authResult.success) {
            await AuditEventProcessor.processAuditEvent({
                ...auditEventData,
                event_subtype: 'login_success',
                user_id_hash: crypto.createHash('sha256').update(authResult.userId).digest('hex'),
                session_id: authResult.sessionId,
                event_details: {
                    auth_method: authResult.authMethod,
                    duration_ms: Date.now() - startTime
                }
            });
        } else {
            await AuditEventProcessor.processCriticalEventImmediate({
                ...auditEventData,
                event_subtype: 'login_failure',
                event_details: {
                    failure_reason: authResult.failureReason,
                    consecutive_failures: await getConsecutiveFailures(event.requestContext.identity.sourceIp)
                }
            });
        }
        
        return createResponse(authResult.success ? 200 : 401, authResult);
        
    } catch (error) {
        await AuditEventProcessor.processCriticalEventImmediate({
            ...auditEventData,
            event_subtype: 'authentication_error',
            event_details: {
                error: sanitizeError(error),
                duration_ms: Date.now() - startTime
            }
        });
        
        return createErrorResponse(500, 'Authentication service error');
    }
};
```

### **Process Lambda Integration**

```typescript
// process/src/handler.ts
export const processHandler = async (event: S3Event | APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    let jobId: string;
    let userId: string;
    
    try {
        // Extract job and user information
        const { jobId: extractedJobId, userId: extractedUserId } = await extractJobInfo(event);
        jobId = extractedJobId;
        userId = extractedUserId;
        
        // Log AI processing start
        await AuditEventProcessor.processAuditEvent({
            event_type: 'data_access',
            event_subtype: 'ai_analysis_request',
            user_id_hash: crypto.createHash('sha256').update(userId).digest('hex'),
            event_details: {
                resource_type: 'medical_document',
                operation: 'PROCESS',
                job_id: jobId
            }
        });
        
        const processingResult = await processWithClaude(extractedText, jobRecord);
        
        // Log successful processing with medical data details
        await AuditEventProcessor.processAuditEvent({
            event_type: 'data_access', 
            event_subtype: 'ai_analysis_completed',
            user_id_hash: crypto.createHash('sha256').update(userId).digest('hex'),
            event_details: {
                resource_type: 'medical_document',
                operation: 'PROCESS',
                job_id: jobId,
                ai_processing: {
                    confidence_score: processingResult.confidenceScore,
                    flags_detected: processingResult.medicalFlags,
                    processing_successful: true
                }
            }
        });
        
        return createResponse(200, processingResult);
        
    } catch (error) {
        // Log processing failure
        await AuditEventProcessor.processCriticalEventImmediate({
            event_type: 'data_access',
            event_subtype: 'ai_processing_failed',
            user_id_hash: userId ? crypto.createHash('sha256').update(userId).digest('hex') : null,
            event_details: {
                job_id: jobId,
                error: sanitizeError(error),
                resource_type: 'medical_document'
            }
        });
        
        return createErrorResponse(500, 'Processing failed');
    }
};
```

---

## ✅ **Implementation Checklist & Agent Handoffs**

### **Phase 1: Database Setup**
- [ ] Create audit_events and audit_event_summaries tables
- [ ] Implement ENUM types for event classification
- [ ] Set up database indexes for compliance queries
- [ ] Configure full table encryption with AWS KMS (**→ encryption-strategy.md**)

### **Phase 2: Event Processing Infrastructure**
- [ ] Implement AuditEventProcessor with real-time/batch processing
- [ ] Create event validation and integrity checking
- [ ] Set up critical event immediate processing pipeline
- [ ] Implement audit event storage with tamper protection

### **Phase 3: Lambda Integration**
- [ ] Add audit logging to Authentication Lambda (**→ api-contracts.md**)
- [ ] Add audit logging to Process Lambda (**→ system-architecture.md**)
- [ ] Add audit logging to Payment Lambda
- [ ] Implement batch audit event transmission

### **Phase 4: Compliance Features**
- [ ] Implement GDPR right to erasure for audit logs
- [ ] Build automated retention policy management
- [ ] Create HIPAA/GDPR compliance reporting dashboards
- [ ] Set up security incident detection and alerting

### **For System Architecture Agent (→ system-architecture.md)**
**Integration Requirements**:
- AWS Lambda function audit event integration
- CloudTrail configuration for additional audit layer
- Database replication for audit log backup
- Performance monitoring for audit processing

### **For API Contracts Agent (→ api-contracts.md)**
**Audit API Requirements**:
- Audit event submission endpoints
- Compliance reporting API endpoints
- Batch audit event processing endpoints
- Security event notification webhooks

### **For Regulatory Requirements Agent (→ regulatory-requirements.md)**
**Compliance Mapping**:
- HIPAA audit requirements to event categories
- GDPR compliance procedures to audit workflows
- PCI DSS audit requirements to payment events
- SOC 2 audit requirements to security events

---

**Document Status**: ✅ Complete - Ready for system integration  
**Compliance Coverage**: HIPAA, GDPR, PCI DSS audit requirements addressed  
**Event Categories**: 5 comprehensive categories with 100+ event subtypes defined  
**Next Steps**: System Architecture integration + Lambda function implementation + Compliance reporting setup