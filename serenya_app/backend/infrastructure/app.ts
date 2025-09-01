#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SerenyaBackendStack } from './serenya-backend-stack';

const app = new cdk.App();

// Get environment from context
const environment = app.node.tryGetContext('environment') || 'dev';

// Environment-specific configuration
const envConfig = {
  dev: {
    region: 'eu-west-1',
    allowOrigins: ['http://localhost:*'],
    retentionDays: 7,
    enableDetailedLogging: true,
  },
  staging: {
    region: 'eu-west-1', 
    allowOrigins: ['https://staging.serenya.health'],
    retentionDays: 14,
    enableDetailedLogging: true,
  },
  prod: {
    region: 'eu-west-1',
    allowOrigins: ['https://app.serenya.health'],
    retentionDays: 30,
    enableDetailedLogging: false,
  }
};

const config = envConfig[environment as keyof typeof envConfig];

new SerenyaBackendStack(app, `SerenyaBackend-${environment}`, {
  env: {
    region: config.region,
  },
  environment,
  config,
  stackName: `serenya-backend-${environment}`,
  description: `Serenya AI Health Agent Backend - ${environment} environment`,
  tags: {
    Project: 'Serenya',
    Environment: environment,
    Component: 'Backend',
    Owner: 'Serenya-Health',
    CostCenter: 'Engineering',
    DataClassification: 'PHI-Temporary',
    Compliance: 'HIPAA',
  },
});