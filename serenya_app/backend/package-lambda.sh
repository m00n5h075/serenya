#!/bin/bash

# Script to create a proper Lambda deployment package with dependencies

echo "Creating Lambda deployment package..."

# Create temporary directory for packaging
TEMP_DIR=$(mktemp -d)
PACKAGE_DIR="$TEMP_DIR/lambda-package"
mkdir -p "$PACKAGE_DIR"

echo "Temporary directory: $TEMP_DIR"

# Copy Lambda function
cp test-dynamodb-connectivity.js "$PACKAGE_DIR/"

# Copy package.json for Lambda
cp lambda-package.json "$PACKAGE_DIR/package.json"

# Change to package directory
cd "$PACKAGE_DIR"

# Install dependencies
echo "Installing dependencies..."
npm install --production

# Create deployment zip
echo "Creating deployment package..."
zip -r ../lambda-deployment.zip .

# Move zip to backend directory
mv ../lambda-deployment.zip /Users/m00n5h075ai/development/serenya/serenya_app/backend/

echo "Lambda deployment package created at: /Users/m00n5h075ai/development/serenya/serenya_app/backend/lambda-deployment.zip"

# Clean up
cd /Users/m00n5h075ai/development/serenya/serenya_app/backend
rm -rf "$TEMP_DIR"

echo "Package creation complete!"