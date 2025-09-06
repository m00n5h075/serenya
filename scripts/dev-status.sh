#!/bin/bash

# Serenya Development Infrastructure - QUICK STATUS CHECK
# Fast overview of infrastructure status and cost optimization

set -e

# Configuration
REGION="eu-west-1"
AWS_CLI="/Users/m00n5h075ai/Library/Python/3.9/bin/aws"
DB_INSTANCE="serenya-backend-dev-serenyadatabase21d84656-2ehdicrcpfog"
STACK_NAME="serenya-backend-dev"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 SERENYA DEVELOPMENT STATUS${NC}"
echo "$(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Check AWS CLI
if ! $AWS_CLI sts get-caller-identity --region $REGION >/dev/null 2>&1; then
    echo -e "${RED}❌ AWS CLI not configured${NC}"
    exit 1
fi

# Quick RDS status
RDS_STATUS=$($AWS_CLI rds describe-db-instances \
    --db-instance-identifier $DB_INSTANCE \
    --region $REGION \
    --query 'DBInstances[0].DBInstanceStatus' \
    --output text 2>/dev/null || echo "not-found")

if [ "$RDS_STATUS" = "not-found" ]; then
    echo -e "${YELLOW}⚠️  RDS: NOT DEPLOYED${NC}"
    echo "   Run: ./scripts/resume-development.sh"
elif [ "$RDS_STATUS" = "available" ]; then
    echo -e "${RED}🔴 RDS: RUNNING${NC} (costing ~\$11/month)"
    echo "   Save costs: ./scripts/stop-dev-infrastructure.sh"
elif [ "$RDS_STATUS" = "stopped" ]; then
    echo -e "${GREEN}✅ RDS: STOPPED${NC} (saving ~70%)"
    echo "   Start for dev: ./scripts/start-dev-infrastructure.sh"
else
    echo -e "${YELLOW}⚠️  RDS: ${RDS_STATUS}${NC}"
fi

# Quick stack status
STACK_STATUS=$($AWS_CLI cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "not-found")

if [ "$STACK_STATUS" = "not-found" ]; then
    echo -e "${YELLOW}⚠️  Stack: NOT DEPLOYED${NC}"
elif [ "$STACK_STATUS" = "UPDATE_COMPLETE" ] || [ "$STACK_STATUS" = "CREATE_COMPLETE" ]; then
    echo -e "${GREEN}✅ Stack: HEALTHY${NC}"
else
    echo -e "${YELLOW}⚠️  Stack: ${STACK_STATUS}${NC}"
fi

# Cost optimization tip
echo ""
echo -e "${BLUE}💡 QUICK ACTIONS:${NC}"
if [ "$RDS_STATUS" = "available" ]; then
    echo "   💰 SAVE MONEY: ./scripts/stop-dev-infrastructure.sh"
elif [ "$RDS_STATUS" = "stopped" ]; then
    echo "   🚀 START DEV: ./scripts/start-dev-infrastructure.sh"
fi
echo "   📊 CHECK COSTS: ./scripts/check-aws-costs.sh"
echo "   ⏰ AUTO SCHEDULE: ./scripts/auto-schedule-rds.sh"