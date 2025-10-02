# RDS to DynamoDB Migration Plan for Serenya

## Executive Summary

Your current AWS costs are unsustainable at $4.7/day ($142/month) for a development environment with no active users. This plan provides a migration path from RDS PostgreSQL to DynamoDB and infrastructure optimization to reduce costs by approximately **85-90%** to **$0.50-1.00/day**.

### Current Cost Analysis
- **RDS Aurora Cluster**: $1.7/day ($51/month) - Base cost for t3.medium cluster
- **NAT Gateway + Elastic IP**: $3.0/day ($90/month) - For Lambda internet access
- **Total Current**: $4.7/day ($142/month)

### Target Cost Analysis
- **DynamoDB On-Demand**: $0.10-0.30/day - Pay per request
- **Lambda + API Gateway**: $0.20-0.40/day - Current usage
- **Secrets Manager**: $0.13/day - Existing
- **CloudWatch Logs**: $0.07-0.20/day - Current usage
- **Total Target**: **$0.50-1.00/day ($15-30/month)**

---

## Part 1: EC2 Cost Elimination ($3/day savings)

### Root Cause: Unnecessary NAT Gateway
Your "serverless" architecture currently includes:
- **NAT Gateway**: `nat-0d9b6316baa338433` ($1.50/day base + $0.045/GB)
- **Elastic IP**: `63.35.241.251` ($1.50/day when attached to NAT Gateway)

**Why it exists**: Lambda functions in VPC private subnets need internet access for external API calls (Google OAuth, Apple Sign-in, Anthropic API).

### Solution: Move Lambda Functions Out of VPC
```typescript
// Current (CDK): Lambda in VPC
const authLambda = new lambda.Function(this, 'AuthFunction', {
  vpc: this.vpc,                    // ❌ Causes NAT Gateway requirement
  vpcSubnets: {
    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
  },
  securityGroups: [lambdaSecurityGroup]
});

// Target: Lambda without VPC
const authLambda = new lambda.Function(this, 'AuthFunction', {
  // ✅ No VPC = No NAT Gateway needed
  // Lambda can access internet directly
});
```

**Impact**: Eliminates NAT Gateway and Elastic IP entirely = **$3/day savings**.

---

## Part 2: Database Migration ($1.7/day savings)

### Current RDS Schema Analysis
Based on your actual database schema (`001_complete_core_schema.sql`), you have **11 core tables**:

```
Core Tables:
├── users - Stores user profiles, authentication data (Google/Apple OAuth), email, names, account status
├── consent_records - Tracks legal consent for medical disclaimers, privacy policy, terms of service (GDPR compliance)
├── user_devices - Registers user devices for biometric authentication, stores device info (iPhone, Android, etc.)
├── user_sessions - Manages active login sessions, JWT tokens, tracks when biometric re-auth is needed
├── biometric_registrations - Handles biometric auth setup (Face ID, fingerprint), stores security challenges
├── subscriptions - Tracks user subscription status (free vs premium), billing periods, provider info
├── subscription_tiers - Defines what features each tier gets (free = 5 docs/month, premium = unlimited)
├── payments - Records all payment transactions, Apple/Google in-app purchases, billing history
├── chat_options - Pre-written questions users can ask about their health results ("Explain this metric", "Prep for doctor")
├── processing_jobs - Tracks uploaded health documents (PDFs, images) through AI processing pipeline
└── processing_job_events - Audit log of what happened to each document upload (uploaded → processing → completed)

Utility Tables:
└── schema_versions - Database version tracking for migrations
```

### DynamoDB Consolidation Strategy
**11 Tables → 1 Table + Code + S3**

**ELIMINATE (Move to Lambda Code):**
- **subscription_tiers** → Hard-code tier definitions in Lambda functions
- **chat_options** → Hard-code predefined questions in Lambda functions  
- **schema_versions** → Not needed in DynamoDB

**ELIMINATE (Move to S3/CloudWatch):**
- **processing_job_events** → Stream audit logs to S3/CloudWatch
- **processing_jobs** → Remove table, determine job status programmatically from existing S3 file locations

**CONSOLIDATE (Embed into Users):**
- **consent_records** → `user.consents: {medical: true, privacy: true, terms: true}`
- **user_devices** → `user.current_device: {id, platform, biometric_type}`
- **user_sessions** → `user.current_session: {token, expires_at}`
- **biometric_registrations** → `user.biometric: {type, challenge, verified}`
- **subscriptions** → `user.subscription: {type, start_date, end_date}`

**KEEP SEPARATE (High Volume):**
- **payments** → Separate records in same DynamoDB table using different sort keys

### DynamoDB Table Design

#### Single-Table Design: `serenya-{environment}`
**One Physical Table, Two Logical Entity Types**

```typescript
interface DynamoDBRecord {
  PK: string;           // Partition Key: "USER#{user_id}"
  SK: string;           // Sort Key: "PROFILE" | "PAYMENT#{date}#{payment_id}"
  GSI1PK?: string;      // Global Secondary Index 1 PK (for lookups by email)
  GSI1SK?: string;      // Global Secondary Index 1 SK
  GSI2PK?: string;      // Global Secondary Index 2 PK (for external auth lookups)
  GSI2SK?: string;      // Global Secondary Index 2 SK
  entity_type: string;  // "user" | "payment"
  data: any;           // Entity-specific data
  created_at: string;
  updated_at: string;
  // NO TTL - all records are permanent, cleanup handled by application logic
}
```

#### Type System and Enums

```typescript
// === CORE BUSINESS ENUMS ===
type AuthProvider = 'google' | 'apple' | 'facebook';
type AccountStatus = 'active' | 'suspended' | 'deactivated' | 'deleted';

// Consent types (5 types from RDS schema)
type ConsentType = 
  | 'medical_disclaimers'
  | 'terms_of_service' 
  | 'privacy_policy'
  | 'healthcare_consultation'
  | 'emergency_care_limitation';

// Subscription types - NOTE: Corrected from RDS schema (billing frequency, not tier names)
type SubscriptionType = 'monthly' | 'yearly';
type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'pending';
type PaymentProvider = 'apple' | 'google' | 'stripe';
type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded' | 'disputed';

// Chat system enums
type ContentType = 'result' | 'report';
type ChatCategoryType = 'explanation' | 'doctor_prep' | 'clarification' | 'general' | 'metrics';

// === DEVICE AND SESSION MANAGEMENT ENUMS ===
type DeviceStatus = 'active' | 'inactive' | 'revoked';
type BiometricType = 'fingerprint' | 'face' | 'voice';
type SessionStatus = 'active' | 'expired' | 'revoked';

// === DOCUMENT PROCESSING ENUMS ===
type ProcessingStatus = 'uploaded' | 'processing' | 'completed' | 'failed' | 'timeout' | 'retrying';
type DocumentFileType = 'pdf' | 'jpg' | 'jpeg' | 'png';

// === SUBSCRIPTION TIER NAMES (Constants, not DB enum) ===
type SubscriptionTierName = 'free' | 'premium' | 'family';
```

#### Access Patterns & Key Design

**1. User Profile (Consolidated with Arrays for Scalability)**
```typescript
PK: "USER#ac5cada7-7b1f-4673-b2b1-089f3e308363"
SK: "PROFILE"
GSI1PK: "USER_EMAIL#${sha256(email)}"
GSI1SK: "PROFILE"
GSI2PK: "USER_EXTERNAL#google#113426185144286227617"
GSI2SK: "PROFILE"
entity_type: "user"

data: {
  // === CORE USER DATA ===
  id: "ac5cada7-7b1f-4673-b2b1-089f3e308363",
  external_id: "113426185144286227617",
  auth_provider: "google",
  email: "user@example.com",
  email_hash: "sha256_hash_of_email",
  email_verified: true,
  name: "John Doe",
  given_name: "John",
  family_name: "Doe", 
  account_status: "active",
  last_login_at: "2025-09-27T10:00:00Z",
  deactivated_at: null,
  
  // === CONSENT RECORDS (single object - current consent status) ===
  consents: {
    medical_disclaimers: {
      consent_given: true,
      consent_version: "v2.1.0",
      consent_method: "bundled_consent",
      ui_checkbox_group: 1,
      created_at: "2025-09-27T10:00:00Z",
      updated_at: "2025-09-27T10:00:00Z",
      withdrawn_at: null
    },
    terms_of_service: {
      consent_given: true,
      consent_version: "v2.1.0",
      consent_method: "bundled_consent",
      ui_checkbox_group: 1,
      created_at: "2025-09-27T10:00:00Z",
      updated_at: "2025-09-27T10:00:00Z",
      withdrawn_at: null
    },
    privacy_policy: {
      consent_given: true,
      consent_version: "v2.1.0",
      consent_method: "bundled_consent",
      ui_checkbox_group: 1,
      created_at: "2025-09-27T10:00:00Z",
      updated_at: "2025-09-27T10:00:00Z",
      withdrawn_at: null
    },
    healthcare_consultation: {
      consent_given: true,
      consent_version: "v2.1.0",
      consent_method: "bundled_consent",
      ui_checkbox_group: 1,
      created_at: "2025-09-27T10:00:00Z",
      updated_at: "2025-09-27T10:00:00Z",
      withdrawn_at: null
    },
    emergency_care_limitation: {
      consent_given: true,
      consent_version: "v2.1.0",
      consent_method: "bundled_consent",
      ui_checkbox_group: 1,
      created_at: "2025-09-27T10:00:00Z",
      updated_at: "2025-09-27T10:00:00Z",
      withdrawn_at: null
    }
  },
  
  // === CURRENT USER DEVICE (single object - current active device) ===
  current_device: {
    device_id: "iphone-123-abc",
    device_name: "iPhone 15 Pro",
    platform: "ios",
    model: "iPhone 15 Pro",
    os_version: "17.0.1", 
    app_version: "1.2.3",
    biometric_type: "face",
    secure_element: true,
    public_key: "device_hardware_public_key_data",
    status: "active",
    last_active_at: "2025-09-27T10:00:00Z",
    created_at: "2025-09-27T09:00:00Z",
    updated_at: "2025-09-27T10:00:00Z"
  },
  
  // === CURRENT USER SESSION (single object - current active session) ===
  current_session: {
    session_id: "sess_abc123", 
    device_id: "iphone-123-abc",
    refresh_token_hash: "sha256_hash_of_refresh_token",
    access_token_hash: "sha256_hash_of_access_token",
    status: "active",
    created_at: "2025-09-27T10:00:00Z",
    last_accessed_at: "2025-09-27T10:00:00Z",
    expires_at: "2025-09-28T10:00:00Z",
    last_biometric_auth_at: "2025-09-27T10:00:00Z",
    biometric_expires_at: "2025-10-04T10:00:00Z",
    requires_biometric_reauth: false,
    updated_at: "2025-09-27T10:00:00Z"
  },
  
  // === CURRENT BIOMETRIC REGISTRATION (single object - current device biometric) ===
  current_biometric: {
    device_id: "iphone-123-abc",
    registration_id: "bio_reg_123",
    biometric_type: "face",
    challenge: "current_challenge_data",
    challenge_expires_at: "2025-09-27T11:00:00Z",
    is_verified: true,
    is_active: true,
    verification_failures: 0,
    device_attestation_data: {
      secure_enclave: true,
      attestation_cert: "certificate_data"
    },
    registration_metadata: {
      registration_source: "initial_setup"
    },
    created_at: "2025-09-27T09:00:00Z",
    updated_at: "2025-09-27T09:00:00Z",
    last_verified_at: "2025-09-27T10:00:00Z"
  },
  
  // === CURRENT SUBSCRIPTION (single object - current active subscription) ===
  current_subscription: {
    subscription_id: "sub_123",
    subscription_status: "active",
    subscription_type: "premium",
    provider: "apple",
    external_subscription_id: "apple_sub_12345",
    external_subscription_id_hash: "sha256_hash_of_external_id",
    start_date: "2025-09-27T00:00:00Z",
    end_date: "2026-09-27T00:00:00Z",
    next_billing_date: "2025-10-27T00:00:00Z",
    usage_current_period: {
      documents_processed: 0,
      period_start: "2025-09-27T00:00:00Z",
      period_end: "2025-10-27T00:00:00Z"
    },
    created_at: "2025-09-27T00:00:00Z",
    updated_at: "2025-09-27T00:00:00Z"
  }
}
// NO TTL - user records are permanent
```

**2. Payment Records (Separate Sort Keys)**
```typescript
PK: "USER#ac5cada7-7b1f-4673-b2b1-089f3e308363"
SK: "PAYMENT#2025-09-27#payment-abc-123"
entity_type: "payment"

data: {
  payment_id: "payment-abc-123",
  subscription_id: "sub_123",
  amount: 9.99,
  currency: "USD",
  payment_status: "completed",
  provider_transaction_id: "apple_pay_transaction_123",
  payment_method: "apple_pay",
  processed_at: "2025-09-27T10:15:00Z"
}
```

### DynamoDB Infrastructure

#### Comprehensive CDK Table Definition
```typescript
// infrastructure/dynamodb-table.ts
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
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
          // For: USER_EMAIL#${sha256(email)} lookups
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
          // For: USER_EXTERNAL#google#123456 lookups
        }
      ]
    });
    
    // CloudWatch Alarms for monitoring
    new cloudwatch.Alarm(this, 'HighReadThrottleAlarm', {
      metric: this.table.metricThrottledRequestsForOperations({
        operations: [dynamodb.Operation.GET_ITEM, dynamodb.Operation.QUERY, dynamodb.Operation.SCAN]
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    
    new cloudwatch.Alarm(this, 'HighWriteThrottleAlarm', {
      metric: this.table.metricThrottledRequestsForOperations({
        operations: [dynamodb.Operation.PUT_ITEM, dynamodb.Operation.UPDATE_ITEM, dynamodb.Operation.DELETE_ITEM]
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
  }
}
```

#### Lambda Functions Infrastructure
```typescript
// infrastructure/lambda-functions.ts
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cdk from 'aws-cdk-lib';

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
      // NO VPC - enables direct internet access, eliminating NAT Gateway costs
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
    
    // Grant S3 permissions for job status detection
    const s3Bucket = s3.Bucket.fromBucketName(this, 'S3Bucket', commonEnvironment.S3_BUCKET_NAME);
    s3Bucket.grantReadWrite(processingLambda);
    s3Bucket.grantRead(authLambda); // For checking user uploads
  }
}
```

### Lambda Code Constants (Replaces Tables)
```typescript
// lambdas/shared/constants.js

// === SUBSCRIPTION TIERS (from RDS subscription_tiers table) ===
export const SUBSCRIPTION_TIERS = {
  free: {
    medical_reports: false,
    max_documents_per_month: 5,
    priority_processing: false,
    advanced_analytics: false,
    export_capabilities: false,
    monthly_price_usd: 0.00,
    yearly_price_usd: 0.00
  },
  premium: {
    medical_reports: true,
    max_documents_per_month: null, // unlimited
    priority_processing: true,
    advanced_analytics: true,
    export_capabilities: true,
    monthly_price_usd: 9.99,
    yearly_price_usd: 99.99
  },
  family: {
    medical_reports: true,
    max_documents_per_month: null, // unlimited
    priority_processing: true,
    advanced_analytics: true,
    export_capabilities: true,
    monthly_price_usd: 19.99,
    yearly_price_usd: 199.99
  }
};

// === CHAT OPTIONS (from RDS chat_options table with all 17 entries) ===
export const CHAT_OPTIONS = {
  result: {
    explanation: [
      { 
        text: "Can you explain this in simpler terms?", 
        prompt: "Explain these results in simple terms that are easy to understand.",
        display_order: 1,
        has_sub_options: false,
        requires_health_data: true
      },
      { 
        text: "What do these numbers mean for my health?", 
        prompt: "Interpret these health metrics and explain what they mean for my overall health.",
        display_order: 2,
        has_sub_options: false,
        requires_health_data: true
      },
      { 
        text: "Expand on the overall health picture from my test results", 
        prompt: "Give me a comprehensive summary in simple terms of my test results.",
        display_order: 5,
        has_sub_options: false,
        requires_health_data: true
      }
    ],
    doctor_prep: [
      { 
        text: "What should I ask my doctor about these results?", 
        prompt: "Generate questions I should ask my doctor about these health results.",
        display_order: 1,
        has_sub_options: false,
        requires_health_data: true
      },
      { 
        text: "What questions should I prepare for my next appointment?", 
        prompt: "Help me prepare questions for my next doctor appointment based on these results.",
        display_order: 2,
        has_sub_options: false,
        requires_health_data: true
      },
      { 
        text: "Which questions should I ask my doctor about my [METRIC] result?", 
        prompt: "Generate specific questions I should ask my doctor about my [METRIC] result.",
        display_order: 4,
        has_sub_options: true,
        requires_health_data: true
      }
    ],
    clarification: [
      { 
        text: "Are there any immediate concerns I should know about?", 
        prompt: "Identify any immediate health concerns I should be aware of from these results.",
        display_order: 1,
        has_sub_options: false,
        requires_health_data: true
      },
      { 
        text: "How do these results compare to normal ranges?", 
        prompt: "Compare my results to normal ranges and explain any deviations.",
        display_order: 2,
        has_sub_options: false,
        requires_health_data: true
      },
      { 
        text: "What does my [METRIC] result mean for my health?", 
        prompt: "What does my [METRIC] result mean for my health? What could cause [METRIC] to be at this level?",
        display_order: 2,
        has_sub_options: true,
        requires_health_data: true
      }
    ],
    metrics: [
      { 
        text: "Explain specific metric", 
        prompt: "Explain what [METRIC] measures and why it matters for my health.",
        display_order: 1,
        has_sub_options: true,
        requires_health_data: false
      }
    ],
    general: [
      { 
        text: "What lifestyle changes might help improve these results?", 
        prompt: "Suggest lifestyle changes that might help improve my health results.",
        display_order: 1,
        has_sub_options: false,
        requires_health_data: true
      }
    ],
    lifestyle: [
      { 
        text: "Are there everyday habits that can influence [METRIC]?", 
        prompt: "Are there everyday habits that can influence [METRIC]? How might [METRIC] affect my daily health or long-term wellbeing?",
        display_order: 3,
        has_sub_options: true,
        requires_health_data: true
      }
    ]
  },
  report: {
    explanation: [
      { 
        text: "Can you summarize the key findings?", 
        prompt: "Summarize the most important findings from this health report.",
        display_order: 1,
        has_sub_options: false,
        requires_health_data: true
      },
      { 
        text: "What are the most important points in this report?", 
        prompt: "Highlight the most important points I should focus on in this report.",
        display_order: 2,
        has_sub_options: false,
        requires_health_data: true
      }
    ],
    doctor_prep: [
      { 
        text: "How should I present this to my doctor?", 
        prompt: "Help me understand how to present this health information to my doctor effectively.",
        display_order: 1,
        has_sub_options: false,
        requires_health_data: true
      },
      { 
        text: "What questions should I ask based on this analysis?", 
        prompt: "Generate questions I should ask my doctor based on this health analysis.",
        display_order: 2,
        has_sub_options: false,
        requires_health_data: true
      },
      { 
        text: "What questions should I ask my doctor about these health trends?", 
        prompt: "What questions should I ask my doctor about these health trends? What key points should I share when I meet my primary-care practitioner?",
        display_order: 4,
        has_sub_options: false,
        requires_health_data: true
      }
    ],
    clarification: [
      { 
        text: "Are there any patterns or trends I should be aware of?", 
        prompt: "Identify any important patterns or trends in my health data I should be aware of.",
        display_order: 1,
        has_sub_options: false,
        requires_health_data: true
      },
      { 
        text: "What do these recommendations mean for my care?", 
        prompt: "Explain what the recommendations in this report mean for my ongoing care.",
        display_order: 2,
        has_sub_options: false,
        requires_health_data: true
      }
    ],
    general: [
      { 
        text: "How can I use this information to improve my health?", 
        prompt: "Explain how I can use the information in this report to improve my health.",
        display_order: 1,
        has_sub_options: false,
        requires_health_data: true
      }
    ],
    trends: [
      { 
        text: "Explain how my [METRIC] has changed over time", 
        prompt: "Explain how my [METRIC] has changed over time and why these trends matter for my health.",
        display_order: 1,
        has_sub_options: true,
        requires_health_data: true
      }
    ],
    stability: [
      { 
        text: "Which results stayed steady over time and is that good?", 
        prompt: "Which results stayed steady over time and is that good? What patterns should I pay most attention to?",
        display_order: 2,
        has_sub_options: false,
        requires_health_data: true
      }
    ],
    patterns: [
      { 
        text: "What patterns should I pay most attention to?", 
        prompt: "What patterns should I pay most attention to across all my health data? Are there emerging trends I should be aware of?",
        display_order: 3,
        has_sub_options: false,
        requires_health_data: true
      }
    ],
    lifestyle: [
      { 
        text: "How could lifestyle changes have influenced these health trends?", 
        prompt: "How could lifestyle changes have influenced these health trends over time? What lifestyle factors might explain the patterns in my data?",
        display_order: 5,
        has_sub_options: false,
        requires_health_data: true
      }
    ]
  }
};

// === TYPE DEFINITIONS ===
export const ENUMS = {
  // Core business enums
  AuthProvider: ['google', 'apple', 'facebook'],
  AccountStatus: ['active', 'suspended', 'deactivated', 'deleted'],
  ConsentType: [
    'medical_disclaimers',
    'terms_of_service', 
    'privacy_policy',
    'healthcare_consultation',
    'emergency_care_limitation'
  ],
  
  // Subscription and payment enums
  SubscriptionType: ['monthly', 'yearly'],  // Billing frequency from RDS schema
  SubscriptionStatus: ['active', 'expired', 'cancelled', 'pending'],
  SubscriptionTierName: ['free', 'premium', 'family'],  // Tier names (constants, not DB enum)
  PaymentProvider: ['apple', 'google', 'stripe'],
  PaymentStatus: ['pending', 'completed', 'failed', 'refunded', 'disputed'],
  
  // Chat system enums
  ContentType: ['result', 'report'],
  ChatCategoryType: ['explanation', 'doctor_prep', 'clarification', 'general', 'metrics'],
  
  // Device and session management enums
  DeviceStatus: ['active', 'inactive', 'revoked'],
  BiometricType: ['fingerprint', 'face', 'voice'],
  SessionStatus: ['active', 'expired', 'revoked'],
  
  // Document processing enums
  ProcessingStatus: ['uploaded', 'processing', 'completed', 'failed', 'timeout', 'retrying'],
  DocumentFileType: ['pdf', 'jpg', 'jpeg', 'png']
};
```

---

## Part 3: Migration Strategy

### Phase 1: Infrastructure Cleanup (Week 1)
**Goal**: Infrastructure already destroyed, set up fresh DynamoDB-only stack

1. **Create New CDK Stack**
   ```typescript
   // infrastructure/serenya-backend-stack.ts
   export class SerenyaBackendStack extends cdk.Stack {
     constructor(scope: Construct, id: string, props?: cdk.StackProps) {
       super(scope, id, props);

       // Single DynamoDB table (no RDS, no VPC)
       const serenyaTable = new dynamodb.Table(this, 'SerenyaTable', {
         tableName: `serenya-${environment}`,
         partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
         sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
         billingMode: dynamodb.BillingMode.ON_DEMAND,
         // GSI configuration from above
       });

       // Lambda functions WITHOUT VPC (direct internet access)
       const authLambda = new lambda.Function(this, 'AuthFunction', {
         // NO vpc: this.vpc - saves NAT Gateway costs
         environment: {
           DYNAMO_TABLE_NAME: serenyaTable.tableName
         }
       });
     }
   }
   ```

2. **Deploy Clean Infrastructure**
   ```bash
   npm run build && cdk deploy
   # Result: DynamoDB + Lambda functions outside VPC
   # Cost: ~$15-30/month vs previous $180/month
   ```

### Phase 2: Code Constants Setup (Week 1)
**Goal**: Replace reference tables with Lambda constants

1. **Create Constants File**
   ```javascript
   // lambdas/shared/constants.js
   export const SUBSCRIPTION_TIERS = {
     free: { max_documents_per_month: 5, /* ... */ },
     premium: { max_documents_per_month: null, /* ... */ }
   };

   export const CHAT_OPTIONS = {
     result: {
       explanation: [
         { text: "Explain in simple terms", prompt: "..." }
       ]
     }
   };
   ```

2. **Create API Endpoints**
   ```javascript
   // lambdas/subscription-tiers/handler.js
   const { SUBSCRIPTION_TIERS } = require('../shared/constants');
   
   exports.handler = async (event) => {
     return {
       statusCode: 200,
       body: JSON.stringify(SUBSCRIPTION_TIERS)
     };
   };
   ```

### Phase 3: DynamoDB Service Layer (Week 2)
**Goal**: Create consolidated data access layer with array management

#### Array Update Complexity Management

**Key Strategy**: Use helper functions to abstract complex array operations and provide consistent patterns for session management, device tracking, and subscription history.

1. **User Service (Consolidated with Array Management)**
   ```javascript
   // lambdas/shared/dynamo-user-service.js
   class DynamoUserService {
     async findByExternalId(authProvider, externalId) {
       const params = {
         TableName: process.env.DYNAMO_TABLE_NAME,
         IndexName: 'GSI2-ExternalAuth',
         KeyConditionExpression: 'GSI2PK = :pk',
         ExpressionAttributeValues: {
           ':pk': `USER_EXTERNAL#${authProvider}#${externalId}`
         }
       };
       const result = await dynamoDB.query(params).promise();
       return result.Items[0]?.data;
     }

     // === SESSION MANAGEMENT (simple object updates) ===
     async updateCurrentSession(userId, sessionData) {
       await dynamoDB.update({
         Key: { PK: `USER#${userId}`, SK: "PROFILE" },
         UpdateExpression: "SET #data.#currentSession = :session, #data.updated_at = :now",
         ExpressionAttributeNames: {
           "#data": "data",
           "#currentSession": "current_session"
         },
         ExpressionAttributeValues: {
           ":session": sessionData,
           ":now": new Date().toISOString()
         }
       });
     }

     async updateSessionAccess(userId) {
       await dynamoDB.update({
         Key: { PK: `USER#${userId}`, SK: "PROFILE" },
         UpdateExpression: "SET #data.#currentSession.#lastAccessed = :now",
         ExpressionAttributeNames: {
           "#data": "data",
           "#currentSession": "current_session",
           "#lastAccessed": "last_accessed_at"
         },
         ExpressionAttributeValues: {
           ":now": new Date().toISOString()
         }
       });
     }

     // === DEVICE MANAGEMENT (simple object updates) ===
     async updateCurrentDevice(userId, deviceData) {
       await dynamoDB.update({
         Key: { PK: `USER#${userId}`, SK: "PROFILE" },
         UpdateExpression: "SET #data.#currentDevice = :device, #data.updated_at = :now",
         ExpressionAttributeNames: {
           "#data": "data",
           "#currentDevice": "current_device"
         },
         ExpressionAttributeValues: {
           ":device": deviceData,
           ":now": new Date().toISOString()
         }
       });
     }

     async updateDeviceActivity(userId) {
       await dynamoDB.update({
         Key: { PK: `USER#${userId}`, SK: "PROFILE" },
         UpdateExpression: "SET #data.#currentDevice.#lastActive = :now",
         ExpressionAttributeNames: {
           "#data": "data",
           "#currentDevice": "current_device",
           "#lastActive": "last_active_at"
         },
         ExpressionAttributeValues: {
           ":now": new Date().toISOString()
         }
       });
     }

     // === SUBSCRIPTION MANAGEMENT (simple object updates) ===
     async updateCurrentSubscription(userId, subscriptionData) {
       await dynamoDB.update({
         Key: { PK: `USER#${userId}`, SK: "PROFILE" },
         UpdateExpression: "SET #data.#currentSubscription = :subscription, #data.updated_at = :now",
         ExpressionAttributeNames: {
           "#data": "data",
           "#currentSubscription": "current_subscription"
         },
         ExpressionAttributeValues: {
           ":subscription": subscriptionData,
           ":now": new Date().toISOString()
         }
       });
     }

     async createUser(userData) {
       const userId = uuidv4();
       const now = new Date().toISOString();
       const sessionExpiry = new Date(Date.now() + 24*60*60*1000); // 24 hours
       
       const consolidatedUser = {
         PK: `USER#${userId}`,
         SK: 'PROFILE',
         GSI1PK: `USER_EMAIL#${crypto.createHash('sha256').update(userData.email).digest('hex')}`,
         GSI1SK: 'PROFILE',
         GSI2PK: `USER_EXTERNAL#${userData.auth_provider}#${userData.external_id}`,
         GSI2SK: 'PROFILE',
         entity_type: 'user',
         data: {
           // Core user data
           id: userId,
           email: userData.email,
           name: userData.name,
           auth_provider: userData.auth_provider,
           external_id: userData.external_id,
           account_status: 'active',
           
           // Initialize embedded objects with proper structure
           consents: {
             medical_disclaimers: { consent_given: false, consent_version: null, consent_date: null },
             terms_of_service: { consent_given: false, consent_version: null, consent_date: null },
             privacy_policy: { consent_given: false, consent_version: null, consent_date: null },
             healthcare_consultation: { consent_given: false, consent_version: null, consent_date: null },
             emergency_care_limitation: { consent_given: false, consent_version: null, consent_date: null }
           },
           current_device: null,
           current_session: null,
           current_biometric: null,
           current_subscription: {
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
             },
             created_at: now,
             updated_at: now
           }
         },
         created_at: now,
         updated_at: now,
         ttl: Math.floor(sessionExpiry.getTime() / 1000) // Auto-cleanup
       };
       
       await dynamoDB.putItem({
         TableName: process.env.DYNAMO_TABLE_NAME,
         Item: consolidatedUser,
         ConditionExpression: 'attribute_not_exists(PK)' // Prevent duplicates
       }).promise();
       
       return consolidatedUser.data;
     }

     async updateUserSession(userId, sessionData) {
       const params = {
         TableName: process.env.DYNAMO_TABLE_NAME,
         Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
         UpdateExpression: 'SET #data.#currentSession = :session, #updatedAt = :now',
         ExpressionAttributeNames: {
           '#data': 'data',
           '#currentSession': 'current_session',
           '#updatedAt': 'updated_at'
         },
         ExpressionAttributeValues: {
           ':session': sessionData,
           ':now': new Date().toISOString()
         }
       };
       
       await dynamoDB.updateItem(params).promise();
     }
   }
   ```

2. **Payment Service (Separate Records)**
   ```javascript
   // lambdas/shared/dynamo-payment-service.js
   class DynamoPaymentService {
     async createPayment(userId, paymentData) {
       const paymentId = uuidv4();
       const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
       const now = new Date().toISOString();
       
       const payment = {
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
       
       await dynamoDB.putItem({
         TableName: process.env.DYNAMO_TABLE_NAME,
         Item: payment
       }).promise();
       
       return payment.data;
     }

     async getUserPayments(userId, limit = 20) {
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
       
       const result = await dynamoDB.query(params).promise();
       return result.Items.map(item => item.data);
     }
   }
   ```

3. **Enhanced Subscription Service (with Usage Limits)**
   ```javascript
   // lambdas/shared/dynamo-subscription-service.js
   class DynamoSubscriptionService {
     // Get user's current subscription (embedded in user profile)
     async getCurrentSubscription(userId) {
       const params = {
         TableName: process.env.DYNAMO_TABLE_NAME,
         Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
         ProjectionExpression: '#data.#currentSubscription',
         ExpressionAttributeNames: {
           '#data': 'data',
           '#currentSubscription': 'current_subscription'
         }
       };
       
       const result = await dynamoDB.getItem(params).promise();
       return result.Item?.data?.current_subscription || null;
     }
     
     // Check usage limits (embedded in subscription data)
     async checkUsageLimit(userId, feature) {
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

     // Increment usage counters (single object updates)
     async incrementUsage(userId, feature) {
       const now = new Date().toISOString();
       
       if (feature === 'document_processing') {
         const params = {
           TableName: process.env.DYNAMO_TABLE_NAME,
           Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
           UpdateExpression: 'ADD #data.#currentSubscription.#usage.#docsProcessed :inc SET #data.#currentSubscription.#usage.#lastUpdated = :now',
           ExpressionAttributeNames: {
             '#data': 'data',
             '#currentSubscription': 'current_subscription',
             '#usage': 'usage_current_period',
             '#docsProcessed': 'documents_processed',
             '#lastUpdated': 'last_updated'
           },
           ExpressionAttributeValues: {
             ':inc': 1,
             ':now': now
           }
         };
         
         await dynamoDB.updateItem(params).promise();
       }
     }

     // Helper method to reset monthly usage counters
     async resetUsagePeriod(userId) {
       const now = new Date().toISOString();
       const nextMonth = new Date(Date.now() + 30*24*60*60*1000).toISOString();
       
       const params = {
         TableName: process.env.DYNAMO_TABLE_NAME,
         Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
         UpdateExpression: 'SET #data.#currentSubscription.#usage = :newUsage',
         ExpressionAttributeNames: {
           '#data': 'data',
           '#currentSubscription': 'current_subscription',
           '#usage': 'usage_current_period'
         },
         ExpressionAttributeValues: {
           ':newUsage': {
             documents_processed: 0,
             period_start: now,
             period_end: nextMonth,
             last_updated: now
           }
         }
       };
       
       await dynamoDB.updateItem(params).promise();
     }
   }
   ```

### Phase 4: Processing Jobs → S3 Logic (Week 2)
**Goal**: Remove processing_jobs table, use S3 file detection

1. **S3 Job Status Detection**
   ```javascript
   // lambdas/shared/job-status-service.js
   class S3JobStatusService {
     async getJobStatus(userId, fileName) {
       const bucketName = process.env.S3_BUCKET_NAME;
       const keyPrefix = `users/${userId}/documents/`;
       
       try {
         // Check if result exists (completed)
         await s3.headObject({
           Bucket: bucketName,
           Key: `${keyPrefix}results/${fileName}.json`
         }).promise();
         return { status: 'completed', result_key: `${keyPrefix}results/${fileName}.json` };
       } catch (e) {
         // Check if original file exists (uploaded/processing)
         try {
           await s3.headObject({
             Bucket: bucketName,
             Key: `${keyPrefix}uploads/${fileName}`
           }).promise();
           return { status: 'processing' };
         } catch (e) {
           return { status: 'not_found' };
         }
       }
     }

     async listUserJobs(userId) {
       const bucketName = process.env.S3_BUCKET_NAME;
       const keyPrefix = `users/${userId}/documents/uploads/`;
       
       const objects = await s3.listObjectsV2({
         Bucket: bucketName,
         Prefix: keyPrefix
       }).promise();
       
       const jobs = [];
       for (const obj of objects.Contents || []) {
         const fileName = obj.Key.replace(keyPrefix, '');
         const status = await this.getJobStatus(userId, fileName);
         jobs.push({
           file_name: fileName,
           uploaded_at: obj.LastModified,
           ...status
         });
       }
       
       return jobs;
     }
   }
   ```

### Phase 5: Lambda Function Updates (Week 3)
**Goal**: Update all Lambda functions to use consolidated DynamoDB approach

1. **Auth Function Update**
   ```javascript
   // lambdas/auth/auth.js
   const { DynamoUserService } = require('../shared/dynamo-user-service');
   const { SUBSCRIPTION_TIERS } = require('../shared/constants');

   exports.handler = async (event) => {
     // Replace all RDS calls with DynamoDB consolidated calls
     const user = await DynamoUserService.findByExternalId(authProvider, externalId);
     
     if (!user) {
       const newUser = await DynamoUserService.createUser({
         email: tokenPayload.email,
         name: tokenPayload.name,
         auth_provider: authProvider,
         external_id: tokenPayload.sub
       });
       user = newUser;
     }
     
     // Update session in embedded user data
     const sessionData = {
       session_id: uuidv4(),
       refresh_token_hash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
       expires_at: new Date(Date.now() + 24*60*60*1000).toISOString()
     };
     
     await DynamoUserService.updateUserSession(user.id, sessionData);
   };
   ```

2. **Remove All RDS Dependencies**
   ```bash
   # Remove from package.json
   - "pg": "^8.11.3"
   
   # Remove from Lambda environment variables
   - RDS_SECRET_ARN
   - DATABASE_URL
   
   # Add DynamoDB environment
   + DYNAMO_TABLE_NAME: serenyaTable.tableName
   ```

### Phase 6: Testing & Deployment (Week 3)
**Goal**: Validate consolidated approach works

1. **Test New Architecture**
   ```bash
   # Test all endpoints
   ./scripts/test-endpoints.sh
   
   # Test user creation/authentication
   # Test payment processing
   # Test job status detection
   ```

2. **Performance Validation**
   - User queries: ~10-50ms (vs 200-500ms RDS)
   - Payment queries: ~20-100ms
   - Job status: ~50-200ms (S3 API calls)

**Result**: 11 tables → 1 DynamoDB table + Lambda constants + S3 logic
**Cost**: $180/month → $15-30/month (83% reduction)

---

## Part 4: Updated Lambda Function Code Examples

### Auth Service (DynamoDB)
```javascript
// lambdas/auth/dynamo-database.js
class DynamoUserService {
  static async findByExternalId(authProvider, externalId) {
    const params = {
      TableName: process.env.DYNAMO_TABLE_NAME,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `USER_EXTERNAL#${authProvider}#${externalId}`
      }
    };
    
    const result = await dynamoDB.query(params).promise();
    return result.Items[0]?.data;
  }

  static async createUser(userData) {
    const userId = uuidv4();
    const timestamp = new Date().toISOString();
    
    const item = {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
      GSI1PK: `USER_EMAIL#${crypto.createHash('sha256').update(userData.email).digest('hex')}`,
      GSI1SK: 'PROFILE',
      GSI2PK: `USER_EXTERNAL#${userData.auth_provider}#${userData.external_id}`,
      GSI2SK: 'PROFILE',
      entity_type: 'user',
      data: {
        id: userId,
        ...userData,
        created_at: timestamp,
        updated_at: timestamp
      },
      created_at: timestamp,
      updated_at: timestamp
    };
    
    await dynamoDB.putItem({
      TableName: process.env.DYNAMO_TABLE_NAME,
      Item: item,
      ConditionExpression: 'attribute_not_exists(PK)' // Prevent duplicates
    }).promise();
    
    return item.data;
  }
}

class DynamoSessionService {
  static async createSession(userId, deviceId, sessionData) {
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 24*60*60*1000); // 24 hours
    
    const item = {
      PK: `USER#${userId}`,
      SK: `SESSION#${sessionId}`,
      GSI1PK: `SESSION#${sessionId}`,
      GSI1SK: `USER#${userId}`,
      entity_type: 'session',
      data: {
        session_id: sessionId,
        user_id: userId,
        device_id: deviceId,
        ...sessionData,
        expires_at: expiresAt.toISOString()
      },
      ttl: Math.floor(expiresAt.getTime() / 1000), // Auto-delete
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    await dynamoDB.putItem({
      TableName: process.env.DYNAMO_TABLE_NAME,
      Item: item
    }).promise();
    
    return item.data;
  }
}
```

### Subscription Service (DynamoDB)
```javascript
// lambdas/subscriptions/dynamo-database.js
class DynamoSubscriptionService {
  static async getUserLatestSubscription(userId) {
    const params = {
      TableName: process.env.DYNAMO_TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'SUBSCRIPTION#'
      },
      ScanIndexForward: false, // Latest first
      Limit: 1
    };
    
    const result = await dynamoDB.query(params).promise();
    return result.Items[0]?.data;
  }

  static async createFreeSubscription(userId) {
    const subscriptionId = uuidv4();
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 365*24*60*60*1000); // 1 year
    
    const item = {
      PK: `USER#${userId}`,
      SK: `SUBSCRIPTION#${subscriptionId}`,
      GSI1PK: 'SUBSCRIPTION_STATUS#active',
      GSI1SK: `USER#${userId}`,
      entity_type: 'subscription',
      data: {
        id: subscriptionId,
        user_id: userId,
        subscription_type: 'free',
        subscription_status: 'active',
        provider: 'internal',
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        external_subscription_id: `free_${userId}`
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    await dynamoDB.putItem({
      TableName: process.env.DYNAMO_TABLE_NAME,
      Item: item
    }).promise();
    
    return item.data;
  }
}
```

---

## Part 5: Cost Comparison & Savings

### Current Monthly Costs (Development)
```
RDS Aurora Cluster (t3.medium):        $51.00
NAT Gateway:                           $45.00  
Elastic IP (attached):                 $45.00
Lambda (current usage):                $12.00
API Gateway:                           $6.00
S3 Storage:                            $3.00
Secrets Manager:                       $4.00
CloudWatch Logs:                       $6.00
Other AWS Services:                    $8.00
                                      -------
TOTAL CURRENT:                        $180.00/month
```

### Target Monthly Costs (After Migration)
```
DynamoDB On-Demand (dev usage):        $9.00
Lambda (without VPC):                  $8.00
API Gateway:                           $6.00
S3 Storage:                            $3.00
Secrets Manager:                       $4.00
CloudWatch Logs:                       $6.00
Other AWS Services:                    $4.00
                                      -------
TOTAL TARGET:                         $40.00/month
```

### **Total Savings: $140/month (78% reduction)**

### Cost Scaling Benefits
```
Current Usage (0 users):     $180/month
Target Usage (0 users):      $40/month

At 100 active users:
Current (projected):          $300/month  
Target (DynamoDB scaling):    $65/month

At 1,000 active users:
Current (projected):          $800/month
Target (DynamoDB scaling):    $150/month
```

---

## Part 6: Implementation Timeline

### **Week 1: Infrastructure Optimization**
- [ ] Remove VPC from Lambda functions
- [ ] Deploy CDK changes
- [ ] Verify NAT Gateway deletion
- [ ] **Immediate savings: $90/month**

### **Week 2: DynamoDB Setup**
- [ ] Add DynamoDB table to CDK stack
- [ ] Create migration Lambda function
- [ ] Set up monitoring and alarms
- [ ] Test basic DynamoDB operations

### **Week 3: Data Migration**
- [ ] Implement data transformation logic
- [ ] Execute migration for all tables
- [ ] Validate data integrity
- [ ] Create rollback procedures

### **Week 4: Application Migration**
- [ ] Update all Lambda functions
- [ ] Replace database service layer
- [ ] Update environment variables
- [ ] Deploy new application code

### **Week 5: Testing & Validation**
- [ ] Comprehensive endpoint testing
- [ ] Performance benchmarking
- [ ] Security validation
- [ ] User acceptance testing

### **Week 6: RDS Decommissioning**
- [ ] Final data backup
- [ ] Remove RDS from CDK stack
- [ ] Deploy final infrastructure
- [ ] **Full savings realized: $140/month**

---

## Part 7: Risk Mitigation

### Data Loss Prevention
1. **Multiple Backups**: RDS snapshots before each phase
2. **Validation Scripts**: Compare RDS vs DynamoDB data
3. **Rollback Plan**: Keep RDS running during transition

### Performance Monitoring
1. **DynamoDB Metrics**: Request latency, throttling
2. **Lambda Performance**: Cold starts, execution time
3. **API Response Times**: End-to-end monitoring

### Security Considerations
1. **Encryption**: DynamoDB encryption at rest/transit
2. **Access Control**: IAM policies for least privilege
3. **Audit Trail**: CloudTrail for all DynamoDB operations

---

## Part 8: Next Steps

1. **Immediate Action**: Remove NAT Gateway (Week 1) for instant $90/month savings
2. **Parallel Development**: Set up DynamoDB while RDS continues running
3. **Gradual Migration**: Move one service at a time to minimize risk
4. **Cost Monitoring**: Set up billing alerts at $20/month threshold

### **Expected Outcome**
- **Development costs**: $180/month → $40/month (78% reduction)
- **Production ready**: Scalable architecture that grows with usage
- **Performance improvement**: DynamoDB typically 2-3x faster than RDS for this access pattern

This migration will transform your unsustainable $180/month development costs into a reasonable $40/month while building a more scalable foundation for production.