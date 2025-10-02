# Serenya Deployment Procedures

**Date:** January 2025 (Updated for DynamoDB Architecture)
**Domain:** DevOps & Infrastructure Deployment
**Dependencies:**
- **← database-architecture.md**: DynamoDB table design and access patterns
- **← api-contracts.md**: API endpoint specifications
- **← observability.md**: Observability infrastructure requirements
**Cross-References:**
- **→ our-dev-rules.md**: Development and deployment standards

---

## 🎯 Overview

This document provides comprehensive deployment procedures for the Serenya healthcare AI platform serverless infrastructure. The stack supports **independent deployment** of three core components:

1. **DynamoDB Database** - User profiles, consents, subscriptions
2. **Backend Lambda Functions** - API processing and business logic
3. **Observability Infrastructure** - CloudWatch dashboards, alarms, DynamoDB Streams

## ✅ Prerequisites

### Required Tools
- **AWS CLI v2.x** - Configured with appropriate permissions
- **Node.js v18+** - Lambda runtime and CDK compilation
- **npm** - Package manager
- **AWS CDK v2.100+** - Infrastructure as Code framework
- **Git** - Source control
- **TypeScript v5.2+** - CDK infrastructure compilation

### Required AWS Permissions
- Administrator access to target AWS account
- CloudFormation stack management
- DynamoDB table creation and management
- Lambda function deployment
- S3 bucket creation
- KMS key creation for encryption
- CloudWatch dashboard and alarm creation
- Secrets Manager access

### AWS Account Setup
```bash
# Configure AWS CLI credentials
aws configure

# Verify account access
aws sts get-caller-identity

# Set environment variables
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=eu-west-1  # Ireland region for GDPR compliance
export ENVIRONMENT=dev       # or staging, prod

# REQUIRED: Set EMAIL_HASH_SALT for email hashing security
# Generate a random salt value (do this once per environment)
export EMAIL_HASH_SALT=$(openssl rand -hex 32)

# Store in AWS Systems Manager Parameter Store for persistence
aws ssm put-parameter \
  --name "/serenya/$ENVIRONMENT/email-hash-salt" \
  --value "$EMAIL_HASH_SALT" \
  --type "SecureString" \
  --description "Salt for email hashing in DynamoDB GSI1-EmailLookup" \
  --overwrite

# Verify the parameter
aws ssm get-parameter \
  --name "/serenya/$ENVIRONMENT/email-hash-salt" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text
```

---

## 🏗️ Infrastructure Architecture

### Current Stack Components

**SerenyaBackendStack** (main stack):
- DynamoDB table (via `SerenyaDynamoDBTable` construct)
- Lambda functions (14 total)
- API Gateway REST API
- S3 buckets (temp-files, events)
- KMS encryption keys
- Secrets Manager for API keys
- Observability infrastructure (via `ObservabilityConstruct`)
- DynamoDB Streams processor Lambda

**Stack Resources:**
- 1 DynamoDB table with 2 GSIs
- 14 Lambda functions
- 1 API Gateway REST API
- 2 S3 buckets (temp-files, events)
- 3 CloudWatch Dashboards
- ~20 CloudWatch Alarms
- 1 SNS Topic for alerts
- 1 KMS key for encryption

---

## 🚀 Full Stack Deployment

### 1. Initial Environment Setup

```bash
# Clone repository and navigate to backend
cd serenya/serenya_app/backend

# Install dependencies
npm install

# Compile TypeScript infrastructure code
npm run build

# Verify CDK version
cdk --version  # Should be 2.100.0 or higher
```

### 2. CDK Bootstrap (First-Time Only)

```bash
# Bootstrap CDK in target account/region
cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_REGION

# Verify bootstrap stack
aws cloudformation describe-stacks --stack-name CDKToolkit --region $AWS_REGION
```

**What Bootstrap Creates:**
- S3 bucket for CDK assets (CloudFormation templates, Lambda code)
- IAM roles for CloudFormation deployments
- ECR repository for container images
- SSM parameters for configuration

### 3. Deploy Complete Stack

```bash
# Development environment
npm run deploy:dev

# Staging environment
npm run deploy:staging

# Production environment
npm run deploy:prod
```

**What Gets Deployed:**
1. KMS encryption key
2. DynamoDB table with GSIs and streams
3. S3 buckets (temp-files, events)
4. Secrets Manager secret for API keys
5. All 14 Lambda functions
6. API Gateway REST API with routes
7. DynamoDB Streams processor Lambda
8. ObservabilityConstruct (dashboards, alarms)
9. IAM roles and policies

**Estimated Deployment Time:**
- Development: 5-8 minutes
- Production: 8-12 minutes (point-in-time recovery enabled)

---

## 📦 Independent Component Deployment

### DynamoDB Database Only

Deploy or update DynamoDB table without affecting Lambda functions:

```bash
# Option 1: Using CDK (recommended)
cdk deploy SerenyaBackend-$ENVIRONMENT \
  --exclusively SerenyaBackend-$ENVIRONMENT/SerenyaDynamoDBTable

# Option 2: Direct AWS CLI updates (for minor changes)
# Update GSI throughput (if needed)
aws dynamodb update-table \
  --table-name serenya-$ENVIRONMENT \
  --global-secondary-index-updates '[{
    "Update": {
      "IndexName": "GSI1-EmailLookup",
      "ProvisionedThroughput": {
        "ReadCapacityUnits": 5,
        "WriteCapacityUnits": 5
      }
    }
  }]'
```

**DynamoDB Resources:**
- Table: `serenya-{environment}`
- GSI1-EmailLookup index
- GSI2-ExternalAuth index
- DynamoDB Streams (NEW_AND_OLD_IMAGES)
- CloudWatch alarms for throttling

**Verification:**
```bash
# Verify table status
aws dynamodb describe-table \
  --table-name serenya-$ENVIRONMENT \
  --region $AWS_REGION

# Check GSI status
aws dynamodb describe-table \
  --table-name serenya-$ENVIRONMENT \
  --query 'Table.GlobalSecondaryIndexes[*].[IndexName,IndexStatus]' \
  --output table
```

---

### Backend Lambda Functions Only

Deploy Lambda function code updates without infrastructure changes:

```bash
# Fast deployment with hotswap (dev only)
npm run build && cdk deploy SerenyaBackend-$ENVIRONMENT --hotswap

# Production deployment (full CloudFormation)
npm run build && cdk deploy SerenyaBackend-$ENVIRONMENT

# Deploy specific function
aws lambda update-function-code \
  --function-name SerenyaBackend-$ENVIRONMENT-AuthFunction \
  --zip-file fileb://dist/lambdas/auth.zip \
  --region $AWS_REGION
```

**Lambda Functions (14 total):**
1. AuthFunction - OAuth authentication
2. UploadFunction - Document upload
3. ProcessFunction - AWS Bedrock AI processing
4. StatusFunction - Job status polling
5. ResultFunction - Result retrieval
6. RetryFunction - Failed job retry
7. CleanupFunction - S3 cleanup
8. DoctorReportFunction - Premium reports
9. ChatPromptsFunction - Chat prompts
10. ChatMessagesFunction - Chat messages
11. ChatStatusFunction - Chat job status
12. SubscriptionsFunction - Subscription management
13. UserProfileFunction - User profile operations
14. AuthorizerFunction - API Gateway authorization
15. StreamProcessorFunction - DynamoDB Streams processing

**Hotswap Benefits:**
- ~30 seconds vs 5-8 minutes
- Only updates Lambda code
- Development environments only

**⚠️ Warning:** Never use hotswap in production.

**Verification:**
```bash
# List Lambda functions
aws lambda list-functions \
  --query 'Functions[?starts_with(FunctionName, `SerenyaBackend-'$ENVIRONMENT'`)].FunctionName' \
  --output table

# Test function
aws lambda invoke \
  --function-name SerenyaBackend-$ENVIRONMENT-StatusFunction \
  --payload '{"pathParameters":{"jobId":"test"}}' \
  /tmp/response.json
```

---

### Observability Infrastructure Only

Update CloudWatch dashboards, alarms, and monitoring:

```bash
# Deploy observability updates
cdk deploy SerenyaBackend-$ENVIRONMENT \
  --exclusively SerenyaBackend-$ENVIRONMENT/Observability
```

**Observability Resources:**
1. Executive Dashboard - Business metrics
2. Operations Dashboard - Technical metrics
3. Security Dashboard - Security events
4. SNS Alert Topic - Critical notifications
5. CloudWatch Alarms - Critical and Warning tiers
6. DynamoDB Streams Processor - Event processing

**Verification:**
```bash
# List dashboards
aws cloudwatch list-dashboards \
  --query 'DashboardEntries[?contains(DashboardName, `Serenya`)].DashboardName' \
  --output table

# List alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix "SerenyaBackend-$ENVIRONMENT" \
  --query 'MetricAlarms[*].[AlarmName,StateValue]' \
  --output table
```

---

## 🔧 Post-Deployment Configuration

### 1. Secrets Manager Setup

```bash
# Get secret ARN
SECRET_ARN=$(aws secretsmanager describe-secret \
  --secret-id serenya/$ENVIRONMENT/api-secrets \
  --query ARN \
  --output text)

# Update API secrets
aws secretsmanager update-secret \
  --secret-id $SECRET_ARN \
  --secret-string '{
    "jwtSecret": "auto-generated",
    "anthropicApiKey": "YOUR_KEY",
    "googleClientId": "YOUR_GOOGLE_CLIENT_ID",
    "googleClientSecret": "YOUR_GOOGLE_SECRET"
  }'

# Verify
aws secretsmanager get-secret-value \
  --secret-id $SECRET_ARN \
  --query SecretString \
  --output text | jq
```

### 2. DynamoDB Verification

```bash
# Check table status
aws dynamodb describe-table \
  --table-name serenya-$ENVIRONMENT \
  --query 'Table.[TableName,TableStatus,StreamSpecification]' \
  --output table

# Verify GSIs
aws dynamodb describe-table \
  --table-name serenya-$ENVIRONMENT \
  --query 'Table.GlobalSecondaryIndexes[*].[IndexName,IndexStatus]' \
  --output table

# Check point-in-time recovery (prod)
aws dynamodb describe-continuous-backups \
  --table-name serenya-$ENVIRONMENT \
  --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus'
```

### 3. S3 Bucket Verification

```bash
# List buckets
aws s3 ls | grep serenya

# Check lifecycle policies
aws s3api get-bucket-lifecycle-configuration \
  --bucket serenya-temp-files-$ENVIRONMENT-$AWS_ACCOUNT_ID

# Verify encryption
aws s3api get-bucket-encryption \
  --bucket serenya-temp-files-$ENVIRONMENT-$AWS_ACCOUNT_ID
```

### 4. API Gateway Testing

```bash
# Get API URL
API_URL=$(aws cloudformation describe-stacks \
  --stack-name SerenyaBackend-$ENVIRONMENT \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text)

echo "API Gateway URL: $API_URL"

# Test endpoint (requires valid token)
curl -X POST "$API_URL/auth/oauth-onboarding" \
  -H "Content-Type: application/json" \
  -d '{
    "google_auth": {"access_token": "test", "id_token": "test"},
    "consents": {
      "terms_of_service": true,
      "privacy_policy": true,
      "medical_disclaimer": true,
      "healthcare_consultation": true,
      "emergency_care_limitation": true
    },
    "device_info": {
      "platform": "ios",
      "app_installation_id": "test-device",
      "app_version": "1.0.0"
    }
  }'
```

---

## ✅ Validation & Testing

### Infrastructure Validation

```bash
# Comprehensive validation
npm run validate:infrastructure

# Pre-deployment validation
npm run validate:pre-deploy

# Post-deployment validation
npm run validate:post-deploy
```

### Integration Testing

```bash
# Run integration tests
npm run test:integration

# Test API endpoints
npm run test:endpoints

# Security validation
npm run test:security
```

### DynamoDB Connectivity Test

```bash
# Deploy test stack
npm run test:dynamodb

# Invoke test
npm run test:dynamodb:invoke

# Cleanup
npm run test:dynamodb:cleanup
```

---

## 🔥 Rollback Procedures

### Emergency Rollback

```bash
# Cancel in-progress update
aws cloudformation cancel-update-stack \
  --stack-name SerenyaBackend-$ENVIRONMENT

# Deploy previous version
git checkout <previous-commit>
npm run build
npm run deploy:$ENVIRONMENT
```

### Lambda Rollback

```bash
# List versions
aws lambda list-versions-by-function \
  --function-name SerenyaBackend-$ENVIRONMENT-AuthFunction \
  --query 'Versions[*].[Version,LastModified]' \
  --output table

# Rollback to previous version
aws lambda update-alias \
  --function-name SerenyaBackend-$ENVIRONMENT-AuthFunction \
  --name live \
  --function-version <previous-version>
```

### Database Rollback

```bash
# Point-in-time recovery (prod only)
aws dynamodb restore-table-to-point-in-time \
  --source-table-name serenya-prod \
  --target-table-name serenya-prod-restored \
  --restore-date-time "2025-01-15T12:00:00Z"
```

⚠️ **Warning:** Point-in-time recovery creates new table. Manual application update required.

---

## 🛠️ Troubleshooting

### CDK Bootstrap Issues

```bash
# Re-bootstrap
cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_REGION --force

# Verify
aws cloudformation describe-stacks --stack-name CDKToolkit
```

### Lambda Function Errors

```bash
# Check logs
aws logs tail /aws/lambda/SerenyaBackend-$ENVIRONMENT-AuthFunction --follow

# Get recent errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/SerenyaBackend-$ENVIRONMENT-AuthFunction \
  --filter-pattern "ERROR" \
  --max-items 10
```

### DynamoDB Throttling

```bash
# Check throttling metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ThrottledRequests \
  --dimensions Name=TableName,Value=serenya-$ENVIRONMENT \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

### API Gateway 5xx Errors

```bash
# Check API logs
aws logs tail /aws/apigateway/SerenyaBackend-$ENVIRONMENT --follow

# Test Lambda directly
aws lambda invoke \
  --function-name SerenyaBackend-$ENVIRONMENT-AuthFunction \
  --payload file://test-event.json \
  /tmp/response.json
```

---

## 🔐 Security

### Access Controls
- Least-privilege IAM policies
- MFA for admin access
- 90-day credential rotation
- CloudTrail monitoring

### Data Protection
- KMS encryption at rest
- TLS 1.3 in transit
- Point-in-time recovery (prod)
- Secrets Manager for API keys
- No PHI in DynamoDB

### Compliance

```bash
# Security audit
npm run security:audit

# Check KMS encryption
aws kms describe-key --key-id alias/serenya-$ENVIRONMENT

# Verify DynamoDB encryption
aws dynamodb describe-table \
  --table-name serenya-$ENVIRONMENT \
  --query 'Table.SSEDescription'
```

---

## 💰 Cost Optimization

### Estimated Monthly Costs (10,000 users)

| Component | Monthly Cost |
|-----------|--------------|
| DynamoDB (pay-per-request) | $25-50 |
| DynamoDB Streams | $5 |
| Point-in-time recovery | $10 |
| Lambda (14 functions, 1M invocations) | $50 |
| S3 (temp-files + events) | $15 |
| CloudWatch (dashboards + alarms) | $34 |
| API Gateway | $35 |
| **Total** | **~$174/month** |

### Cost Monitoring

```bash
# Cost analysis
npm run cost:analyze

# Current month costs
aws ce get-cost-and-usage \
  --time-period Start=$(date +%Y-%m-01),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost
```

---

## 🚨 Disaster Recovery

### Backup Procedures

```bash
# DynamoDB backup
aws dynamodb create-backup \
  --table-name serenya-$ENVIRONMENT \
  --backup-name manual-$(date +%Y%m%d%H%M%S)

# Export CloudFormation
aws cloudformation get-template \
  --stack-name SerenyaBackend-$ENVIRONMENT \
  --template-stage Processed > backup/template-$(date +%Y%m%d).json

# Backup Lambda code
aws lambda get-function \
  --function-name SerenyaBackend-$ENVIRONMENT-AuthFunction \
  --query 'Code.Location' \
  --output text | xargs wget -O backup/auth-$(date +%Y%m%d).zip
```

### Recovery Procedures

**DynamoDB:**
```bash
aws dynamodb restore-table-to-point-in-time \
  --source-table-name serenya-prod \
  --target-table-name serenya-prod-restored \
  --restore-date-time "2025-01-15T12:00:00Z"
```

**Infrastructure:**
```bash
cdk deploy SerenyaBackend-$ENVIRONMENT
```

**Lambda Code:**
```bash
aws lambda update-function-code \
  --function-name SerenyaBackend-$ENVIRONMENT-AuthFunction \
  --zip-file fileb://backup/auth-20250115.zip
```

---

## 📋 Deployment Checklist

### Pre-Deployment
- [ ] AWS CLI configured
- [ ] Environment variables set
- [ ] CDK bootstrapped
- [ ] Dependencies installed (`npm install`)
- [ ] TypeScript compiled (`npm run build`)
- [ ] Pre-deployment validation passed

### Deployment
- [ ] Stack deployed successfully
- [ ] CloudFormation status: `CREATE_COMPLETE` or `UPDATE_COMPLETE`
- [ ] No rollback occurred

### Post-Deployment
- [ ] Secrets Manager configured
- [ ] DynamoDB table active
- [ ] Lambda functions invocable
- [ ] API Gateway accessible
- [ ] S3 buckets created
- [ ] CloudWatch dashboards created
- [ ] SNS alerts configured
- [ ] Post-deployment validation passed

### Testing
- [ ] Integration tests passed
- [ ] API endpoints tested
- [ ] Security validated
- [ ] DynamoDB connectivity verified

### Monitoring
- [ ] CloudWatch dashboards reviewed
- [ ] Alarms configured
- [ ] SNS alerts confirmed
- [ ] DynamoDB Streams processing

---

## 📚 Related Documentation

- **[database-architecture.md](database-architecture.md)** - DynamoDB design
- **[api-contracts.md](api-contracts.md)** - API specifications
- **[observability.md](observability.md)** - Monitoring infrastructure
- **[our-dev-rules.md](our-dev-rules.md)** - Development standards

---

**Document Status**: ✅ Complete - DynamoDB Serverless Architecture
**Last Updated**: January 2025
**Next Review**: March 2025
