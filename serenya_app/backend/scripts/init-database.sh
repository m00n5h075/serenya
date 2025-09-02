#!/bin/bash

# Database initialization script for Serenya Healthcare Platform
# This script invokes the database initialization Lambda function

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if environment argument is provided
if [ $# -eq 0 ]; then
    echo -e "${RED}Error: Environment argument required${NC}"
    echo "Usage: $0 <environment>"
    echo "Example: $0 dev"
    exit 1
fi

ENVIRONMENT=$1

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    echo -e "${RED}Error: Invalid environment '$ENVIRONMENT'${NC}"
    echo "Valid environments: dev, staging, prod"
    exit 1
fi

echo -e "${YELLOW}Initializing database for environment: ${ENVIRONMENT}${NC}"

# Get the database initialization function name
FUNCTION_NAME="serenya-backend-${ENVIRONMENT}-DatabaseInitFunction"

echo -e "${YELLOW}Invoking Lambda function: ${FUNCTION_NAME}${NC}"

# Invoke the database initialization function
RESULT=$(aws lambda invoke \
    --function-name "$FUNCTION_NAME" \
    --payload '{}' \
    --region eu-west-1 \
    /tmp/db-init-result.json)

# Check if invocation was successful
if [ $? -eq 0 ]; then
    # Read the response
    RESPONSE=$(cat /tmp/db-init-result.json)
    
    # Check if the function executed successfully
    if echo "$RESPONSE" | grep -q '"statusCode": 200'; then
        echo -e "${GREEN}✅ Database initialization completed successfully${NC}"
        echo -e "${GREEN}Response:${NC}"
        echo "$RESPONSE" | jq '.'
    else
        echo -e "${RED}❌ Database initialization failed${NC}"
        echo -e "${RED}Response:${NC}"
        echo "$RESPONSE" | jq '.'
        exit 1
    fi
else
    echo -e "${RED}❌ Failed to invoke Lambda function${NC}"
    exit 1
fi

# Clean up temporary file
rm -f /tmp/db-init-result.json

echo -e "${GREEN}Database initialization script completed${NC}"