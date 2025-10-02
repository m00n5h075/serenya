# System Architecture - Serenya AI Health Agent

**Date:** January 2025 (Updated for DynamoDB Serverless Architecture)
**Domain:** Cloud Infrastructure & System Design
**Dependencies:**
- **← database-architecture.md**: DynamoDB single-table design and access patterns
- **← api-contracts.md**: Lambda function specifications and API endpoints
- **← llm-integration-architecture.md**: AWS Bedrock integration and AI processing
- **← observability.md**: CloudWatch dashboards, alarms, and DynamoDB Streams
**Cross-References:**
- **→ deployment-procedures.md**: Infrastructure deployment and configuration
- **→ our-dev-rules.md**: Development and architecture standards

---

## 🏗️ System Architecture Overview

### Architecture Philosophy
- **Serverless-First**: AWS Lambda + API Gateway + DynamoDB (No VPC, No RDS, No EC2)
- **DynamoDB-Native**: Single-table design for all server-side data
- **Privacy-First**: Minimal server storage, medical data on device only
- **Security-First**: KMS encryption, HIPAA-compliant data handling
- **Cost-Optimized**: Pay-per-use pricing, automatic scaling
- **Observable**: CloudWatch metrics, DynamoDB Streams, comprehensive monitoring

### High-Level Architecture Diagram
```
┌─────────────────────────────────────────────────────────────┐
│                    Mobile Apps                               │
│                  (iOS/Android)                               │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS/TLS 1.3
           ┌───────────▼───────────┐
           │  Amazon CloudFront    │
           │  (CDN + WAF)          │
           └───────────┬───────────┘
                       │
           ┌───────────▼───────────┐
           │   API Gateway REST    │
           │  JWT Authorizer       │
           └───────────┬───────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
┌──────▼──────┐ ┌─────▼─────┐ ┌──────▼──────┐
│Auth Lambda  │ │Process    │ │ Chat Lambda │
│(Node.js 18) │ │Lambda     │ │(Node.js 18) │
└──────┬──────┘ │(Node.js18)│ └──────┬──────┘
       │        └─────┬─────┘        │
       │              │              │
       │              │ AWS Bedrock  │
       │              │ (Claude 3)   │
       │              │              │
       └──────────────┼──────────────┘
                      │
          ┌───────────▼───────────┐
          │   DynamoDB Table      │
          │  (Single-Table)       │
          │  + DynamoDB Streams   │
          └───────────┬───────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
┌───────▼─────┐ ┌────▼────┐ ┌──────▼──────┐
│  AWS KMS    │ │   S3    │ │ CloudWatch  │
│(Encryption) │ │(Temp)   │ │(Observ.)    │
└─────────────┘ └─────────┘ └─────────────┘
```

---

## ☁️ AWS Infrastructure Components

### Compute Layer - AWS Lambda Functions

**Total Functions:** 14 Lambda functions

#### 1. Authentication Service (`auth/auth.js`)
```javascript
// OAuth-based authentication, JWT token generation
const config = {
  runtime: 'nodejs18.x',
  timeout: 30,
  memorySize: 512,
  handler: 'auth.handler',
  environment: {
    DYNAMO_TABLE_NAME: 'serenya-{env}',
    KMS_KEY_ID: 'alias/serenya-{env}',
    SECRETS_ARN: 'arn:aws:secretsmanager:...',
    AWS_REGION: 'eu-west-1'
  }
};
```

**Routes:**
- `POST /api/v1/auth/oauth-onboarding` - Google/Apple OAuth onboarding
- `POST /api/v1/auth/oauth-signin` - OAuth sign-in

**Database Operations:**
- DynamoDB PutItem (create user profile with embedded consents, subscription, device)
- DynamoDB Query via GSI2 (OAuth provider lookup)

---

#### 2. Document Upload Service (`upload/upload.js`)
```javascript
// S3 presigned URL generation
const config = {
  runtime: 'nodejs18.x',
  timeout: 30,
  memorySize: 512,
  handler: 'upload.handler',
  environment: {
    TEMP_BUCKET_NAME: 'serenya-temp-files-{env}-{account}',
    KMS_KEY_ID: 'alias/serenya-{env}',
    AWS_REGION: 'eu-west-1'
  }
};
```

**Routes:**
- `POST /api/v1/process/upload` - Get presigned S3 URL

**S3 Operations:**
- Generate presigned URL for `incoming/{jobId}` upload
- Client uploads directly to S3 (bypassing Lambda 6MB limit)

---

#### 3. Document Processing Service (`process/process.js`)
```javascript
// AI document analysis with AWS Bedrock
const config = {
  runtime: 'nodejs18.x',
  timeout: 180, // 3 minutes for Bedrock processing
  memorySize: 2048, // 2GB for document processing
  handler: 'process.handler',
  environment: {
    TEMP_BUCKET_NAME: 'serenya-temp-files-{env}-{account}',
    KMS_KEY_ID: 'alias/serenya-{env}',
    AWS_REGION: 'eu-west-1',
    BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0'
  }
};
```

**Trigger:** S3 Event (ObjectCreated in `incoming/` folder)

**Processing Flow:**
1. S3 event triggers Lambda with job ID
2. Retrieve binary document from S3 `incoming/{jobId}`
3. Call AWS Bedrock with multimodal prompt (PDF/image + text)
4. Parse AI response into structured medical data
5. Store results in S3 `outgoing/{jobId}`
6. Delete `incoming/{jobId}` file
7. Track observability metrics

**No Database Storage:** Results stored temporarily in S3 only

---

#### 4. Job Status Service (`status/status.js`)
```javascript
// Client polling for job completion
const config = {
  runtime: 'nodejs18.x',
  timeout: 30,
  memorySize: 512,
  handler: 'status.handler',
  environment: {
    TEMP_BUCKET_NAME: 'serenya-temp-files-{env}-{account}',
    AWS_REGION: 'eu-west-1'
  }
};
```

**Routes:**
- `GET /api/v1/process/status/{jobId}` - Check job status

**S3 Operations:**
- Check for existence of `outgoing/{jobId}`
- Return `processing`, `completed`, or `failed`

---

#### 5. Result Retrieval Service (`result/result.js`)
```javascript
// Fetch AI analysis results
const config = {
  runtime: 'nodejs18.x',
  timeout: 30,
  memorySize: 512,
  handler: 'result.handler',
  environment: {
    TEMP_BUCKET_NAME: 'serenya-temp-files-{env}-{account}',
    KMS_KEY_ID: 'alias/serenya-{env}',
    AWS_REGION: 'eu-west-1'
  }
};
```

**Routes:**
- `GET /api/v1/process/result/{jobId}` - Retrieve results

**S3 Operations:**
- Get object from `outgoing/{jobId}`
- Return encrypted medical data to client
- Client stores in local SQLite database

---

#### 6. Chat Prompts Service (`chat-prompts/chatPrompts.js`)
```javascript
// Health question prompts retrieval
const config = {
  runtime: 'nodejs18.x',
  timeout: 30,
  memorySize: 512,
  handler: 'chatPrompts.handler'
};
```

**Routes:**
- `GET /api/v1/chat/prompts` - Get chat prompts

**Static Prompts:** Returns predefined health question categories

---

#### 7. Chat Messages Service (`chat-messages/chatMessages.js`)
```javascript
// AI chat responses with Bedrock
const config = {
  runtime: 'nodejs18.x',
  timeout: 60, // 1 minute for Bedrock chat
  memorySize: 1024,
  handler: 'chatMessages.handler',
  environment: {
    TEMP_BUCKET_NAME: 'serenya-temp-files-{env}-{account}',
    AWS_REGION: 'eu-west-1',
    BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0'
  }
};
```

**Routes:**
- `POST /api/v1/chat/messages` - Submit chat message

**Processing:**
- Upload message to S3 `incoming/chat_{jobId}`
- S3 event triggers `process` Lambda
- Bedrock generates AI response
- Results stored in S3 `outgoing/chat_{jobId}`
- Client polls via status endpoint

---

#### 8. Chat Status Service (`chat-status/chatStatus.js`)
```javascript
// Chat job status polling
const config = {
  runtime: 'nodejs18.x',
  timeout: 30,
  memorySize: 512,
  handler: 'chatStatus.handler',
  environment: {
    TEMP_BUCKET_NAME: 'serenya-temp-files-{env}-{account}',
    AWS_REGION: 'eu-west-1'
  }
};
```

**Routes:**
- `GET /api/v1/chat/status/{jobId}` - Check chat job status

---

#### 9. Doctor Report Service (`doctor-report/doctorReport.js`)
```javascript
// Premium feature - historical health reports
const config = {
  runtime: 'nodejs18.x',
  timeout: 300, // 5 minutes for complex reports
  memorySize: 2048,
  handler: 'doctorReport.handler',
  environment: {
    DYNAMO_TABLE_NAME: 'serenya-{env}',
    TEMP_BUCKET_NAME: 'serenya-temp-files-{env}-{account}',
    AWS_REGION: 'eu-west-1',
    BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0'
  }
};
```

**Routes:**
- `POST /api/v1/process/doctor-report` - Generate premium report

**Premium Validation:**
- Check user subscription status in DynamoDB
- Require `current_subscription.type === 'premium'`

---

#### 10. S3 Cleanup Service (`cleanup/cleanup.js`)
```javascript
// Manual S3 object deletion
const config = {
  runtime: 'nodejs18.x',
  timeout: 30,
  memorySize: 512,
  handler: 'cleanup.handler',
  environment: {
    TEMP_BUCKET_NAME: 'serenya-temp-files-{env}-{account}',
    AWS_REGION: 'eu-west-1'
  }
};
```

**Routes:**
- `DELETE /api/v1/process/cleanup/{jobId}` - Delete job files

---

#### 11. Subscriptions Service (`subscriptions/subscriptions.js`)
```javascript
// Subscription management
const config = {
  runtime: 'nodejs18.x',
  timeout: 30,
  memorySize: 512,
  handler: 'subscriptions.handler',
  environment: {
    DYNAMO_TABLE_NAME: 'serenya-{env}',
    KMS_KEY_ID: 'alias/serenya-{env}',
    AWS_REGION: 'eu-west-1'
  }
};
```

**Routes:**
- `GET /api/v1/subscriptions` - Get subscription status
- `POST /api/v1/subscriptions/webhook` - Apple/Google webhook

**Database Operations:**
- DynamoDB UpdateItem (update embedded `current_subscription` object)

---

#### 12. User Profile Service (`user/userProfile.js`)
```javascript
// User profile CRUD operations
const config = {
  runtime: 'nodejs18.x',
  timeout: 30,
  memorySize: 512,
  handler: 'userProfile.handler',
  environment: {
    DYNAMO_TABLE_NAME: 'serenya-{env}',
    KMS_KEY_ID: 'alias/serenya-{env}',
    AWS_REGION: 'eu-west-1'
  }
};
```

**Routes:**
- `GET /api/v1/user/profile` - Get user profile
- `PUT /api/v1/user/profile` - Update user profile
- `DELETE /api/v1/user/profile` - Delete account

**Database Operations:**
- DynamoDB GetItem, UpdateItem, DeleteItem
- KMS encryption/decryption for PII fields

---

#### 13. API Gateway Authorizer (`authorizer/authorizer.js`)
```javascript
// JWT token validation
const config = {
  runtime: 'nodejs18.x',
  timeout: 10,
  memorySize: 256,
  handler: 'authorizer.handler',
  environment: {
    SECRETS_ARN: 'arn:aws:secretsmanager:...',
    AWS_REGION: 'eu-west-1'
  }
};
```

**Purpose:** Validate JWT tokens for all protected API routes

---

#### 14. DynamoDB Stream Processor (`stream-processor/streamProcessor.js`)
```javascript
// Observability event processing
const config = {
  runtime: 'nodejs18.x',
  timeout: 60,
  memorySize: 512,
  handler: 'streamProcessor.handler',
  environment: {
    EVENTS_BUCKET_NAME: 'serenya-events-{env}-{account}',
    AWS_REGION: 'eu-west-1'
  }
};
```

**Trigger:** DynamoDB Streams (NEW_AND_OLD_IMAGES)

**Processing:**
- Capture user registration events
- Track subscription changes (free → premium)
- Monitor session activity
- Store audit events in S3 events bucket

---

### Database Layer - Amazon DynamoDB

#### Production Configuration
```typescript
TableName: 'serenya-{environment}'
BillingMode: PAY_PER_REQUEST
PartitionKey: PK (String)
SortKey: SK (String)
Encryption: AWS_MANAGED
PointInTimeRecovery: true (production)
DynamoDBStreams: NEW_AND_OLD_IMAGES
TTL: Disabled (all records permanent)

// Global Secondary Indexes
GSI1-EmailLookup:
  PartitionKey: GSI1PK (EMAIL#{sha256(email)})
  SortKey: GSI1SK (USER#{userId})

GSI2-ExternalAuth:
  PartitionKey: GSI2PK (EXTERNAL#{provider}#{external_id})
  SortKey: GSI2SK (USER#{userId})
```

#### Data Model
**Single Entity Type:** User Profile

```javascript
{
  // Primary Keys
  PK: "USER#{userId}",
  SK: "PROFILE",

  // Identity
  id: "uuid",
  external_id: "google_sub",
  auth_provider: "google|apple",

  // PII (KMS Encrypted)
  email: "encrypted_base64",
  name: "encrypted_base64",
  given_name: "encrypted_base64",
  family_name: "encrypted_base64",

  // Embedded Objects
  consents: { privacy_policy: {...}, terms_of_service: {...} },
  current_subscription: { type: "free|premium", status: "active" },
  current_device: { platform: "ios|android", device_id: "..." },
  current_session: { session_id: "jwt", expires_at: 123456 },
  current_biometric: { biometric_type: "face", ... } || null,

  // GSI Keys
  GSI1PK: "EMAIL#{sha256(email)}",
  GSI1SK: "USER#{userId}",
  GSI2PK: "EXTERNAL#google#{external_id}",
  GSI2SK: "USER#{userId}",

  // Metadata
  created_at: 1704672000000,
  updated_at: 1704672000000
}
```

**No Medical Data:** All lab results, vitals, and chat messages stored locally on device

---

### Storage Layer - Amazon S3

#### Temporary Files Bucket
```typescript
BucketName: 'serenya-temp-files-{env}-{account}'
Encryption: KMS
LifecyclePolicy: Delete after 2 days
CORS: Enabled for presigned uploads

// Folder Structure
incoming/
  result_{userId}_{timestamp}_{random}     # Document uploads
  chat_{userId}_{timestamp}_{random}       # Chat messages
  report_{userId}_{timestamp}_{random}     # Premium reports

outgoing/
  {jobId}  # AI processing results (JSON)
```

#### Observability Events Bucket
```typescript
BucketName: 'serenya-events-{env}-{account}'
Encryption: KMS
LifecyclePolicy:
  - Infrequent Access: 90 days
  - Glacier: 365 days
  - Retention: 7 years (HIPAA)

// Event Storage
observability/
  year=2025/
    month=01/
      day=15/
        user-registration-{timestamp}.json
        subscription-change-{timestamp}.json
```

---

## 🔐 Security Infrastructure

### AWS KMS Key Management
```typescript
// Single encryption key for all data
SerenyaEncryptionKey:
  Description: "PHI data encryption"
  EnableKeyRotation: true
  UsedBy:
    - DynamoDB (field-level encryption)
    - S3 (server-side encryption)
    - Secrets Manager
```

**Field-Level Encryption:**
- User PII: email, name, given_name, family_name
- Biometric templates
- Temporary S3 objects

### IAM Roles and Policies

#### Lambda Execution Role
```typescript
LambdaExecutionRole:
  ManagedPolicies:
    - AWSLambdaBasicExecutionRole

  InlinePolicies:
    // DynamoDB Access
    - PutItem, GetItem, UpdateItem, DeleteItem
    - Query, Scan, BatchGetItem, BatchWriteItem
    - Access to table and GSI indexes

    // S3 Access
    - GetObject, PutObject, DeleteObject
    - Temp files bucket and events bucket

    // KMS Access
    - Decrypt, GenerateDataKey
    - Encryption key access

    // Secrets Manager
    - GetSecretValue (API secrets)

    // Bedrock Access
    - InvokeModel (Claude 3 Haiku)
    - InvokeModelWithResponseStream
```

### Network Security

**No VPC Required:**
- DynamoDB: AWS-managed service (no VPC)
- Lambda: Outside VPC for optimal performance
- S3: AWS-managed service (no VPC)
- Bedrock: AWS-managed service (no VPC)

**Encryption in Transit:**
- Client → API Gateway: TLS 1.3
- API Gateway → Lambda: AWS internal encryption
- Lambda → DynamoDB: AWS internal encryption
- Lambda → S3: AWS internal encryption
- Lambda → Bedrock: AWS internal encryption

---

## 📊 Monitoring & Observability

### ObservabilityConstruct

**Location:** `infrastructure/observability-construct.ts`

#### CloudWatch Dashboards (3)

**1. Executive Dashboard**
- User registrations (daily, weekly, monthly)
- Active users
- Document processing volume
- Premium subscriptions
- Revenue metrics

**2. Operations Dashboard**
- Lambda duration/invocations/errors (all 14 functions)
- DynamoDB read/write capacity
- DynamoDB throttling events
- API Gateway 4xx/5xx errors
- S3 object count/size

**3. Security Dashboard**
- Failed authentication attempts
- Suspicious activity patterns
- KMS encryption/decryption calls
- DynamoDB Streams processing

#### CloudWatch Alarms

**Critical Alarms (SNS):**
- Lambda errors > 10 in 5 minutes
- DynamoDB throttling detected
- API Gateway 5xx > 10 in 5 minutes
- Bedrock service unavailable

**Warning Alarms (Email):**
- Lambda duration approaching timeout
- DynamoDB capacity warnings
- S3 bucket size growing

### DynamoDB Streams Processing

**Stream Processor Lambda:**
- Triggered by all DynamoDB changes
- Captures user lifecycle events
- Tracks subscription changes
- Monitors authentication activity
- Stores events in S3 events bucket

**Business Intelligence Metrics:**
```javascript
// User Journey Tracking
- user_registered
- user_first_login
- document_processed
- subscription_upgraded
- premium_feature_used

// Observability Metrics
- CloudWatch custom metrics
- S3 event logs (7-year retention)
- Audit trail for HIPAA compliance
```

---

## 💰 Cost Optimization

### Estimated Monthly Costs (10,000 users)

| Service | Usage | Monthly Cost |
|---------|-------|--------------|
| **Lambda** | 14 functions, 1M invocations | $50 |
| **DynamoDB** | Pay-per-request | $25-50 |
| **DynamoDB Streams** | Event processing | $5 |
| **S3 (temp files)** | 2-day lifecycle | $5 |
| **S3 (events)** | 7-year retention | $10 |
| **API Gateway** | 1M requests | $35 |
| **CloudWatch** | Dashboards + alarms | $34 |
| **Bedrock (Claude Haiku)** | 3000 analyses | $8 |
| **KMS** | Encryption operations | $10 |
| **Total** | | **~$182/month** |

### Cost Optimization Strategies

**Serverless Auto-Scaling:**
- No reserved capacity costs
- Pay only for actual usage
- Automatic scaling to zero

**S3 Lifecycle Policies:**
- Temp files deleted after 2 days
- Events moved to Infrequent Access (90 days)
- Events moved to Glacier (365 days)

**DynamoDB Single-Table:**
- Fewer tables = lower costs
- Pay-per-request billing
- No idle capacity charges

---

## 🚀 Deployment & CI/CD

### AWS CDK Infrastructure as Code

**Stack:** `SerenyaBackendStack`

```typescript
// app.ts
const app = new cdk.App();

new SerenyaBackendStack(app, 'SerenyaBackend-dev', {
  environment: 'dev',
  config: {
    region: 'eu-west-1',
    allowOrigins: ['http://localhost:3000'],
    retentionDays: 7,
    enableDetailedLogging: true
  }
});

new SerenyaBackendStack(app, 'SerenyaBackend-prod', {
  environment: 'prod',
  config: {
    region: 'eu-west-1',
    allowOrigins: ['https://app.serenya.health'],
    retentionDays: 365,
    enableDetailedLogging: false,
    alertEmail: 'alerts@serenya.health'
  }
});
```

### Deployment Commands

```bash
# Install dependencies
cd serenya_app/backend
npm install

# Compile TypeScript
npm run build

# Deploy to development
npm run deploy:dev

# Deploy to production
npm run deploy:prod
```

---

## 🔄 Disaster Recovery

### Backup Strategy

**DynamoDB:**
- Point-in-time recovery enabled (production)
- Continuous backups (last 35 days)
- On-demand backups before major changes

**S3:**
- Versioning disabled (temp files)
- Events bucket retention (7 years)
- Cross-region replication (future)

### Recovery Procedures

**DynamoDB Table Restore:**
```bash
# Restore to specific point in time
aws dynamodb restore-table-to-point-in-time \
  --source-table-name serenya-prod \
  --target-table-name serenya-prod-restored \
  --restore-date-time "2025-01-15T12:00:00Z"
```

**Lambda Function Rollback:**
```bash
# Rollback to previous version
aws lambda update-alias \
  --function-name SerenyaBackend-prod-AuthFunction \
  --name live \
  --function-version <previous-version>
```

---

## 📈 Performance & Scaling

### Auto-Scaling Configuration

**Lambda Concurrency:**
- Reserved: 50 concurrent executions
- Provisioned: 10 warm instances (production)
- Auto-scaling: Unlimited (burst to 1000)

**DynamoDB Capacity:**
- Billing Mode: PAY_PER_REQUEST
- Auto-scaling: Automatic
- No capacity planning required

### Performance Benchmarks

**API Response Times:**
- Authentication: <200ms (p99)
- Document upload: <500ms (presigned URL)
- Job status: <100ms (S3 head request)
- Result retrieval: <300ms (S3 get)

**Processing Times:**
- Document analysis: 8-25 seconds (Bedrock)
- Chat response: 3-8 seconds (Bedrock)
- Premium report: 12-25 seconds (Bedrock)

---

## 🛡️ HIPAA Compliance

### Compliance Measures

**Data Protection:**
- No PHI stored in DynamoDB (only authentication data)
- Temporary S3 storage (2 days max)
- KMS encryption at rest
- TLS 1.3 encryption in transit

**Audit Logging:**
- DynamoDB Streams capture all database changes
- S3 events bucket (7-year retention)
- CloudWatch Logs (Lambda execution logs)
- API Gateway access logs

**Access Controls:**
- JWT authentication required
- IAM least-privilege policies
- KMS key policies
- API Gateway rate limiting

---

## 📚 Related Documentation

- **[database-architecture.md](database-architecture.md)** - DynamoDB single-table design
- **[api-contracts.md](api-contracts.md)** - API endpoint specifications
- **[llm-integration-architecture.md](llm-integration-architecture.md)** - Bedrock AI integration
- **[observability.md](observability.md)** - Monitoring and observability
- **[deployment-procedures.md](deployment-procedures.md)** - Deployment guide
- **[our-dev-rules.md](our-dev-rules.md)** - Development standards

---

**Document Status**: ✅ Complete - DynamoDB Serverless Architecture
**Last Updated**: January 2025
**Infrastructure:** AWS Lambda + DynamoDB + S3 + Bedrock + CloudWatch
**No VPC, No RDS, No EC2** - Fully serverless
**Next Review**: March 2025
