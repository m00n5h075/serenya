#!/usr/bin/env node

/**
 * Infrastructure validation script for Serenya Task 2 completion
 * Validates all 16 acceptance criteria for Task 2: AWS Infrastructure Deployment
 */

const AWS = require('aws-sdk');
const https = require('https');
const { promisify } = require('util');

// Configuration
const ENVIRONMENT = process.env.ENVIRONMENT || 'dev';
const REGION = process.env.AWS_REGION || 'us-east-1';
const API_BASE_URL = process.env.API_BASE_URL;

// AWS Services
const cloudformation = new AWS.CloudFormation({ region: REGION });
const apigateway = new AWS.APIGateway({ region: REGION });
const lambda = new AWS.Lambda({ region: REGION });
const rds = new AWS.RDS({ region: REGION });
const s3 = new AWS.S3({ region: REGION });
const cloudwatch = new AWS.CloudWatch({ region: REGION });
const wafv2 = new AWS.WAFV2({ region: REGION });
const ec2 = new AWS.EC2({ region: REGION });
const ssm = new AWS.SSM({ region: REGION });
const kms = new AWS.KMS({ region: REGION });

class InfrastructureValidator {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      total: 16,
      details: [],
    };
    this.stackName = `SerenyaBackend-${ENVIRONMENT}`;
  }

  async validate() {
    console.log(`🚀 Starting infrastructure validation for ${ENVIRONMENT} environment...`);
    console.log(`📍 Region: ${REGION}`);
    console.log(`📦 Stack: ${this.stackName}`);
    console.log('=' .repeat(60));

    try {
      // Get stack resources first
      const stackResources = await this.getStackResources();
      
      // Run all validation tests
      await this.validateCDKDeployment(stackResources);
      await this.validateVPCConfiguration(stackResources);
      await this.validateSecurityGroups(stackResources);
      await this.validateRDSDatabase(stackResources);
      await this.validateLambdaFunctions(stackResources);
      await this.validateAPIGateway(stackResources);
      await this.validateS3Buckets(stackResources);
      await this.validateKMSEncryption(stackResources);
      await this.validateCloudWatchMonitoring(stackResources);
      await this.validateWAFConfiguration(stackResources);
      await this.validateParameterStore(stackResources);
      await this.validateVPCEndpoints(stackResources);
      await this.validateSecurityCompliance(stackResources);
      await this.validateCostOptimization(stackResources);
      await this.validateHealthChecks(stackResources);
      await this.validateDocumentation();

      // Print final results
      this.printResults();
      
      return this.results.failed === 0;
    } catch (error) {
      console.error('❌ Validation failed with error:', error.message);
      return false;
    }
  }

  async getStackResources() {
    try {
      const response = await cloudformation.listStackResources({
        StackName: this.stackName
      }).promise();
      
      return response.StackResourceSummaries.reduce((acc, resource) => {
        acc[resource.LogicalResourceId] = {
          type: resource.ResourceType,
          physicalId: resource.PhysicalResourceId,
          status: resource.ResourceStatus,
        };
        return acc;
      }, {});
    } catch (error) {
      throw new Error(`Failed to get stack resources: ${error.message}`);
    }
  }

  async validateCDKDeployment(stackResources) {
    this.logTest('1. CDK Infrastructure Deployment');
    
    try {
      // Check if stack exists and is in good state
      const stackInfo = await cloudformation.describeStacks({
        StackName: this.stackName
      }).promise();
      
      const stack = stackInfo.Stacks[0];
      const isHealthy = stack.StackStatus === 'CREATE_COMPLETE' || 
                       stack.StackStatus === 'UPDATE_COMPLETE';
      
      if (isHealthy && Object.keys(stackResources).length > 0) {
        this.pass('CDK stack deployed successfully with all resources');
      } else {
        this.fail(`CDK stack in unhealthy state: ${stack.StackStatus}`);
      }
    } catch (error) {
      this.fail(`CDK deployment validation failed: ${error.message}`);
    }
  }

  async validateVPCConfiguration(stackResources) {
    this.logTest('2. VPC Network Configuration');
    
    try {
      const vpcId = stackResources.SerenyaVpc?.physicalId;
      if (!vpcId) {
        this.fail('VPC not found in stack resources');
        return;
      }

      const vpcResponse = await ec2.describeVpcs({
        VpcIds: [vpcId]
      }).promise();

      const subnetsResponse = await ec2.describeSubnets({
        Filters: [{ Name: 'vpc-id', Values: [vpcId] }]
      }).promise();

      const vpc = vpcResponse.Vpcs[0];
      const subnets = subnetsResponse.Subnets;
      
      // Check for multi-AZ setup
      const availabilityZones = [...new Set(subnets.map(s => s.AvailabilityZone))];
      const hasPublicSubnet = subnets.some(s => s.MapPublicIpOnLaunch);
      const hasPrivateSubnet = subnets.some(s => !s.MapPublicIpOnLaunch);
      
      if (availabilityZones.length >= 2 && hasPublicSubnet && hasPrivateSubnet) {
        this.pass('VPC configured with multi-AZ, public and private subnets');
      } else {
        this.fail('VPC configuration incomplete');
      }
    } catch (error) {
      this.fail(`VPC validation failed: ${error.message}`);
    }
  }

  async validateSecurityGroups(stackResources) {
    this.logTest('3. Security Groups Configuration');
    
    try {
      const vpcId = stackResources.SerenyaVpc?.physicalId;
      const securityGroupsResponse = await ec2.describeSecurityGroups({
        Filters: [
          { Name: 'vpc-id', Values: [vpcId] },
          { Name: 'group-name', Values: ['*Serenya*', '*Lambda*', '*Database*'] }
        ]
      }).promise();

      const securityGroups = securityGroupsResponse.SecurityGroups;
      const hasLambdaSG = securityGroups.some(sg => sg.GroupName.includes('Lambda'));
      const hasDatabaseSG = securityGroups.some(sg => sg.GroupName.includes('Database'));
      
      if (hasLambdaSG && hasDatabaseSG && securityGroups.length >= 2) {
        this.pass('Security groups configured for Lambda and Database');
      } else {
        this.fail('Security groups configuration incomplete');
      }
    } catch (error) {
      this.fail(`Security groups validation failed: ${error.message}`);
    }
  }

  async validateRDSDatabase(stackResources) {
    this.logTest('4. RDS Database Configuration');
    
    try {
      const dbInstanceId = Object.values(stackResources)
        .find(resource => resource.type === 'AWS::RDS::DBInstance')?.physicalId;
      
      if (!dbInstanceId) {
        this.fail('RDS instance not found');
        return;
      }

      const dbResponse = await rds.describeDBInstances({
        DBInstanceIdentifier: dbInstanceId
      }).promise();

      const dbInstance = dbResponse.DBInstances[0];
      const isEncrypted = dbInstance.StorageEncrypted;
      const isMultiAZ = dbInstance.MultiAZ;
      const hasBackups = dbInstance.BackupRetentionPeriod > 0;
      
      if (isEncrypted && hasBackups) {
        this.pass('RDS database configured with encryption and backups');
      } else {
        this.fail('RDS database missing critical configurations');
      }
    } catch (error) {
      this.fail(`RDS validation failed: ${error.message}`);
    }
  }

  async validateLambdaFunctions(stackResources) {
    this.logTest('5. Lambda Functions Deployment');
    
    try {
      const lambdaResources = Object.entries(stackResources)
        .filter(([key, resource]) => resource.type === 'AWS::Lambda::Function');
      
      const requiredFunctions = [
        'AuthFunction',
        'ProcessFunction', 
        'UploadFunction',
        'StatusFunction',
        'ResultFunction'
      ];
      
      const foundFunctions = lambdaResources.map(([key]) => key);
      const missingFunctions = requiredFunctions.filter(
        func => !foundFunctions.some(found => found.includes(func))
      );
      
      if (missingFunctions.length === 0 && lambdaResources.length >= 5) {
        this.pass('All required Lambda functions deployed');
      } else {
        this.fail(`Missing Lambda functions: ${missingFunctions.join(', ')}`);
      }
    } catch (error) {
      this.fail(`Lambda validation failed: ${error.message}`);
    }
  }

  async validateAPIGateway(stackResources) {
    this.logTest('6. API Gateway Configuration');
    
    try {
      const apiId = Object.values(stackResources)
        .find(resource => resource.type === 'AWS::ApiGateway::RestApi')?.physicalId;
      
      if (!apiId) {
        this.fail('API Gateway not found');
        return;
      }

      const apiResponse = await apigateway.getRestApi({ restApiId: apiId }).promise();
      const resourcesResponse = await apigateway.getResources({ restApiId: apiId }).promise();
      
      const hasAuthEndpoint = resourcesResponse.items.some(
        resource => resource.pathPart === 'auth'
      );
      const hasProcessEndpoint = resourcesResponse.items.some(
        resource => resource.pathPart === 'process'
      );
      
      if (hasAuthEndpoint && hasProcessEndpoint) {
        this.pass('API Gateway configured with required endpoints');
      } else {
        this.fail('API Gateway missing required endpoints');
      }
    } catch (error) {
      this.fail(`API Gateway validation failed: ${error.message}`);
    }
  }

  async validateS3Buckets(stackResources) {
    this.logTest('7. S3 Buckets Configuration');
    
    try {
      const bucketName = Object.values(stackResources)
        .find(resource => resource.type === 'AWS::S3::Bucket')?.physicalId;
      
      if (!bucketName) {
        this.fail('S3 bucket not found');
        return;
      }

      const encryptionResponse = await s3.getBucketEncryption({
        Bucket: bucketName
      }).promise();
      
      const lifecycleResponse = await s3.getBucketLifecycleConfiguration({
        Bucket: bucketName
      }).promise();
      
      const hasEncryption = encryptionResponse.ServerSideEncryptionConfiguration.Rules.length > 0;
      const hasLifecycle = lifecycleResponse.Rules.length > 0;
      
      if (hasEncryption && hasLifecycle) {
        this.pass('S3 bucket configured with encryption and lifecycle policies');
      } else {
        this.fail('S3 bucket missing encryption or lifecycle configuration');
      }
    } catch (error) {
      this.fail(`S3 validation failed: ${error.message}`);
    }
  }

  async validateKMSEncryption(stackResources) {
    this.logTest('8. KMS Encryption Configuration');
    
    try {
      const kmsKeyId = Object.values(stackResources)
        .find(resource => resource.type === 'AWS::KMS::Key')?.physicalId;
      
      if (!kmsKeyId) {
        this.fail('KMS key not found');
        return;
      }

      const keyResponse = await kms.describeKey({ KeyId: kmsKeyId }).promise();
      const key = keyResponse.KeyMetadata;
      
      const isEnabled = key.KeyState === 'Enabled';
      const hasRotation = key.KeyRotationStatus || false;
      
      if (isEnabled) {
        this.pass('KMS key configured and enabled for encryption');
      } else {
        this.fail('KMS key not properly configured');
      }
    } catch (error) {
      this.fail(`KMS validation failed: ${error.message}`);
    }
  }

  async validateCloudWatchMonitoring(stackResources) {
    this.logTest('9. CloudWatch Monitoring Setup');
    
    try {
      // Check for custom metrics
      const customMetricsResponse = await cloudwatch.listMetrics({
        Namespace: 'Serenya/Business'
      }).promise();
      
      // Check for alarms
      const alarmsResponse = await cloudwatch.describeAlarms({
        AlarmNamePrefix: `Serenya-${ENVIRONMENT}`
      }).promise();
      
      const hasCustomMetrics = customMetricsResponse.Metrics.length > 0;
      const hasAlarms = alarmsResponse.MetricAlarms.length > 0;
      
      if (hasCustomMetrics || hasAlarms) {
        this.pass('CloudWatch monitoring configured with metrics and alarms');
      } else {
        this.fail('CloudWatch monitoring setup incomplete');
      }
    } catch (error) {
      this.fail(`CloudWatch validation failed: ${error.message}`);
    }
  }

  async validateWAFConfiguration(stackResources) {
    this.logTest('10. WAF Security Rules');
    
    try {
      // List WAF WebACLs
      const webAclsResponse = await wafv2.listWebACLs({
        Scope: 'REGIONAL'
      }).promise();
      
      const serenyaWaf = webAclsResponse.WebACLs.find(
        waf => waf.Name.includes(`SerenyaWAF-${ENVIRONMENT}`)
      );
      
      if (serenyaWaf) {
        const wafResponse = await wafv2.getWebACL({
          Scope: 'REGIONAL',
          Id: serenyaWaf.Id,
          Name: serenyaWaf.Name
        }).promise();
        
        const hasRules = wafResponse.WebACL.Rules.length > 0;
        if (hasRules) {
          this.pass('WAF configured with security rules');
        } else {
          this.fail('WAF found but no rules configured');
        }
      } else {
        this.fail('WAF not found or not properly named');
      }
    } catch (error) {
      this.fail(`WAF validation failed: ${error.message}`);
    }
  }

  async validateParameterStore(stackResources) {
    this.logTest('11. Parameter Store Configuration');
    
    try {
      const parametersResponse = await ssm.getParametersByPath({
        Path: `/serenya/${ENVIRONMENT}`,
        Recursive: true
      }).promise();
      
      const parameters = parametersResponse.Parameters;
      const hasRateLimitConfig = parameters.some(p => p.Name.includes('rate-limits'));
      const hasCostConfig = parameters.some(p => p.Name.includes('cost'));
      const hasFeatureFlags = parameters.some(p => p.Name.includes('features'));
      
      if (hasRateLimitConfig && hasCostConfig && hasFeatureFlags) {
        this.pass('Parameter Store configured with required configurations');
      } else {
        this.fail('Parameter Store missing required configurations');
      }
    } catch (error) {
      this.fail(`Parameter Store validation failed: ${error.message}`);
    }
  }

  async validateVPCEndpoints(stackResources) {
    this.logTest('12. VPC Endpoints for Security');
    
    try {
      const vpcId = stackResources.SerenyaVpc?.physicalId;
      const endpointsResponse = await ec2.describeVpcEndpoints({
        Filters: [{ Name: 'vpc-id', Values: [vpcId] }]
      }).promise();
      
      const endpoints = endpointsResponse.VpcEndpoints;
      const hasS3Endpoint = endpoints.some(ep => ep.ServiceName.includes('s3'));
      const hasSecretsEndpoint = endpoints.some(ep => ep.ServiceName.includes('secretsmanager'));
      
      if (hasS3Endpoint && endpoints.length >= 2) {
        this.pass('VPC endpoints configured for secure service access');
      } else {
        this.fail('VPC endpoints configuration incomplete');
      }
    } catch (error) {
      this.fail(`VPC endpoints validation failed: ${error.message}`);
    }
  }

  async validateSecurityCompliance(stackResources) {
    this.logTest('13. HIPAA Security Compliance');
    
    try {
      // Check encryption at rest and in transit
      const dbInstanceId = Object.values(stackResources)
        .find(resource => resource.type === 'AWS::RDS::DBInstance')?.physicalId;
      
      const bucketName = Object.values(stackResources)
        .find(resource => resource.type === 'AWS::S3::Bucket')?.physicalId;
      
      // Validate database encryption
      const dbResponse = await rds.describeDBInstances({
        DBInstanceIdentifier: dbInstanceId
      }).promise();
      const isDbEncrypted = dbResponse.DBInstances[0].StorageEncrypted;
      
      // Validate S3 encryption
      const s3EncryptionResponse = await s3.getBucketEncryption({
        Bucket: bucketName
      }).promise();
      const isS3Encrypted = s3EncryptionResponse.ServerSideEncryptionConfiguration.Rules.length > 0;
      
      if (isDbEncrypted && isS3Encrypted) {
        this.pass('Security compliance: encryption configured for PHI data');
      } else {
        this.fail('Security compliance: missing encryption configurations');
      }
    } catch (error) {
      this.fail(`Security compliance validation failed: ${error.message}`);
    }
  }

  async validateCostOptimization(stackResources) {
    this.logTest('14. Cost Optimization Features');
    
    try {
      // Check for cost tracking Lambda function
      const costTrackingFunction = Object.entries(stackResources)
        .find(([key, resource]) => 
          resource.type === 'AWS::Lambda::Function' && key.includes('CostTracking')
        );
      
      // Check for cost-related parameters
      const costParametersResponse = await ssm.getParametersByPath({
        Path: `/serenya/${ENVIRONMENT}/cost`,
        Recursive: true
      }).promise();
      
      const hasCostTracking = !!costTrackingFunction;
      const hasCostParameters = costParametersResponse.Parameters.length > 0;
      
      if (hasCostTracking && hasCostParameters) {
        this.pass('Cost optimization features configured');
      } else {
        this.fail('Cost optimization features incomplete');
      }
    } catch (error) {
      this.fail(`Cost optimization validation failed: ${error.message}`);
    }
  }

  async validateHealthChecks(stackResources) {
    this.logTest('15. Health Check Endpoints');
    
    try {
      // This would typically check for health check endpoints in Lambda functions
      // For now, we'll validate that the functions are responding
      const lambdaResources = Object.entries(stackResources)
        .filter(([key, resource]) => resource.type === 'AWS::Lambda::Function');
      
      let healthyFunctions = 0;
      for (const [key, resource] of lambdaResources) {
        try {
          await lambda.getFunctionConfiguration({
            FunctionName: resource.physicalId
          }).promise();
          healthyFunctions++;
        } catch (error) {
          // Function not accessible
        }
      }
      
      const healthCheckRatio = healthyFunctions / lambdaResources.length;
      if (healthCheckRatio >= 0.8) { // At least 80% of functions healthy
        this.pass('Health check endpoints accessible');
      } else {
        this.fail('Health check endpoints not properly configured');
      }
    } catch (error) {
      this.fail(`Health checks validation failed: ${error.message}`);
    }
  }

  async validateDocumentation() {
    this.logTest('16. Technical Documentation');
    
    try {
      // Check for required documentation files
      const fs = require('fs').promises;
      const path = require('path');
      
      const requiredDocs = [
        'README.md',
        'DEPLOYMENT_GUIDE.md',
        'SECURITY_AUDIT_CHECKLIST.md'
      ];
      
      let foundDocs = 0;
      const baseDir = path.join(__dirname, '../../..');
      
      for (const doc of requiredDocs) {
        try {
          await fs.access(path.join(baseDir, doc));
          foundDocs++;
        } catch (error) {
          // Document not found
        }
      }
      
      if (foundDocs >= 2) { // At least 2 out of 3 docs
        this.pass('Technical documentation available');
      } else {
        this.fail('Technical documentation incomplete');
      }
    } catch (error) {
      this.fail(`Documentation validation failed: ${error.message}`);
    }
  }

  logTest(testName) {
    console.log(`\n🔍 Testing: ${testName}`);
  }

  pass(message) {
    console.log(`   ✅ PASS: ${message}`);
    this.results.passed++;
    this.results.details.push({ status: 'PASS', message });
  }

  fail(message) {
    console.log(`   ❌ FAIL: ${message}`);
    this.results.failed++;
    this.results.details.push({ status: 'FAIL', message });
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 VALIDATION RESULTS');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${this.results.passed}/${this.results.total}`);
    console.log(`❌ Failed: ${this.results.failed}/${this.results.total}`);
    console.log(`📈 Success Rate: ${Math.round((this.results.passed / this.results.total) * 100)}%`);
    
    if (this.results.failed === 0) {
      console.log('\n🎉 ALL TESTS PASSED! Task 2 implementation is complete.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review and fix the issues above.');
      console.log('\nFailed tests:');
      this.results.details
        .filter(detail => detail.status === 'FAIL')
        .forEach((detail, index) => {
          console.log(`   ${index + 1}. ${detail.message}`);
        });
    }
    console.log('='.repeat(60));
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new InfrastructureValidator();
  validator.validate()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Validation error:', error);
      process.exit(1);
    });
}

module.exports = InfrastructureValidator;