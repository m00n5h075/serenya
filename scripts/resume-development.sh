#!/bin/bash

# Serenya Development Infrastructure - RESUME Script
# Redeploys complete infrastructure after pause
# Estimated deployment time: 8-12 minutes

set -e

# Configuration
REGION="eu-west-1"
AWS_CLI="/Users/m00n5h075ai/Library/Python/3.9/bin/aws"
STACK_NAME="serenya-backend-dev"
PROJECT_DIR="/Users/m00n5h075ai/development/serenya"
BACKUP_DIR="$PROJECT_DIR/backups"

echo "🚀 SERENYA DEVELOPMENT RESUME - INFRASTRUCTURE DEPLOYMENT"
echo "This will redeploy the complete CloudFormation stack"
echo "Stack: $STACK_NAME"
echo "Region: $REGION"
echo "Project: $PROJECT_DIR"
echo ""

# Function to check if AWS CLI is configured
check_aws_config() {
    if ! $AWS_CLI sts get-caller-identity --region $REGION >/dev/null 2>&1; then
        echo "❌ AWS CLI not configured or no access to region $REGION"
        exit 1
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

# Function to restore database backup
restore_db_backup() {
    echo ""
    echo "💾 Database backup restoration options:"
    
    if [ ! -d "$BACKUP_DIR" ]; then
        echo "   ⚠️  No backup directory found at: $BACKUP_DIR"
        return 0
    fi
    
    BACKUPS=($(ls -t $BACKUP_DIR/serenya-db-backup-*.sql 2>/dev/null || echo ""))
    
    if [ ${#BACKUPS[@]} -eq 0 ]; then
        echo "   ⚠️  No database backups found"
        return 0
    fi
    
    echo "   📁 Available backups:"
    for i in "${!BACKUPS[@]}"; do
        BACKUP_FILE=$(basename ${BACKUPS[$i]})
        BACKUP_DATE=$(echo $BACKUP_FILE | sed 's/serenya-db-backup-\(.*\)\.sql/\1/' | sed 's/\(.*\)-\(.*\)/\1 \2:/')
        echo "   $((i+1)). $BACKUP_FILE (Created: $BACKUP_DATE)"
    done
    
    echo ""
    read -p "Restore database backup? (1-${#BACKUPS[@]} or 'n' to skip): " BACKUP_CHOICE
    
    if [ "$BACKUP_CHOICE" = "n" ] || [ "$BACKUP_CHOICE" = "N" ]; then
        echo "   ⏭️  Skipping database restoration"
        return 0
    fi
    
    # Validate choice
    if ! [[ "$BACKUP_CHOICE" =~ ^[0-9]+$ ]] || [ "$BACKUP_CHOICE" -lt 1 ] || [ "$BACKUP_CHOICE" -gt ${#BACKUPS[@]} ]; then
        echo "   ❌ Invalid choice. Skipping database restoration."
        return 0
    fi
    
    SELECTED_BACKUP=${BACKUPS[$((BACKUP_CHOICE-1))]}
    echo "   📥 Restoring backup: $(basename $SELECTED_BACKUP)"
    
    # Get new database credentials and connection info
    echo "   🔍 Getting database connection info..."
    
    # Wait a moment for stack to be fully ready
    sleep 10
    
    DB_SECRET=$($AWS_CLI secretsmanager get-secret-value \
        --secret-id "serenya/dev/database" \
        --region $REGION \
        --query SecretString --output text)
    
    DB_PASSWORD=$(echo $DB_SECRET | jq -r .password)
    DB_USERNAME=$(echo $DB_SECRET | jq -r .username)
    DB_HOST=$($AWS_CLI cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`DatabaseHost`].OutputValue' \
        --output text)
    
    echo "   🔄 Restoring database..."
    if command -v psql &> /dev/null; then
        PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USERNAME -d serenya_dev < $SELECTED_BACKUP
        
        if [ $? -eq 0 ]; then
            echo "   ✅ Database backup restored successfully"
        else
            echo "   ❌ Database backup restoration failed"
        fi
    else
        echo "   ❌ psql not found. Cannot restore database backup."
        echo "      Install PostgreSQL client tools to restore backups."
    fi
}

# Main execution
echo "🔍 Checking AWS configuration..."
check_aws_config
echo "✅ AWS CLI configured correctly"

echo ""
echo "🔍 Checking current stack status..."
STACK_STATUS=$(check_stack_status)

if [ "$STACK_STATUS" != "not-found" ]; then
    echo "⚠️  Stack already exists with status: $STACK_STATUS"
    
    if [ "$STACK_STATUS" = "UPDATE_COMPLETE" ] || [ "$STACK_STATUS" = "CREATE_COMPLETE" ]; then
        echo "   Stack appears to be healthy. Use start-dev-infrastructure.sh instead."
        exit 1
    fi
    
    echo "   Stack may be in a problematic state."
    read -p "Continue with deployment anyway? (y/N): " CONTINUE
    if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
        echo "❌ Operation cancelled"
        exit 1
    fi
fi

echo ""
echo "📁 Checking project directory..."
if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ Project directory not found: $PROJECT_DIR"
    exit 1
fi

cd $PROJECT_DIR

# Check for CDK files
if [ ! -f "cdk.json" ]; then
    echo "❌ CDK project not found in: $PROJECT_DIR"
    echo "   Make sure you're in the correct directory"
    exit 1
fi

echo "✅ CDK project found: $PROJECT_DIR"

# Deploy infrastructure
echo ""
echo "🚀 Deploying infrastructure with CDK..."
echo "   This will take 8-12 minutes..."
echo ""

# Bootstrap CDK if needed (safe to run multiple times)
echo "🔧 Ensuring CDK bootstrap..."
npx cdk bootstrap aws://625819760139/eu-west-1

echo ""
echo "⏳ Deploying all stacks..."
npx cdk deploy --all --require-approval never

if [ $? -ne 0 ]; then
    echo "❌ CDK deployment failed"
    echo "   Check the error messages above and try again"
    exit 1
fi

echo ""
echo "✅ Infrastructure deployment completed!"

# Get new endpoints
echo ""
echo "🔍 Getting infrastructure details..."
API_URL=$($AWS_CLI cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
    --output text)

DB_HOST=$($AWS_CLI cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`DatabaseHost`].OutputValue' \
    --output text)

echo "✅ API Gateway URL: $API_URL"
echo "✅ Database Host: $DB_HOST"

# Offer to restore database backup
if command -v jq &> /dev/null; then
    restore_db_backup
else
    echo "⚠️  jq not found. Cannot offer database restoration."
    echo "   Install jq if you want automatic backup restoration."
fi

echo ""
echo "🚀 Development Infrastructure Status:"
echo "   ✅ RDS PostgreSQL: RUNNING"
echo "   ✅ Lambda Functions: DEPLOYED"
echo "   ✅ API Gateway: ACTIVE"
echo "   ✅ S3 Bucket: ACTIVE"
echo "   ✅ KMS Key: ACTIVE"
echo "   ✅ VPC & Security: CONFIGURED"
echo ""
echo "🌐 API Endpoints Ready:"
echo "   • Auth: POST $API_URL/auth/google"
echo "   • Upload: POST $API_URL/api/v1/process/upload"
echo "   • Profile: GET $API_URL/user/profile"
echo ""
echo "📱 Ready for Flutter development and testing!"
echo "💰 Remember to use ./scripts/stop-dev-infrastructure.sh to save costs"
echo ""
echo "✅ Development infrastructure resumed successfully!"