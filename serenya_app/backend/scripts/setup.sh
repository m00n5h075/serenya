#!/bin/bash

# Serenya Backend Setup Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

print_header() {
    echo ""
    echo "=================================================="
    echo "  Serenya AI Health Agent - Backend Setup"
    echo "=================================================="
    echo ""
}

# Function to check and install prerequisites
install_prerequisites() {
    print_status "Checking and installing prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/"
        exit 1
    fi
    
    # Check Node.js version
    node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        print_error "Node.js version 18 or higher is required. Current version: $(node --version)"
        exit 1
    fi
    
    print_success "Node.js $(node --version) detected."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_warning "AWS CLI not found. Installing..."
        
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            if command -v brew &> /dev/null; then
                brew install awscli
            else
                print_error "Please install AWS CLI manually or install Homebrew first."
                exit 1
            fi
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            # Linux
            curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
            unzip awscliv2.zip
            sudo ./aws/install
            rm -rf aws awscliv2.zip
        else
            print_error "Please install AWS CLI manually for your operating system."
            exit 1
        fi
    fi
    
    print_success "AWS CLI $(aws --version | cut -d' ' -f1) detected."
    
    # Install AWS CDK globally if not present
    if ! command -v cdk &> /dev/null; then
        print_status "Installing AWS CDK..."
        npm install -g aws-cdk
    fi
    
    print_success "AWS CDK $(cdk --version) detected."
}

# Function to configure AWS credentials
configure_aws() {
    print_status "Checking AWS credentials..."
    
    if ! aws sts get-caller-identity &> /dev/null; then
        print_warning "AWS credentials not configured."
        print_status "Please configure your AWS credentials:"
        echo ""
        echo "Option 1: AWS CLI configure"
        echo "  aws configure"
        echo ""
        echo "Option 2: Environment variables"
        echo "  export AWS_ACCESS_KEY_ID=your_access_key"
        echo "  export AWS_SECRET_ACCESS_KEY=your_secret_key"
        echo "  export AWS_DEFAULT_REGION=eu-west-1"
        echo ""
        echo "Option 3: AWS IAM roles (for EC2/Lambda)"
        echo ""
        read -p "Would you like to run 'aws configure' now? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            aws configure
        else
            print_warning "Please configure AWS credentials manually and re-run this script."
            exit 1
        fi
    fi
    
    # Display current AWS identity
    identity=$(aws sts get-caller-identity --query 'Account' --output text)
    region=$(aws configure get region || echo "not-set")
    
    print_success "AWS Account: $identity"
    print_success "AWS Region: $region"
    
    if [ "$region" != "eu-west-1" ]; then
        print_warning "Recommended region for GDPR compliance is eu-west-1"
        read -p "Would you like to set region to eu-west-1? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            aws configure set region eu-west-1
            print_success "Region set to eu-west-1"
        fi
    fi
}

# Function to install project dependencies
install_dependencies() {
    print_status "Installing project dependencies..."
    
    # Install main project dependencies
    npm install
    
    # Install Lambda function dependencies
    print_status "Installing Lambda function dependencies..."
    for lambda_dir in lambdas/*/; do
        if [ -f "$lambda_dir/package.json" ]; then
            lambda_name=$(basename "$lambda_dir")
            print_status "Installing dependencies for $lambda_name..."
            (cd "$lambda_dir" && npm install)
        fi
    done
    
    print_success "All dependencies installed."
}

# Function to create environment configuration
setup_environment_config() {
    local environment=${1:-dev}
    
    print_status "Setting up environment configuration for $environment..."
    
    # Create environment-specific config directory
    mkdir -p "config/$environment"
    
    # Create environment variables file
    cat > "config/$environment/env.json" << EOF
{
  "environment": "$environment",
  "region": "eu-west-1",
  "apiDomain": "api.serenya.health",
  "features": {
    "premiumReports": true,
    "virusScanning": true,
    "detailedLogging": $([ "$environment" = "prod" ] && echo "false" || echo "true")
  },
  "limits": {
    "maxFileSize": 5242880,
    "maxRetryAttempts": 3,
    "processingTimeoutMinutes": 3,
    "jwtExpirationHours": 1
  },
  "monitoring": {
    "enableXRay": true,
    "enableDetailedMetrics": true,
    "logRetentionDays": $([ "$environment" = "prod" ] && echo "30" || echo "7")
  }
}
EOF
    
    print_success "Environment configuration created for $environment"
}

# Function to validate Google OAuth setup
validate_google_oauth() {
    print_status "Google OAuth Setup Validation"
    echo ""
    echo "For Google OAuth integration, you'll need:"
    echo "1. Google Cloud Console project with OAuth 2.0 credentials"
    echo "2. OAuth consent screen configured"
    echo "3. Authorized redirect URIs configured"
    echo ""
    echo "Required OAuth scopes:"
    echo "  - email"
    echo "  - profile"
    echo "  - openid"
    echo ""
    print_warning "After deployment, update AWS Secrets Manager with your Google OAuth credentials."
}

# Function to validate Anthropic API setup
validate_anthropic_setup() {
    print_status "Anthropic API Setup Validation"
    echo ""
    echo "For AI processing, you'll need:"
    echo "1. Anthropic API account"
    echo "2. API key with sufficient credits"
    echo "3. Access to Claude 3 Sonnet model"
    echo ""
    print_warning "After deployment, update AWS Secrets Manager with your Anthropic API key."
}

# Function to show next steps
show_next_steps() {
    local environment=${1:-dev}
    
    print_success "Setup completed successfully!"
    echo ""
    echo "Next steps:"
    echo ""
    echo "1. Deploy the backend:"
    echo "   ./scripts/deploy.sh $environment"
    echo ""
    echo "2. Configure secrets in AWS Secrets Manager:"
    echo "   Secret name: serenya/$environment/api-secrets"
    echo "   Required fields:"
    echo "     - googleClientId"
    echo "     - googleClientSecret" 
    echo "     - anthropicApiKey"
    echo ""
    echo "3. Update Flutter app configuration:"
    echo "   Update AppConstants.baseApiUrl with the deployed API Gateway URL"
    echo ""
    echo "4. Test the integration:"
    echo "   Use the provided test scripts in scripts/test-endpoints.sh"
    echo ""
    print_warning "Remember: This is a healthcare application. Ensure HIPAA compliance in production."
}

# Main setup function
main() {
    local environment=${1:-dev}
    
    print_header
    
    print_status "Starting setup for $environment environment..."
    
    # Install prerequisites
    install_prerequisites
    
    # Configure AWS
    configure_aws
    
    # Install dependencies
    install_dependencies
    
    # Setup environment config
    setup_environment_config $environment
    
    # Validate external service requirements
    validate_google_oauth
    validate_anthropic_setup
    
    # Show next steps
    show_next_steps $environment
}

# Check if being run with arguments
if [ $# -eq 0 ]; then
    main "dev"
else
    main "$1"
fi