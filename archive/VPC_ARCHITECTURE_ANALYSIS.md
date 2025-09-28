# VPC Architecture Analysis - Lambda Function Optimization

## Current Lambda Function Inventory

### Total Functions: 18

**Functions Currently in VPC (15):**
- **AuthFunction** - User authentication via Google/Apple OAuth (needs external internet)
- **ProcessFunction** - Document parsing and AI analysis via Bedrock
- **ChatMessagesFunction** - AI chat responses via Bedrock
- **DoctorReportFunction** - Medical report generation via Bedrock
- **DatabaseInitFunction** - Database schema setup and migrations
- **SubscriptionsFunction** - User subscription management and billing
- **UserProfileFunction** - User profile CRUD operations
- **UploadFunction** - File upload coordination and S3 presigned URLs
- **CleanupFunction** - Cleanup expired jobs and temporary files
- **ChatStatusFunction** - Chat conversation status tracking
- **ResultFunction** - Processing job result retrieval
- **StatusFunction** - System health and status monitoring
- **ChatPromptsFunction** - Chat prompt templates and management
- **AuthorizerFunction** - JWT token validation for API Gateway
- **RetryFunction** - Failed job retry orchestration

**Functions Outside VPC (3):**
- CustomVpcRestrictDefaultSGCustom (CDK utility)
- CustomS3AutoDeleteObjectsCustom (CDK utility)
- LogRetention (CloudWatch utility)

## Current Architecture Problem

**❌ ALL functions currently route through expensive NAT Gateway unnecessarily**

Today's inefficient routing:
- **Bedrock API calls**: ProcessFunction/ChatMessagesFunction → NAT Gateway → Internet → AWS Bedrock
- **S3 operations**: UploadFunction → NAT Gateway → Internet → S3
- **Database calls**: All functions → RDS (correctly routed within VPC)
- **Only AuthFunction** actually needs external internet for OAuth validation

**Root Cause**: Zero VPC endpoints exist, forcing all AWS service calls through internet routing.

**Solution**: Create VPC endpoints for Bedrock/S3/Lambda, move only AuthFunction outside VPC.

## Function Groups by Purpose

### 1. Authentication & Authorization Group
**Functions:**
- **AuthFunction** - OAuth validation, user authentication
- **AuthorizerFunction** - JWT token validation for API Gateway

**External Dependencies:**
- AuthFunction: `https://oauth2.googleapis.com/tokeninfo` (Google OAuth)
- AuthFunction: `https://appleid.apple.com/auth/keys` (Apple Sign-In)
- AuthorizerFunction: No external calls (JWT validation only)

**VPC Placement:**
- **AuthFunction**: MUST be OUTSIDE VPC (external OAuth calls required)
- **AuthorizerFunction**: Can be INSIDE VPC (no external calls)

### 2. AI/Bedrock Processing Group
**Functions:**
- **ProcessFunction** - Document processing with Bedrock
- **ChatMessagesFunction** - Chat responses via Bedrock
- **DoctorReportFunction** - Medical report generation via Bedrock
- **ChatPromptsFunction** - Chat prompt management

**External Dependencies:**
- All use AWS Bedrock (internal AWS service)
- No external internet required

**VPC Placement:**
- **ALL can be INSIDE VPC** (AWS Bedrock accessible within VPC)

### 3. Database Operations Group
**Functions:**
- **DatabaseInitFunction** - Schema initialization and migrations
- **SubscriptionsFunction** - Subscription management
- **UserProfileFunction** - User profile CRUD operations

**External Dependencies:**
- Database access only (PostgreSQL RDS)

**VPC Placement:**
- **ALL INSIDE VPC** (database access only)

### 4. File & Storage Management Group
**Functions:**
- **UploadFunction** - File upload coordination
- **CleanupFunction** - File/resource cleanup
- **ResultFunction** - Processing result handling

**External Dependencies:**
- S3 access (internal AWS service)
- Database access

**VPC Placement:**
- **ALL INSIDE VPC** (AWS services accessible within VPC)

### 5. System & Monitoring Group
**Functions:**
- **StatusFunction** - System health checks
- **ChatStatusFunction** - Chat system status
- **RetryFunction** - Failed operation retry logic

**External Dependencies:**
- Database and AWS service access only

**VPC Placement:**
- **ALL INSIDE VPC** (no external calls required)

### 6. CDK Utility Functions (Outside VPC by design)
**Functions:**
- **CustomVpcRestrictDefaultSGCustom** - CDK VPC configuration
- **CustomS3AutoDeleteObjectsCustom** - CDK S3 cleanup
- **LogRetention** - CloudWatch log management

**VPC Placement:**
- **OUTSIDE VPC** (CDK utilities, managed by AWS)

## Proposed New Architecture

### Functions OUTSIDE VPC (1 + 3 utilities)
1. **AuthFunction** - OAuth validation only
2. CDK utilities (unchanged)

### Functions INSIDE VPC (14)
All other application functions can operate within VPC using AWS internal networking.

### New Lambda Functions Required

#### 1. ExternalAuthValidationFunction (OUTSIDE VPC)
**Purpose:** Handle all external OAuth provider validation
**Responsibilities:**
- Google OAuth token validation
- Apple Sign-In key validation  
- Return standardized auth results

**Code Structure:**
```javascript
exports.handler = async (event) => {
  const { provider, token } = event;
  
  switch (provider) {
    case 'google':
      return await validateGoogleToken(token);
    case 'apple':
      return await validateAppleToken(token);
    default:
      throw new Error('Unsupported provider');
  }
};
```

#### 2. InternalAuthProcessorFunction (INSIDE VPC)
**Purpose:** Process authentication results and manage user sessions
**Responsibilities:**
- User creation/updates in database
- Session management
- JWT token generation
- Database operations

**Invocation Flow (CORRECTED):**
```javascript
// ExternalAuthValidationFunction (outside VPC) - Called by API Gateway
exports.handler = async (event) => {
  // 1. Extract auth payload from request
  const authData = extractAuthData(event);
  
  // 2. Validate with OAuth providers (Google/Apple)
  const oauthResult = await validateWithOAuthProvider(authData);
  
  if (!oauthResult.valid) {
    return createErrorResponse(401, 'OAuth validation failed');
  }
  
  // 3. Invoke internal processor with validated data
  const sessionResult = await lambda.invoke({
    FunctionName: 'InternalAuthProcessorFunction',
    Payload: JSON.stringify(oauthResult.userData)
  }).promise();
  
  // 4. Return final response to API Gateway
  return sessionResult;
};

// InternalAuthProcessorFunction (inside VPC) - Called by ExternalAuthValidationFunction
exports.handler = async (event) => {
  // Process validated OAuth data and manage database operations
  const userData = JSON.parse(event.Records[0].body);
  
  // Database operations (user creation, session management)
  const user = await createOrUpdateUser(userData);
  const session = await createUserSession(user.id);
  
  return {
    statusCode: 200,
    body: JSON.stringify({ user, session })
  };
};
```

## Detailed Architecture Workflow

### Authentication Flow (CORRECTED)
1. **API Gateway** receives OAuth request
2. **API Gateway** routes to **ExternalAuthValidationFunction** (outside VPC)
3. **ExternalAuthValidationFunction** validates with Google/Apple OAuth servers
4. **ExternalAuthValidationFunction** invokes **InternalAuthProcessorFunction** (VPC) with validated data
5. **InternalAuthProcessorFunction** processes user data and manages database operations
6. **InternalAuthProcessorFunction** returns session data to ExternalAuthValidationFunction
7. **ExternalAuthValidationFunction** returns final response to API Gateway

**Why This Direction Works:**
- External function (outside VPC) CAN invoke internal function (inside VPC) ✅
- Internal function (inside VPC) CANNOT invoke external function without NAT Gateway ❌

### AI Processing Flow
1. **API Gateway** receives processing request
2. **AuthorizerFunction** (VPC) validates JWT
3. **ProcessFunction** (VPC) calls AWS Bedrock via VPC endpoint
4. **ProcessFunction** (VPC) updates database with results
5. Response returned through API Gateway

### File Upload Flow
1. **API Gateway** receives upload request
2. **UploadFunction** (VPC) generates S3 presigned URL
3. **UploadFunction** (VPC) updates database tracking
4. Client uploads directly to S3 using presigned URL

## Network Configuration Requirements

### VPC Endpoints Needed
- **Bedrock VPC Endpoint** - For AI processing functions
- **S3 VPC Endpoint** - For file operations
- **Lambda VPC Endpoint** - For function-to-function invocation

### Security Groups
- **Database SG** - Allow VPC functions to access RDS
- **Lambda SG** - Allow function-to-function communication
- **VPC Endpoint SG** - Allow access to AWS services

## Cost Impact Analysis

### Current Costs (with NAT Gateway)
- NAT Gateway: ~$32.4/month
- Elastic IP: ~$35/month
- Data processing: Variable
- **Total**: ~$67.4/month + data charges

### New Architecture Costs
- NAT Gateway: $0 (eliminated)
- Elastic IP: $0 (eliminated)
- VPC Endpoints: ~$28.8/month
  - Bedrock Interface Endpoint: $7.2/month ($0.01/hour × 24 × 30)
  - Lambda Interface Endpoint: $7.2/month ($0.01/hour × 24 × 30)
  - CloudWatch Logs Interface Endpoint: $7.2/month ($0.01/hour × 24 × 30)
  - Secrets Manager Interface Endpoint: $7.2/month ($0.01/hour × 24 × 30)
  - S3 Gateway Endpoint: $0 (no hourly charges for gateway endpoints)
- Function-to-function invocation: Minimal (~$0.20/million requests)
- **Total**: ~$29/month

### Net Savings
- **Monthly savings**: ~$38/month (57% reduction in networking costs)
- **Combined with DynamoDB migration**: Total infrastructure savings of ~$118/month

## Implementation Steps

### ⚠️ CRITICAL: VPC Endpoints Must Be Created First

**Why**: Currently zero VPC endpoints exist. All AWS service calls route through NAT Gateway to internet.

### Phase 1: Create VPC Infrastructure (MANDATORY FIRST)
1. **Create VPC endpoints** ($28.8/month total):
   - Bedrock Interface Endpoint: `com.amazonaws.eu-west-1.bedrock-runtime` ($7.2/month)
   - Lambda Interface Endpoint: `com.amazonaws.eu-west-1.lambda` ($7.2/month)
   - CloudWatch Logs Interface Endpoint: `com.amazonaws.eu-west-1.logs` ($7.2/month)
   - Secrets Manager Interface Endpoint: `com.amazonaws.eu-west-1.secretsmanager` ($7.2/month)
   - S3 Gateway Endpoint: `com.amazonaws.eu-west-1.s3` (free)
2. **Test AWS service connectivity** from within VPC using endpoints
3. **Verify**: Bedrock models (Claude 3 Haiku/Sonnet) available in eu-west-1
4. **This enables** moving functions out of NAT Gateway dependency

### Phase 2: Authentication Function Split
1. Create ExternalAuthValidationFunction (outside VPC) - OAuth only
2. Create InternalAuthProcessorFunction (inside VPC) - database operations
3. Test function-to-function communication via Lambda VPC endpoint
4. Update API Gateway routes to new auth flow

### Phase 3: Cleanup
1. Remove NAT Gateway and Elastic IP
2. Update security groups
3. Monitor and validate all functionality

### Phase 4: Optimization
1. Monitor VPC endpoint usage
2. Optimize function-to-function communication
3. Fine-tune security group rules

## Security Considerations

### Benefits
- **Reduced attack surface** - Only 1 function exposed to internet
- **Network isolation** - Database functions completely isolated
- **Simplified secrets management** - Clear separation of external vs internal credentials

### Precise Communication Whitelisting

#### **ExternalAuthValidationFunction (Outside VPC) - Allowed Communications**

**Inbound Sources (What can call this function):**
```typescript
✅ API Gateway: arn:aws:apigateway:eu-west-1::/restapis/{api-id}/stages/dev/methods/POST/auth/*
❌ InternalAuthProcessorFunction: NOT POSSIBLE (VPC cannot call outside functions without NAT)
❌ Everything else blocked
```

**Outbound Destinations (What this function can call):**
```typescript
✅ oauth2.googleapis.com:443/tokeninfo (Google OAuth validation)
✅ appleid.apple.com:443/auth/keys (Apple Sign-In keys)
✅ logs.eu-west-1.amazonaws.com:443 (CloudWatch Logs)
✅ lambda.eu-west-1.amazonaws.com:443 (Invoke InternalAuthProcessorFunction)
❌ rds.eu-west-1.amazonaws.com (database) - BLOCKED
❌ s3.eu-west-1.amazonaws.com (medical files) - BLOCKED  
❌ bedrock-runtime.eu-west-1.amazonaws.com (AI services) - BLOCKED
❌ All other internet destinations - BLOCKED
```

#### **InternalAuthProcessorFunction (Inside VPC) - Allowed Communications**

**Inbound Sources:**
```typescript
✅ ExternalAuthValidationFunction ARN only (external function CAN invoke VPC functions)
❌ API Gateway direct routes: NOT NEEDED (auth flows through external function first)
❌ Internet access - IMPOSSIBLE (no NAT Gateway)
```

**Outbound Destinations:**
```typescript
✅ RDS database within VPC (user/session management)
✅ lambda.eu-west-1.amazonaws.com via VPC endpoint
✅ logs.eu-west-1.amazonaws.com via VPC endpoint
❌ Internet access - IMPOSSIBLE (PRIVATE_ISOLATED subnet)
❌ S3 medical files - BLOCKED (unless explicitly needed)
❌ Bedrock AI services - BLOCKED
```

### Implementation Enforcement

#### **Network-Level Application Controls**
```javascript
// In ExternalAuthValidationFunction code
const ALLOWED_HOSTS = {
  'oauth2.googleapis.com': {
    port: 443,
    paths: ['/tokeninfo'],
    purpose: 'Google OAuth validation'
  },
  'appleid.apple.com': {
    port: 443, 
    paths: ['/auth/keys'],
    purpose: 'Apple Sign-In key retrieval'
  }
};

const validateDestination = (url) => {
  const parsedUrl = new URL(url);
  const host = parsedUrl.hostname;
  const path = parsedUrl.pathname;
  
  if (!ALLOWED_HOSTS[host]) {
    throw new Error(`Blocked destination: ${host}`);
  }
  
  const allowedConfig = ALLOWED_HOSTS[host];
  if (!allowedConfig.paths.includes(path)) {
    throw new Error(`Blocked path: ${path} on ${host}`);
  }
  
  return true;
};
```

#### **IAM Policy Enforcement**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOnlySpecificLambdaInvocation",
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:eu-west-1:*:function:InternalAuthProcessorFunction"
    },
    {
      "Sid": "DenyAllOtherAWSServices",
      "Effect": "Deny",
      "Action": [
        "rds:*",
        "s3:*",
        "bedrock:*"
      ],
      "Resource": "*"
    }
  ]
}
```

#### **Security Monitoring & Alerting**
```javascript
// CloudWatch custom metrics for blocked calls
const logBlockedDestination = (destination, reason) => {
  console.log(JSON.stringify({
    level: 'SECURITY_VIOLATION',
    blocked_destination: destination,
    reason: reason,
    timestamp: new Date().toISOString(),
    function_name: context.functionName
  }));
  
  // Trigger CloudWatch alarm for immediate response
  await cloudwatch.putMetricData({
    Namespace: 'Serenya/Security',
    MetricData: [{
      MetricName: 'BlockedDestinations',
      Value: 1,
      Dimensions: [{
        Name: 'FunctionName',
        Value: context.functionName
      }]
    }]
  }).promise();
};
```

### Risks & Mitigations
- **Function-to-function communication** - Use IAM roles and least privilege with precise ARN restrictions
- **VPC endpoint security** - Restrict access with security groups and resource policies
- **Monitoring** - Enhanced CloudWatch logging with immediate alerting for unauthorized access attempts
- **Network isolation** - Application-level destination validation with comprehensive logging

## Testing Strategy

### Pre-Migration Testing
1. Verify Bedrock VPC endpoint connectivity
2. Test function-to-function invocation patterns
3. Validate authentication flows in staging

### Post-Migration Validation
1. End-to-end authentication testing
2. AI processing functionality verification
3. Performance benchmarking
4. Cost monitoring and validation

This architecture eliminates the NAT Gateway while maintaining all required functionality through strategic use of VPC endpoints and function-to-function communication patterns.