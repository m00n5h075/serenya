#!/bin/bash

# Serenya Development Infrastructure - PAUSE Script
# Complete infrastructure shutdown for extended breaks
# Expected savings: ~95% of AWS costs
# WARNING: This will delete the entire CloudFormation stack

set -e

# Configuration
REGION="eu-west-1"
AWS_CLI="/Users/m00n5h075ai/Library/Python/3.9/bin/aws"
STACK_NAME="serenya-backend-dev"
DB_INSTANCE="serenya-backend-dev-serenyadatabase21d84656-2ehdicrcpfog"
BACKUP_DIR="/Users/m00n5h075ai/development/serenya/backups"

echo "⚠️  SERENYA DEVELOPMENT PAUSE - COMPLETE SHUTDOWN"
echo "This will DELETE the entire CloudFormation stack!"
echo "Stack: $STACK_NAME"
echo "Region: $REGION"
echo ""

# Function to check if AWS CLI is configured
check_aws_config() {
    if ! $AWS_CLI sts get-caller-identity --region $REGION >/dev/null 2>&1; then
        echo "❌ AWS CLI not configured or no access to region $REGION"
        exit 1
    fi
}

# Function to create database backup
create_db_backup() {
    echo "💾 Creating database backup before shutdown..."
    mkdir -p $BACKUP_DIR
    
    BACKUP_FILE="$BACKUP_DIR/serenya-db-backup-$(date +%Y%m%d-%H%M%S).sql"
    
    # Get database credentials
    DB_SECRET=$($AWS_CLI secretsmanager get-secret-value \
        --secret-id "serenya/dev/database" \
        --region $REGION \
        --query SecretString --output text)
    
    DB_PASSWORD=$(echo $DB_SECRET | jq -r .password)
    DB_USERNAME=$(echo $DB_SECRET | jq -r .username)
    DB_HOST=$($AWS_CLI rds describe-db-instances \
        --db-instance-identifier $DB_INSTANCE \
        --region $REGION \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text 2>/dev/null || echo "not-available")
    
    if [ "$DB_HOST" = "not-available" ]; then
        echo "⚠️  Database not available for backup (may already be stopped)"
        return 1
    fi
    
    echo "   Backing up to: $BACKUP_FILE"
    PGPASSWORD=$DB_PASSWORD pg_dump -h $DB_HOST -U $DB_USERNAME -d serenya_dev > $BACKUP_FILE
    
    if [ $? -eq 0 ]; then
        echo "✅ Database backup created successfully"
        echo "   File: $BACKUP_FILE"
        return 0
    else
        echo "❌ Database backup failed"
        return 1
    fi
}

# Function to check stack status
check_stack_status() {
    local status=$($AWS_CLI cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].StackStatus' \
        --output text 2>/dev/null || echo "not-found")
    echo $status
}

# Confirmation prompt
echo "🚨 WARNING: This will completely delete your development infrastructure!"
echo ""
echo "What will be DELETED:"
echo "   • RDS PostgreSQL database (with all data)"
echo "   • All Lambda functions"
echo "   • API Gateway"
echo "   • S3 bucket (temp files)"
echo "   • VPC and security groups"
echo "   • KMS key"
echo ""
echo "What will be PRESERVED:"
echo "   • CloudFormation template (can redeploy)"
echo "   • Source code"
echo "   • Database backup (if successful)"
echo ""
read -p "Are you sure you want to proceed? (type 'DELETE' to confirm): " CONFIRMATION

if [ "$CONFIRMATION" != "DELETE" ]; then
    echo "❌ Operation cancelled"
    exit 1
fi

# Main execution
echo ""
echo "🔍 Checking AWS configuration..."
check_aws_config
echo "✅ AWS CLI configured correctly"

echo ""
echo "🔍 Checking stack status..."
STACK_STATUS=$(check_stack_status)

if [ "$STACK_STATUS" = "not-found" ]; then
    echo "⚠️  CloudFormation stack not found: $STACK_NAME"
    echo "   Infrastructure may already be deleted"
    exit 0
fi

echo "📊 Current Stack Status: $STACK_STATUS"

# Attempt to create database backup
echo ""
if command -v pg_dump &> /dev/null; then
    if create_db_backup; then
        echo "✅ Database backup completed"
    else
        echo "⚠️  Database backup failed, but continuing with deletion"
        read -p "Continue without backup? (y/N): " CONTINUE
        if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
            echo "❌ Operation cancelled"
            exit 1
        fi
    fi
else
    echo "⚠️  pg_dump not found. Cannot create database backup."
    echo "   Install PostgreSQL client tools if you need backups."
    read -p "Continue without backup? (y/N): " CONTINUE
    if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
        echo "❌ Operation cancelled"
        exit 1
    fi
fi

# Delete CloudFormation stack
echo ""
echo "🗑️  Deleting CloudFormation stack..."
$AWS_CLI cloudformation delete-stack \
    --stack-name $STACK_NAME \
    --region $REGION

echo ""
echo "⏳ Waiting for stack deletion (this may take 5-10 minutes)..."

# Wait for stack deletion (with timeout)
TIMEOUT=900  # 15 minutes
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    sleep 30
    ELAPSED=$((ELAPSED + 30))
    CURRENT_STATUS=$(check_stack_status)
    
    if [ "$CURRENT_STATUS" = "not-found" ]; then
        echo "✅ CloudFormation stack deleted successfully"
        break
    fi
    
    echo "   Status: $CURRENT_STATUS (${ELAPSED}s elapsed)"
    
    if [ "$CURRENT_STATUS" = "DELETE_COMPLETE" ]; then
        echo "✅ CloudFormation stack deleted successfully"
        break
    fi
    
    if [ "$CURRENT_STATUS" = "DELETE_FAILED" ]; then
        echo "❌ Stack deletion failed. Check AWS console for details."
        exit 1
    fi
    
    if [ $ELAPSED -eq $TIMEOUT ]; then
        echo "⚠️  Timeout waiting for stack deletion. Check AWS console."
        break
    fi
done

echo ""
echo "💰 Cost Optimization Complete:"
echo "   🗑️  All AWS resources: DELETED"
echo "   📈 Monthly savings: ~95% reduction (almost $0/month)"
echo ""
echo "📁 What's preserved:"
echo "   ✅ Source code: /Users/m00n5h075ai/development/serenya/"
echo "   ✅ CDK templates: Ready for redeployment"
if [ -d "$BACKUP_DIR" ]; then
    echo "   ✅ Database backups: $BACKUP_DIR"
fi
echo ""
echo "🚀 To resume development:"
echo "   1. Run: ./scripts/resume-development.sh"
echo "   2. Or manually: cd /Users/m00n5h075ai/development/serenya && npx cdk deploy --all"
echo ""
echo "✅ Development infrastructure paused successfully!"
echo "💸 AWS costs reduced to near-zero until you resume development."