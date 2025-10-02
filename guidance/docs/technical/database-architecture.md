# Database Architecture - Serenya AI Health Agent

**Date:** January 2025 (Updated for DynamoDB)
**Domain:** Data Design & Database Management
**AI Agent:** Database Design Agent
**Dependencies:** None (foundational document)
**Cross-References:**
- **→ encryption-strategy.md**: Field-level encryption requirements and AWS KMS integration
- **→ api-contracts.md**: Data schemas for API endpoints
- **→ audit-logging.md**: DynamoDB Streams audit event architecture
- **→ observability.md**: Observability event processing via DynamoDB Streams

---

## 🎯 **Database Strategy Overview**

### **Core Architecture Principles**
- **DynamoDB Single-Table Design**: All server-side data in one DynamoDB table with partition/sort key access patterns
- **UUIDs for identifiers**: Server-generated UUIDs used for all entity IDs
- **No persistent document storage**: Documents processed temporarily via S3, then deleted - only extracted medical data persists
- **Privacy-first architecture**: Complete medical data stored locally on device after processing
- **Minimal server storage**: Only authentication, consent, and subscription data on server - NO medical data (lab_results, vitals, chat_messages) in DynamoDB
- **Embedded objects**: Consents, subscriptions, devices, sessions embedded in user profile for atomic updates
- **Temporary S3 processing**: Original files and AI results stored temporarily in S3 during asynchronous processing
- **DynamoDB Streams**: Automatic observability event capture to S3 events bucket for audit logging

### **Storage Distribution**
```
┌─────────────────────────┐    ┌─────────────────────────┐
│      SERVER-SIDE        │    │    LOCAL DEVICE         │
│   (Compliance & Auth)   │    │  (Complete User Data)   │
├─────────────────────────┤    ├─────────────────────────┤
│ • User profiles         │    │ • Lab results           │
│ • Consent records       │    │ • Vital signs           │
│ • Subscription data     │    │ • AI analyses           │
│ • Device registration   │    │ • Chat conversations    │
│ • Session tokens        │    │ • Timeline history      │
│ • Biometric registration│    │ • Search indexes        │
└─────────────────────────┘    └─────────────────────────┘
     DynamoDB + S3                  SQLite Database
```

### **Document Processing Data Flow**
```
1. Document Upload → S3 Temporary Storage
   └─ s3://serenya-temp-files-{env}-{account}/jobs/{job_id}_original

2. AI Processing (AWS Bedrock) → S3 Results Storage
   └─ s3://serenya-temp-files-{env}-{account}/results/{job_id}.json

3. Client Polling → API Response Transformation
   └─ S3 data → Encrypted API chunks → Local device storage

4. Local Storage Population → S3 Cleanup
   └─ Local SQLite tables populated (serenya_content, lab_results, vitals)
   └─ S3 files deleted (or auto-expire in 2 days via lifecycle policy)
```

**Key Points:**
- **No server-side jobs table**: Job tracking via job_id format (`{user_id}_{timestamp}_{random}`)
- **Temporary S3 storage only**: Files exist only during processing and polling
- **Final storage on device**: All medical data ends up in local SQLite database
- **Automatic cleanup**: S3 lifecycle policy removes files older than 2 days
- **Audit logging**: DynamoDB Streams capture all database changes to S3 events bucket

---

## 📊 **DynamoDB Table Design**

### **Single-Table Design Philosophy**

Serenya uses a **single DynamoDB table** with partition key (PK) and sort key (SK) to support all server-side data access patterns. This approach:

- **Reduces costs**: Single table billing vs multiple tables
- **Simplifies operations**: One table to monitor, backup, and scale
- **Improves performance**: Related data stored together for efficient queries
- **Enables transactions**: Atomic updates across related entities
- **Supports streams**: Single stream for all observability events

### **Table Configuration**

```typescript
Table Name: serenya-{environment}
Partition Key: PK (String)
Sort Key: SK (String)
Billing Mode: PAY_PER_REQUEST
Encryption: AWS_MANAGED
Point-in-Time Recovery: Enabled (production)
DynamoDB Streams: NEW_AND_OLD_IMAGES
TTL Attribute: ttl (currently disabled - all records permanent)
```

### **Global Secondary Indexes**

**GSI1-EmailLookup**: Email-based user lookup
```
Partition Key: GSI1PK (String) - Format: EMAIL#{sha256(email)}
Sort Key: GSI1SK (String) - Format: USER#{userId}
Projection: ALL
Use Case: Find user by email for account linking
```

**GSI2-ExternalAuth**: OAuth provider lookup
```
Partition Key: GSI2PK (String) - Format: EXTERNAL#{provider}#{external_id}
Sort Key: GSI2SK (String) - Format: USER#{userId}
Projection: ALL
Use Case: Find user by Google/Apple OAuth ID during authentication
```

---

## 🔑 **Access Patterns & Data Model**

### **Entity Type Definitions**

The single table stores multiple entity types distinguished by PK/SK patterns:

| Entity Type | PK Pattern | SK Pattern | Description |
|-------------|------------|------------|-------------|
| User Profile | `USER#{userId}` | `PROFILE` | Core user data with embedded consents, subscription, device, session |

**Note**: All user-related data is consolidated into a single DynamoDB item with embedded objects for atomic updates and simplified queries.

---

## 👤 **User Profile Entity**

### **Consolidated User Profile Item**

The user profile item embeds all frequently-accessed user data in a single DynamoDB item:

```javascript
{
  // Primary Keys
  PK: "USER#{userId}",
  SK: "PROFILE",

  // Core Identity
  id: "uuid",                           // User unique identifier
  external_id: "string",                // OAuth provider user ID (Google 'sub', Apple ID)
  auth_provider: "google|apple",        // OAuth provider type

  // Personal Information (ENCRYPTED via AWS KMS)
  email: "encrypted_base64_string",     // KMS-encrypted email
  email_hash: "sha256_hash",            // For GSI1 lookup
  name: "encrypted_base64_string",      // KMS-encrypted full name
  given_name: "encrypted_base64_string", // KMS-encrypted first name
  family_name: "encrypted_base64_string", // KMS-encrypted last name
  email_verified: true,                 // Email verification status

  // Account Status
  account_status: "active|suspended|deactivated|deleted",

  // Embedded Consents (created during onboarding)
  consents: {
    privacy_policy: {
      consented: true,
      version: "1.0",
      timestamp: 1704672000000,
      ip_address: "1.2.3.4",
      user_agent: "Mozilla/5.0..."
    },
    terms_of_service: {
      consented: true,
      version: "1.0",
      timestamp: 1704672000000,
      ip_address: "1.2.3.4",
      user_agent: "Mozilla/5.0..."
    },
    medical_disclaimer: {
      consented: true,
      version: "1.0",
      timestamp: 1704672000000,
      ip_address: "1.2.3.4",
      user_agent: "Mozilla/5.0..."
    },
    healthcare_consultation: {
      consented: true,
      version: "1.0",
      timestamp: 1704672000000,
      ip_address: "1.2.3.4",
      user_agent: "Mozilla/5.0..."
    },
    emergency_care_limitation: {
      consented: true,
      version: "1.0",
      timestamp: 1704672000000,
      ip_address: "1.2.3.4",
      user_agent: "Mozilla/5.0..."
    }
  },

  // Embedded Subscription (always present)
  current_subscription: {
    id: "subscription-id",
    type: "free|premium",
    status: "active|expired|cancelled",
    provider: "system|apple|google",    // 'system' for free tier
    external_subscription_id: null,     // Apple/Google subscription ID (null for free)
    start_date: 1704672000000,
    end_date: 1736208000000,            // 1 year from start
    created_at: 1704672000000,
    updated_at: 1704672000000
  },

  // Embedded Device (updated on login)
  current_device: {
    device_id: "client-generated-uuid",
    platform: "ios|android",
    device_model: "iPhone 14 Pro",
    device_name: "John's iPhone",
    app_version: "1.2.3",
    os_version: "17.1",
    device_status: "active|inactive|revoked",
    registered_at: 1704672000000,
    last_seen_at: 1704672000000,
    registration_ip: "1.2.3.4",
    registration_user_agent: "Mozilla/5.0..."
  },

  // Embedded Session (updated on login)
  current_session: {
    session_id: "jwt-session-id",
    created_at: 1704672000000,
    expires_at: 1707350400000,          // 30 days from creation
    last_activity_at: 1704672000000,
    session_status: "active|expired|revoked",
    source_ip: "1.2.3.4",
    user_agent: "Mozilla/5.0...",
    login_method: "oauth"
  },

  // Embedded Biometric (optional, varies per user)
  current_biometric: {
    biometric_id: "uuid",
    biometric_type: "fingerprint|face|voice",
    biometric_hash: "encrypted_base64_string", // KMS-encrypted biometric hash
    device_id: "client-generated-uuid",
    registered_at: 1704672000000,
    last_used_at: 1704672000000,
    registration_ip: "1.2.3.4",
    status: "active|revoked"
  } || null,                            // null if biometric not registered

  // GSI Keys for Efficient Lookups
  GSI1PK: "EMAIL#{sha256(email)}",      // Email lookup via GSI1
  GSI1SK: "USER#{userId}",
  GSI2PK: "EXTERNAL#{provider}#{external_id}", // OAuth lookup via GSI2
  GSI2SK: "USER#{userId}",

  // Metadata
  created_at: 1704672000000,
  updated_at: 1704672000000,
  last_login_at: 1704672000000,

  // Audit Fields
  created_ip: "1.2.3.4",
  created_user_agent: "Mozilla/5.0..."
}
```

### **Why Single Item for User Profile?**

**Benefits of Embedded Objects:**

1. **Atomic Updates**: All user data updates in single transaction
2. **Simplified Queries**: One GetItem call retrieves complete user profile
3. **Reduced Costs**: Fewer read/write operations vs separate items
4. **Consistency**: No eventual consistency issues between related entities
5. **DynamoDB Streams**: Single stream event captures all user changes

**When to Embed vs Separate:**

✅ **Embed (One-to-One, Updated Together):**
- Consents (always created during onboarding)
- Subscription (one active subscription per user)
- Current device (one device per user)
- Current session (one active session per user)
- Current biometric (optional, one per user)

❌ **Separate (One-to-Many, Independent Lifecycle):**
- Medical data (stored locally, not in DynamoDB)
- Audit logs (stored in S3 via DynamoDB Streams)
- Processing jobs (tracked via S3 object existence, not DynamoDB)

---

## 🔐 **Field-Level Encryption**

### **AWS KMS Integration**

**Encrypted Fields:**
- `email` - User's email address (PII)
- `name` - Full display name (PII)
- `given_name` - First name (PII)
- `family_name` - Last name (PII)
- `current_biometric.biometric_hash` - Biometric template hash (sensitive)

**Encryption Context:**
```javascript
{
  userId: "uuid",
  operation: "user_profile_creation|user_profile_update|biometric_registration"
}
```

**Encryption Process:**
1. **Encrypt on Write**: Lambda encrypts PII fields using AWS KMS before DynamoDB PutItem/UpdateItem
2. **Decrypt on Read**: Lambda decrypts PII fields using AWS KMS after DynamoDB GetItem/Query
3. **Encryption at Rest**: DynamoDB uses AWS-managed encryption for all data
4. **Transport Encryption**: TLS 1.3 for all API communication

**See [encryption-strategy.md](encryption-strategy.md) for detailed encryption architecture.**

---

## 🔍 **Common Query Patterns**

### **1. User Authentication (OAuth Login)**

**Scenario**: User logs in with Google/Apple OAuth

```javascript
// Query GSI2 by external OAuth ID
const params = {
  TableName: 'serenya-prod',
  IndexName: 'GSI2-ExternalAuth',
  KeyConditionExpression: 'GSI2PK = :pk',
  ExpressionAttributeValues: {
    ':pk': `EXTERNAL#google#${googleUserId}`
  }
};

const result = await dynamodb.query(params).promise();
// Returns complete user profile with embedded consents, subscription, device, session
```

**Performance**: Single query returns all user data needed for authentication

---

### **2. User Profile Lookup by Email**

**Scenario**: Check if user exists by email (account linking)

```javascript
// Generate email hash
const emailHash = crypto.createHash('sha256')
  .update(email.toLowerCase())
  .digest('hex');

// Query GSI1 by email hash
const params = {
  TableName: 'serenya-prod',
  IndexName: 'GSI1-EmailLookup',
  KeyConditionExpression: 'GSI1PK = :pk',
  ExpressionAttributeValues: {
    ':pk': `EMAIL#${emailHash}`
  }
};

const result = await dynamodb.query(params).promise();
```

**Performance**: Single query with email hash lookup

---

### **3. Get Complete User Profile**

**Scenario**: Retrieve user's complete profile for API response

```javascript
// Get user profile by ID
const params = {
  TableName: 'serenya-prod',
  Key: {
    PK: `USER#${userId}`,
    SK: 'PROFILE'
  }
};

const result = await dynamodb.get(params).promise();
// Returns user profile with all embedded objects (consents, subscription, device, session, biometric)
// Lambda decrypts PII fields (email, name, given_name, family_name) using AWS KMS
```

**Performance**: Single GetItem call, ~10ms latency

---

### **4. Update User Subscription**

**Scenario**: User upgrades from free to premium via Apple/Google in-app purchase

```javascript
// Update subscription object embedded in user profile
const params = {
  TableName: 'serenya-prod',
  Key: {
    PK: `USER#${userId}`,
    SK: 'PROFILE'
  },
  UpdateExpression: 'SET current_subscription = :sub, updated_at = :timestamp',
  ExpressionAttributeValues: {
    ':sub': {
      id: 'premium-subscription-id',
      type: 'premium',
      status: 'active',
      provider: 'apple',
      external_subscription_id: 'apple-subscription-id',
      start_date: Date.now(),
      end_date: Date.now() + (365 * 24 * 60 * 60 * 1000), // 1 year
      created_at: Date.now(),
      updated_at: Date.now()
    },
    ':timestamp': Date.now()
  },
  ReturnValues: 'ALL_NEW'
};

const result = await dynamodb.update(params).promise();
```

**Performance**: Single UpdateItem operation, atomic subscription change

---

### **5. Update Current Session on Login**

**Scenario**: User logs in, create new session

```javascript
// Update session object embedded in user profile
const params = {
  TableName: 'serenya-prod',
  Key: {
    PK: `USER#${userId}`,
    SK: 'PROFILE'
  },
  UpdateExpression: 'SET current_session = :session, updated_at = :timestamp, last_login_at = :timestamp',
  ExpressionAttributeValues: {
    ':session': {
      session_id: 'jwt-session-id',
      created_at: Date.now(),
      expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
      last_activity_at: Date.now(),
      session_status: 'active',
      source_ip: '1.2.3.4',
      user_agent: 'Mozilla/5.0...',
      login_method: 'oauth'
    },
    ':timestamp': Date.now()
  },
  ReturnValues: 'ALL_NEW'
};

const result = await dynamodb.update(params).promise();
```

**Performance**: Single UpdateItem operation, replaces old session atomically

---

### **6. Check User Subscription Tier**

**Scenario**: Validate if user can access premium feature (doctor reports)

```javascript
// Get user profile
const userProfile = await getUserProfile(userId);

// Check subscription from embedded object
const subscription = userProfile.current_subscription;
const hasPremiumAccess =
  subscription.type === 'premium' &&
  subscription.status === 'active' &&
  subscription.end_date > Date.now();

if (!hasPremiumAccess) {
  return {
    error: 'PREMIUM_REQUIRED',
    message: 'Premium subscription required for doctor reports'
  };
}
```

**Performance**: No additional query needed, subscription data already in user profile

---

## 📈 **DynamoDB Streams & Observability**

### **Stream Configuration**

```typescript
Stream: NEW_AND_OLD_IMAGES
Purpose: Capture all database changes for observability and audit logging
Processing: Lambda function processes stream events and writes to S3 events bucket
```

### **Stream Event Processing**

**Stream Processor Lambda**: `stream-processor/streamProcessor.js`

**Event Types Captured:**
1. **User Registration**: New user profile creation (INSERT event)
2. **User Updates**: Profile, subscription, device, session changes (MODIFY event)
3. **Subscription Changes**: Free → Premium, Premium → Expired (MODIFY event)
4. **Session Activity**: Login, logout, session expiration (MODIFY event)

**S3 Event Storage:**
```
s3://serenya-events-{environment}-{account}/
└── observability/
    ├── year=2025/
    │   └── month=01/
    │       └── day=15/
    │           ├── user-registration-{timestamp}.json
    │           ├── subscription-change-{timestamp}.json
    │           └── session-activity-{timestamp}.json
```

**Lifecycle Policy:**
- **Infrequent Access**: After 90 days
- **Glacier**: After 365 days
- **Retention**: 7 years (HIPAA compliance)

**See [observability.md](observability.md) for detailed stream processing architecture.**

---

## 📊 **Capacity Planning & Performance**

### **Estimated Data Volumes**

**User Profiles:**
- Average item size: ~5 KB (with embedded objects)
- 10,000 users: ~50 MB
- 100,000 users: ~500 MB
- 1,000,000 users: ~5 GB

**Growth Projections:**
- Year 1: 10,000 users
- Year 2: 50,000 users
- Year 3: 200,000 users
- Year 5: 1,000,000 users

### **Performance Benchmarks**

**Read Operations:**
- GetItem (user profile): ~10ms p50, ~20ms p99
- Query GSI1 (email lookup): ~15ms p50, ~30ms p99
- Query GSI2 (OAuth lookup): ~15ms p50, ~30ms p99

**Write Operations:**
- PutItem (new user): ~20ms p50, ~40ms p99
- UpdateItem (subscription): ~15ms p50, ~30ms p99
- UpdateItem (session): ~15ms p50, ~30ms p99

**Billing Mode: PAY_PER_REQUEST**
- No capacity planning required
- Automatic scaling to handle traffic spikes
- Cost-effective for unpredictable workloads
- Estimated cost: $1.25 per million read requests, $6.25 per million write requests

### **Optimization Strategies**

1. **Embedded Objects**: Reduce read operations by embedding frequently-accessed data
2. **GSI Projections**: ALL projection for complete data access without base table reads
3. **DynamoDB Streams**: Asynchronous event processing reduces API response time
4. **AWS KMS Caching**: Cache KMS data keys to reduce encryption/decryption latency
5. **Connection Pooling**: Reuse DynamoDB DocumentClient across Lambda invocations

---

## 🔄 **Migration from PostgreSQL to DynamoDB**

### **Migration Summary**

**Previous Architecture (PostgreSQL):**
- Multiple relational tables (users, consents, subscriptions, devices, sessions, biometric_registrations)
- Foreign key constraints
- SQL transactions
- RDS connection pooling

**Current Architecture (DynamoDB):**
- Single table with embedded objects
- Partition/sort key access patterns
- Atomic item updates
- Serverless auto-scaling

### **Migration Benefits**

1. **Serverless**: No database server management, automatic scaling
2. **Performance**: Single-digit millisecond latency at any scale
3. **Cost-Effective**: Pay-per-request billing for unpredictable workloads
4. **High Availability**: Multi-AZ replication with automatic failover
5. **Simplified Schema**: No foreign key constraints, easier to evolve
6. **DynamoDB Streams**: Built-in change data capture for observability

### **Migration Challenges Addressed**

1. **Relational Data → Embedded Objects**: Consolidated frequently-accessed data into single items
2. **SQL Queries → GSI Patterns**: Designed GSIs for common query patterns (email, OAuth lookup)
3. **Transactions → Atomic Updates**: Embedded objects enable atomic updates without transactions
4. **Connection Pooling → Serverless SDK**: AWS SDK manages connections automatically
5. **Audit Logging → DynamoDB Streams**: Stream events replace database triggers for audit logging

---

## 📋 **Data Model Validation Rules**

### **User Profile Validation**

```javascript
const USER_PROFILE_SCHEMA = {
  // Required Fields
  id: { type: 'uuid', required: true },
  external_id: { type: 'string', required: true },
  auth_provider: { type: 'enum', values: ['google', 'apple'], required: true },
  email: { type: 'encrypted_string', required: true },
  name: { type: 'encrypted_string', required: true },
  account_status: { type: 'enum', values: ['active', 'suspended', 'deactivated', 'deleted'], required: true },

  // Embedded Objects (Required)
  consents: { type: 'object', required: true },
  current_subscription: { type: 'object', required: true },

  // Embedded Objects (Optional)
  current_device: { type: 'object', required: false },
  current_session: { type: 'object', required: false },
  current_biometric: { type: 'object', required: false },

  // GSI Keys
  GSI1PK: { type: 'string', pattern: /^EMAIL#[a-f0-9]{64}$/, required: true },
  GSI1SK: { type: 'string', pattern: /^USER#[a-f0-9-]{36}$/, required: true },
  GSI2PK: { type: 'string', pattern: /^EXTERNAL#(google|apple)#.+$/, required: true },
  GSI2SK: { type: 'string', pattern: /^USER#[a-f0-9-]{36}$/, required: true },

  // Timestamps
  created_at: { type: 'number', required: true },
  updated_at: { type: 'number', required: true }
};
```

### **Subscription Validation**

```javascript
const SUBSCRIPTION_SCHEMA = {
  id: { type: 'string', required: true },
  type: { type: 'enum', values: ['free', 'premium'], required: true },
  status: { type: 'enum', values: ['active', 'expired', 'cancelled'], required: true },
  provider: { type: 'enum', values: ['system', 'apple', 'google'], required: true },
  external_subscription_id: { type: 'string', required: false },
  start_date: { type: 'number', required: true },
  end_date: { type: 'number', required: true },
  created_at: { type: 'number', required: true },
  updated_at: { type: 'number', required: true }
};
```

### **Consent Validation**

```javascript
const CONSENT_SCHEMA = {
  consented: { type: 'boolean', required: true },
  version: { type: 'string', required: true },
  timestamp: { type: 'number', required: true },
  ip_address: { type: 'string', required: true },
  user_agent: { type: 'string', required: true }
};

const REQUIRED_CONSENT_TYPES = [
  'privacy_policy',
  'terms_of_service',
  'medical_disclaimer',
  'healthcare_consultation',
  'emergency_care_limitation'
];
```

---

## 🛡️ **Security & Compliance**

### **Data Protection**

1. **Encryption at Rest**: AWS-managed DynamoDB encryption for all data
2. **Encryption in Transit**: TLS 1.3 for all API communication
3. **Field-Level Encryption**: AWS KMS encryption for PII fields (email, name, given_name, family_name)
4. **Access Control**: IAM roles with least-privilege access to DynamoDB
5. **DynamoDB Streams**: Encrypted stream events for audit logging

### **HIPAA Compliance**

- **No PHI in DynamoDB**: All medical data stored locally on device
- **Audit Logging**: DynamoDB Streams capture all user data changes
- **7-Year Retention**: S3 events bucket with 7-year lifecycle policy
- **Encryption**: AWS KMS encryption for all PII fields
- **Access Logs**: CloudWatch logs for all DynamoDB access

### **GDPR Compliance**

- **Right to Access**: User profile retrieval with decrypted PII
- **Right to Erasure**: DeleteItem operation removes user profile
- **Right to Portability**: Export user profile as JSON
- **Consent Management**: Embedded consents object with timestamps and IP addresses
- **Data Minimization**: Only authentication and consent data on server

---

## ✅ **Implementation Checklist**

### **Database Setup**
- [x] DynamoDB table creation with PK/SK
- [x] GSI1-EmailLookup configuration
- [x] GSI2-ExternalAuth configuration
- [x] DynamoDB Streams enabled (NEW_AND_OLD_IMAGES)
- [x] Point-in-Time Recovery enabled (production)
- [x] CloudWatch alarms for throttling

### **Encryption Implementation**
- [x] AWS KMS key for field-level encryption
- [x] Encryption service for PII fields
- [x] Decryption on read operations
- [x] Encryption context for audit trails

### **Access Patterns**
- [x] User authentication via GSI2
- [x] Email lookup via GSI1
- [x] User profile retrieval by ID
- [x] Subscription updates
- [x] Session management
- [x] Device registration

### **Observability**
- [x] DynamoDB Streams processor Lambda
- [x] S3 events bucket for audit logs
- [x] CloudWatch dashboards for metrics
- [x] Alarms for critical operations

### **Security & Compliance**
- [x] IAM roles with least-privilege access
- [x] Encryption at rest and in transit
- [x] Field-level encryption for PII
- [x] Audit logging via DynamoDB Streams
- [x] HIPAA compliance measures
- [x] GDPR compliance measures

---

## 📚 **Related Documentation**

- **[api-contracts.md](api-contracts.md)**: API endpoint schemas and DynamoDB operations
- **[encryption-strategy.md](encryption-strategy.md)**: AWS KMS encryption architecture
- **[observability.md](observability.md)**: DynamoDB Streams event processing
- **[audit-logging.md](audit-logging.md)**: S3 events bucket audit logging
- **[our-dev-rules.md](our-dev-rules.md)**: DynamoDB development guidelines

---

**Document Status**: ✅ Complete - DynamoDB Architecture
**Last Updated**: January 2025
**Previous Version**: PostgreSQL architecture archived in `/archive/database-architecture-postgresql.md`
