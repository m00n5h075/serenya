// infrastructure/serenya-dynamodb-table.ts
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class SerenyaDynamoDBTable extends Construct {
  public readonly table: dynamodb.Table;
  
  constructor(scope: Construct, id: string, environment: string) {
    super(scope, id);
    
    this.table = new dynamodb.Table(this, 'SerenyaTable', {
      tableName: `serenya-${environment}`,

      // Primary Keys
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING
      },

      // Billing & Performance
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: environment === 'prod',

      // DynamoDB Streams for observability event processing
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,

      // Auto-cleanup via TTL (disabled - all records permanent)
      timeToLiveAttribute: 'ttl',

      // Lifecycle
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // Add Global Secondary Indexes
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1-EmailLookup',
      partitionKey: { 
        name: 'GSI1PK', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: { 
        name: 'GSI1SK', 
        type: dynamodb.AttributeType.STRING 
      },
      projectionType: dynamodb.ProjectionType.ALL
      // For: USER_EMAIL#{sha256(email)} lookups
    });

    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI2-ExternalAuth',
      partitionKey: { 
        name: 'GSI2PK', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: { 
        name: 'GSI2SK', 
        type: dynamodb.AttributeType.STRING 
      },
      projectionType: dynamodb.ProjectionType.ALL
      // For: USER_EXTERNAL#{provider}#{external_id} lookups
    });
    
    // CloudWatch Alarms for monitoring
    new cloudwatch.Alarm(this, 'HighReadThrottleAlarm', {
      metric: this.table.metricThrottledRequestsForOperations({
        operations: [dynamodb.Operation.GET_ITEM, dynamodb.Operation.QUERY, dynamodb.Operation.SCAN]
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    
    new cloudwatch.Alarm(this, 'HighWriteThrottleAlarm', {
      metric: this.table.metricThrottledRequestsForOperations({
        operations: [dynamodb.Operation.PUT_ITEM, dynamodb.Operation.UPDATE_ITEM, dynamodb.Operation.DELETE_ITEM]
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
  }
}