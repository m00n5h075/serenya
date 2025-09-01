# Serenya AI Health Agent - AWS Serverless Backend

## Overview

This is the complete AWS serverless backend infrastructure for the Serenya AI Health Agent Flutter mobile app. The backend provides HIPAA-compliant, privacy-first processing of medical documents with AI interpretation using Anthropic Claude.

## Architecture

### 🏗️ Infrastructure Components

- **API Gateway**: Regional REST API with JWT authorization
- **Lambda Functions**: Serverless compute for all business logic
- **S3**: Temporary encrypted storage with automatic cleanup
- **DynamoDB**: Job tracking and user profiles with TTL
- **KMS**: Customer-managed encryption keys
- **Secrets Manager**: Secure storage for API keys and secrets
- **CloudWatch**: Logging and monitoring without PHI exposure

### 🔒 Security & Compliance

- **HIPAA Compliant**: No permanent PHI storage, encryption at rest and in transit
- **GDPR Ready**: EU-West-1 deployment with data retention controls
- **Zero-Trust**: JWT authentication, least privilege IAM roles
- **Audit Logging**: Comprehensive logging without exposing PHI
- **Auto-Cleanup**: Automatic deletion of temporary files (1hr + 24hr failsafe)

## API Endpoints

### Authentication
- `POST /auth/google` - Google OAuth verification → JWT token

### User Management  
- `GET /user/profile` - Retrieve user profile information

### File Processing
- `POST /api/v1/process/upload` - Upload medical document for processing
- `GET /api/v1/process/status/{jobId}` - Check processing status
- `GET /api/v1/process/result/{jobId}` - Retrieve AI interpretation
- `POST /api/v1/process/retry/{jobId}` - Retry failed processing
- `POST /api/v1/process/doctor-report` - Generate premium PDF report

## Quick Start

### Prerequisites

1. **AWS Account** with appropriate permissions
2. **Node.js 18+** 
3. **AWS CLI** configured with credentials
4. **AWS CDK** installed globally (`npm install -g aws-cdk`)

### Initial Setup

```bash
# 1. Run setup script
./scripts/setup.sh dev

# 2. Install dependencies  
npm install

# 3. Bootstrap CDK (first time only)
cdk bootstrap

# 4. Deploy to development
./scripts/deploy.sh dev
```

### Configure Secrets

After deployment, update AWS Secrets Manager:

```bash
# Get the secret ARN from deployment output
aws secretsmanager update-secret \
  --secret-id "serenya/dev/api-secrets" \
  --secret-string '{
    "jwtSecret": "auto-generated-by-deployment",
    "anthropicApiKey": "your-anthropic-api-key", 
    "googleClientId": "your-google-oauth-client-id",
    "googleClientSecret": "your-google-oauth-client-secret"
  }'
```

### Update Flutter App

Update your Flutter app's API configuration:

```dart
// lib/core/constants/app_constants.dart
static const String baseApiUrl = 'https://your-api-gateway-url.execute-api.eu-west-1.amazonaws.com/dev';
```

## Deployment

### Environment Deployment

```bash
# Development
./scripts/deploy.sh dev

# Staging  
./scripts/deploy.sh staging

# Production
./scripts/deploy.sh prod
```

### Environment Differences

- **Dev**: Detailed logging, local origins allowed, 7-day retention
- **Staging**: Similar to dev but restricted origins, 14-day retention  
- **Prod**: Minimal logging, production origins only, 30-day retention

## Configuration

### Environment Variables

Each Lambda function receives these environment variables:

```
REGION=eu-west-1
ENVIRONMENT=dev|staging|prod
JOBS_TABLE_NAME=serenya-jobs-{env}
USERS_TABLE_NAME=serenya-users-{env}
TEMP_BUCKET_NAME=serenya-temp-files-{env}-{account}
API_SECRETS_ARN=arn:aws:secretsmanager:...
KMS_KEY_ID=key-id
ENABLE_DETAILED_LOGGING=true|false
```

### File Processing Limits

- **File Size**: 5MB maximum
- **File Types**: PDF, JPG, JPEG, PNG only
- **Processing Timeout**: 3 minutes maximum
- **Retry Logic**: 30s → 2m → 5m exponential backoff
- **Storage**: 1 hour automatic cleanup, 24 hour failsafe

## Security Features

### Data Protection
- All data encrypted at rest with customer-managed KMS keys
- S3 buckets have public access blocked and SSL enforcement
- DynamoDB tables use customer-managed encryption
- Temporary storage only - no permanent PHI retention

### Access Control
- JWT tokens with 1-hour expiration
- API Gateway authorizer validates all protected endpoints
- IAM roles follow least privilege principle
- Rate limiting to prevent abuse

### Audit & Compliance
- All actions logged to CloudWatch without PHI exposure
- User actions tracked with anonymized identifiers
- Processing metrics available for compliance reporting
- Automatic data retention enforcement

## Monitoring & Observability

### CloudWatch Metrics
- API Gateway request/response metrics
- Lambda function duration and error rates
- DynamoDB read/write capacity
- S3 storage and request metrics

### Alarms (Recommended)
- Lambda function error rates > 5%
- API Gateway 4xx/5xx rates > 10%
- Processing timeout rates > 1%
- S3 bucket size growth anomalies

### X-Ray Tracing
- End-to-end request tracing enabled
- Performance bottleneck identification
- Error correlation across services

## Testing

### Endpoint Testing

```bash
# Test all endpoints
./scripts/test-endpoints.sh dev

# Test with authentication token
TEST_TOKEN=eyJ... ./scripts/test-endpoints.sh staging
```

### Load Testing

```bash
# Install artillery for load testing
npm install -g artillery

# Run load tests (create artillery configs first)
artillery run config/load-test-dev.yml
```

## Cost Optimization

### AWS Free Tier Usage
- Lambda: 1M requests/month, 400,000 GB-seconds
- API Gateway: 1M requests/month
- DynamoDB: 25GB storage, 25 RCU/WCU
- S3: 5GB storage, 20,000 GET requests, 2,000 PUT requests

### Production Cost Estimates
- **Light usage** (100 docs/day): ~$20-30/month
- **Medium usage** (1000 docs/day): ~$100-150/month  
- **Heavy usage** (10000 docs/day): ~$500-800/month

*Costs primarily driven by Anthropic API usage and Lambda compute time.*

## Troubleshooting

### Common Issues

1. **Deployment Fails**: Check AWS permissions and CDK bootstrap
2. **Lambda Timeouts**: Increase memory size or timeout limits
3. **Authentication Errors**: Verify JWT secret and Google OAuth setup
4. **File Upload Fails**: Check S3 permissions and CORS configuration
5. **AI Processing Fails**: Verify Anthropic API key and quota

### Debug Commands

```bash
# Check stack status
cdk diff --context environment=dev

# View logs
aws logs tail /aws/lambda/serenya-auth-dev --follow

# Check DynamoDB items
aws dynamodb scan --table-name serenya-jobs-dev --max-items 5

# Test S3 access
aws s3 ls s3://serenya-temp-files-dev-{account}/
```

## Flutter Integration

### API Service Updates

The backend is designed to work with the existing Flutter `ApiService`. The endpoints match the expected format:

```dart
// These endpoints are implemented and ready
uploadDocument() // → POST /api/v1/process/upload
getProcessingStatus() // → GET /api/v1/process/status/{jobId}  
getInterpretation() // → GET /api/v1/process/result/{jobId}
retryProcessing() // → POST /api/v1/process/retry/{jobId}
generateDoctorReport() // → POST /api/v1/process/doctor-report
```

### Response Formats

All responses follow the expected Flutter format:

```json
{
  "success": true,
  "job_id": "uuid",
  "confidence_score": 8.5,
  "interpretation_text": "...",
  "medical_flags": ["ABNORMAL_VALUES"],
  "safety_warnings": [...]
}
```

## Production Checklist

### Before Production Deployment

- [ ] Configure production Google OAuth credentials
- [ ] Set up production Anthropic API key with sufficient credits
- [ ] Review and update CORS origins for production domain
- [ ] Set up CloudWatch alarms and notifications
- [ ] Configure backup and disaster recovery procedures
- [ ] Complete security audit and penetration testing
- [ ] Validate HIPAA compliance with legal team
- [ ] Set up monitoring dashboards
- [ ] Create incident response procedures
- [ ] Configure automated security scanning

### Post-Deployment

- [ ] Verify all endpoints are working
- [ ] Test end-to-end Flutter app integration  
- [ ] Monitor error rates and performance
- [ ] Set up log aggregation and analysis
- [ ] Configure cost monitoring and alerts
- [ ] Document operational procedures
- [ ] Train support team on backend architecture

## Support & Maintenance

### Regular Maintenance
- Monitor AWS service quotas and limits
- Review and update dependencies monthly
- Audit access logs quarterly
- Test disaster recovery procedures
- Update security policies as needed

### Emergency Procedures
- Lambda function failures: Check CloudWatch logs
- DynamoDB throttling: Increase provisioned capacity
- S3 access issues: Verify bucket policies and encryption
- Authentication failures: Check JWT secret and Google OAuth

## Contributing

### Development Workflow
1. Create feature branch
2. Make changes to Lambda functions or infrastructure
3. Test locally with `./scripts/test-endpoints.sh dev`
4. Deploy to staging: `./scripts/deploy.sh staging`
5. Run integration tests
6. Deploy to production: `./scripts/deploy.sh prod`

### Code Standards
- Use TypeScript for infrastructure code
- Use Node.js 18+ for Lambda functions
- Follow AWS Well-Architected Framework principles
- Implement comprehensive error handling
- Include audit logging for all user actions
- Never log PHI or sensitive data

---

**⚕️ Healthcare Compliance Notice**: This backend is designed for healthcare applications processing PHI. Ensure proper security reviews, compliance audits, and legal approval before production use.