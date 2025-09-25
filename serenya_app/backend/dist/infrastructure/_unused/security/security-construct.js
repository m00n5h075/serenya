"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const wafv2 = __importStar(require("aws-cdk-lib/aws-wafv2"));
const cloudtrail = __importStar(require("aws-cdk-lib/aws-cloudtrail"));
const guardduty = __importStar(require("aws-cdk-lib/aws-guardduty"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const constructs_1 = require("constructs");
class SecurityConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
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
                destination: ec2.FlowLogDestination.toCloudWatchLogs(new logs.LogGroup(this, 'VpcFlowLogsGroup', {
                    logGroupName: `/aws/vpc/flowlogs/serenya-${environment}`,
                    retention: environment === 'prod' ? logs.RetentionDays.ONE_WEEK : logs.RetentionDays.THREE_DAYS,
                    removalPolicy: cdk.RemovalPolicy.DESTROY,
                }), flowLogsRole),
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
    createWafRules(environment) {
        const rules = [];
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
    createSecurityAlarms(environment) {
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
exports.SecurityConstruct = SecurityConstruct;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjdXJpdHktY29uc3RydWN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vaW5mcmFzdHJ1Y3R1cmUvX3VudXNlZC9zZWN1cml0eS9zZWN1cml0eS1jb25zdHJ1Y3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLDZEQUErQztBQUMvQyx1RUFBeUQ7QUFDekQscUVBQXVEO0FBQ3ZELHlEQUEyQztBQUMzQywyREFBNkM7QUFDN0MsdURBQXlDO0FBQ3pDLHlEQUEyQztBQUUzQywyQ0FBdUM7QUFVdkMsTUFBYSxpQkFBa0IsU0FBUSxzQkFBUztJQUs5QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTZCO1FBQ3JFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxpQkFBaUIsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUVuRSx1Q0FBdUM7UUFDdkMsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQy9ELFVBQVUsRUFBRSxzQkFBc0IsV0FBVyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLE1BQU0sRUFBRTtZQUMvRSxVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7WUFDMUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7WUFDakQsVUFBVSxFQUFFLElBQUk7WUFDaEIsY0FBYyxFQUFFO2dCQUNkO29CQUNFLEVBQUUsRUFBRSxlQUFlO29CQUNuQixPQUFPLEVBQUUsSUFBSTtvQkFDYixVQUFVLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsV0FBVyxLQUFLLE1BQU0sQ0FB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KiBhcyB3YWZ2MiBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtd2FmdjInO1xuaW1wb3J0ICogYXMgY2xvdWR0cmFpbCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR0cmFpbCc7XG5pbXBvcnQgKiBhcyBndWFyZGR1dHkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWd1YXJkZHV0eSc7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5pbnRlcmZhY2UgU2VjdXJpdHlDb25zdHJ1Y3RQcm9wcyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG4gIHJlZ2lvbjogc3RyaW5nO1xuICB2cGM6IGVjMi5WcGM7XG4gIGFwaTogYXBpZ2F0ZXdheS5SZXN0QXBpO1xuICBlbmFibGVWcGNGbG93TG9nczogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFNlY3VyaXR5Q29uc3RydWN0IGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IHdlYkFjbDogd2FmdjIuQ2ZuV2ViQUNMO1xuICBwdWJsaWMgcmVhZG9ubHkgY2xvdWRUcmFpbDogY2xvdWR0cmFpbC5UcmFpbDtcbiAgcHVibGljIHJlYWRvbmx5IGd1YXJkRHV0eURldGVjdG9yOiBndWFyZGR1dHkuQ2ZuRGV0ZWN0b3I7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNlY3VyaXR5Q29uc3RydWN0UHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgeyBlbnZpcm9ubWVudCwgcmVnaW9uLCB2cGMsIGFwaSwgZW5hYmxlVnBjRmxvd0xvZ3MgfSA9IHByb3BzO1xuXG4gICAgLy8gQ3JlYXRlIFMzIGJ1Y2tldCBmb3IgQ2xvdWRUcmFpbCBsb2dzXG4gICAgY29uc3QgY2xvdWRUcmFpbEJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0Nsb3VkVHJhaWxCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgc2VyZW55YS1jbG91ZHRyYWlsLSR7ZW52aXJvbm1lbnR9LSR7Y2RrLkF3cy5BQ0NPVU5UX0lEfS0ke3JlZ2lvbn1gLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIGVuZm9yY2VTU0w6IHRydWUsXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdEZWxldGVPbGRMb2dzJyxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKGVudmlyb25tZW50ID09PSAncHJvZCcgPyA5MCA6IDMwKSxcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZFRyYWlsIGZvciBBUEkgYXVkaXQgbG9nZ2luZ1xuICAgIHRoaXMuY2xvdWRUcmFpbCA9IG5ldyBjbG91ZHRyYWlsLlRyYWlsKHRoaXMsICdDbG91ZFRyYWlsJywge1xuICAgICAgdHJhaWxOYW1lOiBgc2VyZW55YS0ke2Vudmlyb25tZW50fS1jbG91ZHRyYWlsYCxcbiAgICAgIGJ1Y2tldDogY2xvdWRUcmFpbEJ1Y2tldCxcbiAgICAgIGluY2x1ZGVHbG9iYWxTZXJ2aWNlRXZlbnRzOiB0cnVlLFxuICAgICAgaXNNdWx0aVJlZ2lvblRyYWlsOiBmYWxzZSwgLy8gU2luZ2xlIHJlZ2lvbiBmb3IgY29zdCBvcHRpbWl6YXRpb25cbiAgICAgIGVuYWJsZUZpbGVWYWxpZGF0aW9uOiB0cnVlLFxuICAgICAgc2VuZFRvQ2xvdWRXYXRjaExvZ3M6IHRydWUsXG4gICAgICBjbG91ZFdhdGNoTG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdDbG91ZFRyYWlsTG9nR3JvdXAnLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvY2xvdWR0cmFpbC9zZXJlbnlhLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgcmV0ZW50aW9uOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCA6IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIH0pLFxuICAgICAgbWFuYWdlbWVudEV2ZW50czogY2xvdWR0cmFpbC5SZWFkV3JpdGVUeXBlLkFMTCxcbiAgICAgIGRhdGFFdmVudHM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHMzT2JqZWN0OiBjbG91ZHRyYWlsLlMzRXZlbnRUeXBlLkFMTCxcbiAgICAgICAgICByZXNvdXJjZXM6IFsnYXJuOmF3czpzMzo6OiovKiddLFxuICAgICAgICB9XG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gVlBDIEZsb3cgTG9ncyBmb3IgbmV0d29yayBtb25pdG9yaW5nXG4gICAgaWYgKGVuYWJsZVZwY0Zsb3dMb2dzKSB7XG4gICAgICBjb25zdCBmbG93TG9nc1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0Zsb3dMb2dzUm9sZScsIHtcbiAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ3ZwYy1mbG93LWxvZ3MuYW1hem9uYXdzLmNvbScpLFxuICAgICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICAgIEZsb3dMb2dzRGVsaXZlcnlSb2xlUG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICdsb2dzOkNyZWF0ZUxvZ0dyb3VwJyxcbiAgICAgICAgICAgICAgICAgICdsb2dzOkNyZWF0ZUxvZ1N0cmVhbScsXG4gICAgICAgICAgICAgICAgICAnbG9nczpQdXRMb2dFdmVudHMnLFxuICAgICAgICAgICAgICAgICAgJ2xvZ3M6RGVzY3JpYmVMb2dHcm91cHMnLFxuICAgICAgICAgICAgICAgICAgJ2xvZ3M6RGVzY3JpYmVMb2dTdHJlYW1zJyxcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBuZXcgZWMyLkZsb3dMb2codGhpcywgJ1ZwY0Zsb3dMb2dzJywge1xuICAgICAgICByZXNvdXJjZVR5cGU6IGVjMi5GbG93TG9nUmVzb3VyY2VUeXBlLmZyb21WcGModnBjKSxcbiAgICAgICAgZGVzdGluYXRpb246IGVjMi5GbG93TG9nRGVzdGluYXRpb24udG9DbG91ZFdhdGNoTG9ncyhcbiAgICAgICAgICBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnVnBjRmxvd0xvZ3NHcm91cCcsIHtcbiAgICAgICAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvdnBjL2Zsb3dsb2dzL3NlcmVueWEtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICAgICAgcmV0ZW50aW9uOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLIDogbG9ncy5SZXRlbnRpb25EYXlzLlRIUkVFX0RBWVMsXG4gICAgICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIGZsb3dMb2dzUm9sZVxuICAgICAgICApLFxuICAgICAgICB0cmFmZmljVHlwZTogZWMyLkZsb3dMb2dUcmFmZmljVHlwZS5BTEwsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBHdWFyZER1dHkgZm9yIHRocmVhdCBkZXRlY3Rpb25cbiAgICB0aGlzLmd1YXJkRHV0eURldGVjdG9yID0gbmV3IGd1YXJkZHV0eS5DZm5EZXRlY3Rvcih0aGlzLCAnR3VhcmREdXR5RGV0ZWN0b3InLCB7XG4gICAgICBlbmFibGU6IHRydWUsXG4gICAgICBmaW5kaW5nUHVibGlzaGluZ0ZyZXF1ZW5jeTogJ0ZJRlRFRU5fTUlOVVRFUycsXG4gICAgICBkYXRhU291cmNlczoge1xuICAgICAgICBzM0xvZ3M6IHsgZW5hYmxlOiB0cnVlIH0sXG4gICAgICAgIGt1YmVybmV0ZXNMb2dzOiB7IGF1ZGl0TG9nczogeyBlbmFibGU6IGZhbHNlIH0gfSwgLy8gTm90IHVzaW5nIEVLU1xuICAgICAgICBtYWx3YXJlUHJvdGVjdGlvbjogeyBzY2FuRWMySW5zdGFuY2VXaXRoRmluZGluZ3M6IHsgZWJzVm9sdW1lczogZmFsc2UgfSB9LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEFXUyBXQUYgV2ViIEFDTFxuICAgIHRoaXMud2ViQWNsID0gbmV3IHdhZnYyLkNmbldlYkFDTCh0aGlzLCAnV2ViQUNMJywge1xuICAgICAgc2NvcGU6ICdSRUdJT05BTCcsXG4gICAgICBuYW1lOiBgU2VyZW55YVdBRi0ke2Vudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFdBRiBydWxlcyBmb3IgU2VyZW55YSAke2Vudmlyb25tZW50fSBBUEkgcHJvdGVjdGlvbmAsXG4gICAgICBkZWZhdWx0QWN0aW9uOiB7IGFsbG93OiB7fSB9LFxuICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIG1ldHJpY05hbWU6IGBTZXJlbnlhV0FGLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIH0sXG4gICAgICBydWxlczogdGhpcy5jcmVhdGVXYWZSdWxlcyhlbnZpcm9ubWVudCksXG4gICAgfSk7XG5cbiAgICAvLyBBc3NvY2lhdGUgV0FGIHdpdGggQVBJIEdhdGV3YXlcbiAgICBuZXcgd2FmdjIuQ2ZuV2ViQUNMQXNzb2NpYXRpb24odGhpcywgJ1dlYkFDTEFzc29jaWF0aW9uJywge1xuICAgICAgcmVzb3VyY2VBcm46IGFwaS5kZXBsb3ltZW50U3RhZ2Uuc3RhZ2VBcm4sXG4gICAgICB3ZWJBY2xBcm46IHRoaXMud2ViQWNsLmF0dHJBcm4sXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtcyBmb3Igc2VjdXJpdHkgZXZlbnRzXG4gICAgdGhpcy5jcmVhdGVTZWN1cml0eUFsYXJtcyhlbnZpcm9ubWVudCk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVdhZlJ1bGVzKGVudmlyb25tZW50OiBzdHJpbmcpOiB3YWZ2Mi5DZm5XZWJBQ0wuUnVsZVByb3BlcnR5W10ge1xuICAgIGNvbnN0IHJ1bGVzOiB3YWZ2Mi5DZm5XZWJBQ0wuUnVsZVByb3BlcnR5W10gPSBbXTtcblxuICAgIC8vIFJ1bGUgMTogQVdTIE1hbmFnZWQgQ29yZSBSdWxlIFNldFxuICAgIHJ1bGVzLnB1c2goe1xuICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXQnLFxuICAgICAgcHJpb3JpdHk6IDEsXG4gICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgIHZlbmRvck5hbWU6ICdBV1MnLFxuICAgICAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNDb21tb25SdWxlU2V0JyxcbiAgICAgICAgICBleGNsdWRlZFJ1bGVzOiBbXG4gICAgICAgICAgICAvLyBFeGNsdWRlIHJ1bGVzIHRoYXQgbWlnaHQgYmxvY2sgbGVnaXRpbWF0ZSBoZWFsdGggZGF0YSB1cGxvYWRzXG4gICAgICAgICAgICB7IG5hbWU6ICdTaXplUmVzdHJpY3Rpb25zX0JPRFknIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdHZW5lcmljUkZJX0JPRFknIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBvdmVycmlkZUFjdGlvbjogeyBub25lOiB7fSB9LFxuICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIG1ldHJpY05hbWU6IGBTZXJlbnlhV0FGLSR7ZW52aXJvbm1lbnR9LUNvcmVSdWxlU2V0YCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBSdWxlIDI6IEtub3duIGJhZCBpbnB1dHNcbiAgICBydWxlcy5wdXNoKHtcbiAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNLbm93bkJhZElucHV0c1J1bGVTZXQnLFxuICAgICAgcHJpb3JpdHk6IDIsXG4gICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgIHZlbmRvck5hbWU6ICdBV1MnLFxuICAgICAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNLbm93bkJhZElucHV0c1J1bGVTZXQnLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG92ZXJyaWRlQWN0aW9uOiB7IG5vbmU6IHt9IH0sXG4gICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgbWV0cmljTmFtZTogYFNlcmVueWFXQUYtJHtlbnZpcm9ubWVudH0tS25vd25CYWRJbnB1dHNgLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFJ1bGUgMzogU1FMIGluamVjdGlvbiBwcm90ZWN0aW9uXG4gICAgcnVsZXMucHVzaCh7XG4gICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzU1FMaVJ1bGVTZXQnLFxuICAgICAgcHJpb3JpdHk6IDMsXG4gICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgIHZlbmRvck5hbWU6ICdBV1MnLFxuICAgICAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNTUUxpUnVsZVNldCcsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgb3ZlcnJpZGVBY3Rpb246IHsgbm9uZToge30gfSxcbiAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICBtZXRyaWNOYW1lOiBgU2VyZW55YVdBRi0ke2Vudmlyb25tZW50fS1TUUxpYCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBSdWxlIDQ6IFJhdGUgbGltaXRpbmcgZm9yIGF1dGhlbnRpY2F0ZWQgdXNlcnMgKDIwMC9ob3VyKVxuICAgIHJ1bGVzLnB1c2goe1xuICAgICAgbmFtZTogJ0F1dGhlbnRpY2F0ZWRVc2VyUmF0ZUxpbWl0JyxcbiAgICAgIHByaW9yaXR5OiAxMCxcbiAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICByYXRlQmFzZWRTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICBsaW1pdDogMjAwLCAvLyAyMDAgcmVxdWVzdHMgcGVyIDUtbWludXRlIHdpbmRvd1xuICAgICAgICAgIGFnZ3JlZ2F0ZUtleVR5cGU6ICdJUCcsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgYWN0aW9uOiB7XG4gICAgICAgIGJsb2NrOiB7XG4gICAgICAgICAgY3VzdG9tUmVzcG9uc2U6IHtcbiAgICAgICAgICAgIHJlc3BvbnNlQ29kZTogNDI5LFxuICAgICAgICAgICAgY3VzdG9tUmVzcG9uc2VCb2R5S2V5OiAnUmF0ZUxpbWl0ZWQnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIG1ldHJpY05hbWU6IGBTZXJlbnlhV0FGLSR7ZW52aXJvbm1lbnR9LUF1dGhSYXRlTGltaXRgLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFJ1bGUgNTogUmF0ZSBsaW1pdGluZyBmb3IgYW5vbnltb3VzIHVzZXJzICgyMC9ob3VyKVxuICAgIHJ1bGVzLnB1c2goe1xuICAgICAgbmFtZTogJ0Fub255bW91c1VzZXJSYXRlTGltaXQnLFxuICAgICAgcHJpb3JpdHk6IDExLFxuICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgIGFuZFN0YXRlbWVudDoge1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgcmF0ZUJhc2VkU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgbGltaXQ6IDIwLCAvLyAyMCByZXF1ZXN0cyBwZXIgNS1taW51dGUgd2luZG93XG4gICAgICAgICAgICAgICAgYWdncmVnYXRlS2V5VHlwZTogJ0lQJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIG5vdFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgICAgYnl0ZU1hdGNoU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgICAgIHNlYXJjaFN0cmluZzogJ0JlYXJlcicsXG4gICAgICAgICAgICAgICAgICAgIGZpZWxkVG9NYXRjaDogeyBzaW5nbGVIZWFkZXI6IHsgbmFtZTogJ2F1dGhvcml6YXRpb24nIH0gfSxcbiAgICAgICAgICAgICAgICAgICAgdGV4dFRyYW5zZm9ybWF0aW9uczogW3sgcHJpb3JpdHk6IDAsIHR5cGU6ICdOT05FJyB9XSxcbiAgICAgICAgICAgICAgICAgICAgcG9zaXRpb25hbENvbnN0cmFpbnQ6ICdTVEFSVFNfV0lUSCcsXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgYWN0aW9uOiB7XG4gICAgICAgIGJsb2NrOiB7XG4gICAgICAgICAgY3VzdG9tUmVzcG9uc2U6IHtcbiAgICAgICAgICAgIHJlc3BvbnNlQ29kZTogNDI5LFxuICAgICAgICAgICAgY3VzdG9tUmVzcG9uc2VCb2R5S2V5OiAnUmF0ZUxpbWl0ZWQnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIG1ldHJpY05hbWU6IGBTZXJlbnlhV0FGLSR7ZW52aXJvbm1lbnR9LUFub25SYXRlTGltaXRgLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFJ1bGUgNjogUmVxdWVzdCBzaXplIGxpbWl0cyAoMTBNQiBtYXhpbXVtKVxuICAgIHJ1bGVzLnB1c2goe1xuICAgICAgbmFtZTogJ1JlcXVlc3RTaXplTGltaXQnLFxuICAgICAgcHJpb3JpdHk6IDEyLFxuICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgIHNpemVDb25zdHJhaW50U3RhdGVtZW50OiB7XG4gICAgICAgICAgZmllbGRUb01hdGNoOiB7IGJvZHk6IHt9IH0sXG4gICAgICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiAnR1QnLFxuICAgICAgICAgIHNpemU6IDEwNDg1NzYwLCAvLyAxME1CIGluIGJ5dGVzXG4gICAgICAgICAgdGV4dFRyYW5zZm9ybWF0aW9uczogW3sgcHJpb3JpdHk6IDAsIHR5cGU6ICdOT05FJyB9XSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBhY3Rpb246IHtcbiAgICAgICAgYmxvY2s6IHtcbiAgICAgICAgICBjdXN0b21SZXNwb25zZToge1xuICAgICAgICAgICAgcmVzcG9uc2VDb2RlOiA0MTMsXG4gICAgICAgICAgICBjdXN0b21SZXNwb25zZUJvZHlLZXk6ICdSZXF1ZXN0VG9vTGFyZ2UnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIG1ldHJpY05hbWU6IGBTZXJlbnlhV0FGLSR7ZW52aXJvbm1lbnR9LVNpemVMaW1pdGAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gUnVsZSA3OiBCbG9jayBzdXNwaWNpb3VzIHVzZXIgYWdlbnRzXG4gICAgcnVsZXMucHVzaCh7XG4gICAgICBuYW1lOiAnQmxvY2tTdXNwaWNpb3VzVXNlckFnZW50cycsXG4gICAgICBwcmlvcml0eTogMTMsXG4gICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgb3JTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGJ5dGVNYXRjaFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgIHNlYXJjaFN0cmluZzogJ2N1cmwnLFxuICAgICAgICAgICAgICAgIGZpZWxkVG9NYXRjaDogeyBzaW5nbGVIZWFkZXI6IHsgbmFtZTogJ3VzZXItYWdlbnQnIH0gfSxcbiAgICAgICAgICAgICAgICB0ZXh0VHJhbnNmb3JtYXRpb25zOiBbeyBwcmlvcml0eTogMCwgdHlwZTogJ0xPV0VSQ0FTRScgfV0sXG4gICAgICAgICAgICAgICAgcG9zaXRpb25hbENvbnN0cmFpbnQ6ICdDT05UQUlOUycsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBieXRlTWF0Y2hTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICBzZWFyY2hTdHJpbmc6ICd3Z2V0JyxcbiAgICAgICAgICAgICAgICBmaWVsZFRvTWF0Y2g6IHsgc2luZ2xlSGVhZGVyOiB7IG5hbWU6ICd1c2VyLWFnZW50JyB9IH0sXG4gICAgICAgICAgICAgICAgdGV4dFRyYW5zZm9ybWF0aW9uczogW3sgcHJpb3JpdHk6IDAsIHR5cGU6ICdMT1dFUkNBU0UnIH1dLFxuICAgICAgICAgICAgICAgIHBvc2l0aW9uYWxDb25zdHJhaW50OiAnQ09OVEFJTlMnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgYnl0ZU1hdGNoU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgc2VhcmNoU3RyaW5nOiAnYm90JyxcbiAgICAgICAgICAgICAgICBmaWVsZFRvTWF0Y2g6IHsgc2luZ2xlSGVhZGVyOiB7IG5hbWU6ICd1c2VyLWFnZW50JyB9IH0sXG4gICAgICAgICAgICAgICAgdGV4dFRyYW5zZm9ybWF0aW9uczogW3sgcHJpb3JpdHk6IDAsIHR5cGU6ICdMT1dFUkNBU0UnIH1dLFxuICAgICAgICAgICAgICAgIHBvc2l0aW9uYWxDb25zdHJhaW50OiAnQ09OVEFJTlMnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGFjdGlvbjogeyBibG9jazoge30gfSxcbiAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICBtZXRyaWNOYW1lOiBgU2VyZW55YVdBRi0ke2Vudmlyb25tZW50fS1TdXNwaWNpb3VzVUFgLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHJldHVybiBydWxlcztcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlU2VjdXJpdHlBbGFybXMoZW52aXJvbm1lbnQ6IHN0cmluZykge1xuICAgIC8vIFdBRiBibG9ja2VkIHJlcXVlc3RzIGFsYXJtXG4gICAgbmV3IGNkay5hd3NfY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnV0FGQmxvY2tlZFJlcXVlc3RzQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6IGBTZXJlbnlhLSR7ZW52aXJvbm1lbnR9LVdBRi1IaWdoQmxvY2tlZGAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnQgd2hlbiBXQUYgYmxvY2tzIGhpZ2ggbnVtYmVyIG9mIHJlcXVlc3RzJyxcbiAgICAgIG1ldHJpYzogbmV3IGNkay5hd3NfY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6ICdBV1MvV0FGVjInLFxuICAgICAgICBtZXRyaWNOYW1lOiAnQmxvY2tlZFJlcXVlc3RzJyxcbiAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgIFdlYkFDTDogYFNlcmVueWFXQUYtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICAgIFJlZ2lvbjogY2RrLkF3cy5SRUdJT04sXG4gICAgICAgICAgUnVsZTogJ0FMTCcsXG4gICAgICAgIH0sXG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMTAwLCAvLyBBbGVydCBpZiBtb3JlIHRoYW4gMTAwIHJlcXVlc3RzIGJsb2NrZWQgaW4gNSBtaW51dGVzXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNkay5hd3NfY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICAvLyBHdWFyZER1dHkgZmluZGluZ3MgYWxhcm0gd291bGQgcmVxdWlyZSBhZGRpdGlvbmFsIHNldHVwIHdpdGggU05TXG4gICAgLy8gQ2xvdWRUcmFpbCB1bmF1dGhvcml6ZWQgQVBJIGNhbGxzIHdvdWxkIHJlcXVpcmUgY3VzdG9tIG1ldHJpYyBmaWx0ZXJcbiAgfVxufSJdfQ==