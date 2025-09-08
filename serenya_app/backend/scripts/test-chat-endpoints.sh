#!/bin/bash

# Chat API Endpoints Test Script
# This script tests the complete chat workflow without deploying infrastructure

set -e

echo "=========================================="
echo "Chat API Endpoints Validation"
echo "=========================================="
echo ""

# Configuration
CHAT_PROMPTS_DIR="lambdas/chat-prompts"
CHAT_MESSAGES_DIR="lambdas/chat-messages" 
CHAT_STATUS_DIR="lambdas/chat-status"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Test 1: Verify Lambda function files exist
echo "1. Testing Lambda Function Files..."
echo "-----------------------------------"

if [[ -f "$CHAT_PROMPTS_DIR/chatPrompts.js" ]]; then
    print_status "Chat prompts Lambda function exists"
else
    print_error "Chat prompts Lambda function missing: $CHAT_PROMPTS_DIR/chatPrompts.js"
    exit 1
fi

if [[ -f "$CHAT_MESSAGES_DIR/chatMessages.js" ]]; then
    print_status "Chat messages Lambda function exists" 
else
    print_error "Chat messages Lambda function missing: $CHAT_MESSAGES_DIR/chatMessages.js"
    exit 1
fi

if [[ -f "$CHAT_STATUS_DIR/chatStatus.js" ]]; then
    print_status "Chat status Lambda function exists"
else
    print_error "Chat status Lambda function missing: $CHAT_STATUS_DIR/chatStatus.js"
    exit 1
fi

echo ""

# Test 2: Verify package.json files
echo "2. Testing Package Configuration..."
echo "----------------------------------"

for dir in "$CHAT_PROMPTS_DIR" "$CHAT_MESSAGES_DIR" "$CHAT_STATUS_DIR"; do
    if [[ -f "$dir/package.json" ]]; then
        print_status "Package.json exists for $(basename $dir)"
    else
        print_error "Package.json missing for $(basename $dir)"
        exit 1
    fi
done

echo ""

# Test 3: Syntax validation using Node.js
echo "3. Testing JavaScript Syntax..."
echo "-------------------------------"

if command -v node >/dev/null 2>&1; then
    for dir in "$CHAT_PROMPTS_DIR" "$CHAT_MESSAGES_DIR" "$CHAT_STATUS_DIR"; do
        if node -c "$dir/"*.js 2>/dev/null; then
            print_status "JavaScript syntax valid for $(basename $dir)"
        else
            print_error "JavaScript syntax errors in $(basename $dir)"
            exit 1
        fi
    done
else
    print_warning "Node.js not available - skipping syntax validation"
fi

echo ""

# Test 4: Check CDK infrastructure updates
echo "4. Testing Infrastructure Configuration..."
echo "----------------------------------------"

if [[ -f "infrastructure/serenya-backend-stack.ts" ]]; then
    # Check if chat functions are defined
    if grep -q "chatPromptsFunction" infrastructure/serenya-backend-stack.ts; then
        print_status "Chat prompts function defined in CDK stack"
    else
        print_error "Chat prompts function not found in CDK stack"
        exit 1
    fi
    
    if grep -q "chatMessagesFunction" infrastructure/serenya-backend-stack.ts; then
        print_status "Chat messages function defined in CDK stack"
    else
        print_error "Chat messages function not found in CDK stack" 
        exit 1
    fi
    
    if grep -q "chatStatusFunction" infrastructure/serenya-backend-stack.ts; then
        print_status "Chat status function defined in CDK stack"
    else
        print_error "Chat status function not found in CDK stack"
        exit 1
    fi
    
    # Check if API routes are defined
    if grep -q "chat/prompts" infrastructure/serenya-backend-stack.ts; then
        print_status "Chat prompts API route defined"
    else
        print_error "Chat prompts API route not found"
        exit 1
    fi
    
    if grep -q "chat/messages" infrastructure/serenya-backend-stack.ts; then
        print_status "Chat messages API route defined"
    else
        print_error "Chat messages API route not found" 
        exit 1
    fi
    
    if grep -q "chat/jobs/{job_id}/status" infrastructure/serenya-backend-stack.ts; then
        print_status "Chat status API route defined"
    else
        print_error "Chat status API route not found"
        exit 1
    fi
    
    # Check Bedrock permissions
    if grep -q "bedrock:InvokeModel" infrastructure/serenya-backend-stack.ts; then
        print_status "Bedrock permissions configured"
    else
        print_error "Bedrock permissions not found"
        exit 1
    fi
    
else
    print_error "CDK stack file not found: infrastructure/serenya-backend-stack.ts"
    exit 1
fi

echo ""

# Test 5: Verify shared dependencies
echo "5. Testing Shared Dependencies..."
echo "--------------------------------"

SHARED_DIR="lambdas/shared"

if [[ -f "$SHARED_DIR/utils.js" ]]; then
    print_status "Shared utils available"
else
    print_error "Shared utils missing: $SHARED_DIR/utils.js"
    exit 1
fi

if [[ -f "$SHARED_DIR/bedrock-service.js" ]]; then
    print_status "Bedrock service available"
else
    print_error "Bedrock service missing: $SHARED_DIR/bedrock-service.js" 
    exit 1
fi

if [[ -f "$SHARED_DIR/audit-service.js" ]]; then
    print_status "Audit service available"
else
    print_error "Audit service missing: $SHARED_DIR/audit-service.js"
    exit 1
fi

echo ""

# Test 6: Function integration validation
echo "6. Testing Function Integration..."
echo "---------------------------------"

# Check that chat functions use required dependencies
for func_file in "$CHAT_PROMPTS_DIR/chatPrompts.js" "$CHAT_MESSAGES_DIR/chatMessages.js" "$CHAT_STATUS_DIR/chatStatus.js"; do
    if grep -q "require.*shared/utils" "$func_file"; then
        print_status "$(basename $(dirname $func_file)) uses shared utils"
    else
        print_error "$(basename $(dirname $func_file)) missing shared utils import"
        exit 1
    fi
    
    if grep -q "auditService" "$func_file"; then
        print_status "$(basename $(dirname $func_file)) uses audit service"
    else
        print_error "$(basename $(dirname $func_file)) missing audit service"
        exit 1
    fi
done

# Check specific integrations
if grep -q "bedrockService" "$CHAT_MESSAGES_DIR/chatMessages.js"; then
    print_status "Chat messages integrates with Bedrock service"
else
    print_error "Chat messages missing Bedrock service integration"
    exit 1
fi

if grep -q "DocumentJobService" "$CHAT_PROMPTS_DIR/chatPrompts.js"; then
    print_status "Chat prompts integrates with database service"
else
    print_error "Chat prompts missing database service integration"
    exit 1
fi

echo ""

# Test 7: Error handling validation
echo "7. Testing Error Handling Patterns..."
echo "------------------------------------"

for func_file in "$CHAT_PROMPTS_DIR/chatPrompts.js" "$CHAT_MESSAGES_DIR/chatMessages.js" "$CHAT_STATUS_DIR/chatStatus.js"; do
    if grep -q "createErrorResponse" "$func_file"; then
        print_status "$(basename $(dirname $func_file)) uses standard error responses"
    else
        print_error "$(basename $(dirname $func_file)) missing standard error handling"
        exit 1
    fi
    
    if grep -q "sanitizeError" "$func_file"; then
        print_status "$(basename $(dirname $func_file)) sanitizes errors"
    else
        print_error "$(basename $(dirname $func_file)) missing error sanitization"
        exit 1
    fi
done

echo ""

echo "=========================================="
print_status "All Chat API Endpoint Tests Passed!"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "- Deploy infrastructure: npx cdk deploy"
echo "- Verify endpoints in AWS Console"
echo "- Test with actual API calls"
echo ""

exit 0