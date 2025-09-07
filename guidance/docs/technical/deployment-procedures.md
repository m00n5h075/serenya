# Serenya Deployment Procedures

## Overview
This document provides comprehensive deployment procedures for the Serenya healthcare AI platform infrastructure and applications.

## Prerequisites

### Required Tools
- AWS CLI v2.x configured with appropriate permissions
- Node.js v18+ and npm
- AWS CDK v2.x installed globally
- Git

### Required Permissions
- Administrator access to target AWS account
- Ability to create IAM roles and policies
- VPC and subnet creation permissions
- CloudFormation stack management permissions

## Infrastructure Deployment

### 1. Initial Environment Setup

```bash
# Clone repository and navigate to backend
cd serenya/serenya_app/backend

# Install dependencies
npm install

# Set environment variables
export ENVIRONMENT=dev  # or prod
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

### 2. Enhanced Infrastructure Deployment (Tasks 1 & 2 Complete)

```bash
# Bootstrap CDK if first time
cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_REGION

# Deploy enhanced stack with all features
cdk deploy EnhancedSerenyaBackend-$ENVIRONMENT \
  --require-approval never \
  --parameters enablePrivateLink=true \
  --parameters enableVpcFlowLogs=true \
  --parameters enableNatGateway=true
```

### 3. Post-Deployment Configuration

#### Database Initialization
```bash
# Wait for RDS instance to be available
aws rds wait db-instance-available \
  --db-instance-identifier serenyabackend-$ENVIRONMENT-serenyad-*

# Run consolidated database migrations (2 migrations total)
node scripts/init-database.js

# Verify database schema
node scripts/validate-database-schema.js
```

**Migration Structure (Consolidated):**
- **Migration 001**: Complete core schema (v2.0.0)
  - All business tables: users, devices, sessions, subscriptions, payments
  - All ENUM types and indexes
  - Encryption hash fields built-in
  - Performance optimizations
- **Migration 002**: Audit infrastructure (v2.1.0)
  - HIPAA/GDPR compliance audit logging
  - Tamper detection and privacy-safe logging
  - Audit summary tables for reporting

#### Parameter Store Configuration
```bash
# Update API secrets in Parameter Store
aws ssm put-parameter \
  --name "/serenya/$ENVIRONMENT/api-secrets" \
  --value '{"anthropicApiKey":"YOUR_KEY","googleClientId":"YOUR_ID"}' \
  --type "SecureString" \
  --overwrite

# Verify parameter store setup
node scripts/validation/validate-infrastructure.js
```

### 4. Validation and Testing

```bash
# Run comprehensive infrastructure validation
node scripts/validation/validate-infrastructure.js

# Run integration tests
npm run test:integration

# Test API endpoints
npm run test:endpoints

# Validate security configuration
npm run test:security
```

## Rollback Procedures

### Emergency Rollback
```bash
# Rollback to previous stack version
cdk deploy EnhancedSerenyaBackend-$ENVIRONMENT \
  --require-approval never \
  --previous-parameters

# If complete rollback needed
aws cloudformation cancel-update-stack \
  --stack-name EnhancedSerenyaBackend-$ENVIRONMENT
```

## Troubleshooting Guide

### Common Issues

#### CDK Deployment Failures
1. **Bootstrap Issues**
   ```bash
   # Re-bootstrap CDK
   cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_REGION --force
   ```

2. **Permission Errors**
   ```bash
   # Verify IAM permissions
   aws iam simulate-principal-policy \
     --policy-source-arn $(aws sts get-caller-identity --query Arn --output text) \
     --action-names cloudformation:CreateStack \
     --resource-arns "*"
   ```

#### Runtime Issues

1. **Lambda Function Errors**
   ```bash
   # Check function logs
   aws logs tail /aws/lambda/SerenyaBackend-$ENVIRONMENT-ProcessFunction --follow
   ```

2. **Database Connection Issues**
   ```bash
   # Test database connectivity
   aws rds describe-db-instances --db-instance-identifier serenyabackend-$ENVIRONMENT-*
   ```

## Security Considerations

### Access Controls
- Use least-privilege IAM policies
- Enable MFA for administrative access
- Rotate credentials regularly
- Monitor access patterns with CloudTrail

### Data Protection
- Verify encryption at rest for all data stores
- Ensure encryption in transit for all communications
- Regular backup validation
- Secure parameter store usage

### Network Security
- WAF rules are properly configured
- VPC endpoints are functioning
- Security groups follow least-privilege
- Network ACLs provide defense in depth

## Disaster Recovery

### Backup Procedures
```bash
# Manual RDS snapshot
aws rds create-db-snapshot \
  --db-instance-identifier serenyabackend-$ENVIRONMENT-* \
  --db-snapshot-identifier manual-snapshot-$(date +%Y%m%d%H%M%S)

# Export CloudFormation template
aws cloudformation get-template \
  --stack-name EnhancedSerenyaBackend-$ENVIRONMENT \
  --template-stage Processed > backup/template-$(date +%Y%m%d).json
```

### Recovery Procedures
1. **Database Recovery**
   - Restore from automated backup
   - Point-in-time recovery if needed
   - Validate data integrity

2. **Infrastructure Recovery**
   - Deploy from CloudFormation template
   - Restore application code from Git
   - Reconfigure external dependencies

## Compliance and Auditing

### HIPAA Compliance Checks
- Verify encryption configurations
- Review access logs
- Validate audit trail completeness
- Test data breach response procedures

### Security Audits
```bash
# Run security validation
npm run security:audit

# Check for compliance violations
node scripts/compliance-check.js
```

---

**Document Version**: 1.1  
**Last Updated**: September 2025  
**Next Review**: December 2025