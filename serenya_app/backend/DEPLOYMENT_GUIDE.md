# Serenya Backend Deployment Guide

## 🚀 Quick Deployment

### 1. Prerequisites Setup
```bash
# Run the setup script
./scripts/setup.sh dev

# This will check and install:
# - Node.js 18+
# - AWS CLI
# - AWS CDK
# - Project dependencies
```

### 2. AWS Configuration
```bash
# Configure AWS credentials (if not done)
aws configure

# Set region to EU-West-1 for GDPR compliance
aws configure set region eu-west-1

# Verify configuration
aws sts get-caller-identity
```

### 3. Deploy Backend
```bash
# Deploy to development environment
./scripts/deploy.sh dev

# Note the API Gateway URL from the output
```

### 4. Configure Secrets
```bash
# Update API secrets with your actual credentials
aws secretsmanager update-secret \
  --secret-id "serenya/dev/api-secrets" \
  --secret-string '{
    "jwtSecret": "keep-auto-generated-value",
    "anthropicApiKey": "sk-ant-api03-...",
    "googleClientId": "123456789-....apps.googleusercontent.com", 
    "googleClientSecret": "GOCSPX-..."
  }' \
  --region eu-west-1
```

### 5. Update Flutter App
```dart
// Update lib/core/constants/app_constants.dart
static const String baseApiUrl = 'https://YOUR_API_GATEWAY_URL';
```

### 6. Test Integration
```bash
# Test endpoints
API_URL=https://YOUR_API_GATEWAY_URL ./scripts/test-endpoints.sh dev

# Run comprehensive integration tests
API_URL=https://YOUR_API_GATEWAY_URL node scripts/integration-test.js dev
```

## 🏢 Production Deployment

### 1. Environment Preparation

#### Production Secrets Setup
```bash
# Create production secrets
aws secretsmanager create-secret \
  --name "serenya/prod/api-secrets" \
  --description "Serenya production API secrets" \
  --secret-string '{
    "jwtSecret": "generate-secure-256bit-key",
    "anthropicApiKey": "your-production-anthropic-key",
    "googleClientId": "your-production-google-client-id",
    "googleClientSecret": "your-production-google-client-secret"
  }' \
  --region eu-west-1
```

#### Google OAuth Configuration
1. Create production OAuth 2.0 credentials in Google Cloud Console
2. Configure OAuth consent screen for production
3. Add production domain to authorized origins
4. Set authorized redirect URIs

#### Anthropic API Setup
1. Create Anthropic account with sufficient credits
2. Generate production API key
3. Verify access to Claude 3 Sonnet model
4. Set up billing alerts for API usage

### 2. Production Deployment
```bash
# Deploy to production
./scripts/deploy.sh prod

# Verify deployment
aws cloudformation describe-stacks \
  --stack-name SerenyaBackend-prod \
  --region eu-west-1
```

### 3. Production Testing
```bash
# Test production endpoints
API_URL=https://YOUR_PROD_API_GATEWAY_URL ./scripts/test-endpoints.sh prod

# Load testing (install artillery first: npm install -g artillery)
artillery run config/load-test-prod.yml
```

### 4. Monitoring Setup

#### CloudWatch Alarms
```bash
# Create critical alarms
aws cloudwatch put-metric-alarm \
  --alarm-name "Serenya-Auth-Errors-Prod" \
  --alarm-description "High authentication error rate" \
  --metric-name "ErrorRate" \
  --namespace "AWS/Lambda" \
  --statistic "Average" \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 5.0 \
  --comparison-operator "GreaterThanThreshold" \
  --dimensions Name=FunctionName,Value=SerenyaBackend-prod-AuthFunction
```

#### Cost Monitoring
```bash
# Set up cost alerts
aws budgets create-budget \
  --account-id YOUR_ACCOUNT_ID \
  --budget '{
    "BudgetName": "Serenya-Backend-Monthly",
    "BudgetLimit": {
      "Amount": "100",
      "Unit": "USD"
    },
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }'
```

## 🔧 Configuration Management

### Environment Variables

Each environment has specific configuration in `config/environments.ts`:

```typescript
// Development
{
  allowOrigins: ['http://localhost:*'],
  enableDetailedLogging: true,
  memorySize: { small: 256, medium: 512, large: 1024 }
}

// Production  
{
  allowOrigins: ['https://app.serenya.health'],
  enableDetailedLogging: false,
  memorySize: { small: 512, medium: 1024, large: 2048 }
}
```

### Secrets Management

#### Required Secrets Format
```json
{
  "jwtSecret": "base64-encoded-256bit-key",
  "anthropicApiKey": "sk-ant-api03-...",
  "googleClientId": "123456789-....apps.googleusercontent.com",
  "googleClientSecret": "GOCSPX-..."
}
```

#### Secret Rotation
```bash
# Rotate JWT secret (will invalidate all tokens)
aws secretsmanager rotate-secret \
  --secret-id "serenya/prod/api-secrets" \
  --rotation-lambda-arn arn:aws:lambda:...
```

## 🔍 Monitoring & Observability

### CloudWatch Dashboards

Create custom dashboard:
```bash
aws cloudwatch put-dashboard \
  --dashboard-name "Serenya-Backend-Prod" \
  --dashboard-body file://config/cloudwatch-dashboard.json
```

### Key Metrics to Monitor

1. **API Gateway**:
   - Request count and latency
   - Error rates (4xx, 5xx)
   - Cache hit rates

2. **Lambda Functions**:
   - Invocation count and duration
   - Error rates and throttles
   - Memory utilization

3. **DynamoDB**:
   - Read/write capacity consumption
   - Throttled requests
   - Item count trends

4. **S3**:
   - Object count and size
   - Request rates
   - Storage cost trends

### Log Analysis

```bash
# Search for errors across all functions
aws logs filter-log-events \
  --log-group-name "/aws/lambda/SerenyaBackend-prod-AuthFunction" \
  --filter-pattern "ERROR" \
  --start-time $(date -d "1 hour ago" +%s)000

# Monitor processing times
aws logs filter-log-events \
  --log-group-name "/aws/lambda/SerenyaBackend-prod-ProcessFunction" \
  --filter-pattern "processing_completed" \
  --start-time $(date -d "1 hour ago" +%s)000
```

## 🛡️ Security Best Practices

### Access Control
- Use separate AWS accounts for dev/staging/prod
- Implement least privilege IAM policies
- Enable MFA for all administrative access
- Regular access reviews and cleanup

### Data Protection
- All data encrypted with customer-managed KMS keys
- Automatic key rotation enabled
- No permanent PHI storage
- Secure transmission with TLS 1.2+

### Monitoring & Auditing
- All user actions logged (without PHI)
- Failed authentication attempts tracked
- Unusual access patterns alerted
- Regular security audits

### Incident Response
1. **Detection**: CloudWatch alarms and monitoring
2. **Response**: Automated scaling and failover
3. **Investigation**: Centralized logging and tracing
4. **Recovery**: Automated backups and restore procedures

## 🔄 Maintenance & Updates

### Regular Maintenance Tasks

#### Weekly
- [ ] Review error logs and failed processing
- [ ] Monitor cost trends and usage patterns
- [ ] Check SSL certificate expiration
- [ ] Verify backup and cleanup processes

#### Monthly  
- [ ] Update Lambda function dependencies
- [ ] Review and update security policies
- [ ] Analyze performance metrics and optimize
- [ ] Test disaster recovery procedures

#### Quarterly
- [ ] Security audit and penetration testing
- [ ] Compliance review (HIPAA, GDPR)
- [ ] Cost optimization review
- [ ] Update incident response procedures

### Dependency Updates
```bash
# Check for outdated dependencies
npm outdated

# Update dependencies (test thoroughly)
npm update

# Update Lambda dependencies
for dir in lambdas/*/; do
  (cd "$dir" && npm update)
done

# Redeploy after updates
./scripts/deploy.sh staging
# Test thoroughly, then deploy to prod
./scripts/deploy.sh prod
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Deployment Failures
```bash
# Check CDK diff
npm run diff -- --context environment=dev

# Verify permissions
aws iam get-user
aws sts get-caller-identity

# Check bootstrap status
aws cloudformation describe-stacks --stack-name CDKToolkit
```

#### 2. Authentication Issues
```bash
# Verify Google OAuth configuration
# Check redirect URIs in Google Cloud Console
# Verify client ID in secrets manager

# Test JWT generation
aws logs filter-log-events \
  --log-group-name "/aws/lambda/SerenyaBackend-dev-AuthFunction" \
  --filter-pattern "auth_success"
```

#### 3. File Processing Failures
```bash
# Check processing function logs
aws logs tail /aws/lambda/SerenyaBackend-dev-ProcessFunction --follow

# Verify Anthropic API key
aws secretsmanager get-secret-value --secret-id "serenya/dev/api-secrets"

# Check S3 bucket permissions
aws s3api get-bucket-policy --bucket serenya-temp-files-dev-ACCOUNT
```

#### 4. Performance Issues
```bash
# Monitor Lambda performance
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=SerenyaBackend-dev-ProcessFunction \
  --start-time $(date -d "1 hour ago" -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum
```

### Emergency Procedures

#### Critical Error Response
1. **Check system status**: AWS Health Dashboard
2. **Review recent deployments**: CloudFormation events
3. **Check error rates**: CloudWatch metrics
4. **Scale resources**: Increase Lambda memory/timeout if needed
5. **Rollback**: Revert to previous working version

#### Data Breach Response
1. **Immediate**: Disable affected services
2. **Investigation**: Review access logs and audit trails
3. **Notification**: Follow legal requirements for breach notification
4. **Recovery**: Implement fixes and restore services
5. **Prevention**: Update security controls and monitoring

## 📞 Support & Contact

### Getting Help
1. **Documentation**: Check this guide and inline code comments
2. **AWS Support**: Use AWS Support Center for infrastructure issues
3. **Anthropic Support**: Contact Anthropic for API-related issues
4. **Google Support**: Use Google Cloud Console for OAuth issues

### Escalation Path
1. **Level 1**: Application logs and CloudWatch metrics
2. **Level 2**: AWS Support (if infrastructure-related)
3. **Level 3**: Development team and architecture review

---

**⚕️ Healthcare Compliance Reminder**: This system processes PHI and must comply with HIPAA, GDPR, and other applicable regulations. Ensure proper security reviews and legal approval before production deployment.