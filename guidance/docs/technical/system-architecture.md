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

// Configuration - Higher resources for Bedrock AI processing
const config = {
  runtime: 'nodejs18.x',
  timeout: 180, // 3 minutes for Bedrock AI processing
  memorySize: 2048, // 2GB for document processing
  environment: {
    BEDROCK_REGION: process.env.BEDROCK_REGION || 'eu-west-1',
    BEDROCK_MODEL_ID: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
    DATABASE_URL: process.env.DATABASE_URL,
    KMS_KEY_ID: process.env.KMS_KEY_ID,
    COST_TRACKING_TABLE: process.env.COST_TRACKING_TABLE
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
  timeout: 60, // 1 minute for Bedrock AI chat responses
  memorySize: 1024, // 1GB for Bedrock AI processing
  environment: {
    BEDROCK_REGION: process.env.BEDROCK_REGION || 'eu-west-1',
    BEDROCK_MODEL_ID: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    DATABASE_URL: process.env.DATABASE_URL,
    KMS_KEY_ID: process.env.KMS_KEY_ID,
    COST_TRACKING_TABLE: process.env.COST_TRACKING_TABLE
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
  userId: string,
  jobId: string
): Promise<string> {
  // Updated S3 key structure to match API contracts workflow
  const key = `jobs/${jobId}_original`;
  
  const uploadParams = {
    Bucket: 'serenya-temp-processing', // Updated bucket name
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
  // Deletion handled by S3 lifecycle policies (2 days retention)
  // No manual deletion needed - lifecycle rules handle cleanup automatically
  console.log(`Document ${key} scheduled for automatic deletion via lifecycle policy`);
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

### **VPC PrivateLink for AWS Bedrock Integration**

**Purpose**: Secure, private connectivity to AWS Bedrock for AI processing without internet exposure

```yaml
# VPC Endpoint for Bedrock (PrivateLink)
BedrockVPCEndpoint:
  Type: AWS::EC2::VPCEndpoint
  Properties:
    VpcId: !Ref VPC
    ServiceName: !Sub 'com.amazonaws.${AWS::Region}.bedrock-runtime'
    VpcEndpointType: Interface
    SubnetIds:
      - !Ref PrivateSubnet1
      - !Ref PrivateSubnet2
    SecurityGroupIds:
      - !Ref BedrockSecurityGroup
    PrivateDnsEnabled: true
    PolicyDocument:
      Version: '2012-10-17'
      Statement:
        - Effect: Allow
          Principal: '*'
          Action:
            - bedrock:InvokeModel
            - bedrock:InvokeModelWithResponseStream
          Resource: !Sub 'arn:aws:bedrock:${AWS::Region}::foundation-model/anthropic.claude-3-5-sonnet-*'

# Security group for Bedrock VPC Endpoint
BedrockSecurityGroup:
  Type: AWS::EC2::SecurityGroup
  Properties:
    VpcId: !Ref VPC
    GroupDescription: Security group for Bedrock VPC Endpoint
    SecurityGroupIngress:
      - IpProtocol: tcp
        FromPort: 443
        ToPort: 443
        SourceSecurityGroupId: !Ref LambdaSecurityGroup
        Description: HTTPS access from Lambda functions
```

**Medical Document Processing Security Architecture**:
1. **Encrypted Upload**: Documents uploaded encrypted to S3 temporary storage
2. **Lambda Processing**: ProcessFunction temporarily decrypts documents in memory only
3. **VPC PrivateLink**: Bedrock communication stays within AWS private network
4. **Secure Memory Management**: Plaintext content securely deleted from Lambda memory
5. **Response Encryption**: AI results encrypted before storage/transmission
6. **Automatic Cleanup**: S3 temporary files automatically deleted

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
              Resource: 
                - !Sub "${TempProcessingBucket}/*"
                - !Sub "${TempProcessingBucket}"
      - PolicyName: BedrockAccess
        PolicyDocument:
          Statement:
            - Effect: Allow
              Action:
                - bedrock:InvokeModel
                - bedrock:InvokeModelWithResponseStream
              Resource: 
                - !Sub 'arn:aws:bedrock:${AWS::Region}::foundation-model/anthropic.claude-3-5-sonnet-*'
                - !Sub 'arn:aws:bedrock:${AWS::Region}::foundation-model/anthropic.claude-3-haiku-*'
            - Effect: Allow
              Action:
                - bedrock:GetFoundationModel
                - bedrock:ListFoundationModels
              Resource: '*'
      - PolicyName: CostTrackingAccess
        PolicyDocument:
          Statement:
            - Effect: Allow
              Action:
                - dynamodb:PutItem
                - dynamodb:Query
                - dynamodb:UpdateItem
              Resource: !Sub "${CostTrackingTable.Arn}"
            - Effect: Allow
              Action:
                - cloudwatch:PutMetricData
              Resource: '*'
              Condition:
                StringEquals:
                  'cloudwatch:namespace': 'Serenya/LLM'
```

### **Cost Tracking Infrastructure**

#### **DynamoDB Table for LLM Usage**
```yaml
# Cost tracking table
CostTrackingTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: serenya-llm-cost-tracking
    BillingMode: PAY_PER_REQUEST
    AttributeDefinitions:
      - AttributeName: userId
        AttributeType: S
      - AttributeName: timestamp
        AttributeType: N
    KeySchema:
      - AttributeName: userId
        KeyType: HASH
      - AttributeName: timestamp
        KeyType: RANGE
    TimeToLiveSpecification:
      AttributeName: ttl
      Enabled: true
    GlobalSecondaryIndexes:
      - IndexName: monthly-usage-index
        KeySchema:
          - AttributeName: userId
            KeyType: HASH
          - AttributeName: month
            KeyType: RANGE
        Projection:
          ProjectionType: INCLUDE
          NonKeyAttributes: [inputTokens, outputTokens, totalCost]
    PointInTimeRecoverySpecification:
      PointInTimeRecoveryEnabled: true
```

#### **CloudWatch Metrics for LLM Usage**
```typescript
// monitoring/llm-metrics.ts
import { CloudWatch } from 'aws-sdk';

const cloudwatch = new CloudWatch();

export interface LLMUsageMetrics {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  provider: 'bedrock' | 'mock';
  modelId: string;
  processingTimeMs: number;
  userId: string;
  documentType: 'lab_results' | 'vitals' | 'chat' | 'report';
}

export async function trackLLMUsage(metrics: LLMUsageMetrics): Promise<void> {
  const metricData = [
    {
      MetricName: 'InputTokens',
      Dimensions: [
        { Name: 'Provider', Value: metrics.provider },
        { Name: 'ModelId', Value: metrics.modelId },
        { Name: 'DocumentType', Value: metrics.documentType }
      ],
      Value: metrics.inputTokens,
      Unit: 'Count',
      Timestamp: new Date()
    },
    {
      MetricName: 'OutputTokens', 
      Dimensions: [
        { Name: 'Provider', Value: metrics.provider },
        { Name: 'ModelId', Value: metrics.modelId },
        { Name: 'DocumentType', Value: metrics.documentType }
      ],
      Value: metrics.outputTokens,
      Unit: 'Count',
      Timestamp: new Date()
    },
    {
      MetricName: 'TotalCost',
      Dimensions: [
        { Name: 'Provider', Value: metrics.provider },
        { Name: 'ModelId', Value: metrics.modelId }
      ],
      Value: metrics.totalCost,
      Unit: 'Count', // Cost in cents
      Timestamp: new Date()
    },
    {
      MetricName: 'ProcessingTime',
      Dimensions: [
        { Name: 'DocumentType', Value: metrics.documentType }
      ],
      Value: metrics.processingTimeMs,
      Unit: 'Milliseconds',
      Timestamp: new Date()
    }
  ];

  await cloudwatch.putMetricData({
    Namespace: 'Serenya/LLM',
    MetricData: metricData
  }).promise();

  // Store detailed usage in DynamoDB for billing integration
  await storeLLMUsageRecord(metrics);
}

async function storeLLMUsageRecord(metrics: LLMUsageMetrics): Promise<void> {
  const dynamodb = new AWS.DynamoDB.DocumentClient();
  
  const record = {
    userId: metrics.userId,
    timestamp: Date.now(),
    month: new Date().toISOString().substring(0, 7), // YYYY-MM for GSI
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    totalCost: metrics.totalCost,
    provider: metrics.provider,
    modelId: metrics.modelId,
    documentType: metrics.documentType,
    processingTimeMs: metrics.processingTimeMs,
    ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year retention
  };

  await dynamodb.put({
    TableName: process.env.COST_TRACKING_TABLE,
    Item: record
  }).promise();
}
```

### **HIPAA Compliance Infrastructure**

#### **VPC Flow Logs for Audit Trail**
```yaml
# VPC Flow Logs Role
VPCFlowLogsRole:
  Type: AWS::IAM::Role
  Properties:
    AssumeRolePolicyDocument:
      Statement:
        - Effect: Allow
          Principal:
            Service: vpc-flow-logs.amazonaws.com
          Action: sts:AssumeRole
    Policies:
      - PolicyName: CloudWatchLogsPolicy
        PolicyDocument:
          Statement:
            - Effect: Allow
              Action:
                - logs:CreateLogGroup
                - logs:CreateLogStream
                - logs:PutLogEvents
                - logs:DescribeLogGroups
                - logs:DescribeLogStreams
              Resource: '*'

# VPC Flow Logs
VPCFlowLogs:
  Type: AWS::EC2::FlowLog
  Properties:
    ResourceType: VPC
    ResourceId: !Ref VPC
    TrafficType: ALL
    LogDestination: !Sub "arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:serenya-vpc-flow-logs"
    LogDestinationType: cloud-watch-logs
    DeliverLogsPermissionArn: !GetAtt VPCFlowLogsRole.Arn
    LogFormat: '${version} ${account-id} ${interface-id} ${srcaddr} ${dstaddr} ${srcport} ${dstport} ${protocol} ${packets} ${bytes} ${windowstart} ${windowend} ${action} ${flowlogstatus}'
```

#### **Network ACLs for Subnet-Level Security**
```yaml
# Network ACL for Isolated Subnets (Document/Chat Lambdas)
IsolatedNetworkAcl:
  Type: AWS::EC2::NetworkAcl
  Properties:
    VpcId: !Ref VPC
    Tags:
      - Key: Name
        Value: IsolatedSubnetACL

# Inbound rules for isolated subnets
IsolatedNetworkAclInboundRule:
  Type: AWS::EC2::NetworkAclEntry
  Properties:
    NetworkAclId: !Ref IsolatedNetworkAcl
    RuleNumber: 100
    Protocol: 6
    RuleAction: allow
    CidrBlock: 10.0.0.0/16
    PortRange:
      From: 443
      To: 443

# Outbound rules for isolated subnets
IsolatedNetworkAclOutboundRule:
  Type: AWS::EC2::NetworkAclEntry
  Properties:
    NetworkAclId: !Ref IsolatedNetworkAcl
    RuleNumber: 100
    Protocol: 6
    RuleAction: allow
    CidrBlock: 10.0.0.0/16
    PortRange:
      From: 443
      To: 443
    Egress: true

# Associate ACL with isolated subnets
IsolatedSubnet1AclAssociation:
  Type: AWS::EC2::SubnetNetworkAclAssociation
  Properties:
    SubnetId: !Ref IsolatedSubnet1
    NetworkAclId: !Ref IsolatedNetworkAcl

IsolatedSubnet2AclAssociation:
  Type: AWS::EC2::SubnetNetworkAclAssociation
  Properties:
    SubnetId: !Ref IsolatedSubnet2
    NetworkAclId: !Ref IsolatedNetworkAcl
```

#### **Enhanced CloudTrail for HIPAA Compliance**
```yaml
# CloudTrail with data events
HIPAACompliantCloudTrail:
  Type: AWS::CloudTrail::Trail
  Properties:
    TrailName: serenya-hipaa-audit-trail
    S3BucketName: !Ref CloudTrailLogsBucket
    S3KeyPrefix: cloudtrail-logs/
    IncludeGlobalServiceEvents: true
    IsMultiRegionTrail: true
    EnableLogFileValidation: true
    EventSelectors:
      - ReadWriteType: All
        IncludeManagementEvents: true
        DataResources:
          - Type: "AWS::S3::Object"
            Values: 
              - !Sub "${TempProcessingBucket}/*"
          - Type: "AWS::KMS::Key"
            Values: 
              - !GetAtt DatabaseEncryptionKey.Arn
              - !GetAtt DocumentsKMSKey.Arn
    InsightSelectors:
      - InsightType: ApiCallRateInsight

# CloudTrail logs bucket
CloudTrailLogsBucket:
  Type: AWS::S3::Bucket
  Properties:
    BucketName: !Sub "serenya-cloudtrail-logs-${AWS::AccountId}"
    BucketEncryption:
      ServerSideEncryptionConfiguration:
        - ServerSideEncryptionByDefault:
            SSEAlgorithm: AES256
    PublicAccessBlockConfiguration:
      BlockPublicAcls: true
      BlockPublicPolicy: true
      IgnorePublicAcls: true
      RestrictPublicBuckets: true
```

---

## 📊 **Monitoring & Observability**

### **Unified Error Handling Infrastructure**
**Infrastructure support for three-layer error handling strategy (Issue #16 resolution):**

#### **Circuit Breaker Implementation**
```yaml
# infrastructure/circuit-breakers.yml
CircuitBreakers:
  GoogleOAuthService:
    failure_threshold: 5
    success_threshold: 3
    timeout: 30
    monitor_window: 60
    fallback_enabled: false
    
  OpenAIService:
    failure_threshold: 3
    success_threshold: 2
    timeout: 45
    monitor_window: 120
    fallback_enabled: true  # Enable cached responses
    
  DatabaseService:
    failure_threshold: 10
    success_threshold: 5
    timeout: 15
    monitor_window: 30
    fallback_enabled: false  # Critical service

# Lambda environment variables
Environment:
  CIRCUIT_BREAKER_CONFIG_ARN: !Ref CircuitBreakerConfig
  ERROR_CORRELATION_TABLE: !Ref ErrorCorrelationTable
```

#### **Error Monitoring & Alerting**
```typescript
// monitoring/error-metrics.ts
const errorMetrics = {
  "ErrorCategorization": {
    "MetricName": "ErrorsByCategory",
    "Dimensions": [
      {"Name": "Category", "Value": "technical|validation|business|external"},
      {"Name": "RecoveryStrategy", "Value": "retry|fallback|escalate|ignore"}
    ],
    "Unit": "Count"
  },
  "CircuitBreakerStatus": {
    "MetricName": "CircuitBreakerState", 
    "Dimensions": [
      {"Name": "Service", "Value": "google_oauth|openai_api|database"},
      {"Name": "Status", "Value": "open|closed|half_open"}
    ],
    "Unit": "Count"
  },
  "ErrorRecovery": {
    "MetricName": "RecoverySuccess",
    "Dimensions": [
      {"Name": "Strategy", "Value": "retry|fallback|escalate|ignore"},
      {"Name": "Success", "Value": "true|false"}
    ],
    "Unit": "Count"
  }
}
```

#### **Lambda Error Handling Configuration**  
```typescript
// All Lambda functions must implement:
const errorHandler = {
  timeout: 180000,  // 3 minutes max
  retryPolicy: {
    maximumRetryAttempts: 2,
    maximumEventAge: 3600
  },
  deadLetterQueue: {
    targetArn: errorProcessingQueue
  },
  environment: {
    ERROR_CORRELATION_ENABLED: 'true',
    CIRCUIT_BREAKER_ENABLED: 'true', 
    FALLBACK_MODE_ENABLED: 'true'
  }
}
```

### **CloudWatch Dashboards**
```typescript
// monitoring/dashboard.ts - Aligned with API requirements
const dashboardConfig = {
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/Lambda", "Duration", "FunctionName", "serenya-auth-function"],
          ["AWS/Lambda", "Duration", "FunctionName", "serenya-document-function"],
          ["AWS/Lambda", "Duration", "FunctionName", "serenya-chat-function"]
        ],
        "period": 300,
        "stat": "Average",
        "region": "eu-west-1", // Updated to match BEDROCK_REGION
        "title": "Lambda Function Duration",
        "yAxis": {
          "left": {
            "min": 0,
            "max": 180000 // 3 minutes timeout visualization
          }
        }
      }
    },
    {
      "type": "metric", 
      "properties": {
        "metrics": [
          ["AWS/ApiGatewayV2", "Count", "ApiId", "serenya-api"],
          ["AWS/ApiGatewayV2", "4XXError", "ApiId", "serenya-api"],
          ["AWS/ApiGatewayV2", "5XXError", "ApiId", "serenya-api"],
          ["AWS/ApiGatewayV2", "IntegrationLatency", "ApiId", "serenya-api"]
        ],
        "period": 300,
        "stat": "Sum",
        "region": "eu-west-1", 
        "title": "API Gateway Performance & Errors"
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", "serenya-db"],
          ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", "serenya-db"],
          ["AWS/RDS", "FreeableMemory", "DBInstanceIdentifier", "serenya-db"],
          ["AWS/RDS", "ReadLatency", "DBInstanceIdentifier", "serenya-db"],
          ["AWS/RDS", "WriteLatency", "DBInstanceIdentifier", "serenya-db"]
        ],
        "period": 300,
        "stat": "Average",
        "region": "eu-west-1",
        "title": "Database Performance"
      }
    },
    {
      // NEW: LLM Cost Tracking Metrics (aligned with API contracts)
      "type": "metric",
      "properties": {
        "metrics": [
          ["Serenya/LLM", "InputTokens", "Provider", "bedrock"],
          ["Serenya/LLM", "OutputTokens", "Provider", "bedrock"],
          ["Serenya/LLM", "TotalCost", "Provider", "bedrock"],
          ["Serenya/LLM", "ProcessingTime", "DocumentType", "lab_results"],
          ["Serenya/LLM", "ProcessingTime", "DocumentType", "vitals"],
          ["Serenya/LLM", "ProcessingTime", "DocumentType", "chat"]
        ],
        "period": 300,
        "stat": "Sum",
        "region": "eu-west-1",
        "title": "LLM Usage & Cost Tracking"
      }
    },
    {
      // NEW: S3 Bucket Performance (for document processing workflow)
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/S3", "NumberOfObjects", "BucketName", "serenya-temp-processing"],
          ["AWS/S3", "BucketSizeBytes", "BucketName", "serenya-temp-processing"],
          ["AWS/S3", "AllRequests", "BucketName", "serenya-temp-processing"]
        ],
        "period": 3600,
        "stat": "Average",
        "region": "eu-west-1",
        "title": "Document Processing S3 Metrics"
      }
    },
    {
      // NEW: Unified Error Handling Metrics
      "type": "metric",
      "properties": {
        "metrics": [
          ["Serenya/Errors", "ErrorsByCategory", "Category", "technical"],
          ["Serenya/Errors", "ErrorsByCategory", "Category", "validation"],
          ["Serenya/Errors", "ErrorsByCategory", "Category", "business"],
          ["Serenya/Errors", "ErrorsByCategory", "Category", "external"],
          ["Serenya/Errors", "CircuitBreakerState", "Service", "google_oauth"],
          ["Serenya/Errors", "CircuitBreakerState", "Service", "openai_api"],
          ["Serenya/Errors", "RecoverySuccess", "Strategy", "retry"],
          ["Serenya/Errors", "RecoverySuccess", "Strategy", "fallback"]
        ],
        "period": 300,
        "stat": "Sum", 
        "region": "eu-west-1",
        "title": "Error Handling & Recovery Metrics"
      }
    },
    {
      // NEW: VPC and Network Security Monitoring
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/VPC", "PacketDropCount", "VPC", "serenya-vpc"],
          ["AWS/Lambda", "ConcurrentExecutions", "FunctionName", "serenya-document-function"],
          ["AWS/Lambda", "ConcurrentExecutions", "FunctionName", "serenya-chat-function"]
        ],
        "period": 300,
        "stat": "Sum",
        "region": "eu-west-1",
        "title": "Network Security & Concurrency"
      }
    }
  ]
};
```

### **Alarms and Notifications**
```yaml
# Critical alarms aligned with API requirements + unified error handling

# Circuit Breaker Alarms
CircuitBreakerOpenAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmDescription: "Circuit breaker opened for critical service"
    MetricName: CircuitBreakerState
    Namespace: Serenya/Errors
    Statistic: Sum
    Period: 60
    EvaluationPeriods: 1
    Threshold: 1
    ComparisonOperator: GreaterThanOrEqualToThreshold
    Dimensions:
      - Name: "Status"
        Value: "open"
    AlarmActions:
      - !Ref CriticalAlertsTopic

# High Error Rate by Category
HighTechnicalErrorAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmDescription: "High rate of technical errors indicating infrastructure issues"
    MetricName: ErrorsByCategory
    Namespace: Serenya/Errors
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 2
    Threshold: 20
    ComparisonOperator: GreaterThanThreshold
    Dimensions:
      - Name: "Category"
        Value: "technical"
    AlarmActions:
      - !Ref CriticalAlertsTopic

# Recovery Strategy Failure
RecoveryStrategyFailureAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmDescription: "Error recovery strategies failing at high rate"
    MetricName: RecoverySuccess
    Namespace: Serenya/Errors
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 3
    Threshold: 10
    ComparisonOperator: LessThanThreshold
    Dimensions:
      - Name: "Success"
        Value: "true"
    AlarmActions:
      - !Ref CriticalAlertsTopic

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

# Updated Lambda timeout alarms to match API contracts
DocumentProcessingTimeoutAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmDescription: "Document processing Lambda approaching timeout"
    MetricName: Duration
    Namespace: AWS/Lambda
    Dimensions:
      - Name: FunctionName
        Value: serenya-document-function
    Statistic: Average
    Period: 300
    EvaluationPeriods: 2
    Threshold: 150000 # 150 seconds (30s before 180s timeout)
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref PerformanceAlertsTopic

ChatResponseTimeoutAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmDescription: "Chat Lambda approaching timeout"
    MetricName: Duration
    Namespace: AWS/Lambda
    Dimensions:
      - Name: FunctionName
        Value: serenya-chat-function
    Statistic: Average
    Period: 300
    EvaluationPeriods: 2
    Threshold: 50000 # 50 seconds (10s before 60s timeout)
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref PerformanceAlertsTopic

AuthTimeoutAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmDescription: "Auth Lambda approaching timeout"
    MetricName: Duration
    Namespace: AWS/Lambda
    Dimensions:
      - Name: FunctionName
        Value: serenya-auth-function
    Statistic: Average
    Period: 300
    EvaluationPeriods: 2
    Threshold: 50000 # 50 seconds (10s before 60s timeout)
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref PerformanceAlertsTopic

# NEW: LLM Cost Tracking Alarms
LLMCostThresholdAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmDescription: "LLM costs exceeding budget threshold"
    MetricName: TotalCost
    Namespace: Serenya/LLM
    Statistic: Sum
    Period: 3600
    EvaluationPeriods: 1
    Threshold: 100 # $1.00 per hour threshold
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref CostAlertsTopic

# NEW: HIPAA Security Alerts  
VPCFlowLogsFailureAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmDescription: "VPC Flow Logs delivery failures"
    MetricName: DeliveryErrors
    Namespace: AWS/VPCFlowLogs
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 1
    Threshold: 1
    ComparisonOperator: GreaterThanOrEqualToThreshold
    AlarmActions:
      - !Ref SecurityAlertsTopic

UnauthorizedAPIAccessAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmDescription: "High rate of 4XX authentication errors"
    MetricName: 4XXError
    Namespace: AWS/ApiGatewayV2
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 2
    Threshold: 50
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref SecurityAlertsTopic
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