#!/bin/bash

# Deploy script for the subscriptions endpoint
# This script deploys the new subscription Lambda function and API Gateway route

set -e

echo "🚀 Deploying Serenya Subscriptions Endpoint..."

# Get the environment (default to dev)
ENVIRONMENT=${1:-dev}

echo "📋 Environment: $ENVIRONMENT"

# Check if we're in the backend directory
if [ ! -f "cdk.json" ]; then
  echo "❌ Error: Please run this script from the backend directory"
  exit 1
fi

# Build the TypeScript code
echo "🔨 Building CDK code..."
npm run build

# Synthesize the CDK template to check for errors
echo "📝 Synthesizing CDK template..."
npx cdk synth --quiet > /dev/null

# Deploy the stack
echo "🚀 Deploying to AWS..."
npx cdk deploy SerenyaBackend-${ENVIRONMENT} --require-approval never

echo "✅ Deployment completed successfully!"
echo ""
echo "📋 New endpoint available:"
echo "   GET /subscriptions/current - Get user's current subscription"
echo ""
echo "🔑 The endpoint requires JWT authentication (Authorization: Bearer <token>)"
echo "📊 Returns subscription details including plan type, status, and limits"
echo ""
echo "🧪 To test the endpoint:"
echo "   curl -H 'Authorization: Bearer <your-jwt-token>' \\"
echo "        https://<api-gateway-url>/subscriptions/current"
echo ""
echo "🎉 The frontend mock data has been replaced with real API calls!"