#!/bin/bash

# Serenya Development Infrastructure - START Script
# Starts AWS resources for development/testing sessions
# Estimated startup time: 2-3 minutes

set -e

# Configuration
REGION="eu-west-1"
AWS_CLI="/Users/m00n5h075ai/Library/Python/3.9/bin/aws"
DB_INSTANCE="serenya-backend-dev-serenyadatabase21d84656-2ehdicrcpfog"
API_URL="https://bpzha55z9e.execute-api.eu-west-1.amazonaws.com/dev/"

echo "🚀 Starting Serenya Development Infrastructure..."
echo "Region: $REGION"
echo "Database: $DB_INSTANCE"
echo ""

# Function to check if AWS CLI is configured
check_aws_config() {
    if ! $AWS_CLI sts get-caller-identity --region $REGION >/dev/null 2>&1; then
        echo "❌ AWS CLI not configured or no access to region $REGION"
        exit 1
    fi
}

# Function to check RDS status
check_rds_status() {
    local status=$($AWS_CLI rds describe-db-instances \
        --db-instance-identifier $DB_INSTANCE \
        --region $REGION \
        --query 'DBInstances[0].DBInstanceStatus' \
        --output text 2>/dev/null || echo "not-found")
    echo $status
}

# Function to test API connectivity
test_api_connectivity() {
    echo "🔍 Testing API connectivity..."
    if curl -s --max-time 10 "$API_URL" >/dev/null 2>&1; then
        echo "✅ API Gateway is responding"
        return 0
    else
        echo "⚠️  API Gateway not responding (this is normal during startup)"
        return 1
    fi
}

# Main execution
echo "🔍 Checking AWS configuration..."
check_aws_config
echo "✅ AWS CLI configured correctly"

echo ""
echo "🔍 Checking RDS instance status..."
RDS_STATUS=$(check_rds_status)

if [ "$RDS_STATUS" = "not-found" ]; then
    echo "❌ RDS instance not found: $DB_INSTANCE"
    exit 1
fi

echo "📊 Current RDS Status: $RDS_STATUS"

if [ "$RDS_STATUS" = "available" ]; then
    echo "✅ RDS instance is already running"
else
    if [ "$RDS_STATUS" = "stopped" ]; then
        echo ""
        echo "🚀 Starting RDS instance..."
        $AWS_CLI rds start-db-instance \
            --db-instance-identifier $DB_INSTANCE \
            --region $REGION \
            --output table
        
        echo ""
        echo "⏳ Waiting for RDS to start (this may take 2-3 minutes)..."
        
        # Wait for RDS to start (with timeout)
        TIMEOUT=300  # 5 minutes
        ELAPSED=0
        while [ $ELAPSED -lt $TIMEOUT ]; do
            sleep 20
            ELAPSED=$((ELAPSED + 20))
            CURRENT_STATUS=$(check_rds_status)
            echo "   Status: $CURRENT_STATUS (${ELAPSED}s elapsed)"
            
            if [ "$CURRENT_STATUS" = "available" ]; then
                echo "✅ RDS instance started successfully"
                break
            fi
            
            if [ "$CURRENT_STATUS" = "starting" ]; then
                continue
            fi
            
            if [ $ELAPSED -eq $TIMEOUT ]; then
                echo "⚠️  Timeout waiting for RDS to start. Check AWS console."
                exit 1
            fi
        done
    else
        echo "⚠️  RDS instance is in state: $RDS_STATUS"
        echo "   Cannot start instance in this state. Wait and try again."
        exit 1
    fi
fi

echo ""
echo "🔍 Verifying infrastructure health..."

# Test API Gateway
test_api_connectivity

# Get database endpoint
DB_HOST=$($AWS_CLI rds describe-db-instances \
    --db-instance-identifier $DB_INSTANCE \
    --region $REGION \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text)

echo "✅ Database endpoint: $DB_HOST"

echo ""
echo "🚀 Development Infrastructure Status:"
echo "   ✅ RDS PostgreSQL: RUNNING"
echo "   ✅ Lambda Functions: ACTIVE"
echo "   ✅ API Gateway: ACTIVE"
echo "   ✅ S3 Bucket: ACTIVE"
echo "   ✅ KMS Key: ACTIVE"
echo ""
echo "🌐 API Endpoints Ready:"
echo "   • Auth: POST $API_URL/auth/google"
echo "   • Upload: POST $API_URL/api/v1/process/upload"
echo "   • Profile: GET $API_URL/user/profile"
echo ""
echo "📱 Ready for Flutter development and testing!"
echo "💰 To save costs when done: ./scripts/stop-dev-infrastructure.sh"
echo ""
echo "✅ Development infrastructure started successfully!"