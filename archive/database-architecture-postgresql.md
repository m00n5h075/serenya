# Database Architecture - Serenya AI Health Agent

**Date:** September 4, 2025 (Updated)  
**Domain:** Data Design & Database Management  
**AI Agent:** Database Design Agent  
**Dependencies:** None (foundational document)  
**Cross-References:** 
- **→ encryption-strategy.md**: Table encryption requirements and key management
- **→ api-contracts.md**: Data schemas for API endpoints
- **→ audit-logging.md**: Audit event database schemas
- **→ system-architecture.md**: Infrastructure and deployment considerations

---

## 🎯 **Database Strategy Overview**

### **Core Architecture Principles**
- **UUIDs for all primary keys**: Server-generated UUIDs used as primary keys and foreign keys
- **No persistent document storage**: Documents processed temporarily via S3, then deleted - only extracted medical data persists
- **Privacy-first architecture**: Complete medical data stored locally on device after processing
- **Minimal server storage**: Only authentication, consent, and reference data on server - NO medical data tables (serenya_content, lab_results, vitals, chat_messages) on server
- **Hybrid ENUM management**: Database-level constraints + code-level constants + documentation
- **Temporary S3 processing**: Original files and AI results stored temporarily in S3 during asynchronous processing

### **Storage Distribution**
```
┌─────────────────────────┐    ┌─────────────────────────┐
│      SERVER-SIDE        │    │    LOCAL DEVICE         │
│   (Compliance & Auth)   │    │  (Complete User Data)   │
├─────────────────────────┤    ├─────────────────────────┤
│ • User profiles         │    │ • Lab results           │
│ • Consent records       │    │ • Vital signs           │
│ • Subscription data     │    │ • AI analyses           │
│ • Payment transactions  │    │ • Chat conversations    │
│ • Chat options (ref)    │    │ • Timeline history      │
│ • Audit logs           │    │ • Search indexes        │
└─────────────────────────┘    └─────────────────────────┘
```

### **Document Processing Data Flow**
```
1. Document Upload → S3 Temporary Storage
   └─ s3://serenya-temp-processing/jobs/{job_id}_original

2. AI Processing → S3 Results Storage  
   └─ s3://serenya-temp-processing/results/{job_id}.json

3. Client Polling → API Response Transformation
   └─ S3 data → Encrypted API chunks → Local device storage

4. Local Storage Population → S3 Cleanup
   └─ serenya_content, lab_results, vitals tables populated
   └─ S3 files deleted (or auto-expire in 2 days)
```

**Key Points:**
- **No server-side jobs table**: Job tracking via job_id format (`{user_id}_{timestamp}_{random}`)
- **Temporary S3 storage only**: Files exist only during processing and polling
- **Final storage on device**: All medical data ends up in local SQLite database
- **Automatic cleanup**: S3 lifecycle policy removes files older than 2 days

---

## 📊 **ENUM Definitions**

### **Database ENUM Types**
```sql
-- Authentication & User Management
CREATE TYPE auth_provider_type AS ENUM ('google', 'apple', 'facebook');
CREATE TYPE account_status_type AS ENUM ('active', 'suspended', 'deactivated', 'deleted');
CREATE TYPE device_status_type AS ENUM ('active', 'inactive', 'revoked');
CREATE TYPE biometric_type AS ENUM ('fingerprint', 'face', 'voice');
CREATE TYPE session_status_type AS ENUM ('active', 'expired', 'revoked');

-- Legal Compliance (5 consent types for onboarding)
-- UI Implementation: 2 bundled checkboxes map to these 5 consent types
-- Checkbox 1 -> terms_of_service, privacy_policy, healthcare_consultation
-- Checkbox 2 -> medical_disclaimer, emergency_care_limitation
CREATE TYPE consent_type AS ENUM (
  'terms_of_service', 
  'privacy_policy', 
  'medical_disclaimer', 
  'healthcare_consultation', 
  'emergency_care_limitation'
);

-- Subscription & Payments
CREATE TYPE subscription_status_type AS ENUM ('active', 'expired', 'cancelled', 'pending');
CREATE TYPE subscription_type AS ENUM ('monthly', 'yearly');
CREATE TYPE payment_provider_type AS ENUM ('apple', 'google', 'stripe');
CREATE TYPE payment_status_type AS ENUM ('pending', 'completed', 'failed', 'refunded', 'disputed');

-- Content & Processing (Local Device)
CREATE TYPE content_type AS ENUM ('result', 'report');
CREATE TYPE message_sender_type AS ENUM ('user', 'serenya');

-- Medical Data Categories (Local Device)
CREATE TYPE test_category_type AS ENUM ('blood', 'urine', 'imaging', 'other');
CREATE TYPE vital_type AS ENUM ('blood_pressure', 'heart_rate', 'temperature', 'weight', 'height', 'oxygen_saturation');

-- Chat & UI (Both Server & Local)
CREATE TYPE chat_category_type AS ENUM ('explanation', 'doctor_prep', 'clarification', 'general');
```

### **ENUM Value Descriptions**

**Account Status:**
- `active`: Normal functioning account
- `suspended`: Temporarily disabled (admin action, policy violations)
- `deactivated`: User-initiated deactivation (can be reactivated)
- `deleted`: Permanent deletion (GDPR/user request)

**Subscription Status:**
- `active`: Current subscription with valid billing
- `expired`: Subscription period ended, grace period may apply
- `cancelled`: User cancelled, access until period end
- `pending`: New subscription awaiting payment confirmation

**Payment Status:**
- `pending`: Payment initiated but not confirmed
- `completed`: Successful payment processed
- `failed`: Payment attempt unsuccessful
- `refunded`: Payment reversed to customer
- `disputed`: Payment under dispute/chargeback

**Content Type:**
- `result`: AI analysis of specific medical documents/data (free tier)
- `report`: Comprehensive reports derived from complete medical history (premium tier)

**Vital Types:**
- `blood_pressure`: Systolic/diastolic measurements
- `heart_rate`: Beats per minute
- `temperature`: Body temperature in Celsius/Fahrenheit
- `weight`: Body weight in kg/lbs
- `height`: Body height in cm/inches
- `oxygen_saturation`: SpO2 percentage

---

## 🖥️ **Server-Side Database Schema**

### **Data Flow Context**
**Agent Handoff Note**: Server-side tables support the single-server-round-trip workflow defined in **→ system-architecture.md**. Authentication data flows to **→ encryption-strategy.md** for biometric session management.

### **`users` Table**
```sql
CREATE TABLE users (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255) NOT NULL,  -- Provider's user ID (e.g., Google 'sub')
    auth_provider auth_provider_type NOT NULL,
    
    -- Profile information  
    email VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    name VARCHAR(255) NOT NULL,         -- Full display name
    given_name VARCHAR(255),            -- First name
    family_name VARCHAR(255),           -- Last name
    
    -- Account management
    account_status account_status_type DEFAULT 'active',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE,
    deactivated_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT unique_external_provider UNIQUE (external_id, auth_provider)
);

-- Indexes for performance
CREATE INDEX idx_users_external_id ON users(external_id);
CREATE INDEX idx_users_auth_provider ON users(auth_provider);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_account_status ON users(account_status);
```

**Encryption Requirements**: See **→ encryption-strategy.md** for field-level encryption of `email, name, given_name, family_name`

### **`consent_records` Table**
```sql
CREATE TABLE consent_records (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Consent details
    consent_type consent_type NOT NULL,
    consent_given BOOLEAN NOT NULL,
    consent_version VARCHAR(50) NOT NULL,    -- e.g., "v2.1.0"
    
    -- Bundled consent tracking (UI -> Database mapping)
    consent_method VARCHAR(20) DEFAULT 'bundled_consent',  -- 'bundled_consent' | 'granular_consent'
    ui_checkbox_group INTEGER,                             -- 1 or 2 (which checkbox collected this consent)
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    withdrawn_at TIMESTAMP WITH TIME ZONE,   -- NULL when consent is active
    
    -- Constraints: One record per consent type per user
    CONSTRAINT unique_user_consent_type UNIQUE (user_id, consent_type)
);

-- Indexes for compliance queries
CREATE INDEX idx_consent_user_id ON consent_records(user_id);
CREATE INDEX idx_consent_type ON consent_records(consent_type);
CREATE INDEX idx_consent_withdrawn ON consent_records(withdrawn_at);
```

**Purpose**: Legal compliance tracking - exactly 3 records per user during onboarding (medical_disclaimers, terms_of_service, privacy_policy)

### **`subscriptions` Table**
```sql
CREATE TABLE subscriptions (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Subscription details
    subscription_status subscription_status_type DEFAULT 'pending',
    subscription_type subscription_type NOT NULL,
    
    -- Provider integration
    provider payment_provider_type NOT NULL,
    external_subscription_id VARCHAR(255) NOT NULL,  -- Apple/Google subscription ID
    
    -- Billing periods
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT unique_external_subscription UNIQUE (provider, external_subscription_id)
);

-- Indexes for subscription management
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(subscription_status);
CREATE INDEX idx_subscriptions_provider ON subscriptions(provider);
CREATE INDEX idx_subscriptions_end_date ON subscriptions(end_date);
```

**Encryption Requirements**: See **→ encryption-strategy.md** for field-level encryption of `user_id, subscription_status, subscription_type`

### **`subscription_tiers` Table**
```sql
CREATE TABLE subscription_tiers (
    -- Primary identification
    tier_name VARCHAR(20) PRIMARY KEY,  -- 'free', 'premium'
    
    -- Feature flags
    medical_reports BOOLEAN DEFAULT FALSE,  -- AI-generated professional analysis
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Default tier configurations
INSERT INTO subscription_tiers (tier_name, medical_reports) VALUES
('free', FALSE),      -- Free: Document upload, processing, chat - NO medical reports
('premium', TRUE);    -- Premium: All features including medical reports

-- Index for efficient tier lookups
CREATE INDEX idx_subscription_tiers_medical_reports ON subscription_tiers(medical_reports);
```

**Purpose**: Defines available features for each subscription tier
**No Encryption Required**: Reference data, no PII or sensitive information

### **`payments` Table**
```sql
CREATE TABLE payments (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Payment details
    amount DECIMAL(10,2) NOT NULL,           -- e.g., 9.99
    currency CHAR(3) NOT NULL,               -- ISO 4217: USD, EUR, etc.
    payment_status payment_status_type DEFAULT 'pending',
    
    -- Provider integration
    provider_transaction_id VARCHAR(255) NOT NULL,    -- Apple/Google/Stripe transaction ID
    payment_method VARCHAR(100) NOT NULL,             -- 'apple_pay', 'google_pay', 'credit_card'
    
    -- Timestamps
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for payment tracking
CREATE INDEX idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(payment_status);
CREATE INDEX idx_payments_provider_transaction ON payments(provider_transaction_id);
```

**Encryption Requirements**: See **→ encryption-strategy.md** for full table encryption (PCI DSS compliance)

### **`chat_options` Table**
```sql
CREATE TABLE chat_options (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Content categorization
    content_type content_type NOT NULL,     -- 'result' or 'report'
    category chat_category_type NOT NULL,   -- grouping for UI organization
    
    -- Option details
    option_text TEXT NOT NULL,              -- The suggested question/prompt
    display_order INTEGER NOT NULL,         -- For consistent UI ordering
    is_active BOOLEAN DEFAULT TRUE,         -- Enable/disable without deletion
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT unique_content_category_order UNIQUE (content_type, category, display_order)
);

-- Indexes for UI queries
CREATE INDEX idx_chat_options_content_type ON chat_options(content_type, is_active, display_order);
CREATE INDEX idx_chat_options_category ON chat_options(category);
```

**Purpose**: Reference data for predefined chat prompts. **Agent Handoff**: Content managed by **→ ui-specifications.md** Chat Interface specifications.

**Example Options**:
- **Results**: "Can you explain this in simpler terms?", "What should I ask my doctor?"
- **Reports**: "How should I present this to my doctor?", "What are the key points?"

**Encryption Requirements**: No encryption required (public reference data)

### **`user_devices` Table**
```sql
CREATE TABLE user_devices (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User association
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Device identification
    device_id TEXT NOT NULL,                    -- Client-generated unique device ID
    device_name TEXT,                          -- User-friendly device name
    
    -- Device information
    platform TEXT NOT NULL,                   -- 'ios' or 'android'
    model TEXT,                               -- Device model (e.g., 'iPhone 14 Pro')
    os_version TEXT,                          -- Operating system version
    app_version TEXT,                         -- App version at registration
    
    -- Biometric capability
    biometric_type biometric_type,            -- Primary biometric method
    secure_element BOOLEAN DEFAULT FALSE,     -- Hardware security support
    public_key TEXT,                          -- Device hardware public key for verification
    
    -- Device status
    status device_status_type DEFAULT 'active',
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT unique_device_per_user UNIQUE (user_id, device_id)
);

-- Indexes for authentication queries
CREATE INDEX idx_user_devices_user_id ON user_devices(user_id, status);
CREATE INDEX idx_user_devices_device_id ON user_devices(device_id);
CREATE INDEX idx_user_devices_active ON user_devices(status, last_active_at);
```

**Purpose**: Track registered devices for authentication and session management. Supports single-device policy with future multi-device capability.

**Encryption Requirements**: Device information and public keys - no encryption needed (non-sensitive technical data)

### **`user_sessions` Table**
```sql
CREATE TABLE user_sessions (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User and device association
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES user_devices(id) ON DELETE CASCADE,
    
    -- Session tokens
    session_id TEXT NOT NULL UNIQUE,          -- JWT session identifier
    refresh_token_hash TEXT NOT NULL,        -- Hashed refresh token
    access_token_hash TEXT,                  -- Optional: hashed access token
    
    -- Session lifecycle
    status session_status_type DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Biometric authentication tracking
    last_biometric_auth_at TIMESTAMP WITH TIME ZONE,
    biometric_expires_at TIMESTAMP WITH TIME ZONE,
    requires_biometric_reauth BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for session management
CREATE INDEX idx_user_sessions_user_device ON user_sessions(user_id, device_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(session_id, status);
CREATE INDEX idx_user_sessions_refresh ON user_sessions(refresh_token_hash);
CREATE INDEX idx_user_sessions_expiry ON user_sessions(expires_at, status);
CREATE INDEX idx_user_sessions_biometric ON user_sessions(biometric_expires_at, requires_biometric_reauth);
```

**Purpose**: Track user sessions, refresh tokens, and biometric re-authentication requirements. Supports 15-minute access tokens and 7-day refresh tokens with 7-day biometric cycles.

**Encryption Requirements**: Token hashes stored (already hashed), no additional encryption needed

### **`biometric_registrations` Table**
```sql
CREATE TABLE biometric_registrations (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Device association
    device_id UUID NOT NULL REFERENCES user_devices(id) ON DELETE CASCADE,
    
    -- Registration details
    registration_id TEXT NOT NULL UNIQUE,     -- Client-facing registration ID
    biometric_type biometric_type NOT NULL,  -- Type of biometric registered
    
    -- Challenge-response data
    challenge TEXT NOT NULL,                  -- Current verification challenge
    challenge_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Registration status
    is_verified BOOLEAN DEFAULT FALSE,       -- Initial registration verified
    is_active BOOLEAN DEFAULT TRUE,          -- Registration is active
    verification_failures INTEGER DEFAULT 0, -- Failed verification attempts
    
    -- Security metadata
    device_attestation_data JSONB,           -- Device security attestation
    registration_metadata JSONB,             -- Additional registration context
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_verified_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT unique_device_biometric UNIQUE (device_id, biometric_type)
);

-- Indexes for biometric operations
CREATE INDEX idx_biometric_registrations_device ON biometric_registrations(device_id, is_active);
CREATE INDEX idx_biometric_registrations_id ON biometric_registrations(registration_id);
CREATE INDEX idx_biometric_registrations_challenge ON biometric_registrations(challenge_expires_at, is_active);
CREATE INDEX idx_biometric_registrations_failures ON biometric_registrations(verification_failures, is_active);
```

**Purpose**: Manage biometric authentication registrations, challenges, and verification status per device. Supports challenge-response authentication flow.

**Encryption Requirements**: Challenge data and device attestation may contain sensitive information - consider field-level encryption for challenge and attestation data

---

## 📱 **Local Device Database Schema**

**Note**: Local SQLite database schema and implementation details have been moved to **→ flutter-app-architecture.md** to avoid duplication and provide better context for mobile developers.

- **Local SQLite Schema**: Table definitions, indexes, and relationships → `flutter-app-architecture.md`
- **Local Data Access Patterns**: Query examples and performance optimization → `flutter-app-architecture.md` 
- **Local Storage Estimates**: Data volume calculations → `flutter-app-architecture.md`
- **Entity Relationships**: Local database foreign key relationships → `flutter-app-architecture.md`

---

## 🔄 **Database Schema Migrations**

### **Version Control Strategy**
```sql
CREATE TABLE schema_versions (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    description TEXT,
    rollback_sql TEXT  -- Optional rollback commands
);

-- Track current schema version
INSERT INTO schema_versions VALUES (1, NOW(), 'Initial Serenya schema', NULL);
```

### **Migration Approach**
1. **Additive Changes**: New columns, indexes - safe for production
2. **Structural Changes**: Column renames, type changes - require migration planning  
3. **Data Migrations**: ENUM updates, data transformations - require downtime planning
4. **Breaking Changes**: Table renames, relationship changes - major version updates

---

## ✅ **Implementation Checklist**

### **Database Setup**
- [ ] PostgreSQL server configuration and optimization
- [ ] ENUM type creation and validation
- [ ] Table creation with proper constraints
- [ ] Index creation and performance testing

### **Data Validation**
- [ ] UUID generation and validation
- [ ] ENUM value validation in application code
- [ ] Foreign key constraint testing
- [ ] Data integrity validation rules

### **Performance Testing**
- [ ] Timeline query performance benchmarking
- [ ] Index effectiveness validation
- [ ] Memory usage optimization

### **Security Implementation**
- [ ] Encryption requirements implementation (→ encryption-strategy.md)
- [ ] Access control and authentication integration
- [ ] Audit logging integration (→ audit-logging.md)
- [ ] Data masking and privacy controls

---

**Document Status**: ✅ Complete - Ready for agent handoff  
**Last Updated**: September 4, 2025  
**Next Reviews**: Security Agent, API Agent, System Architecture Agent
