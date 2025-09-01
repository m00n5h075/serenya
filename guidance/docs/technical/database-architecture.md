# Database Architecture - Serenya AI Health Agent

**Date:** September 1, 2025  
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
- **No document storage**: Documents processed temporarily, then deleted - only extracted medical data persists
- **Privacy-first architecture**: Complete medical data stored locally on device
- **Minimal server storage**: Only authentication, consent, and reference data on server
- **Hybrid ENUM management**: Database-level constraints + code-level constants + documentation

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

---

## 📊 **ENUM Definitions**

### **Database ENUM Types**
```sql
-- Authentication & User Management
CREATE TYPE auth_provider_type AS ENUM ('google', 'apple', 'facebook');
CREATE TYPE account_status_type AS ENUM ('active', 'suspended', 'deactivated', 'deleted');

-- Legal Compliance
CREATE TYPE consent_type AS ENUM ('medical_disclaimers', 'terms_of_service', 'privacy_policy');

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

---

## 📱 **Local Device Database Schema**

### **Data Flow Context**
**Agent Handoff Note**: Local device storage supports the complete user medical data as defined in the single-server-round-trip workflow (**→ system-architecture.md**). All tables require encryption per **→ encryption-strategy.md** specifications.

### **`serenya_content` Table**
```sql
CREATE TABLE serenya_content (
    -- Primary identification (from server)
    id UUID PRIMARY KEY,                    -- Server-generated UUID
    user_id UUID NOT NULL,                  -- References server users.id
    
    -- Content classification
    content_type content_type NOT NULL,     -- 'result' or 'report'
    title VARCHAR(255) NOT NULL,            -- AI-generated, constrained format
    
    -- AI-generated content
    content TEXT NOT NULL,                  -- Markdown formatted AI response
    confidence_score DECIMAL(3,1) NOT NULL CHECK (confidence_score >= 0.0 AND confidence_score <= 10.0),
    medical_flags JSON,                     -- AI-generated alerts array
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Indexes for timeline queries (most critical performance requirement)
CREATE INDEX idx_serenya_content_user_timeline ON serenya_content(user_id, created_at DESC);
CREATE INDEX idx_serenya_content_type ON serenya_content(user_id, content_type);
CREATE INDEX idx_serenya_content_confidence ON serenya_content(confidence_score);
```

**Purpose**: Central table for all AI analyses and reports. **Timeline Integration**: All timeline items come from this table, ordered by `created_at DESC`

**Encryption Requirements**: See **→ encryption-strategy.md** for field-level encryption of `content, medical_flags`

### **`lab_results` Table**
```sql
CREATE TABLE lab_results (
    -- Primary identification  
    id UUID PRIMARY KEY,                    -- Server-generated UUID
    user_id UUID NOT NULL,                  -- References server users.id
    serenya_content_id UUID NOT NULL,       -- References serenya_content.id
    
    -- Test identification
    test_name VARCHAR(255) NOT NULL,        -- e.g., "Blood Glucose", "Total Cholesterol"
    test_category test_category_type NOT NULL,
    
    -- Test results
    test_value DECIMAL(10,3),               -- Numeric result value
    test_unit VARCHAR(50),                  -- e.g., "mg/dL", "mmol/L", "%"
    
    -- Reference ranges (lab-specific)
    reference_range_low DECIMAL(10,3),
    reference_range_high DECIMAL(10,3),
    reference_range_text VARCHAR(255),      -- e.g., "Normal", "< 200 mg/dL"
    
    -- AI analysis
    is_abnormal BOOLEAN DEFAULT FALSE,
    confidence_score DECIMAL(3,1) CHECK (confidence_score >= 0.0 AND confidence_score <= 10.0),
    ai_interpretation TEXT,                 -- AI analysis of this specific result
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Indexes for medical data queries
CREATE INDEX idx_lab_results_user_timeline ON lab_results(user_id, created_at DESC);
CREATE INDEX idx_lab_results_content_id ON lab_results(serenya_content_id);
CREATE INDEX idx_lab_results_test_name ON lab_results(test_name);
CREATE INDEX idx_lab_results_abnormal ON lab_results(user_id, is_abnormal);
CREATE INDEX idx_lab_results_category ON lab_results(user_id, test_category);
```

**Purpose**: Normalized storage of extracted lab test results. **Agent Handoff**: Data populated by AI processing workflow defined in **→ system-architecture.md**.

**Encryption Requirements**: See **→ encryption-strategy.md** for full table encryption (sensitive medical data)

### **`vitals` Table**
```sql
CREATE TABLE vitals (
    -- Primary identification
    id UUID PRIMARY KEY,                    -- Server-generated UUID  
    user_id UUID NOT NULL,                  -- References server users.id
    serenya_content_id UUID NOT NULL,       -- References serenya_content.id
    
    -- Vital sign identification
    vital_type vital_type NOT NULL,
    
    -- Measurements (flexible schema for different vital types)
    systolic_value INTEGER,                 -- For blood pressure
    diastolic_value INTEGER,                -- For blood pressure  
    numeric_value DECIMAL(6,2),             -- For single-value vitals
    unit VARCHAR(20),                       -- e.g., "mmHg", "°C", "kg", "bpm"
    
    -- AI analysis
    is_abnormal BOOLEAN DEFAULT FALSE,
    confidence_score DECIMAL(3,1) CHECK (confidence_score >= 0.0 AND confidence_score <= 10.0),
    ai_interpretation TEXT,                 -- AI analysis of this vital sign
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Indexes for vital signs queries
CREATE INDEX idx_vitals_user_timeline ON vitals(user_id, created_at DESC);
CREATE INDEX idx_vitals_content_id ON vitals(serenya_content_id);
CREATE INDEX idx_vitals_type ON vitals(user_id, vital_type, created_at DESC);
CREATE INDEX idx_vitals_abnormal ON vitals(user_id, is_abnormal);
```

**Purpose**: Normalized storage of extracted vital sign measurements.

**Usage Examples**:
- **Blood Pressure**: `vital_type='blood_pressure'`, `systolic_value=120`, `diastolic_value=80`, `unit='mmHg'`
- **Heart Rate**: `vital_type='heart_rate'`, `numeric_value=72`, `unit='bpm'`
- **Weight**: `vital_type='weight'`, `numeric_value=70.5`, `unit='kg'`

**Encryption Requirements**: See **→ encryption-strategy.md** for full table encryption (sensitive medical data)

### **`chat_messages` Table**
```sql
CREATE TABLE chat_messages (
    -- Primary identification
    id UUID PRIMARY KEY,                    -- Server-generated UUID
    serenya_content_id UUID NOT NULL,       -- References serenya_content.id
    
    -- Message details
    sender message_sender_type NOT NULL,    -- 'user' or 'serenya'
    message TEXT NOT NULL,                  -- The actual message content
    
    -- Optional metadata
    message_metadata JSON,                  -- Optional: typing indicators, read status, etc.
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Indexes for chat retrieval
CREATE INDEX idx_chat_messages_content_timeline ON chat_messages(serenya_content_id, created_at ASC);
CREATE INDEX idx_chat_messages_sender ON chat_messages(serenya_content_id, sender);
```

**Purpose**: Direct conversation messages linked to specific results or reports. **Agent Handoff**: UI patterns defined in **→ ui-specifications.md** Chat Interface section.

**Encryption Requirements**: See **→ encryption-strategy.md** for field-level encryption of `message`

---

## 🔗 **Data Relationships & Constraints**

### **Relationship Diagram**
```
SERVER-SIDE:
users (1) ←→ (many) consent_records
users (1) ←→ (many) subscriptions  
subscriptions (1) ←→ (many) payments
(no table relationships) chat_options

LOCAL DEVICE:
serenya_content (1) ←→ (many) lab_results
serenya_content (1) ←→ (many) vitals
serenya_content (1) ←→ (many) chat_messages

CROSS-REFERENCE:
users.id ←→ serenya_content.user_id (logical, not FK)
```

### **Referential Integrity**
**Server-Side**: Standard foreign key constraints with CASCADE DELETE for data consistency
**Local Device**: No foreign key constraints (performance + offline capability)
**Cross-System**: Logical references only, handled at application level

### **Data Consistency Rules**
1. **User Profile**: Each user has exactly 3 consent records (one per consent type)
2. **Subscription**: Active users can have 0 or 1 active subscription
3. **Content Hierarchy**: Every lab_result and vital must reference valid serenya_content
4. **Chat Conversations**: Chat messages must reference existing serenya_content

---

## 🚀 **Performance Optimization**

### **Query Patterns by Importance**

**Critical Performance (Timeline View)**:
```sql
-- Timeline query (most frequent)
SELECT * FROM serenya_content 
WHERE user_id = ? 
ORDER BY created_at DESC 
LIMIT 50;

-- Chat history (frequent)
SELECT * FROM chat_messages 
WHERE serenya_content_id = ? 
ORDER BY created_at ASC;
```

**Important Performance (Medical Data)**:
```sql
-- Lab results for specific content
SELECT * FROM lab_results 
WHERE serenya_content_id = ?;

-- Abnormal results search
SELECT * FROM lab_results 
WHERE user_id = ? AND is_abnormal = TRUE
ORDER BY created_at DESC;
```

### **Index Strategy**
- **Primary Indexes**: Timeline queries (user_id, created_at DESC)
- **Secondary Indexes**: Search and filter operations
- **Composite Indexes**: Multi-column queries for performance
- **JSON Indexes**: Medical flags and metadata searches (if needed)

### **Storage Estimates**
```
Per User Estimate (1 year):
- serenya_content: ~50 records × 2KB = 100KB
- lab_results: ~200 records × 1KB = 200KB  
- vitals: ~100 records × 0.5KB = 50KB
- chat_messages: ~500 records × 0.3KB = 150KB
Total per user per year: ~500KB
```

---

## 📋 **Agent Handoff Requirements**

### **For Security Agent (→ encryption-strategy.md)**
**Required Information**:
- Table encryption classifications (provided above)
- Field-level encryption requirements for specific columns
- Key derivation requirements for different data types
- Performance impact considerations for encrypted queries

### **For API Agent (→ api-contracts.md)**
**Required Information**:
- Complete table schemas for request/response validation
- UUID generation and foreign key relationships
- Data validation rules and constraints
- Query patterns for endpoint optimization

### **For Compliance Agent (→ audit-logging.md)**
**Required Information**:
- User and consent table structures for audit context
- Payment table schema for financial audit events
- Data classification levels for each table

### **For System Architecture Agent (→ system-architecture.md)**
**Required Information**:
- Server vs local storage distribution
- Database technology requirements (PostgreSQL + SQLite)
- Backup and replication requirements
- Performance and scaling considerations

---

## 🔄 **Migration & Versioning Strategy**

### **Schema Version Management**
```sql
-- Version tracking table
CREATE TABLE schema_versions (
    version VARCHAR(20) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);
```

### **Migration Approach**
1. **Additive Changes**: New columns, indexes - safe for production
2. **Structural Changes**: Column renames, type changes - require migration planning  
3. **Data Migrations**: ENUM updates, data transformations - require downtime planning
4. **Breaking Changes**: Table renames, relationship changes - major version updates

### **Local Device Migration**
- **App Updates**: Schema migrations handled by Flutter/SQLite migration framework
- **Data Preservation**: Critical user data must survive app updates
- **Rollback Strategy**: Schema downgrades not supported (data loss risk)

---

## ✅ **Implementation Checklist**

### **Database Setup**
- [ ] PostgreSQL server configuration and optimization
- [ ] SQLite local database setup with encryption
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
- [ ] Large dataset performance testing
- [ ] Index effectiveness validation
- [ ] Memory usage optimization

### **Security Implementation**
- [ ] Encryption requirements implementation (→ encryption-strategy.md)
- [ ] Access control and authentication integration
- [ ] Audit logging integration (→ audit-logging.md)
- [ ] Data masking and privacy controls

---

**Document Status**: ✅ Complete - Ready for agent handoff  
**Last Updated**: September 1, 2025  
**Next Reviews**: Security Agent, API Agent, System Architecture Agent