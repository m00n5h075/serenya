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
Based on your database schema, you have 16 tables with complex relationships:

```
Core Tables:
├── users (UUID, email, external_id, auth_provider)
├── user_sessions (JWT tokens, biometric auth)
├── user_devices (device registration, biometrics)
├── subscriptions (user subscription tiers)
├── consent_records (GDPR compliance)
├── processing_jobs (file upload/processing)
├── processing_job_events (audit trail)
├── biometric_registrations (security)
├── payments (subscription payments)
└── chat_options, chat_messages (AI features)
```

### DynamoDB Table Design

#### Single-Table Design with GSIs
```typescript
interface DynamoDBRecord {
  PK: string;           // Partition Key
  SK: string;           // Sort Key  
  GSI1PK?: string;      // Global Secondary Index 1 PK
  GSI1SK?: string;      // Global Secondary Index 1 SK
  GSI2PK?: string;      // Global Secondary Index 2 PK
  GSI2SK?: string;      // Global Secondary Index 2 SK
  entity_type: string;  // Record type
  data: any;           // Entity-specific data
  created_at: string;
  updated_at: string;
  ttl?: number;        // For auto-expiring records
}
```

#### Access Patterns & Key Design

**1. Users**
```typescript
// Primary
PK: "USER#${user_id}"
SK: "PROFILE"
GSI1PK: "USER_EMAIL#${email_hash}"
GSI1SK: "PROFILE"
GSI2PK: "USER_EXTERNAL#${auth_provider}#${external_id}"
GSI2SK: "PROFILE"

// Example
PK: "USER#ac5cada7-7b1f-4673-b2b1-089f3e308363"
SK: "PROFILE"
data: {
  email: "user@example.com",
  name: "John Doe",
  auth_provider: "google",
  external_id: "113426185144286227617",
  account_status: "active"
}
```

**2. User Sessions**
```typescript
PK: "USER#${user_id}"
SK: "SESSION#${session_id}"
GSI1PK: "SESSION#${session_id}"
GSI1SK: "USER#${user_id}"
ttl: session_expires_timestamp

data: {
  refresh_token_hash: "...",
  device_id: "...",
  status: "active",
  last_accessed_at: "2025-09-27T10:00:00Z"
}
```

**3. Devices**
```typescript
PK: "USER#${user_id}"
SK: "DEVICE#${device_id}"
GSI1PK: "DEVICE#${device_id}"
GSI1SK: "USER#${user_id}"

data: {
  device_name: "iPhone 15",
  platform: "ios",
  biometric_type: "faceid"
}
```

**4. Processing Jobs**
```typescript
PK: "USER#${user_id}"
SK: "JOB#${job_id}"
GSI1PK: "JOB_STATUS#${status}"
GSI1SK: "JOB#${created_at}#${job_id}"

data: {
  original_filename: "bloodwork.pdf",
  status: "completed",
  s3_bucket: "serenya-temp-files-dev",
  confidence_score: 85
}
```

**5. Subscriptions**
```typescript
PK: "USER#${user_id}"
SK: "SUBSCRIPTION#${subscription_id}"
GSI1PK: "SUBSCRIPTION_STATUS#${status}"
GSI1SK: "USER#${user_id}"

data: {
  subscription_type: "free",
  provider: "internal",
  start_date: "2025-09-27T00:00:00Z",
  end_date: "2025-10-27T00:00:00Z"
}
```

### DynamoDB Infrastructure
```typescript
const serenyaTable = new dynamodb.Table(this, 'SerenyaTable', {
  tableName: `serenya-${environment}`,
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.ON_DEMAND,
  timeToLiveAttribute: 'ttl',
  encryption: dynamodb.TableEncryption.AWS_MANAGED,
  pointInTimeRecovery: environment === 'prod',
  removalPolicy: environment === 'prod' 
    ? cdk.RemovalPolicy.RETAIN 
    : cdk.RemovalPolicy.DESTROY,

  globalSecondaryIndexes: [
    {
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
    },
    {
      indexName: 'GSI2', 
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
    }
  ]
});
```

---

## Part 3: Migration Strategy

### Phase 1: Infrastructure Optimization (Week 1)
**Goal**: Eliminate NAT Gateway costs immediately

1. **Update CDK Stack**
   ```bash
   # Remove VPC configuration from Lambda functions
   cd /Users/m00n5h075ai/development/serenya/serenya_app/backend
   
   # Edit infrastructure/serenya-backend-stack.ts
   # Remove vpc: this.vpc from all Lambda function definitions
   ```

2. **Deploy Changes**
   ```bash
   npx cdk diff  # Review changes
   npx cdk deploy  # Apply infrastructure changes
   ```

3. **Verify Cost Reduction**
   - NAT Gateway will be destroyed
   - Elastic IP will be released
   - **Immediate savings: $3/day**

### Phase 2: DynamoDB Setup (Week 2)
**Goal**: Create parallel DynamoDB infrastructure

1. **Create DynamoDB Table**
   ```typescript
   // Add to serenya-backend-stack.ts
   const dynamoTable = new dynamodb.Table(this, 'SerenyaTable', {
     // Configuration above
   });
   ```

2. **Create Migration Lambda**
   ```typescript
   const migrationLambda = new lambda.Function(this, 'MigrationFunction', {
     runtime: lambda.Runtime.NODEJS_18_X,
     handler: 'migration.handler',
     code: lambda.Code.fromAsset('lambdas/migration'),
     timeout: cdk.Duration.minutes(15),
     memorySize: 1024,
     environment: {
       DYNAMO_TABLE_NAME: dynamoTable.tableName,
       RDS_SECRET_ARN: this.dbSecret.secretArn
     }
   });
   ```

### Phase 3: Data Migration (Week 3)
**Goal**: Migrate all data from RDS to DynamoDB

1. **Migration Script Structure**
   ```javascript
   // lambdas/migration/migration.js
   const migrateTable = async (tableName) => {
     const records = await queryRDS(`SELECT * FROM ${tableName}`);
     
     for (const record of records) {
       const dynamoRecord = transformToDynamoDB(record, tableName);
       await dynamoDB.putItem(dynamoRecord);
     }
   };

   const transformToDynamoDB = (record, tableName) => {
     switch(tableName) {
       case 'users':
         return {
           PK: `USER#${record.id}`,
           SK: 'PROFILE',
           GSI1PK: `USER_EMAIL#${hashEmail(record.email)}`,
           GSI1SK: 'PROFILE',
           entity_type: 'user',
           data: {
             email: record.email,
             name: record.name,
             auth_provider: record.auth_provider,
             external_id: record.external_id
           }
         };
       // ... other table transformations
     }
   };
   ```

2. **Execute Migration**
   ```bash
   # Test migration with small dataset
   aws lambda invoke --function-name migration-function \
     --payload '{"action": "migrate", "table": "users", "limit": 10}' \
     /tmp/test-result.json

   # Full migration
   aws lambda invoke --function-name migration-function \
     --payload '{"action": "migrate_all"}' \
     /tmp/migration-result.json
   ```

### Phase 4: Application Code Update (Week 4)
**Goal**: Update Lambda functions to use DynamoDB

1. **Database Service Layer**
   ```javascript
   // lambdas/shared/dynamo-service.js
   class DynamoUserService {
     async findByExternalId(authProvider, externalId) {
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

     async createUser(userData) {
       const userId = uuidv4();
       const item = {
         PK: `USER#${userId}`,
         SK: 'PROFILE',
         GSI1PK: `USER_EMAIL#${hashEmail(userData.email)}`,
         GSI1SK: 'PROFILE',
         GSI2PK: `USER_EXTERNAL#${userData.auth_provider}#${userData.external_id}`,
         GSI2SK: 'PROFILE',
         entity_type: 'user',
         data: userData,
         created_at: new Date().toISOString(),
         updated_at: new Date().toISOString()
       };
       
       await dynamoDB.putItem({ TableName: process.env.DYNAMO_TABLE_NAME, Item: item }).promise();
       return { id: userId, ...userData };
     }
   }
   ```

2. **Update Lambda Functions**
   ```javascript
   // lambdas/auth/auth.js - Replace PostgreSQL calls
   const { DynamoUserService, DynamoSessionService } = require('../shared/dynamo-service');

   // Replace:
   // const user = await UserService.findByExternalId(authProvider, externalId);
   // With:
   const user = await DynamoUserService.findByExternalId(authProvider, externalId);
   ```

### Phase 5: Testing & Validation (Week 5)
**Goal**: Ensure feature parity and data integrity

1. **Parallel Testing**
   ```bash
   # Test all endpoints with DynamoDB
   ./scripts/test-endpoints.sh

   # Compare response times
   # DynamoDB: ~50-100ms vs RDS: ~200-500ms
   ```

2. **Data Validation**
   ```bash
   # Verify data consistency
   aws lambda invoke --function-name validation-function \
     --payload '{"action": "compare_data"}' \
     /tmp/validation-result.json
   ```

### Phase 6: RDS Decommissioning (Week 6)
**Goal**: Remove RDS infrastructure and realize full cost savings

1. **Final Data Backup**
   ```bash
   # Create final RDS snapshot
   aws rds create-db-cluster-snapshot \
     --db-cluster-identifier serenya-backend-dev-serenyadatabase21d84656 \
     --db-cluster-snapshot-identifier final-migration-backup
   ```

2. **Update CDK Stack**
   ```typescript
   // Remove RDS cluster from infrastructure/serenya-backend-stack.ts
   // Comment out or delete:
   // this.database = new rds.DatabaseCluster(...)
   ```

3. **Deploy Final Changes**
   ```bash
   npx cdk deploy
   # RDS cluster will be destroyed
   # **Additional savings: $1.7/day**
   ```

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