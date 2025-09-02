#!/bin/bash

# Serenya Backend Deployment Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENTS=("dev" "staging" "prod")
DEFAULT_ENVIRONMENT="dev"
REGION="eu-west-1"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if AWS CLI is installed
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if AWS CDK is installed
    if ! command -v cdk &> /dev/null; then
        print_error "AWS CDK is not installed. Please install it first: npm install -g aws-cdk"
        exit 1
    fi
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install it first."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured. Please run 'aws configure' first."
        exit 1
    fi
    
    print_success "All prerequisites met."
}

# Function to install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    # Install main dependencies
    npm install
    
    # Install Lambda function dependencies
    for lambda_dir in lambdas/*/; do
        if [ -f "$lambda_dir/package.json" ]; then
            print_status "Installing dependencies for $(basename "$lambda_dir")"
            (cd "$lambda_dir" && npm install)
        fi
    done
    
    print_success "Dependencies installed."
}

# Function to build the project
build_project() {
    print_status "Building the project..."
    npm run build
    print_success "Project built successfully."
}

# Function to bootstrap CDK (if needed)
bootstrap_cdk() {
    local environment=$1
    print_status "Checking CDK bootstrap status for $environment..."
    
    # Check if bootstrap is needed
    if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region $REGION &> /dev/null; then
        print_warning "CDK not bootstrapped. Bootstrapping now..."
        npm run bootstrap
        print_success "CDK bootstrap completed."
    else
        print_status "CDK already bootstrapped."
    fi
}

# Function to validate environment secrets
validate_secrets() {
    local environment=$1
    print_status "Validating secrets for $environment environment..."
    
    # Check if secrets exist in AWS Secrets Manager
    secret_name="serenya/$environment/api-secrets"
    
    if ! aws secretsmanager describe-secret --secret-id "$secret_name" --region $REGION &> /dev/null; then
        print_warning "Secrets not found for $environment. They will be created during deployment."
        print_warning "Remember to update the secrets with actual values after deployment:"
        echo "  - Google OAuth credentials"
        echo "  - Anthropic API key"
    else
        print_success "Secrets found for $environment environment."
    fi
}

# Function to deploy to specific environment
deploy_environment() {
    local environment=$1
    
    print_status "Deploying to $environment environment..."
    
    # Validate environment
    if [[ ! " ${ENVIRONMENTS[@]} " =~ " ${environment} " ]]; then
        print_error "Invalid environment: $environment. Valid environments: ${ENVIRONMENTS[*]}"
        exit 1
    fi
    
    # Bootstrap CDK
    bootstrap_cdk $environment
    
    # Validate secrets
    validate_secrets $environment
    
    # Deploy stack
    print_status "Deploying CDK stack for $environment..."
    npm run deploy:$environment
    
    print_success "Deployment to $environment completed!"
    
    # Initialize database
    print_status "Initializing database schema..."
    if [ -f "scripts/init-database.sh" ]; then
        bash scripts/init-database.sh $environment
        if [ $? -eq 0 ]; then
            print_success "Database initialization completed."
        else
            print_warning "Database initialization failed. You may need to run it manually."
            print_warning "Run: bash scripts/init-database.sh $environment"
        fi
    else
        print_warning "Database initialization script not found."
    fi
    
    # Output important information
    print_status "Retrieving deployment information..."
    
    # Get API Gateway URL
    api_url=$(aws cloudformation describe-stacks \
        --stack-name "SerenyaBackend-$environment" \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
        --output text 2>/dev/null || echo "Not found")
    
    if [ "$api_url" != "Not found" ]; then
        print_success "API Gateway URL: $api_url"
        print_warning "Update your Flutter app's AppConstants.baseApiUrl to: $api_url"
    fi
    
    # Get database information
    db_host=$(aws cloudformation describe-stacks \
        --stack-name "SerenyaBackend-$environment" \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`DatabaseHost`].OutputValue' \
        --output text 2>/dev/null || echo "Not found")
    
    if [ "$db_host" != "Not found" ]; then
        print_success "PostgreSQL Database Host: $db_host"
    fi
    
    # Get VPC information
    vpc_id=$(aws cloudformation describe-stacks \
        --stack-name "SerenyaBackend-$environment" \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`VpcId`].OutputValue' \
        --output text 2>/dev/null || echo "Not found")
    
    if [ "$vpc_id" != "Not found" ]; then
        print_success "VPC ID: $vpc_id"
    fi
    
    # Remind about secrets configuration
    print_warning "Don't forget to configure the following secrets in AWS Secrets Manager:"
    echo "  Secret Name: serenya/$environment/api-secrets"
    echo "  Required values:"
    echo "    - googleClientId: Your Google OAuth client ID"
    echo "    - googleClientSecret: Your Google OAuth client secret"
    echo "    - anthropicApiKey: Your Anthropic API key"
    echo "    - jwtSecret: Will be auto-generated"
    echo ""
    echo "  Database credentials are automatically managed in:"
    echo "  Secret Name: serenya/$environment/database"
    echo "  Secret Name: serenya/$environment/app-database"
}

# Function to show help
show_help() {
    echo "Serenya Backend Deployment Script"
    echo ""
    echo "Usage: $0 [OPTIONS] [ENVIRONMENT]"
    echo ""
    echo "ENVIRONMENTS:"
    echo "  dev      - Development environment (default)"
    echo "  staging  - Staging environment"
    echo "  prod     - Production environment"
    echo ""
    echo "OPTIONS:"
    echo "  -h, --help     Show this help message"
    echo "  -c, --check    Check prerequisites only"
    echo "  -b, --build    Build only (no deployment)"
    echo "  -d, --destroy  Destroy the stack instead of deploying"
    echo "  --diff         Show differences before deploying"
    echo ""
    echo "Examples:"
    echo "  $0                    # Deploy to dev environment"
    echo "  $0 staging            # Deploy to staging environment"
    echo "  $0 --check            # Check prerequisites"
    echo "  $0 --destroy prod     # Destroy production stack"
    echo "  $0 --diff staging     # Show diff for staging"
}

# Main script logic
main() {
    local environment=$DEFAULT_ENVIRONMENT
    local action="deploy"
    local check_only=false
    local build_only=false
    local show_diff=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -c|--check)
                check_only=true
                shift
                ;;
            -b|--build)
                build_only=true
                shift
                ;;
            -d|--destroy)
                action="destroy"
                shift
                ;;
            --diff)
                show_diff=true
                shift
                ;;
            dev|staging|prod)
                environment=$1
                shift
                ;;
            *)
                print_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    print_status "Serenya Backend Deployment"
    print_status "Environment: $environment"
    print_status "Action: $action"
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    if [ "$check_only" = true ]; then
        print_success "Prerequisites check completed."
        exit 0
    fi
    
    # Install dependencies
    install_dependencies
    
    # Build project
    build_project
    
    if [ "$build_only" = true ]; then
        print_success "Build completed."
        exit 0
    fi
    
    # Show diff if requested
    if [ "$show_diff" = true ]; then
        print_status "Showing deployment diff..."
        npm run diff -- --context environment=$environment
        exit 0
    fi
    
    # Deploy or destroy
    if [ "$action" = "destroy" ]; then
        print_warning "This will destroy the $environment environment!"
        read -p "Are you sure? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_status "Destroying $environment environment..."
            cdk destroy --context environment=$environment --force
            print_success "Environment destroyed."
        else
            print_status "Destruction cancelled."
        fi
    else
        deploy_environment $environment
    fi
}

# Run main function
main "$@"