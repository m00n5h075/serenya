#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TestDynamoDBStack } from './test-dynamodb-stack';

/**
 * CDK App to deploy DynamoDB connectivity test
 * This will verify that Lambda functions outside VPC can connect to DynamoDB
 */

const app = new cdk.App();

new TestDynamoDBStack(app, 'SerenyaDynamoDBConnectivityTest', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION || 'eu-west-1'
  },
  description: 'Temporary stack to test DynamoDB connectivity from Lambda outside VPC for Serenya project',
  tags: {
    Project: 'Serenya',
    Purpose: 'DynamoDB-Connectivity-Test',
    Temporary: 'true',
    Environment: 'test'
  }
});