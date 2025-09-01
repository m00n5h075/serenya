# System Architecture - Serenya AI Health Agent

**Date:** September 1, 2025  
**Domain:** Cloud Infrastructure & System Design  
**AI Agent:** System Architecture Agent  
**Dependencies:**
- **← database-architecture.md**: PostgreSQL deployment and connection management
- **← api-contracts.md**: AWS Lambda function requirements and endpoints
- **← encryption-strategy.md**: AWS KMS integration and key management
- **← audit-logging.md**: CloudTrail and logging infrastructure requirements
**Cross-References:**
- **→ mobile-architecture.md**: Client-server communication patterns and offline sync
- **→ implementation-roadmap.md**: Infrastructure setup timeline (Week 1-2, Phase 1)

---

## 🏗️ **System Architecture Overview**

### **Architecture Philosophy**
- **Cloud-Native**: Serverless-first with AWS managed services
- **Security-First**: Multi-layered security with encryption at rest and in transit
- **Compliance-Ready**: HIPAA/GDPR compliant infrastructure from day one
- **Scalable**: Auto-scaling components that handle growth seamlessly
- **Resilient**: Multi-AZ deployment with automated failover and backup
- **Observable**: Comprehensive monitoring, logging, and alerting

### **High-Level Architecture Diagram**
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Mobile Apps   │    │   Web Console    │    │  Admin Dashboard│
│  (iOS/Android)  │    │   (Optional)     │    │   (Internal)    │
└─────────┬───────┘    └────────┬─────────┘    └─────────┬───────┘
          │                     │                        │
          └─────────────────────┼────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Amazon CloudFront   │
                    │  (Global CDN + WAF)   │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │   API Gateway (v2)    │
                    │  Rate Limiting + Auth │
                    └───────────┬───────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
  ┌───────▼────────┐   ┌────────▼────────┐   ┌───────▼────────┐
  │  Auth Lambda   │   │Document Lambda  │   │  Chat Lambda   │
  │  (Node.js)     │   │  (Node.js)      │   │  (Node.js)     │
  └───────┬────────┘   └────────┬────────┘   └───────┬────────┘
          │                     │                     │
          └─────────────────────┼─────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Amazon RDS         │
                    │  (PostgreSQL)        │
                    │  Multi-AZ + Backups  │
                    └───────────┬───────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
┌───────▼────────┐     ┌────────▼────────┐     ┌───────▼────────┐
│   AWS KMS      │     │  Amazon S3      │     │  CloudWatch    │
│ (Encryption)   │     │ (Documents)     │     │ (Monitoring)   │
└────────────────┘     └─────────────────┘     └────────────────┘
```

---

## ☁️ **AWS Infrastructure Components**

### **Compute Layer - AWS Lambda Functions**

#### **Authentication Service**
```typescript
// auth-function/handler.ts
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { httpMethod, path, body } = event;
  
  // Route handling
  if (path === '/auth/google' && httpMethod === 'POST') {
    return await handleGoogleAuth(JSON.parse(body));
  }
  
  if (path === '/auth/refresh' && httpMethod === 'POST') {
    return await handleTokenRefresh(JSON.parse(body));
  }
  
  return { statusCode: 404, body: JSON.stringify({ error: 'Not Found' }) };
};

// Configuration
const config = {
  runtime: 'nodejs18.x',
  timeout: 30, // seconds
  memorySize: 512, // MB
  environment: {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    KMS_KEY_ID: process.env.KMS_KEY_ID
  }
};
```

#### **Document Processing Service**
```typescript
// document-function/handler.ts
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { httpMethod, path, body } = event;
  
  if (path === '/documents/upload' && httpMethod === 'POST') {
    return await handleDocumentUpload(JSON.parse(body));
  }
  
  if (path.match(/\/jobs\/(.+)\/status/) && httpMethod === 'GET') {
    const jobId = path.split('/')[2];
    return await handleJobStatus(jobId);
  }
  
  return { statusCode: 404, body: JSON.stringify({ error: 'Not Found' }) };
};

// Configuration - Higher resources for AI processing
const config = {
  runtime: 'nodejs18.x',
  timeout: 180, // 3 minutes for AI processing
  memorySize: 2048, // 2GB for document processing
  environment: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
    DATABASE_URL: process.env.DATABASE_URL,
    KMS_KEY_ID: process.env.KMS_KEY_ID
  }
};
```

#### **Chat & Conversation Service**
```typescript
// chat-function/handler.ts
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { httpMethod, path, body } = event;
  
  if (path === '/chat/messages' && httpMethod === 'POST') {
    return await handleChatMessage(JSON.parse(body));
  }
  
  if (path.match(/\/chat\/conversations\/(.+)/) && httpMethod === 'GET') {
    const contentId = path.split('/')[3];
    return await handleGetConversation(contentId);
  }
  
  return { statusCode: 404, body: JSON.stringify({ error: 'Not Found' }) };
};

// Configuration
const config = {
  runtime: 'nodejs18.x',
  timeout: 60, // 1 minute for AI chat responses
  memorySize: 1024, // 1GB for AI processing
  environment: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    KMS_KEY_ID: process.env.KMS_KEY_ID
  }
};
```

### **Database Layer - Amazon RDS PostgreSQL**

#### **Production Configuration**
```yaml
# RDS Configuration
DatabaseInstance:
  Engine: postgres
  EngineVersion: "15.4"
  InstanceClass: db.r6g.large # 2 vCPU, 16GB RAM
  AllocatedStorage: 100 # GB, SSD
  StorageType: gp3
  StorageEncrypted: true
  MultiAZ: true # High availability
  BackupRetentionPeriod: 30 # days
  PreferredBackupWindow: "03:00-04:00" # UTC
  PreferredMaintenanceWindow: "sun:04:00-sun:05:00" # UTC
  VpcSecurityGroupIds: 
    - !Ref DatabaseSecurityGroup
  DBSubnetGroupName: !Ref DatabaseSubnetGroup

# Performance and Monitoring
PerformanceInsightsEnabled: true
MonitoringInterval: 60 # seconds
EnableCloudwatchLogsExports:
  - postgresql
```

#### **Connection Management**
```typescript
// database/connection.ts
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum connections
  idleTimeoutMillis: 30000, // Close idle connections after 30s
  connectionTimeoutMillis: 2000, // Timeout connection attempts after 2s
  ssl: {
    rejectUnauthorized: false // Required for RDS
  }
});

// Connection with retry logic
export async function getConnection() {
  const maxRetries = 3;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      const client = await pool.connect();
      return client;
    } catch (error) {
      retries++;
      if (retries === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * retries));
    }
  }
}
```

### **Storage Layer - Amazon S3**

#### **Document Storage Configuration**
```yaml
# S3 Bucket for documents
DocumentBucket:
  BucketName: serenya-documents-prod
  VersioningConfiguration:
    Status: Enabled
  BucketEncryption:
    ServerSideEncryptionConfiguration:
      - ServerSideEncryptionByDefault:
          SSEAlgorithm: aws:kms
          KMSMasterKeyID: !Ref DocumentsKMSKey
  PublicAccessBlockConfiguration:
    BlockPublicAcls: true
    BlockPublicPolicy: true
    IgnorePublicAcls: true
    RestrictPublicBuckets: true
  LifecycleConfiguration:
    Rules:
      - Id: DeleteProcessedDocuments
        Status: Enabled
        ExpirationInDays: 1 # Delete after processing
```

#### **Document Processing Workflow**
```typescript
// storage/document-handler.ts
import { S3, KMS } from 'aws-sdk';

const s3 = new S3();
const kms = new KMS();

export async function uploadDocument(
  fileData: Buffer, 
  fileName: string, 
  userId: string
): Promise<string> {
  const key = `uploads/${userId}/${Date.now()}-${fileName}`;
  
  const uploadParams = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    Body: fileData,
    ServerSideEncryption: 'aws:kms',
    SSEKMSKeyId: process.env.KMS_KEY_ID,
    ContentType: 'application/octet-stream',
    Metadata: {
      'user-id': userId,
      'upload-timestamp': new Date().toISOString()
    }
  };
  
  await s3.upload(uploadParams).promise();
  return key;
}

export async function scheduleDocumentDeletion(key: string): Promise<void> {
  // Schedule deletion after 24 hours
  const deleteParams = {
    Bucket: process.env.S3_BUCKET_NAME,
    Delete: {
      Objects: [{ Key: key }]
    }
  };
  
  // Use EventBridge to schedule deletion
  await scheduleEventBridgeRule(deleteParams, 24); // hours
}
```

---

## 🔐 **Security Infrastructure**

### **AWS KMS Key Management**
```yaml
# KMS Keys for different data types
DatabaseEncryptionKey:
  Type: AWS::KMS::Key
  Properties:
    Description: "Serenya database field encryption"
    KeyPolicy:
      Statement:
        - Sid: Enable Lambda access
          Effect: Allow
          Principal:
            AWS: !Sub "${LambdaRole.Arn}"
          Action:
            - kms:Encrypt
            - kms:Decrypt
            - kms:ReEncrypt*
            - kms:GenerateDataKey*
            - kms:DescribeKey

DocumentsKMSKey:
  Type: AWS::KMS::Key
  Properties:
    Description: "Serenya document storage encryption"
    KeyPolicy:
      Statement:
        - Sid: Enable S3 service access
          Effect: Allow
          Principal:
            Service: s3.amazonaws.com
          Action:
            - kms:Encrypt
            - kms:Decrypt
            - kms:ReEncrypt*
            - kms:GenerateDataKey*
```

### **Network Security - VPC Configuration**
```yaml
# VPC for all resources
VPC:
  Type: AWS::EC2::VPC
  Properties:
    CidrBlock: 10.0.0.0/16
    EnableDnsHostnames: true
    EnableDnsSupport: true

# Private subnets for RDS
PrivateSubnet1:
  Type: AWS::EC2::Subnet
  Properties:
    VpcId: !Ref VPC
    CidrBlock: 10.0.1.0/24
    AvailabilityZone: !Select [0, !GetAZs '']

PrivateSubnet2:
  Type: AWS::EC2::Subnet  
  Properties:
    VpcId: !Ref VPC
    CidrBlock: 10.0.2.0/24
    AvailabilityZone: !Select [1, !GetAZs '']

# Security group for database
DatabaseSecurityGroup:
  Type: AWS::EC2::SecurityGroup
  Properties:
    VpcId: !Ref VPC
    GroupDescription: Security group for PostgreSQL database
    SecurityGroupIngress:
      - IpProtocol: tcp
        FromPort: 5432
        ToPort: 5432
        SourceSecurityGroupId: !Ref LambdaSecurityGroup
```

### **IAM Roles and Policies**
```yaml
# Lambda execution role
LambdaExecutionRole:
  Type: AWS::IAM::Role
  Properties:
    AssumeRolePolicyDocument:
      Statement:
        - Effect: Allow
          Principal:
            Service: lambda.amazonaws.com
          Action: sts:AssumeRole
    ManagedPolicyArns:
      - arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole
    Policies:
      - PolicyName: DatabaseAccess
        PolicyDocument:
          Statement:
            - Effect: Allow
              Action:
                - rds-db:connect
              Resource: !Sub "${DatabaseInstance}/*"
      - PolicyName: KMSAccess
        PolicyDocument:
          Statement:
            - Effect: Allow
              Action:
                - kms:Encrypt
                - kms:Decrypt
                - kms:ReEncrypt*
                - kms:GenerateDataKey*
                - kms:DescribeKey
              Resource:
                - !GetAtt DatabaseEncryptionKey.Arn
                - !GetAtt DocumentsKMSKey.Arn
      - PolicyName: S3Access
        PolicyDocument:
          Statement:
            - Effect: Allow
              Action:
                - s3:GetObject
                - s3:PutObject
                - s3:DeleteObject
              Resource: !Sub "${DocumentBucket}/*"
```

---

## 📊 **Monitoring & Observability**

### **CloudWatch Dashboards**
```typescript
// monitoring/dashboard.ts
const dashboardConfig = {
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/Lambda", "Duration", "FunctionName", "auth-function"],
          ["AWS/Lambda", "Duration", "FunctionName", "document-function"],
          ["AWS/Lambda", "Duration", "FunctionName", "chat-function"]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-west-2",
        "title": "Lambda Function Duration"
      }
    },
    {
      "type": "metric", 
      "properties": {
        "metrics": [
          ["AWS/ApiGatewayV2", "Count", "ApiId", "serenya-api"],
          ["AWS/ApiGatewayV2", "4XXError", "ApiId", "serenya-api"],
          ["AWS/ApiGatewayV2", "5XXError", "ApiId", "serenya-api"]
        ],
        "period": 300,
        "stat": "Sum",
        "region": "us-west-2", 
        "title": "API Gateway Requests & Errors"
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", "serenya-db"],
          ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", "serenya-db"],
          ["AWS/RDS", "FreeableMemory", "DBInstanceIdentifier", "serenya-db"]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-west-2",
        "title": "Database Performance"
      }
    }
  ]
};
```

### **Alarms and Notifications**
```yaml
# Critical alarms
HighErrorRateAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmDescription: "High API error rate"
    MetricName: 5XXError
    Namespace: AWS/ApiGatewayV2
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 2
    Threshold: 10
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref CriticalAlertsTopic

DatabaseConnectionAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmDescription: "Database connection count high"
    MetricName: DatabaseConnections
    Namespace: AWS/RDS
    Statistic: Average
    Period: 300
    EvaluationPeriods: 3
    Threshold: 80
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref WarningAlertsTopic

LambdaDurationAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmDescription: "Lambda function duration high"
    MetricName: Duration
    Namespace: AWS/Lambda
    Statistic: Average
    Period: 300
    EvaluationPeriods: 2
    Threshold: 25000 # 25 seconds
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref PerformanceAlertsTopic
```

### **Structured Logging**
```typescript
// utils/logger.ts
import { createLogger, format, transports } from 'winston';

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: {
    service: 'serenya-api',
    version: process.env.APP_VERSION || '1.0.0'
  },
  transports: [
    new transports.Console()
  ]
});

// Usage in Lambda functions
export function logApiRequest(event: APIGatewayProxyEvent, context: Context) {
  logger.info('API Request', {
    requestId: context.awsRequestId,
    method: event.httpMethod,
    path: event.path,
    userAgent: event.headers['user-agent'],
    sourceIp: event.requestContext.identity.sourceIp,
    timestamp: new Date().toISOString()
  });
}

export function logError(error: Error, context: any = {}) {
  logger.error('Application Error', {
    error: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  });
}
```

---

## 🚀 **Deployment & CI/CD**

### **AWS CDK Infrastructure as Code**
```typescript
// infrastructure/app.ts
import * as cdk from 'aws-cdk-lib';
import { SerenyaStack } from './serenya-stack';

const app = new cdk.App();

// Production environment
new SerenyaStack(app, 'SerenyaProductionStack', {
  env: {
    account: process.env.AWS_ACCOUNT_ID,
    region: 'us-west-2'
  },
  stage: 'production',
  domainName: 'api.serenya.health'
});

// Development environment
new SerenyaStack(app, 'SerenyaDevelopmentStack', {
  env: {
    account: process.env.AWS_ACCOUNT_ID,
    region: 'us-west-2'
  },
  stage: 'development',
  domainName: 'api-dev.serenya.health'
});
```

### **GitHub Actions CI/CD Pipeline**
```yaml
# .github/workflows/deploy.yml
name: Deploy Serenya API

on:
  push:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test
      - run: npm run lint
      - run: npm run type-check

  deploy-dev:
    if: github.ref == 'refs/heads/develop'
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-west-2
      - run: npx cdk deploy SerenyaDevelopmentStack --require-approval never

  deploy-prod:
    if: github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-west-2
      - run: npx cdk deploy SerenyaProductionStack --require-approval never
```

---

## 📈 **Performance & Scaling**

### **Auto-Scaling Configuration**
```typescript
// Lambda auto-scaling is automatic, but we configure:
const lambdaConfig = {
  concurrency: {
    reserved: 50, // Reserve capacity
    provisioned: 10 // Keep warm instances
  },
  
  // Cold start optimization
  bundling: {
    minify: true,
    externalModules: ['aws-sdk'], // Exclude AWS SDK
    nodeModules: ['pg', 'jsonwebtoken'] // Include essential modules
  }
};

// RDS connection pooling
const databaseConfig = {
  maxConnections: 100, // RDS instance limit
  connectionPool: {
    min: 5, // Always keep minimum connections
    max: 20, // Per Lambda function
    acquireTimeoutMillis: 2000,
    createTimeoutMillis: 2000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000
  }
};
```

### **Caching Strategy**
```typescript
// API Gateway caching
const apiGatewayCache = {
  '/content/timeline': {
    ttl: 300, // 5 minutes
    keyParameters: ['userId', 'limit', 'offset']
  },
  '/subscriptions/status': {
    ttl: 900, // 15 minutes
    keyParameters: ['userId']
  }
};

// In-memory caching for Lambda
import NodeCache from 'node-cache';

const cache = new NodeCache({
  stdTTL: 300, // 5 minutes default
  checkperiod: 60, // Check for expired keys every minute
  useClones: false // For performance
});

export function getCachedOrFetch<T>(
  key: string, 
  fetchFn: () => Promise<T>,
  ttl: number = 300
): Promise<T> {
  const cached = cache.get<T>(key);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }
  
  return fetchFn().then(result => {
    cache.set(key, result, ttl);
    return result;
  });
}
```

---

## 🔄 **Disaster Recovery & Backup**

### **Backup Strategy**
```yaml
# RDS automated backups
BackupConfiguration:
  BackupRetentionPeriod: 30 # days
  PreferredBackupWindow: "03:00-04:00" # UTC
  DeleteAutomatedBackups: false
  DeletionProtection: true

# Cross-region backup for critical data
CrossRegionBackup:
  DestinationRegion: us-east-1
  BackupPlan:
    BackupPlanName: SerenyaCrossRegionBackup
    BackupPlanRule:
      - RuleName: DailyBackups
        TargetBackupVault: SerenyaBackupVault
        ScheduleExpression: "cron(0 2 ? * * *)" # Daily at 2 AM UTC
        Lifecycle:
          DeleteAfterDays: 365 # 1 year retention
```

### **Disaster Recovery Procedures**
```typescript
// DR automation scripts
const disasterRecoveryPlan = {
  rto: 4, // hours - Recovery Time Objective  
  rpo: 1, // hour - Recovery Point Objective
  
  procedures: {
    databaseFailure: async () => {
      // 1. Promote read replica to master
      await rds.promoteReadReplica({
        DBInstanceIdentifier: 'serenya-db-replica'
      });
      
      // 2. Update Lambda environment variables
      await updateLambdaConfig({
        DATABASE_URL: process.env.REPLICA_DATABASE_URL
      });
      
      // 3. Update Route 53 health checks
      await updateHealthChecks();
    },
    
    regionFailure: async () => {
      // 1. Activate cross-region resources
      await activateStandbyRegion('us-east-1');
      
      // 2. Restore from latest backup
      await restoreFromBackup('latest');
      
      // 3. Update DNS to point to DR region
      await updateDNSFailover();
    }
  }
};
```

---

## 🔄 **Agent Handoff Requirements**

### **For Mobile Architecture Agent (→ mobile-architecture.md)**
**Infrastructure Integration Points**:
- API Gateway endpoints and authentication flow
- WebSocket connections for real-time updates (future enhancement)
- CDN configuration for static assets and app updates
- Error handling patterns for AWS service failures
- Network optimization and timeout configuration

### **For Database Architecture Agent (→ database-architecture.md)**
**Database Infrastructure Requirements**:
- RDS connection string format and SSL requirements
- Connection pool configuration and limits
- Backup and recovery procedures
- Performance monitoring and optimization
- Migration deployment automation

### **For API Design Agent (→ api-contracts.md)**
**Deployment and Runtime Environment**:
- Lambda function configuration and limits
- Environment variable management
- External service integration (Anthropic AI)
- Error handling and retry logic
- Performance optimization and cold start reduction

### **For Security Implementation Agent (→ encryption-strategy.md)**
**Security Infrastructure Integration**:
- AWS KMS key policies and access patterns
- VPC and network security configuration
- IAM roles and permission boundaries
- CloudTrail integration for security audit
- Certificate management and TLS termination

---

**Document Status**: ✅ Complete - Ready for infrastructure deployment and service integration  
**Infrastructure Coverage**: Complete AWS architecture with security, monitoring, and DR  
**Cross-References**: All system components mapped to implementation requirements  
**Next Steps**: Database setup + Lambda deployment + security configuration + monitoring activation