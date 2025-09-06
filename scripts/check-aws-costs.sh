#!/bin/bash

# Serenya Development Infrastructure - COST MONITORING Script
# Monitors AWS costs and provides optimization recommendations

set -e

# Configuration
REGION="eu-west-1"
AWS_CLI="/Users/m00n5h075ai/Library/Python/3.9/bin/aws"
STACK_NAME="serenya-backend-dev"
ACCOUNT_ID="625819760139"

echo "💰 SERENYA AWS COST MONITORING"
echo "Account: $ACCOUNT_ID"
echo "Region: $REGION"
echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Function to check if AWS CLI is configured
check_aws_config() {
    if ! $AWS_CLI sts get-caller-identity --region $REGION >/dev/null 2>&1; then
        echo "❌ AWS CLI not configured or no access to region $REGION"
        exit 1
    fi
}

# Function to get current month costs
get_current_costs() {
    local start_date=$(date '+%Y-%m-01')
    local end_date=$(date -v+1m '+%Y-%m-01' 2>/dev/null || date -d "$(date '+%Y-%m-01') + 1 month" '+%Y-%m-01')
    
    echo "📊 Current Month Costs (${start_date} to ${end_date}):"
    
    # Get costs by service
    $AWS_CLI ce get-cost-and-usage \
        --time-period Start=${start_date},End=${end_date} \
        --granularity MONTHLY \
        --metrics BlendedCost \
        --group-by Type=DIMENSION,Key=SERVICE \
        --query 'ResultsByTime[0].Groups[?Metrics.BlendedCost.Amount != `0`].[Keys[0], Metrics.BlendedCost.Amount, Metrics.BlendedCost.Unit]' \
        --output table 2>/dev/null || echo "   ⚠️  Cost data not available (may need billing permissions)"
    
    # Get total cost
    local total_cost=$($AWS_CLI ce get-cost-and-usage \
        --time-period Start=${start_date},End=${end_date} \
        --granularity MONTHLY \
        --metrics BlendedCost \
        --query 'ResultsByTime[0].Total.BlendedCost.Amount' \
        --output text 2>/dev/null || echo "0")
    
    if [ "$total_cost" != "0" ] && [ "$total_cost" != "None" ]; then
        echo ""
        echo "💵 Total Current Month: \$${total_cost} USD"
        
        # Cost projections
        local days_in_month=$(date '+%d')
        local days_total=$(date -d "$(date '+%Y-%m-01') + 1 month - 1 day" '+%d' 2>/dev/null || echo "30")
        local daily_average=$(echo "scale=2; $total_cost / $days_in_month" | bc 2>/dev/null || echo "0")
        local monthly_projection=$(echo "scale=2; $daily_average * $days_total" | bc 2>/dev/null || echo "0")
        
        if [ "$daily_average" != "0" ]; then
            echo "📈 Daily Average: \$${daily_average} USD"
            echo "📊 Month Projection: \$${monthly_projection} USD"
        fi
    fi
}

# Function to check RDS status and costs
check_rds_costs() {
    echo ""
    echo "🗄️  DATABASE COST ANALYSIS:"
    
    local db_status=$($AWS_CLI rds describe-db-instances \
        --db-instance-identifier serenya-backend-dev-serenyadatabase21d84656-2ehdicrcpfog \
        --region $REGION \
        --query 'DBInstances[0].DBInstanceStatus' \
        --output text 2>/dev/null || echo "not-found")
    
    if [ "$db_status" = "not-found" ]; then
        echo "   ✅ RDS Instance: NOT DEPLOYED (Cost: $0/month)"
        return 0
    fi
    
    local db_class=$($AWS_CLI rds describe-db-instances \
        --db-instance-identifier serenya-backend-dev-serenyadatabase21d84656-2ehdicrcpfog \
        --region $REGION \
        --query 'DBInstances[0].DBInstanceClass' \
        --output text)
    
    local storage_size=$($AWS_CLI rds describe-db-instances \
        --db-instance-identifier serenya-backend-dev-serenyadatabase21d84656-2ehdicrcpfog \
        --region $REGION \
        --query 'DBInstances[0].AllocatedStorage' \
        --output text)
    
    echo "   📊 RDS Status: $db_status"
    echo "   💻 Instance Class: $db_class"
    echo "   💾 Storage: ${storage_size}GB gp2"
    
    # Cost estimates for eu-west-1
    if [ "$db_status" = "available" ]; then
        echo "   💰 Estimated Costs (if running 24/7):"
        echo "      • db.t3.micro: ~\$11.00/month"
        echo "      • 20GB gp2 storage: ~\$2.00/month"
        echo "      • Total: ~\$13.00/month"
        echo ""
        echo "   💡 COST OPTIMIZATION:"
        echo "      • Stop when not developing: saves ~70%"
        echo "      • Run: ./scripts/stop-dev-infrastructure.sh"
    else
        echo "   ✅ Instance stopped: saving ~\$11/month"
    fi
}

# Function to check Lambda costs
check_lambda_costs() {
    echo ""
    echo "⚡ LAMBDA FUNCTIONS ANALYSIS:"
    
    local function_count=$($AWS_CLI lambda list-functions \
        --region $REGION \
        --query 'length(Functions[?contains(FunctionName, `serenya-backend-dev`)])' \
        --output text 2>/dev/null || echo "0")
    
    if [ "$function_count" = "0" ]; then
        echo "   ✅ Lambda Functions: NOT DEPLOYED (Cost: $0/month)"
        return 0
    fi
    
    echo "   📊 Function Count: $function_count functions"
    echo "   💰 Cost Structure:"
    echo "      • Idle cost: ~\$0.00/month (only pay for invocations)"
    echo "      • Per request: \$0.0000002 per request"
    echo "      • Per GB-second: \$0.0000166667"
    echo ""
    echo "   💡 During development (low usage):"
    echo "      • Estimated: ~\$0.10-0.50/month"
    echo "      • Optimization: Not needed (already very low cost)"
}

# Function to provide cost optimization recommendations
show_cost_recommendations() {
    echo ""
    echo "💡 COST OPTIMIZATION RECOMMENDATIONS:"
    echo ""
    echo "🎯 IMMEDIATE ACTIONS (70% savings):"
    echo "   1. Stop RDS when not developing:"
    echo "      ./scripts/stop-dev-infrastructure.sh"
    echo ""
    echo "   2. Start RDS when needed:"
    echo "      ./scripts/start-dev-infrastructure.sh"
    echo ""
    echo "🎯 MAXIMUM SAVINGS (95% savings):"
    echo "   1. Complete pause for long breaks:"
    echo "      ./scripts/pause-development.sh"
    echo ""
    echo "   2. Resume when ready to develop:"
    echo "      ./scripts/resume-development.sh"
    echo ""
    echo "📊 ESTIMATED MONTHLY COSTS:"
    echo "   • Full infrastructure: ~\$15/month"
    echo "   • RDS stopped: ~\$4/month (70% savings)"
    echo "   • Complete pause: ~\$0.50/month (95% savings)"
    echo ""
    echo "⚠️  COST ALERTS:"
    echo "   • Set billing alert at \$5/month for development"
    echo "   • Monitor costs weekly during development phase"
    echo "   • Scale up alerts before production deployment"
}

# Main execution
echo "🔍 Checking AWS configuration..."
check_aws_config
echo "✅ AWS CLI configured correctly"

# Get current costs
get_current_costs

# Check major cost drivers
check_rds_costs
check_lambda_costs

# Show optimization recommendations
show_cost_recommendations

echo ""
echo "✅ Cost monitoring complete!"
echo "🔄 Run this script weekly to track development costs"