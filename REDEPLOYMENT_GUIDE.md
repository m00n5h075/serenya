# Serenya Infrastructure Redeployment Guide

**Last Updated:** September 4, 2025  
**Status:** Infrastructure PAUSED - All AWS resources deleted for cost savings  
**Next Action:** Follow this guide when ready to resume development

---

## 🎯 Overview

This guide ensures smooth redeployment of Serenya infrastructure after using `pause-development.sh`. The infrastructure has been completely deleted to achieve 95% cost savings (~$0.50/month), and this document contains all steps to restore full functionality.

---

## ✅ What's Preserved (No Action Needed)

- **✅ Source Code:** All Flutter and backend code intact at `/Users/m00n5h075ai/development/serenya/`
- **✅ CDK Templates:** Complete infrastructure-as-code ready in `serenya_app/backend/`
- **✅ Configuration Files:** All settings in `cdk.json`, `package.json`, `pubspec.yaml`
- **✅ Secrets Structure:** Secrets Manager schema preserved in CDK code
- **✅ Cost Optimization Scripts:** All scripts ready in `/scripts/` folder
- **✅ Documentation:** Complete project documentation preserved

---

## 🔧 What Needs Updates After Redeployment

### New Resource Identifiers (Generated During Redeployment)
- **🔄 RDS Endpoint:** New PostgreSQL hostname
- **🔄 API Gateway URL:** New base API URL (critical for mobile app)
- **🔄 Secret ARNs:** New AWS Secrets Manager resource IDs
- **🔄 KMS Key ID:** New encryption key for field-level encryption
- **🔄 S3 Bucket Name:** New temporary file storage bucket

### Breaking Changes Expected
- **📱 Mobile App Authentication:** Will break until API URL is updated
- **🗄️ Database:** Completely empty, needs schema recreation
- **🔐 Encryption Keys:** All new keys, previous encrypted backups incompatible

---

## 🚀 Step-by-Step Redeployment Process

### Phase 1: Infrastructure Redeployment (8-12 minutes)

```bash
# 1. Navigate to project directory
cd /Users/m00n5h075ai/development/serenya

# 2. Run automated redeployment script
./scripts/resume-development.sh
```

**What This Does:**
- ✅ Redeploys complete CloudFormation stack
- ✅ Creates new RDS PostgreSQL instance
- ✅ Deploys all Lambda functions
- ✅ Creates new API Gateway with new URL
- ✅ Sets up VPC, security groups, KMS keys
- ✅ Configures Secrets Manager with new ARNs
- ✅ Sets up S3 bucket for temporary files

**Expected Output:**
```
✅ Infrastructure deployment completed!
✅ API Gateway URL: https://[NEW-API-ID].execute-api.eu-west-1.amazonaws.com/dev/
✅ Database Host: [NEW-RDS-ENDPOINT].rds.amazonaws.com
```

### Phase 2: Extract New Configuration Details

```bash
# Get the new API Gateway URL (CRITICAL for mobile app)
NEW_API_URL=$(/Users/m00n5h075ai/Library/Python/3.9/bin/aws cloudformation describe-stacks \
  --stack-name serenya-backend-dev --region eu-west-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text)

echo "🌐 NEW API URL: $NEW_API_URL"

# Get new database endpoint
NEW_DB_HOST=$(/Users/m00n5h075ai/Library/Python/3.9/bin/aws cloudformation describe-stacks \
  --stack-name serenya-backend-dev --region eu-west-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseHost`].OutputValue' --output text)

echo "🗄️ NEW DB HOST: $NEW_DB_HOST"

# Get new KMS key ID
NEW_KMS_KEY=$(/Users/m00n5h075ai/Library/Python/3.9/bin/aws cloudformation describe-stacks \
  --stack-name serenya-backend-dev --region eu-west-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`KmsKeyId`].OutputValue' --output text)

echo "🔐 NEW KMS KEY: $NEW_KMS_KEY"
```

### Phase 3: Update Mobile App Configuration

**CRITICAL:** Mobile app will not work until this step is completed.

```bash
# Navigate to Flutter app
cd /Users/m00n5h075ai/development/serenya/serenya_app

# Edit the API constants file
# UPDATE THIS FILE: lib/core/constants/app_constants.dart
```

**File Update Required:**
```dart
// File: lib/core/constants/app_constants.dart

// OLD (will be broken):
static const String baseApiUrl = 'https://bpzha55z9e.execute-api.eu-west-1.amazonaws.com/dev/';

// NEW (replace with actual URL from Phase 2):
static const String baseApiUrl = 'https://[NEW-API-ID].execute-api.eu-west-1.amazonaws.com/dev/';
```

**Verification:**
```bash
# Ensure the URL ends with '/dev/' (include trailing slash)
# Double-check the URL matches the output from Phase 2
grep -n "baseApiUrl" lib/core/constants/app_constants.dart
```

### Phase 4: Database Schema Initialization

```bash
# Navigate to backend directory
cd /Users/m00n5h075ai/development/serenya/serenya_app/backend

# Initialize database schema (recreate all tables)
./scripts/init-database.sh

# Alternative: Use Lambda function for database initialization
/Users/m00n5h075ai/Library/Python/3.9/bin/aws lambda invoke \
  --function-name serenya-backend-dev-DatabaseInitFunction \
  --region eu-west-1 \
  /tmp/db-init-result.json

# Check initialization result
cat /tmp/db-init-result.json
```

**Expected Database Tables After Initialization:**
- ✅ `users` - User accounts and profiles
- ✅ `user_consents` - HIPAA consent tracking
- ✅ `health_documents` - Document metadata (local storage)
- ✅ `document_interpretations` - AI analysis results (local storage)
- ✅ `interpretation_timeline` - Timeline entries (local storage)
- ✅ All required indexes and constraints
- ✅ All ENUM types (document_type, confidence_level, etc.)

### Phase 5: Test Complete System

```bash
# 1. Test API Gateway connectivity
curl -X GET "$NEW_API_URL" || curl -X GET "$NEW_API_URL/health"

# 2. Test authentication endpoint
curl -X POST "$NEW_API_URL/auth/google" \
  -H "Content-Type: application/json" \
  -d '{"token": "test_token"}' \
  | jq '.'

# 3. Run Flutter tests
cd /Users/m00n5h075ai/development/serenya/serenya_app
flutter test

# 4. Test mobile app authentication flow
flutter run # Test Google OAuth flow

# 5. Verify database connectivity
/Users/m00n5h075ai/Library/Python/3.9/bin/aws rds describe-db-instances \
  --region eu-west-1 \
  --query 'DBInstances[?contains(DBInstanceIdentifier, `serenya`)].DBInstanceStatus'
```

### Phase 6: Resume Development Workflow

```bash
# Start cost-optimized development workflow
./scripts/dev-status.sh                    # Quick status check
./scripts/auto-schedule-rds.sh            # Set up automated cost savings (optional)

# Begin development
flutter run                               # Start mobile app development
```

---

## 🚨 Common Issues and Solutions

### Issue 1: Mobile App Authentication Fails
**Symptoms:** `Network error` or `Failed to authenticate` in mobile app

**Solution:**
```bash
# 1. Verify API URL is correct
grep "baseApiUrl" lib/core/constants/app_constants.dart

# 2. Test API endpoint manually
curl -X GET "$NEW_API_URL"

# 3. Ensure URL ends with '/dev/' (trailing slash is important)

# 4. Clean and rebuild Flutter app
flutter clean && flutter pub get && flutter run
```

### Issue 2: Database Connection Errors
**Symptoms:** Lambda functions failing with database errors

**Solution:**
```bash
# 1. Check RDS status
/Users/m00n5h075ai/Library/Python/3.9/bin/aws rds describe-db-instances \
  --region eu-west-1 --query 'DBInstances[?contains(DBInstanceIdentifier, `serenya`)].DBInstanceStatus'

# 2. Verify database initialization
./scripts/init-database.sh

# 3. Check Lambda function logs
/Users/m00n5h075ai/Library/Python/3.9/bin/aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/serenya-backend-dev" --region eu-west-1
```

### Issue 3: API Gateway Returns 502/503 Errors
**Symptoms:** `Bad Gateway` or `Service Unavailable` responses

**Solution:**
```bash
# 1. Check Lambda function health
/Users/m00n5h075ai/Library/Python/3.9/bin/aws lambda list-functions \
  --region eu-west-1 --query 'Functions[?contains(FunctionName, `serenya-backend-dev`)]'

# 2. Test Lambda functions directly
/Users/m00n5h075ai/Library/Python/3.9/bin/aws lambda invoke \
  --function-name serenya-backend-dev-AuthFunction \
  --region eu-west-1 /tmp/test-result.json

# 3. Check CloudFormation stack status
/Users/m00n5h075ai/Library/Python/3.9/bin/aws cloudformation describe-stacks \
  --stack-name serenya-backend-dev --region eu-west-1 \
  --query 'Stacks[0].StackStatus'
```

### Issue 4: Stack Deployment Fails
**Symptoms:** `resume-development.sh` script fails during CDK deployment

**Solution:**
```bash
# 1. Check CDK bootstrap status
cd /Users/m00n5h075ai/development/serenya/serenya_app/backend
npx cdk bootstrap aws://625819760139/eu-west-1

# 2. Manual deployment with detailed output
npx cdk deploy --all --verbose

# 3. Check for resource conflicts
/Users/m00n5h075ai/Library/Python/3.9/bin/aws cloudformation describe-stack-events \
  --stack-name serenya-backend-dev --region eu-west-1
```

---

## 🔄 Post-Redeployment Checklist

### ✅ Infrastructure Verification
- [ ] CloudFormation stack status: `UPDATE_COMPLETE` or `CREATE_COMPLETE`
- [ ] RDS instance status: `available`
- [ ] API Gateway responding to health checks
- [ ] Lambda functions deployed and accessible
- [ ] KMS keys active and accessible
- [ ] S3 bucket created and accessible

### ✅ Mobile App Updates
- [ ] `app_constants.dart` updated with new API URL
- [ ] Flutter app builds without errors
- [ ] Google OAuth authentication flow working
- [ ] API calls succeeding from mobile app
- [ ] Local database encryption working with new keys

### ✅ Backend Services
- [ ] Database schema initialized (all tables created)
- [ ] Database indexes and constraints in place
- [ ] Authentication API endpoint functional
- [ ] User profile API endpoint functional  
- [ ] All Lambda functions responding correctly

### ✅ Development Environment
- [ ] Cost optimization scripts working with new resources
- [ ] Development workflow scripts updated
- [ ] Local development environment connecting to new infrastructure
- [ ] Test suites passing with new endpoints

---

## 💰 Cost Management After Redeployment

```bash
# Check infrastructure status and costs
./scripts/dev-status.sh

# Set up automated cost savings
./scripts/auto-schedule-rds.sh

# Daily workflow for cost optimization
./scripts/start-dev-infrastructure.sh    # Begin dev session
# ... develop and test ...
./scripts/stop-dev-infrastructure.sh     # End session (save 70%)
```

**Expected Monthly Costs After Redeployment:**
- **Full infrastructure (24/7):** ~$15/month
- **With RDS scheduling:** ~$4/month (70% savings)
- **Manual stop/start:** ~$4/month (70% savings)

---

## 📞 Emergency Contacts and Resources

### AWS Console Links
- **CloudFormation:** https://console.aws.amazon.com/cloudformation/
- **RDS:** https://console.aws.amazon.com/rds/
- **Lambda:** https://console.aws.amazon.com/lambda/
- **API Gateway:** https://console.aws.amazon.com/apigateway/
- **Cost Explorer:** https://console.aws.amazon.com/cost-management/

### Key Project Files
- **CDK Configuration:** `/serenya_app/backend/cdk.json`
- **Infrastructure Code:** `/serenya_app/backend/infrastructure/`
- **Mobile App Constants:** `/serenya_app/lib/core/constants/app_constants.dart`
- **Cost Scripts:** `/scripts/`

### AWS CLI Commands Reference
```bash
# AWS CLI path (configured for this project)
AWS_CLI="/Users/m00n5h075ai/Library/Python/3.9/bin/aws"

# Check account and permissions
$AWS_CLI sts get-caller-identity

# Monitor deployment progress
$AWS_CLI cloudformation describe-stacks --stack-name serenya-backend-dev --region eu-west-1

# Get stack outputs (API URL, database host, etc.)
$AWS_CLI cloudformation describe-stacks --stack-name serenya-backend-dev --region eu-west-1 --query 'Stacks[0].Outputs'
```

---

## 📝 Redeployment Log Template

**Date:** ___________  
**Redeployment Started:** ___________  
**Redeployment Completed:** ___________  

**New Resource Identifiers:**
- **API Gateway URL:** ________________________________
- **RDS Endpoint:** ____________________________________
- **KMS Key ID:** ______________________________________
- **S3 Bucket:** _______________________________________

**Issues Encountered:**
- ________________________________________________
- ________________________________________________

**Resolution Steps:**
- ________________________________________________
- ________________________________________________

**Final Status:**
- [ ] Infrastructure fully operational
- [ ] Mobile app authentication working
- [ ] Database schema initialized
- [ ] Cost optimization configured
- [ ] Development workflow resumed

---

**✅ Next Steps After Successful Redeployment:**
1. Resume normal development workflow
2. Implement planned features (Task M00-177 LLM Provider Architecture recommended)
3. Continue with mobile document processing features
4. Set up regular cost monitoring and optimization schedule

---

*This document should be updated after each successful redeployment to reflect any changes in the process or new issues discovered.*