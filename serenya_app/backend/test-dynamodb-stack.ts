import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Construct } from 'constructs';

/**
 * Temporary stack to test DynamoDB connectivity from Lambda outside VPC
 * This will verify the technical feasibility before proceeding with full migration
 */
export class TestDynamoDBStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a test DynamoDB table to verify connectivity
    const testTable = new dynamodb.Table(this, 'DynamoDBConnectivityTestTable', {
      tableName: 'serenya-dynamodb-connectivity-test',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Safe to delete for testing
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false }, // Not needed for test table
    });

    // Lambda execution role with DynamoDB permissions
    const lambdaExecutionRole = new iam.Role(this, 'TestLambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for DynamoDB connectivity test Lambda',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant the Lambda function full access to DynamoDB for testing
    // This includes: GetItem, PutItem, UpdateItem, DeleteItem, Query, Scan, CreateTable, DeleteTable, etc.
    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:*', // Full DynamoDB access for testing
      ],
      resources: ['*'], // All tables for comprehensive testing
    }));

    // Lambda function to test DynamoDB connectivity
    const testFunction = new lambda.Function(this, 'DynamoDBConnectivityTestFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'test-dynamodb-connectivity.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..')), // Parent directory contains the test file
      role: lambdaExecutionRole,
      timeout: cdk.Duration.minutes(5), // Allow time for table operations
      memorySize: 256,
      environment: {
        TEST_TABLE_NAME: testTable.tableName,
      },
      logGroup: new logs.LogGroup(this, 'TestFunctionLogGroup', {
        retention: logs.RetentionDays.ONE_DAY,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      description: 'Test Lambda function to verify DynamoDB connectivity outside VPC',
    });

    // Additional grant using CDK's built-in method to ensure proper permissions
    testTable.grantFullAccess(testFunction);

    // Outputs
    new cdk.CfnOutput(this, 'TestFunctionName', {
      value: testFunction.functionName,
      description: 'Name of the test Lambda function',
    });

    new cdk.CfnOutput(this, 'TestTableName', {
      value: testTable.tableName,
      description: 'Name of the test DynamoDB table',
    });

    new cdk.CfnOutput(this, 'TestFunctionArn', {
      value: testFunction.functionArn,
      description: 'ARN of the test Lambda function',
    });

    // Manual test command output
    new cdk.CfnOutput(this, 'TestCommand', {
      value: `aws lambda invoke --function-name ${testFunction.functionName} --region ${this.region} /tmp/dynamodb-test-result.json`,
      description: 'Command to manually invoke the test function',
    });
  }
}