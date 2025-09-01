#!/bin/bash

# Serenya Backend API Testing Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Configuration
ENVIRONMENT=${1:-dev}
API_URL=""
TEST_TOKEN=""

# Function to get API URL from CloudFormation
get_api_url() {
    print_status "Getting API URL for $ENVIRONMENT environment..."
    
    API_URL=$(aws cloudformation describe-stacks \
        --stack-name "SerenyaBackend-$ENVIRONMENT" \
        --region eu-west-1 \
        --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
        --output text 2>/dev/null || echo "")
    
    if [ -z "$API_URL" ]; then
        print_error "Could not retrieve API URL. Make sure the stack is deployed."
        exit 1
    fi
    
    print_success "API URL: $API_URL"
}

# Function to test health check (if implemented)
test_health_check() {
    print_status "Testing health check endpoint..."
    
    response=$(curl -s -w "%{http_code}" -o /tmp/health_response.json \
        "$API_URL/health" \
        -H "Content-Type: application/json" \
        2>/dev/null || echo "000")
    
    if [ "$response" = "200" ]; then
        print_success "Health check endpoint is working"
    else
        print_warning "Health check endpoint not available (optional)"
    fi
}

# Function to test Google OAuth endpoint
test_google_oauth() {
    print_status "Testing Google OAuth endpoint..."
    
    # Test with invalid token to check endpoint availability
    response=$(curl -s -w "%{http_code}" -o /tmp/auth_response.json \
        "$API_URL/auth/google" \
        -H "Content-Type: application/json" \
        -d '{"google_token":"invalid","id_token":"invalid"}' \
        2>/dev/null || echo "000")
    
    if [ "$response" = "401" ] || [ "$response" = "400" ]; then
        print_success "Google OAuth endpoint is responding correctly"
    elif [ "$response" = "000" ]; then
        print_error "Google OAuth endpoint is not accessible"
        return 1
    else
        print_warning "Google OAuth endpoint returned unexpected status: $response"
    fi
}

# Function to test protected endpoints (requires valid token)
test_protected_endpoints() {
    if [ -z "$TEST_TOKEN" ]; then
        print_warning "No valid token available. Skipping protected endpoint tests."
        print_status "To test protected endpoints, provide a valid JWT token:"
        print_status "export TEST_TOKEN='your_jwt_token_here'"
        return
    fi
    
    print_status "Testing protected endpoints with provided token..."
    
    # Test user profile endpoint
    test_user_profile
    
    # Test upload endpoint (without file)
    test_upload_endpoint
    
    # Test status endpoint
    test_status_endpoint
    
    # Test result endpoint  
    test_result_endpoint
}

test_user_profile() {
    print_status "Testing GET /user/profile..."
    
    response=$(curl -s -w "%{http_code}" -o /tmp/profile_response.json \
        "$API_URL/user/profile" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        2>/dev/null || echo "000")
    
    if [ "$response" = "200" ]; then
        print_success "User profile endpoint is working"
    elif [ "$response" = "401" ]; then
        print_warning "User profile endpoint requires valid authentication"
    else
        print_error "User profile endpoint failed with status: $response"
    fi
}

test_upload_endpoint() {
    print_status "Testing POST /api/v1/process/upload (without file)..."
    
    response=$(curl -s -w "%{http_code}" -o /tmp/upload_response.json \
        "$API_URL/api/v1/process/upload" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        -F "test=true" \
        2>/dev/null || echo "000")
    
    if [ "$response" = "400" ]; then
        print_success "Upload endpoint is responding correctly (expected 400 for no file)"
    elif [ "$response" = "401" ]; then
        print_warning "Upload endpoint requires valid authentication"
    else
        print_warning "Upload endpoint returned status: $response"
    fi
}

test_status_endpoint() {
    print_status "Testing GET /api/v1/process/status/{jobId}..."
    
    response=$(curl -s -w "%{http_code}" -o /tmp/status_response.json \
        "$API_URL/api/v1/process/status/test-job-id" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        2>/dev/null || echo "000")
    
    if [ "$response" = "404" ]; then
        print_success "Status endpoint is responding correctly (expected 404 for test job)"
    elif [ "$response" = "401" ]; then
        print_warning "Status endpoint requires valid authentication"
    else
        print_warning "Status endpoint returned status: $response"
    fi
}

test_result_endpoint() {
    print_status "Testing GET /api/v1/process/result/{jobId}..."
    
    response=$(curl -s -w "%{http_code}" -o /tmp/result_response.json \
        "$API_URL/api/v1/process/result/test-job-id" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        2>/dev/null || echo "000")
    
    if [ "$response" = "404" ]; then
        print_success "Result endpoint is responding correctly (expected 404 for test job)"
    elif [ "$response" = "401" ]; then
        print_warning "Result endpoint requires valid authentication"
    else
        print_warning "Result endpoint returned status: $response"
    fi
}

# Function to test CORS configuration
test_cors() {
    print_status "Testing CORS configuration..."
    
    response=$(curl -s -w "%{http_code}" -o /tmp/cors_response.json \
        -X OPTIONS \
        "$API_URL/auth/google" \
        -H "Origin: https://app.serenya.health" \
        -H "Access-Control-Request-Method: POST" \
        -H "Access-Control-Request-Headers: Content-Type,Authorization" \
        2>/dev/null || echo "000")
    
    if [ "$response" = "200" ]; then
        print_success "CORS configuration is working"
    else
        print_error "CORS configuration may have issues. Status: $response"
    fi
}

# Function to test rate limiting
test_rate_limiting() {
    print_status "Testing rate limiting..."
    
    # Make multiple rapid requests to test rate limiting
    success_count=0
    rate_limited_count=0
    
    for i in {1..10}; do
        response=$(curl -s -w "%{http_code}" -o /dev/null \
            "$API_URL/auth/google" \
            -H "Content-Type: application/json" \
            -d '{"google_token":"test","id_token":"test"}' \
            2>/dev/null || echo "000")
        
        if [ "$response" = "429" ]; then
            rate_limited_count=$((rate_limited_count + 1))
        elif [ "$response" = "400" ] || [ "$response" = "401" ]; then
            success_count=$((success_count + 1))
        fi
        
        sleep 0.1
    done
    
    if [ $rate_limited_count -gt 0 ]; then
        print_success "Rate limiting is working ($rate_limited_count/10 requests limited)"
    else
        print_warning "Rate limiting may not be configured"
    fi
}

# Function to run comprehensive tests
run_comprehensive_tests() {
    print_status "Running comprehensive API tests..."
    echo ""
    
    # Get API URL
    get_api_url
    
    # Basic connectivity tests
    test_health_check
    test_google_oauth
    test_cors
    
    # Protected endpoint tests
    test_protected_endpoints
    
    # Security tests
    test_rate_limiting
    
    echo ""
    print_success "Test suite completed!"
    
    # Show test results summary
    echo ""
    echo "Test Results Summary:"
    echo "===================="
    echo "Environment: $ENVIRONMENT"
    echo "API URL: $API_URL"
    echo "Timestamp: $(date)"
    echo ""
    
    if [ -n "$TEST_TOKEN" ]; then
        print_success "Authentication tests included"
    else
        print_warning "Authentication tests skipped (no TEST_TOKEN provided)"
    fi
}

# Function to show usage
show_help() {
    echo "Serenya Backend API Testing Script"
    echo ""
    echo "Usage: $0 [ENVIRONMENT]"
    echo ""
    echo "ENVIRONMENTS:"
    echo "  dev      - Development environment (default)"
    echo "  staging  - Staging environment"
    echo "  prod     - Production environment"
    echo ""
    echo "ENVIRONMENT VARIABLES:"
    echo "  TEST_TOKEN   - JWT token for testing protected endpoints"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Test dev environment"
    echo "  $0 staging                            # Test staging environment"
    echo "  TEST_TOKEN=eyJ... $0 prod             # Test prod with auth token"
    echo ""
    echo "Prerequisites:"
    echo "  - AWS CLI configured with appropriate permissions"
    echo "  - Backend stack deployed to target environment"
    echo "  - curl command available"
}

# Main script logic
main() {
    if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
        show_help
        exit 0
    fi
    
    local environment=${1:-dev}
    
    echo ""
    echo "=============================================="
    echo "  Serenya Backend API Testing"
    echo "=============================================="
    echo ""
    
    # Check if curl is available
    if ! command -v curl &> /dev/null; then
        print_error "curl is required but not installed."
        exit 1
    fi
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is required but not installed."
        exit 1
    fi
    
    # Get test token from environment if provided
    if [ -n "$TEST_TOKEN" ]; then
        print_status "Using provided test token for authentication tests"
    fi
    
    # Run tests
    run_comprehensive_tests
}

# Run main function
main "$@"