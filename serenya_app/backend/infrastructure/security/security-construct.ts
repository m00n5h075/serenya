import * as cdk from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

interface SecurityConstructProps {
  environment: string;
  region: string;
  vpc: ec2.Vpc;
  api: apigateway.RestApi;
  enableVpcFlowLogs: boolean;
}

export class SecurityConstruct extends Construct {
  public readonly webAcl: wafv2.CfnWebACL;
  public readonly cloudTrail: cloudtrail.Trail;
  public readonly guardDutyDetector: guardduty.CfnDetector;

  constructor(scope: Construct, id: string, props: SecurityConstructProps) {
    super(scope, id);

    const { environment, region, vpc, api, enableVpcFlowLogs } = props;

    // Create S3 bucket for CloudTrail logs
    const cloudTrailBucket = new s3.Bucket(this, 'CloudTrailBucket', {
      bucketName: `serenya-cloudtrail-${environment}-${cdk.Aws.ACCOUNT_ID}-${region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [
        {
          id: 'DeleteOldLogs',
          enabled: true,
          expiration: cdk.Duration.days(environment === 'prod' ? 90 : 30),
        }
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // CloudTrail for API audit logging
    this.cloudTrail = new cloudtrail.Trail(this, 'CloudTrail', {
      trailName: `serenya-${environment}-cloudtrail`,
      bucket: cloudTrailBucket,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: false, // Single region for cost optimization
      enableFileValidation: true,
      sendToCloudWatchLogs: true,
      cloudWatchLogGroup: new logs.LogGroup(this, 'CloudTrailLogGroup', {
        logGroupName: `/aws/cloudtrail/serenya-${environment}`,
        retention: environment === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      managementEvents: cloudtrail.ReadWriteType.ALL,
      dataEvents: [
        {
          s3Object: cloudtrail.S3EventType.ALL,
          resources: ['arn:aws:s3:::*/*'],
        }
      ],
    });

    // VPC Flow Logs for network monitoring
    if (enableVpcFlowLogs) {
      const flowLogsRole = new iam.Role(this, 'FlowLogsRole', {
        assumedBy: new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
        inlinePolicies: {
          FlowLogsDeliveryRolePolicy: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: [
                  'logs:CreateLogGroup',
                  'logs:CreateLogStream',
                  'logs:PutLogEvents',
                  'logs:DescribeLogGroups',
                  'logs:DescribeLogStreams',
                ],
                resources: ['*'],
              }),
            ],
          }),
        },
      });

      new ec2.FlowLog(this, 'VpcFlowLogs', {
        resourceType: ec2.FlowLogResourceType.fromVpc(vpc),
        destination: ec2.FlowLogDestination.toCloudWatchLogs(
          new logs.LogGroup(this, 'VpcFlowLogsGroup', {
            logGroupName: `/aws/vpc/flowlogs/serenya-${environment}`,
            retention: environment === 'prod' ? logs.RetentionDays.ONE_WEEK : logs.RetentionDays.THREE_DAYS,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          }),
          flowLogsRole
        ),
        trafficType: ec2.FlowLogTrafficType.ALL,
      });
    }

    // GuardDuty for threat detection
    this.guardDutyDetector = new guardduty.CfnDetector(this, 'GuardDutyDetector', {
      enable: true,
      findingPublishingFrequency: 'FIFTEEN_MINUTES',
      dataSources: {
        s3Logs: { enable: true },
        kubernetesLogs: { auditLogs: { enable: false } }, // Not using EKS
        malwareProtection: { scanEc2InstanceWithFindings: { ebsVolumes: false } },
      },
    });

    // AWS WAF Web ACL
    this.webAcl = new wafv2.CfnWebACL(this, 'WebACL', {
      scope: 'REGIONAL',
      name: `SerenyaWAF-${environment}`,
      description: `WAF rules for Serenya ${environment} API protection`,
      defaultAction: { allow: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `SerenyaWAF-${environment}`,
      },
      rules: this.createWafRules(environment),
    });

    // Associate WAF with API Gateway
    new wafv2.CfnWebACLAssociation(this, 'WebACLAssociation', {
      resourceArn: api.deploymentStage.stageArn,
      webAclArn: this.webAcl.attrArn,
    });

    // CloudWatch Alarms for security events
    this.createSecurityAlarms(environment);
  }

  private createWafRules(environment: string): wafv2.CfnWebACL.RuleProperty[] {
    const rules: wafv2.CfnWebACL.RuleProperty[] = [];

    // Rule 1: AWS Managed Core Rule Set
    rules.push({
      name: 'AWSManagedRulesCommonRuleSet',
      priority: 1,
      statement: {
        managedRuleGroupStatement: {
          vendorName: 'AWS',
          name: 'AWSManagedRulesCommonRuleSet',
          excludedRules: [
            // Exclude rules that might block legitimate health data uploads
            { name: 'SizeRestrictions_BODY' },
            { name: 'GenericRFI_BODY' },
          ],
        },
      },
      overrideAction: { none: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `SerenyaWAF-${environment}-CoreRuleSet`,
      },
    });

    // Rule 2: Known bad inputs
    rules.push({
      name: 'AWSManagedRulesKnownBadInputsRuleSet',
      priority: 2,
      statement: {
        managedRuleGroupStatement: {
          vendorName: 'AWS',
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
        },
      },
      overrideAction: { none: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `SerenyaWAF-${environment}-KnownBadInputs`,
      },
    });

    // Rule 3: SQL injection protection
    rules.push({
      name: 'AWSManagedRulesSQLiRuleSet',
      priority: 3,
      statement: {
        managedRuleGroupStatement: {
          vendorName: 'AWS',
          name: 'AWSManagedRulesSQLiRuleSet',
        },
      },
      overrideAction: { none: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `SerenyaWAF-${environment}-SQLi`,
      },
    });

    // Rule 4: Rate limiting for authenticated users (200/hour)
    rules.push({
      name: 'AuthenticatedUserRateLimit',
      priority: 10,
      statement: {
        rateBasedStatement: {
          limit: 200, // 200 requests per 5-minute window
          aggregateKeyType: 'IP',
        },
      },
      action: {
        block: {
          customResponse: {
            responseCode: 429,
            customResponseBodyKey: 'RateLimited',
          },
        },
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `SerenyaWAF-${environment}-AuthRateLimit`,
      },
    });

    // Rule 5: Rate limiting for anonymous users (20/hour)
    rules.push({
      name: 'AnonymousUserRateLimit',
      priority: 11,
      statement: {
        andStatement: {
          statements: [
            {
              rateBasedStatement: {
                limit: 20, // 20 requests per 5-minute window
                aggregateKeyType: 'IP',
              },
            },
            {
              notStatement: {
                statement: {
                  byteMatchStatement: {
                    searchString: 'Bearer',
                    fieldToMatch: { singleHeader: { name: 'authorization' } },
                    textTransformations: [{ priority: 0, type: 'NONE' }],
                    positionalConstraint: 'STARTS_WITH',
                  },
                },
              },
            },
          ],
        },
      },
      action: {
        block: {
          customResponse: {
            responseCode: 429,
            customResponseBodyKey: 'RateLimited',
          },
        },
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `SerenyaWAF-${environment}-AnonRateLimit`,
      },
    });

    // Rule 6: Request size limits (10MB maximum)
    rules.push({
      name: 'RequestSizeLimit',
      priority: 12,
      statement: {
        sizeConstraintStatement: {
          fieldToMatch: { body: {} },
          comparisonOperator: 'GT',
          size: 10485760, // 10MB in bytes
          textTransformations: [{ priority: 0, type: 'NONE' }],
        },
      },
      action: {
        block: {
          customResponse: {
            responseCode: 413,
            customResponseBodyKey: 'RequestTooLarge',
          },
        },
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `SerenyaWAF-${environment}-SizeLimit`,
      },
    });

    // Rule 7: Block suspicious user agents
    rules.push({
      name: 'BlockSuspiciousUserAgents',
      priority: 13,
      statement: {
        orStatement: {
          statements: [
            {
              byteMatchStatement: {
                searchString: 'curl',
                fieldToMatch: { singleHeader: { name: 'user-agent' } },
                textTransformations: [{ priority: 0, type: 'LOWERCASE' }],
                positionalConstraint: 'CONTAINS',
              },
            },
            {
              byteMatchStatement: {
                searchString: 'wget',
                fieldToMatch: { singleHeader: { name: 'user-agent' } },
                textTransformations: [{ priority: 0, type: 'LOWERCASE' }],
                positionalConstraint: 'CONTAINS',
              },
            },
            {
              byteMatchStatement: {
                searchString: 'bot',
                fieldToMatch: { singleHeader: { name: 'user-agent' } },
                textTransformations: [{ priority: 0, type: 'LOWERCASE' }],
                positionalConstraint: 'CONTAINS',
              },
            },
          ],
        },
      },
      action: { block: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `SerenyaWAF-${environment}-SuspiciousUA`,
      },
    });

    return rules;
  }

  private createSecurityAlarms(environment: string) {
    // WAF blocked requests alarm
    new cdk.aws_cloudwatch.Alarm(this, 'WAFBlockedRequestsAlarm', {
      alarmName: `Serenya-${environment}-WAF-HighBlocked`,
      alarmDescription: 'Alert when WAF blocks high number of requests',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/WAFV2',
        metricName: 'BlockedRequests',
        dimensionsMap: {
          WebACL: `SerenyaWAF-${environment}`,
          Region: cdk.Aws.REGION,
          Rule: 'ALL',
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 100, // Alert if more than 100 requests blocked in 5 minutes
      evaluationPeriods: 2,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // GuardDuty findings alarm would require additional setup with SNS
    // CloudTrail unauthorized API calls would require custom metric filter
  }
}