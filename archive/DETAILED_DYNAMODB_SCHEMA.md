# Detailed DynamoDB Schema Design for Serenya

## Overview

This document provides the complete technical specification for consolidating Serenya's 11 RDS PostgreSQL tables into a single DynamoDB table with embedded user data, Lambda constants, and S3-based job tracking.

## Single Table Design: `serenya-{environment}`

### Core Design Principles

1. **Single Physical Table** - One DynamoDB table for all entity types
2. **Embedded User Data** - Related entities stored within user records
3. **Hierarchical Sort Keys** - Enable efficient querying and sorting
4. **Global Secondary Indexes** - Support alternative access patterns
5. **TTL for Cleanup** - Automatic expiration of temporary data

### Partition & Sort Key Strategy

```typescript
interface SerenyaRecord {
  PK: string;           // Partition Key: "USER#{user_id}" | "SYSTEM#{type}"
  SK: string;           // Sort Key: "PROFILE" | "PAYMENT#{date}#{id}" | "CONFIG#{key}"
  GSI1PK?: string;      // Email-based lookups
  GSI1SK?: string;      
  GSI2PK?: string;      // External auth lookups (Google/Apple ID)
  GSI2SK?: string;      
  entity_type: string;  // "user" | "payment" | "system_config"
  data: any;           // Entity-specific payload
  created_at: string;   // ISO 8601 timestamp
  updated_at: string;   // ISO 8601 timestamp
  ttl?: number;        // Unix timestamp for auto-expiration
}
```

---

## Entity Types & Records

### 1. User Profile (Consolidated Record)

**Purpose**: Combines users, consent_records, user_devices, user_sessions, biometric_registrations, and subscriptions tables

```typescript
// Primary Record
PK: "USER#ac5cada7-7b1f-4673-b2b1-089f3e308363"
SK: "PROFILE"

// Global Secondary Indexes
GSI1PK: "USER_EMAIL#a8f5c7e2d9b1c0e4f7a8d2c5b9e1f4a7c2e8b5d1f9c3a6e0d7b4f1a9c8e5b2d6"  // SHA256(email)
GSI1SK: "PROFILE"
GSI2PK: "USER_EXTERNAL#google#113426185144286227617"
GSI2SK: "PROFILE"

entity_type: "user"
data: {
  // Core User Data (from users table)
  id: "ac5cada7-7b1f-4673-b2b1-089f3e308363",
  email: "user@example.com",
  name: "John Doe",
  auth_provider: "google",
  external_id: "113426185144286227617",
  account_status: "active",
  
  // Embedded Consent Data (from consent_records table)
  consents: {
    medical_disclaimers: true,
    terms_of_service: true, 
    privacy_policy: true,
    consent_version: "v2.1.0",
    consent_date: "2025-09-27T10:00:00Z",
    ip_address: "192.168.1.100",
    user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"
  },
  
  // Embedded Device Data (from user_devices table)
  current_device: {
    device_id: "iphone-123-abc-def",
    device_name: "iPhone 15 Pro",
    platform: "ios",
    platform_version: "17.0.1",
    app_version: "1.2.3",
    biometric_type: "faceid",
    device_fingerprint: "a8c5d2e9f7b1c4e8",
    last_active_at: "2025-09-27T10:30:00Z",
    timezone: "America/New_York"
  },
  
  // Embedded Session Data (from user_sessions table)
  current_session: {
    session_id: "sess_abc123def456",
    access_token_hash: "sha256_hash_of_access_token",
    refresh_token_hash: "sha256_hash_of_refresh_token", 
    issued_at: "2025-09-27T10:00:00Z",
    expires_at: "2025-09-28T10:00:00Z",
    last_accessed_at: "2025-09-27T15:45:00Z",
    biometric_expires_at: "2025-10-04T10:00:00Z",
    user_agent: "SerenyaApp/1.2.3 (iPhone15,2; iOS 17.0.1)",
    source_ip: "192.168.1.100"
  },
  
  // Embedded Biometric Data (from biometric_registrations table)
  biometric: {
    registration_id: "bio_reg_faceid_123",
    biometric_type: "faceid",
    is_verified: true,
    verification_level: "high",
    challenge_data: "encrypted_challenge_blob",
    challenge_expires_at: "2025-09-27T11:00:00Z",
    last_verification_at: "2025-09-27T10:00:00Z",
    failure_count: 0,
    locked_until: null
  },
  
  // Embedded Subscription Data (from subscriptions table)
  subscription: {
    subscription_id: "sub_free_123",
    subscription_type: "free",
    subscription_status: "active", 
    provider: "internal",
    external_subscription_id: null,
    start_date: "2025-09-27T00:00:00Z",
    end_date: "2025-10-27T00:00:00Z",
    auto_renew: true,
    trial_period_days: 0,
    grace_period_days: 7,
    
    // Usage tracking for tier limits
    usage_current_period: {
      documents_processed: 2,
      period_start: "2025-09-01T00:00:00Z",
      period_end: "2025-09-30T23:59:59Z"
    }
  }
}

created_at: "2025-09-27T10:00:00Z"
updated_at: "2025-09-27T15:45:00Z"
ttl: 1759095652  // Session expiration for auto-cleanup
```

### 2. Payment Records

**Purpose**: Replaces payments table with separate sort keys for high-volume transactional data

```typescript
// Individual Payment Record
PK: "USER#ac5cada7-7b1f-4673-b2b1-089f3e308363"
SK: "PAYMENT#2025-09-27#payment-abc-123"

entity_type: "payment"
data: {
  payment_id: "payment-abc-123",
  user_id: "ac5cada7-7b1f-4673-b2b1-089f3e308363",
  subscription_id: "sub_premium_456",
  
  // Payment Details
  amount: 9.99,
  currency: "USD",
  payment_status: "completed",
  payment_method: "apple_pay",
  
  // Provider Information
  provider_transaction_id: "apple_pay_transaction_123456",
  provider_receipt_data: "base64_encoded_receipt",
  provider_sandbox: false,
  
  // Timestamps
  initiated_at: "2025-09-27T10:00:00Z",
  processed_at: "2025-09-27T10:15:00Z",
  
  // Metadata
  platform: "ios",
  app_version: "1.2.3",
  
  // Refund Information (if applicable)
  refund_status: null,
  refund_amount: null,
  refunded_at: null,
  refund_reason: null
}

created_at: "2025-09-27T10:15:00Z"
updated_at: "2025-09-27T10:15:00Z"
```

### 3. System Configuration (Optional)

**Purpose**: Replace hard-coded values that may need runtime updates

```typescript
// System-wide Configuration
PK: "SYSTEM#CONFIG"
SK: "APP_SETTINGS#v1"

entity_type: "system_config"
data: {
  config_key: "app_settings",
  version: "v1",
  
  // Feature Flags
  features: {
    biometric_auth_enabled: true,
    apple_signin_enabled: true,
    google_signin_enabled: true,
    premium_subscriptions_enabled: true,
    document_processing_enabled: true
  },
  
  // System Limits
  limits: {
    max_file_size_mb: 10,
    max_files_per_upload: 5,
    session_timeout_hours: 24,
    biometric_timeout_days: 7
  },
  
  // External Service Configuration
  services: {
    anthropic_api_timeout_ms: 30000,
    apple_signin_timeout_ms: 15000,
    google_signin_timeout_ms: 15000
  }
}

created_at: "2025-09-27T00:00:00Z"
updated_at: "2025-09-27T10:00:00Z"
```

---

## Global Secondary Indexes (GSI)

### GSI1: Email-based User Lookups

**Purpose**: Find users by email address (hashed for privacy)

```typescript
GSI1PK: "USER_EMAIL#${sha256(email)}"
GSI1SK: "PROFILE"

// Usage Example:
const hashedEmail = crypto.createHash('sha256').update('user@example.com').digest('hex');
const params = {
  TableName: 'serenya-dev',
  IndexName: 'GSI1-EmailLookup',
  KeyConditionExpression: 'GSI1PK = :pk',
  ExpressionAttributeValues: {
    ':pk': `USER_EMAIL#${hashedEmail}`
  }
};
```

### GSI2: External Authentication Lookups

**Purpose**: Find users by OAuth provider external ID

```typescript
GSI2PK: "USER_EXTERNAL#${provider}#${external_id}"
GSI2SK: "PROFILE"

// Usage Examples:
// Google OAuth: "USER_EXTERNAL#google#113426185144286227617"
// Apple Sign-in: "USER_EXTERNAL#apple#001234.a1b2c3d4e5f6"

const params = {
  TableName: 'serenya-dev',
  IndexName: 'GSI2-ExternalAuth',
  KeyConditionExpression: 'GSI2PK = :pk',
  ExpressionAttributeValues: {
    ':pk': `USER_EXTERNAL#google#113426185144286227617`
  }
};
```

---

## Access Patterns & Query Examples

### 1. User Authentication Flow

```typescript
class DynamoUserService {
  // Find user by Google/Apple external ID
  async findByExternalId(provider: string, externalId: string) {
    const params = {
      TableName: process.env.DYNAMO_TABLE_NAME,
      IndexName: 'GSI2-ExternalAuth',
      KeyConditionExpression: 'GSI2PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `USER_EXTERNAL#${provider}#${externalId}`
      }
    };
    
    const result = await this.dynamoDB.query(params).promise();
    return result.Items[0]?.data || null;
  }
  
  // Create new user with all embedded data
  async createUser(userData: CreateUserRequest) {
    const userId = uuidv4();
    const now = new Date().toISOString();
    const sessionExpiry = new Date(Date.now() + 24*60*60*1000); // 24 hours
    
    const userRecord = {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
      GSI1PK: `USER_EMAIL#${crypto.createHash('sha256').update(userData.email).digest('hex')}`,
      GSI1SK: 'PROFILE',
      GSI2PK: `USER_EXTERNAL#${userData.auth_provider}#${userData.external_id}`,
      GSI2SK: 'PROFILE',
      entity_type: 'user',
      data: {
        id: userId,
        email: userData.email,
        name: userData.name,
        auth_provider: userData.auth_provider,
        external_id: userData.external_id,
        account_status: 'active',
        
        // Initialize embedded objects
        consents: {
          medical_disclaimers: false,
          terms_of_service: false,
          privacy_policy: false,
          consent_version: null,
          consent_date: null
        },
        current_device: null,
        current_session: null,
        biometric: null,
        subscription: {
          subscription_id: `sub_free_${userId}`,
          subscription_type: 'free',
          subscription_status: 'active',
          provider: 'internal',
          start_date: now,
          end_date: new Date(Date.now() + 365*24*60*60*1000).toISOString(), // 1 year
          usage_current_period: {
            documents_processed: 0,
            period_start: now,
            period_end: new Date(Date.now() + 30*24*60*60*1000).toISOString() // 30 days
          }
        }
      },
      created_at: now,
      updated_at: now,
      ttl: Math.floor(sessionExpiry.getTime() / 1000)
    };
    
    await this.dynamoDB.putItem({
      TableName: process.env.DYNAMO_TABLE_NAME,
      Item: userRecord,
      ConditionExpression: 'attribute_not_exists(PK)' // Prevent duplicates
    }).promise();
    
    return userRecord.data;
  }
  
  // Update user session data
  async updateSession(userId: string, sessionData: SessionData) {
    const now = new Date().toISOString();
    const sessionExpiry = new Date(Date.now() + 24*60*60*1000);
    
    const params = {
      TableName: process.env.DYNAMO_TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      UpdateExpression: 'SET #data.#currentSession = :session, #updatedAt = :now, #ttl = :ttl',
      ExpressionAttributeNames: {
        '#data': 'data',
        '#currentSession': 'current_session',
        '#updatedAt': 'updated_at',
        '#ttl': 'ttl'
      },
      ExpressionAttributeValues: {
        ':session': sessionData,
        ':now': now,
        ':ttl': Math.floor(sessionExpiry.getTime() / 1000)
      }
    };
    
    await this.dynamoDB.updateItem(params).promise();
  }
}
```

### 2. Payment Management

```typescript
class DynamoPaymentService {
  // Create new payment record
  async createPayment(userId: string, paymentData: PaymentData) {
    const paymentId = uuidv4();
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const now = new Date().toISOString();
    
    const paymentRecord = {
      PK: `USER#${userId}`,
      SK: `PAYMENT#${date}#${paymentId}`,
      entity_type: 'payment',
      data: {
        payment_id: paymentId,
        user_id: userId,
        ...paymentData,
        processed_at: now
      },
      created_at: now,
      updated_at: now
    };
    
    await this.dynamoDB.putItem({
      TableName: process.env.DYNAMO_TABLE_NAME,
      Item: paymentRecord
    }).promise();
    
    return paymentRecord.data;
  }
  
  // Get user's payment history
  async getUserPayments(userId: string, limit = 20) {
    const params = {
      TableName: process.env.DYNAMO_TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'PAYMENT#'
      },
      ScanIndexForward: false, // Latest first
      Limit: limit
    };
    
    const result = await this.dynamoDB.query(params).promise();
    return result.Items.map(item => item.data);
  }
}
```

### 3. Subscription Management

```typescript
class DynamoSubscriptionService {
  // Get user's current subscription (embedded in user profile)
  async getCurrentSubscription(userId: string) {
    const params = {
      TableName: process.env.DYNAMO_TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      ProjectionExpression: '#data.#subscription',
      ExpressionAttributeNames: {
        '#data': 'data',
        '#subscription': 'subscription'
      }
    };
    
    const result = await this.dynamoDB.getItem(params).promise();
    return result.Item?.data?.subscription || null;
  }
  
  // Update subscription (embedded in user profile)
  async updateSubscription(userId: string, subscriptionData: SubscriptionData) {
    const now = new Date().toISOString();
    
    const params = {
      TableName: process.env.DYNAMO_TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      UpdateExpression: 'SET #data.#subscription = :subscription, #updatedAt = :now',
      ExpressionAttributeNames: {
        '#data': 'data',
        '#subscription': 'subscription',
        '#updatedAt': 'updated_at'
      },
      ExpressionAttributeValues: {
        ':subscription': subscriptionData,
        ':now': now
      }
    };
    
    await this.dynamoDB.updateItem(params).promise();
  }
  
  // Check usage limits (embedded in subscription data)
  async checkUsageLimit(userId: string, feature: string) {
    const subscription = await this.getCurrentSubscription(userId);
    if (!subscription) return { allowed: false, reason: 'No subscription found' };
    
    const tier = SUBSCRIPTION_TIERS[subscription.subscription_type];
    if (!tier) return { allowed: false, reason: 'Invalid subscription tier' };
    
    if (feature === 'document_processing') {
      const maxDocs = tier.max_documents_per_month;
      if (maxDocs === null) return { allowed: true }; // Unlimited
      
      const currentUsage = subscription.usage_current_period?.documents_processed || 0;
      return { 
        allowed: currentUsage < maxDocs,
        usage: currentUsage,
        limit: maxDocs
      };
    }
    
    return { allowed: true };
  }
}
```

---

## Lambda Constants (Replaces Reference Tables)

### Subscription Tiers Configuration

```typescript
// lambdas/shared/subscription-tiers.ts
export const SUBSCRIPTION_TIERS = {
  free: {
    tier_name: 'Free',
    medical_reports: false,
    max_documents_per_month: 5,
    priority_processing: false,
    advanced_analytics: false,
    export_capabilities: false,
    chat_interactions_per_day: 10,
    storage_gb: 1,
    retention_days: 30,
    support_level: 'community',
    monthly_price_usd: 0.00,
    yearly_price_usd: 0.00,
    apple_product_id: null,
    google_product_id: null
  },
  
  premium: {
    tier_name: 'Premium',
    medical_reports: true,
    max_documents_per_month: null, // unlimited
    priority_processing: true,
    advanced_analytics: true,
    export_capabilities: true,
    chat_interactions_per_day: null, // unlimited
    storage_gb: 10,
    retention_days: 365,
    support_level: 'priority',
    monthly_price_usd: 9.99,
    yearly_price_usd: 99.99,
    apple_product_id: 'com.serenya.premium.monthly',
    google_product_id: 'serenya_premium_monthly'
  }
} as const;

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS;

// Lambda endpoint to expose tiers
export const getSubscriptionTiers = async () => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(SUBSCRIPTION_TIERS)
  };
};
```

### Chat Options Configuration

```typescript
// lambdas/shared/chat-options.ts
export const CHAT_OPTIONS = {
  result: {
    category: 'Lab Results',
    options: [
      {
        id: 'explain_simple',
        text: 'Can you explain this in simpler terms?',
        prompt: 'Explain these lab results in simple, easy-to-understand language. Avoid medical jargon and focus on what these numbers mean for my health.',
        icon: 'lightbulb'
      },
      {
        id: 'health_impact', 
        text: 'What do these numbers mean for my health?',
        prompt: 'Interpret these health metrics and explain their significance. What should I be concerned about or encouraged by?',
        icon: 'heart'
      },
      {
        id: 'trends_analysis',
        text: 'How have my results changed over time?',
        prompt: 'Analyze trends in my health data over time. What improvements or concerns should I be aware of?',
        icon: 'trending-up',
        requires_history: true
      }
    ]
  },
  
  report: {
    category: 'Medical Reports',
    options: [
      {
        id: 'key_findings',
        text: 'Can you summarize the key findings?',
        prompt: 'Summarize the most important findings from this medical report. What are the main takeaways I should focus on?',
        icon: 'document-text'
      },
      {
        id: 'doctor_prep',
        text: 'What should I ask my doctor?',
        prompt: 'Based on this report, generate intelligent questions I should ask my doctor during my next appointment.',
        icon: 'chat-bubble-left-right'
      },
      {
        id: 'follow_up',
        text: 'What follow-up actions should I take?',
        prompt: 'What follow-up actions, lifestyle changes, or next steps should I consider based on this medical report?',
        icon: 'clipboard-document-check'
      }
    ]
  },
  
  metric: {
    category: 'Specific Metrics',
    dynamic: true, // Generated based on available metrics in the document
    base_prompts: {
      explanation: 'Explain what [METRIC] measures, why it\'s important, and what my specific value means.',
      ranges: 'What are the normal ranges for [METRIC] and where do I fall within those ranges?',
      improvement: 'How can I improve my [METRIC] levels through lifestyle changes?'
    }
  }
} as const;

// Lambda endpoint to expose chat options
export const getChatOptions = async (event: APIGatewayProxyEvent) => {
  const { documentType, availableMetrics } = JSON.parse(event.body || '{}');
  
  let options = { ...CHAT_OPTIONS };
  
  // Add dynamic metric-specific options if metrics are provided
  if (documentType === 'result' && availableMetrics?.length > 0) {
    const metricOptions = availableMetrics.map((metric: string) => ({
      id: `metric_${metric.toLowerCase().replace(/\s+/g, '_')}`,
      text: `Explain ${metric}`,
      prompt: CHAT_OPTIONS.metric.base_prompts.explanation.replace('[METRIC]', metric),
      icon: 'beaker',
      metric: metric
    }));
    
    options.result.options.push(...metricOptions);
  }
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  };
};
```

---

## S3-Based Job Processing (Replaces processing_jobs & processing_job_events)

### Job Status Detection Service

```typescript
// lambdas/shared/job-status-service.ts
export class S3JobStatusService {
  private s3: AWS.S3;
  private bucketName: string;
  
  constructor() {
    this.s3 = new AWS.S3();
    this.bucketName = process.env.S3_BUCKET_NAME!;
  }
  
  async getJobStatus(userId: string, fileName: string): Promise<JobStatus> {
    const keyPrefix = `users/${userId}/documents/`;
    
    try {
      // Check if processing result exists (job completed)
      const resultKey = `${keyPrefix}results/${fileName}.json`;
      await this.s3.headObject({
        Bucket: this.bucketName,
        Key: resultKey
      }).promise();
      
      return {
        status: 'completed',
        file_name: fileName,
        result_location: resultKey,
        completed_at: await this.getObjectLastModified(resultKey)
      };
      
    } catch (error) {
      // Check if original upload exists (job pending/processing)
      try {
        const uploadKey = `${keyPrefix}uploads/${fileName}`;
        const uploadObj = await this.s3.headObject({
          Bucket: this.bucketName,
          Key: uploadKey
        }).promise();
        
        // Check if processing has started (check for temp processing file)
        try {
          const processingKey = `${keyPrefix}processing/${fileName}.processing`;
          await this.s3.headObject({
            Bucket: this.bucketName,
            Key: processingKey
          }).promise();
          
          return {
            status: 'processing',
            file_name: fileName,
            uploaded_at: uploadObj.LastModified?.toISOString(),
            processing_started_at: await this.getObjectLastModified(processingKey)
          };
          
        } catch {
          return {
            status: 'pending',
            file_name: fileName,
            uploaded_at: uploadObj.LastModified?.toISOString()
          };
        }
        
      } catch {
        return {
          status: 'not_found',
          file_name: fileName
        };
      }
    }
  }
  
  async listUserJobs(userId: string, limit = 50): Promise<JobStatus[]> {
    const keyPrefix = `users/${userId}/documents/uploads/`;
    
    const objects = await this.s3.listObjectsV2({
      Bucket: this.bucketName,
      Prefix: keyPrefix,
      MaxKeys: limit
    }).promise();
    
    const jobs: JobStatus[] = [];
    
    for (const obj of objects.Contents || []) {
      const fileName = obj.Key!.replace(keyPrefix, '');
      const status = await this.getJobStatus(userId, fileName);
      jobs.push(status);
    }
    
    // Sort by upload time, newest first
    return jobs.sort((a, b) => 
      new Date(b.uploaded_at || 0).getTime() - new Date(a.uploaded_at || 0).getTime()
    );
  }
  
  // Create processing marker file when job starts
  async markJobAsProcessing(userId: string, fileName: string): Promise<void> {
    const processingKey = `users/${userId}/documents/processing/${fileName}.processing`;
    
    await this.s3.putObject({
      Bucket: this.bucketName,
      Key: processingKey,
      Body: JSON.stringify({
        started_at: new Date().toISOString(),
        status: 'processing'
      }),
      ContentType: 'application/json'
    }).promise();
  }
  
  // Remove processing marker and create result when job completes
  async markJobAsCompleted(userId: string, fileName: string, result: any): Promise<void> {
    const resultKey = `users/${userId}/documents/results/${fileName}.json`;
    const processingKey = `users/${userId}/documents/processing/${fileName}.processing`;
    
    // Save result
    await this.s3.putObject({
      Bucket: this.bucketName,
      Key: resultKey,
      Body: JSON.stringify({
        ...result,
        completed_at: new Date().toISOString()
      }),
      ContentType: 'application/json'
    }).promise();
    
    // Remove processing marker
    try {
      await this.s3.deleteObject({
        Bucket: this.bucketName,
        Key: processingKey
      }).promise();
    } catch (error) {
      // Processing marker might not exist, that's okay
    }
  }
  
  private async getObjectLastModified(key: string): Promise<string> {
    try {
      const obj = await this.s3.headObject({
        Bucket: this.bucketName,
        Key: key
      }).promise();
      return obj.LastModified?.toISOString() || new Date().toISOString();
    } catch {
      return new Date().toISOString();
    }
  }
}

interface JobStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'not_found';
  file_name: string;
  uploaded_at?: string;
  processing_started_at?: string;
  completed_at?: string;
  result_location?: string;
  error_message?: string;
}
```

---

## CloudFormation/CDK Infrastructure

### DynamoDB Table Definition

```typescript
// infrastructure/dynamodb-table.ts
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cdk from 'aws-cdk-lib';

export class SerenyaDynamoDBTable extends cdk.Construct {
  public readonly table: dynamodb.Table;
  
  constructor(scope: cdk.Construct, id: string, environment: string) {
    super(scope, id);
    
    this.table = new dynamodb.Table(this, 'SerenyaTable', {
      tableName: `serenya-${environment}`,
      
      // Primary Keys
      partitionKey: { 
        name: 'PK', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: { 
        name: 'SK', 
        type: dynamodb.AttributeType.STRING 
      },
      
      // Billing & Performance
      billingMode: dynamodb.BillingMode.ON_DEMAND,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: environment === 'prod',
      
      // Auto-cleanup via TTL
      timeToLiveAttribute: 'ttl',
      
      // Lifecycle
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      
      // Global Secondary Indexes
      globalSecondaryIndexes: [
        {
          indexName: 'GSI1-EmailLookup',
          partitionKey: { 
            name: 'GSI1PK', 
            type: dynamodb.AttributeType.STRING 
          },
          sortKey: { 
            name: 'GSI1SK', 
            type: dynamodb.AttributeType.STRING 
          },
          projectionType: dynamodb.ProjectionType.ALL
        },
        {
          indexName: 'GSI2-ExternalAuth',
          partitionKey: { 
            name: 'GSI2PK', 
            type: dynamodb.AttributeType.STRING 
          },
          sortKey: { 
            name: 'GSI2SK', 
            type: dynamodb.AttributeType.STRING 
          },
          projectionType: dynamodb.ProjectionType.ALL
        }
      ]
    });
    
    // CloudWatch Alarms for monitoring
    new cdk.aws_cloudwatch.Alarm(this, 'HighReadThrottleAlarm', {
      metric: this.table.metricThrottledRequestsForOperations({
        operations: [dynamodb.Operation.GET_ITEM, dynamodb.Operation.QUERY, dynamodb.Operation.SCAN]
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING
    });
    
    new cdk.aws_cloudwatch.Alarm(this, 'HighWriteThrottleAlarm', {
      metric: this.table.metricThrottledRequestsForOperations({
        operations: [dynamodb.Operation.PUT_ITEM, dynamodb.Operation.UPDATE_ITEM, dynamodb.Operation.DELETE_ITEM]
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING
    });
  }
}
```

### Lambda Permissions & Environment

```typescript
// infrastructure/lambda-functions.ts
export class SerenyaLambdaFunctions extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, table: dynamodb.Table) {
    super(scope, id);
    
    // Common environment variables for all Lambda functions
    const commonEnvironment = {
      DYNAMO_TABLE_NAME: table.tableName,
      S3_BUCKET_NAME: process.env.S3_BUCKET_NAME || 'serenya-temp-files-dev',
      NODE_ENV: process.env.NODE_ENV || 'development'
    };
    
    // Auth Lambda (outside VPC for external API access)
    const authLambda = new lambda.Function(this, 'AuthFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'auth.handler',
      code: lambda.Code.fromAsset('lambdas/auth'),
      environment: {
        ...commonEnvironment,
        JWT_SECRET_ARN: process.env.JWT_SECRET_ARN!
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512
    });
    
    // Subscription Lambda
    const subscriptionLambda = new lambda.Function(this, 'SubscriptionFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'subscriptions.handler',
      code: lambda.Code.fromAsset('lambdas/subscriptions'),
      environment: commonEnvironment,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256
    });
    
    // Processing Status Lambda
    const processingLambda = new lambda.Function(this, 'ProcessingFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'processing.handler',
      code: lambda.Code.fromAsset('lambdas/processing'),
      environment: commonEnvironment,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256
    });
    
    // Grant DynamoDB permissions
    table.grantReadWriteData(authLambda);
    table.grantReadData(subscriptionLambda);
    table.grantReadData(processingLambda);
    
    // Grant S3 permissions for job status
    const s3Bucket = s3.Bucket.fromBucketName(this, 'S3Bucket', commonEnvironment.S3_BUCKET_NAME);
    s3Bucket.grantReadWrite(processingLambda);
    s3Bucket.grantRead(authLambda); // For checking user uploads
  }
}
```

---

## Cost Analysis & Performance

### Expected Costs (Development Environment)

```
DynamoDB On-Demand:
- Read Requests: ~1,000/month @ $1.25/million = $0.001
- Write Requests: ~500/month @ $1.25/million = $0.001  
- Storage: ~1MB @ $0.25/GB = $0.001
Total DynamoDB: ~$0.003/month

Lambda Functions (outside VPC):
- Auth: ~100 invocations @ 512MB = $0.001
- Subscriptions: ~50 invocations @ 256MB = $0.0005
- Processing: ~20 invocations @ 256MB = $0.0002
Total Lambda: ~$0.002/month

S3 File Operations:
- PUT requests: ~100/month @ $0.005/1000 = $0.0005
- GET requests: ~500/month @ $0.0004/1000 = $0.0002
- Storage: ~100MB @ $0.023/GB = $0.002
Total S3: ~$0.003/month

Total DynamoDB Solution: ~$0.008/month vs $180/month RDS
Savings: 99.996% cost reduction
```

### Performance Characteristics

```
Operation                    | RDS Latency | DynamoDB Latency | Improvement
User Authentication         | 200-500ms   | 10-50ms          | 4-10x faster
User Profile Lookup         | 150-300ms   | 5-25ms           | 6-12x faster  
Payment History (10 items)  | 100-250ms   | 20-80ms          | 3-5x faster
Job Status Check            | 50-150ms    | 50-200ms*        | Similar
Session Updates             | 80-200ms    | 10-40ms          | 4-8x faster

* S3 API latency varies by region and caching
```

### Scaling Characteristics

```
Users          | DynamoDB Cost/Month | Performance Impact
0-100         | $1-5               | Excellent (< 50ms)
100-1,000     | $5-25              | Good (< 100ms)
1,000-10,000  | $25-150            | Good (< 150ms) 
10,000+       | $150+              | May need provisioned capacity
```

---

This detailed schema provides a complete blueprint for consolidating Serenya's 11 RDS tables into a single DynamoDB table while maintaining all functionality and achieving significant cost savings.