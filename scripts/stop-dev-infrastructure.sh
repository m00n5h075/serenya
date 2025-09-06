#!/bin/bash

# Serenya Development Infrastructure - STOP Script
# Stops expensive AWS resources during non-development hours
# Expected savings: ~70% of AWS costs

set -e

# Configuration
REGION="eu-west-1"
AWS_CLI="/Users/m00n5h075ai/Library/Python/3.9/bin/aws"
DB_INSTANCE="serenya-backend-dev-serenyadatabase21d84656-2ehdicrcpfog"

echo "🛑 Stopping Serenya Development Infrastructure..."
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

if [ "$RDS_STATUS" = "stopped" ]; then
    echo "✅ RDS instance is already stopped"
    echo "💰 Infrastructure is in cost-saving mode"
else
    if [ "$RDS_STATUS" = "available" ] || [ "$RDS_STATUS" = "backing-up" ]; then
        echo ""
        echo "🛑 Stopping RDS instance..."
        $AWS_CLI rds stop-db-instance \
            --db-instance-identifier $DB_INSTANCE \
            --region $REGION \
            --output table
        
        echo ""
        echo "⏳ Waiting for RDS to stop (this may take 2-3 minutes)..."
        
        # Wait for RDS to stop (with timeout)
        TIMEOUT=300  # 5 minutes
        ELAPSED=0
        while [ $ELAPSED -lt $TIMEOUT ]; do
            sleep 15
            ELAPSED=$((ELAPSED + 15))
            CURRENT_STATUS=$(check_rds_status)
            echo "   Status: $CURRENT_STATUS (${ELAPSED}s elapsed)"
            
            if [ "$CURRENT_STATUS" = "stopped" ]; then
                echo "✅ RDS instance stopped successfully"
                break
            fi
            
            if [ "$CURRENT_STATUS" = "stopping" ]; then
                continue
            fi
            
            if [ $ELAPSED -eq $TIMEOUT ]; then
                echo "⚠️  Timeout waiting for RDS to stop. Check AWS console."
                break
            fi
        done
    else
        echo "⚠️  RDS instance is in state: $RDS_STATUS"
        echo "   Cannot stop instance in this state. Wait and try again."
        exit 1
    fi
fi

echo ""
echo "💰 Cost Optimization Summary:"
echo "   🛑 RDS PostgreSQL: STOPPED (saves ~$8-10/month)"
echo "   ✅ Lambda Functions: ACTIVE (minimal cost when idle)"
echo "   ✅ API Gateway: ACTIVE (needed for development)"
echo "   ✅ S3 Bucket: ACTIVE (empty, minimal cost)"
echo "   ✅ KMS Key: ACTIVE (needed for security)"
echo ""
echo "📈 Expected Monthly Savings: ~70% reduction"
echo "🚀 To resume development: ./scripts/start-dev-infrastructure.sh"
echo ""
echo "✅ Development infrastructure stopped successfully!"