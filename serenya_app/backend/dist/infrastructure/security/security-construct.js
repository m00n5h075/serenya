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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjdXJpdHktY29uc3RydWN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vaW5mcmFzdHJ1Y3R1cmUvc2VjdXJpdHkvc2VjdXJpdHktY29uc3RydWN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyw2REFBK0M7QUFDL0MsdUVBQXlEO0FBQ3pELHFFQUF1RDtBQUN2RCx5REFBMkM7QUFDM0MsMkRBQTZDO0FBQzdDLHVEQUF5QztBQUN6Qyx5REFBMkM7QUFFM0MsMkNBQXVDO0FBVXZDLE1BQWEsaUJBQWtCLFNBQVEsc0JBQVM7SUFLOUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE2QjtRQUNyRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFbkUsdUNBQXVDO1FBQ3ZDLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUMvRCxVQUFVLEVBQUUsc0JBQXNCLFdBQVcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxNQUFNLEVBQUU7WUFDL0UsVUFBVSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO1lBQzFDLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1lBQ2pELFVBQVUsRUFBRSxJQUFJO1lBQ2hCLGNBQWMsRUFBRTtnQkFDZDtvQkFDRSxFQUFFLEVBQUUsZUFBZTtvQkFDbkIsT0FBTyxFQUFFLElBQUk7b0JBQ2IsVUFBVSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFD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TUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRTtZQUNyQixnQkFBZ0IsRUFBRTtnQkFDaEIsc0JBQXNCLEVBQUUsSUFBSTtnQkFDNUIsd0JBQXdCLEVBQUUsSUFBSTtnQkFDOUIsVUFBVSxFQUFFLGNBQWMsV0FBVyxlQUFlO2FBQ3JEO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0lBRU8sb0JBQW9CLENBQUMsV0FBbUI7UUFDOUMsNkJBQTZCO1FBQzdCLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLHlCQUF5QixFQUFFO1lBQzVELFNBQVMsRUFBRSxXQUFXLFdBQVcsa0JBQWtCO1lBQ25ELGdCQUFnQixFQUFFLCtDQUErQztZQUNqRSxNQUFNLEVBQUUsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQztnQkFDcEMsU0FBUyxFQUFFLFdBQVc7Z0JBQ3RCLFVBQVUsRUFBRSxpQkFBaUI7Z0JBQzdCLGFBQWEsRUFBRTtvQkFDYixNQUFNLEVBQUUsY0FBYyxXQUFXLEVBQUU7b0JBQ25DLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU07b0JBQ3RCLElBQUksRUFBRSxLQUFLO2lCQUNaO2dCQUNELFNBQVMsRUFBRSxLQUFLO2dCQUNoQixNQUFNLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO2FBQ2hDLENBQUM7WUFDRixTQUFTLEVBQUUsR0FBRyxFQUFFLHVEQUF1RDtZQUN2RSxpQkFBaUIsRUFBRSxDQUFDO1lBQ3BCLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsYUFBYTtTQUNwRSxDQUFDLENBQUM7UUFFSCxtRUFBbUU7UUFDbkUsdUVBQXVFO0lBQ3pFLENBQUM7Q0FDRjtBQXpWRCw4Q0F5VkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgd2FmdjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXdhZnYyJztcbmltcG9ydCAqIGFzIGNsb3VkdHJhaWwgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkdHJhaWwnO1xuaW1wb3J0ICogYXMgZ3VhcmRkdXR5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1ndWFyZGR1dHknO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuaW50ZXJmYWNlIFNlY3VyaXR5Q29uc3RydWN0UHJvcHMge1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuICByZWdpb246IHN0cmluZztcbiAgdnBjOiBlYzIuVnBjO1xuICBhcGk6IGFwaWdhdGV3YXkuUmVzdEFwaTtcbiAgZW5hYmxlVnBjRmxvd0xvZ3M6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBTZWN1cml0eUNvbnN0cnVjdCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSB3ZWJBY2w6IHdhZnYyLkNmbldlYkFDTDtcbiAgcHVibGljIHJlYWRvbmx5IGNsb3VkVHJhaWw6IGNsb3VkdHJhaWwuVHJhaWw7XG4gIHB1YmxpYyByZWFkb25seSBndWFyZER1dHlEZXRlY3RvcjogZ3VhcmRkdXR5LkNmbkRldGVjdG9yO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZWN1cml0eUNvbnN0cnVjdFByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQsIHJlZ2lvbiwgdnBjLCBhcGksIGVuYWJsZVZwY0Zsb3dMb2dzIH0gPSBwcm9wcztcblxuICAgIC8vIENyZWF0ZSBTMyBidWNrZXQgZm9yIENsb3VkVHJhaWwgbG9nc1xuICAgIGNvbnN0IGNsb3VkVHJhaWxCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdDbG91ZFRyYWlsQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYHNlcmVueWEtY2xvdWR0cmFpbC0ke2Vudmlyb25tZW50fS0ke2Nkay5Bd3MuQUNDT1VOVF9JRH0tJHtyZWdpb259YCxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRGVsZXRlT2xkTG9ncycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyhlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gOTAgOiAzMCksXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRUcmFpbCBmb3IgQVBJIGF1ZGl0IGxvZ2dpbmdcbiAgICB0aGlzLmNsb3VkVHJhaWwgPSBuZXcgY2xvdWR0cmFpbC5UcmFpbCh0aGlzLCAnQ2xvdWRUcmFpbCcsIHtcbiAgICAgIHRyYWlsTmFtZTogYHNlcmVueWEtJHtlbnZpcm9ubWVudH0tY2xvdWR0cmFpbGAsXG4gICAgICBidWNrZXQ6IGNsb3VkVHJhaWxCdWNrZXQsXG4gICAgICBpbmNsdWRlR2xvYmFsU2VydmljZUV2ZW50czogdHJ1ZSxcbiAgICAgIGlzTXVsdGlSZWdpb25UcmFpbDogZmFsc2UsIC8vIFNpbmdsZSByZWdpb24gZm9yIGNvc3Qgb3B0aW1pemF0aW9uXG4gICAgICBlbmFibGVGaWxlVmFsaWRhdGlvbjogdHJ1ZSxcbiAgICAgIHNlbmRUb0Nsb3VkV2F0Y2hMb2dzOiB0cnVlLFxuICAgICAgY2xvdWRXYXRjaExvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnQ2xvdWRUcmFpbExvZ0dyb3VwJywge1xuICAgICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2Nsb3VkdHJhaWwvc2VyZW55YS0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgIHJldGVudGlvbjogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEggOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICB9KSxcbiAgICAgIG1hbmFnZW1lbnRFdmVudHM6IGNsb3VkdHJhaWwuUmVhZFdyaXRlVHlwZS5BTEwsXG4gICAgICBkYXRhRXZlbnRzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBzM09iamVjdDogY2xvdWR0cmFpbC5TM0V2ZW50VHlwZS5BTEwsXG4gICAgICAgICAgcmVzb3VyY2VzOiBbJ2Fybjphd3M6czM6OjoqLyonXSxcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIFZQQyBGbG93IExvZ3MgZm9yIG5ldHdvcmsgbW9uaXRvcmluZ1xuICAgIGlmIChlbmFibGVWcGNGbG93TG9ncykge1xuICAgICAgY29uc3QgZmxvd0xvZ3NSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdGbG93TG9nc1JvbGUnLCB7XG4gICAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCd2cGMtZmxvdy1sb2dzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgICBGbG93TG9nc0RlbGl2ZXJ5Um9sZVBvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgICAnbG9nczpDcmVhdGVMb2dHcm91cCcsXG4gICAgICAgICAgICAgICAgICAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLFxuICAgICAgICAgICAgICAgICAgJ2xvZ3M6UHV0TG9nRXZlbnRzJyxcbiAgICAgICAgICAgICAgICAgICdsb2dzOkRlc2NyaWJlTG9nR3JvdXBzJyxcbiAgICAgICAgICAgICAgICAgICdsb2dzOkRlc2NyaWJlTG9nU3RyZWFtcycsXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgbmV3IGVjMi5GbG93TG9nKHRoaXMsICdWcGNGbG93TG9ncycsIHtcbiAgICAgICAgcmVzb3VyY2VUeXBlOiBlYzIuRmxvd0xvZ1Jlc291cmNlVHlwZS5mcm9tVnBjKHZwYyksXG4gICAgICAgIGRlc3RpbmF0aW9uOiBlYzIuRmxvd0xvZ0Rlc3RpbmF0aW9uLnRvQ2xvdWRXYXRjaExvZ3MoXG4gICAgICAgICAgbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1ZwY0Zsb3dMb2dzR3JvdXAnLCB7XG4gICAgICAgICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL3ZwYy9mbG93bG9ncy9zZXJlbnlhLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgICAgIHJldGVudGlvbjogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyA6IGxvZ3MuUmV0ZW50aW9uRGF5cy5USFJFRV9EQVlTLFxuICAgICAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBmbG93TG9nc1JvbGVcbiAgICAgICAgKSxcbiAgICAgICAgdHJhZmZpY1R5cGU6IGVjMi5GbG93TG9nVHJhZmZpY1R5cGUuQUxMLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gR3VhcmREdXR5IGZvciB0aHJlYXQgZGV0ZWN0aW9uXG4gICAgdGhpcy5ndWFyZER1dHlEZXRlY3RvciA9IG5ldyBndWFyZGR1dHkuQ2ZuRGV0ZWN0b3IodGhpcywgJ0d1YXJkRHV0eURldGVjdG9yJywge1xuICAgICAgZW5hYmxlOiB0cnVlLFxuICAgICAgZmluZGluZ1B1Ymxpc2hpbmdGcmVxdWVuY3k6ICdGSUZURUVOX01JTlVURVMnLFxuICAgICAgZGF0YVNvdXJjZXM6IHtcbiAgICAgICAgczNMb2dzOiB7IGVuYWJsZTogdHJ1ZSB9LFxuICAgICAgICBrdWJlcm5ldGVzTG9nczogeyBhdWRpdExvZ3M6IHsgZW5hYmxlOiBmYWxzZSB9IH0sIC8vIE5vdCB1c2luZyBFS1NcbiAgICAgICAgbWFsd2FyZVByb3RlY3Rpb246IHsgc2NhbkVjMkluc3RhbmNlV2l0aEZpbmRpbmdzOiB7IGVic1ZvbHVtZXM6IGZhbHNlIH0gfSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBBV1MgV0FGIFdlYiBBQ0xcbiAgICB0aGlzLndlYkFjbCA9IG5ldyB3YWZ2Mi5DZm5XZWJBQ0wodGhpcywgJ1dlYkFDTCcsIHtcbiAgICAgIHNjb3BlOiAnUkVHSU9OQUwnLFxuICAgICAgbmFtZTogYFNlcmVueWFXQUYtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgZGVzY3JpcHRpb246IGBXQUYgcnVsZXMgZm9yIFNlcmVueWEgJHtlbnZpcm9ubWVudH0gQVBJIHByb3RlY3Rpb25gLFxuICAgICAgZGVmYXVsdEFjdGlvbjogeyBhbGxvdzoge30gfSxcbiAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICBtZXRyaWNOYW1lOiBgU2VyZW55YVdBRi0ke2Vudmlyb25tZW50fWAsXG4gICAgICB9LFxuICAgICAgcnVsZXM6IHRoaXMuY3JlYXRlV2FmUnVsZXMoZW52aXJvbm1lbnQpLFxuICAgIH0pO1xuXG4gICAgLy8gQXNzb2NpYXRlIFdBRiB3aXRoIEFQSSBHYXRld2F5XG4gICAgbmV3IHdhZnYyLkNmbldlYkFDTEFzc29jaWF0aW9uKHRoaXMsICdXZWJBQ0xBc3NvY2lhdGlvbicsIHtcbiAgICAgIHJlc291cmNlQXJuOiBhcGkuZGVwbG95bWVudFN0YWdlLnN0YWdlQXJuLFxuICAgICAgd2ViQWNsQXJuOiB0aGlzLndlYkFjbC5hdHRyQXJuLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBBbGFybXMgZm9yIHNlY3VyaXR5IGV2ZW50c1xuICAgIHRoaXMuY3JlYXRlU2VjdXJpdHlBbGFybXMoZW52aXJvbm1lbnQpO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVXYWZSdWxlcyhlbnZpcm9ubWVudDogc3RyaW5nKTogd2FmdjIuQ2ZuV2ViQUNMLlJ1bGVQcm9wZXJ0eVtdIHtcbiAgICBjb25zdCBydWxlczogd2FmdjIuQ2ZuV2ViQUNMLlJ1bGVQcm9wZXJ0eVtdID0gW107XG5cbiAgICAvLyBSdWxlIDE6IEFXUyBNYW5hZ2VkIENvcmUgUnVsZSBTZXRcbiAgICBydWxlcy5wdXNoKHtcbiAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNDb21tb25SdWxlU2V0JyxcbiAgICAgIHByaW9yaXR5OiAxLFxuICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgIG1hbmFnZWRSdWxlR3JvdXBTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICB2ZW5kb3JOYW1lOiAnQVdTJyxcbiAgICAgICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzQ29tbW9uUnVsZVNldCcsXG4gICAgICAgICAgZXhjbHVkZWRSdWxlczogW1xuICAgICAgICAgICAgLy8gRXhjbHVkZSBydWxlcyB0aGF0IG1pZ2h0IGJsb2NrIGxlZ2l0aW1hdGUgaGVhbHRoIGRhdGEgdXBsb2Fkc1xuICAgICAgICAgICAgeyBuYW1lOiAnU2l6ZVJlc3RyaWN0aW9uc19CT0RZJyB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnR2VuZXJpY1JGSV9CT0RZJyB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgb3ZlcnJpZGVBY3Rpb246IHsgbm9uZToge30gfSxcbiAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICBtZXRyaWNOYW1lOiBgU2VyZW55YVdBRi0ke2Vudmlyb25tZW50fS1Db3JlUnVsZVNldGAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gUnVsZSAyOiBLbm93biBiYWQgaW5wdXRzXG4gICAgcnVsZXMucHVzaCh7XG4gICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzS25vd25CYWRJbnB1dHNSdWxlU2V0JyxcbiAgICAgIHByaW9yaXR5OiAyLFxuICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgIG1hbmFnZWRSdWxlR3JvdXBTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICB2ZW5kb3JOYW1lOiAnQVdTJyxcbiAgICAgICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzS25vd25CYWRJbnB1dHNSdWxlU2V0JyxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBvdmVycmlkZUFjdGlvbjogeyBub25lOiB7fSB9LFxuICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIG1ldHJpY05hbWU6IGBTZXJlbnlhV0FGLSR7ZW52aXJvbm1lbnR9LUtub3duQmFkSW5wdXRzYCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBSdWxlIDM6IFNRTCBpbmplY3Rpb24gcHJvdGVjdGlvblxuICAgIHJ1bGVzLnB1c2goe1xuICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc1NRTGlSdWxlU2V0JyxcbiAgICAgIHByaW9yaXR5OiAzLFxuICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgIG1hbmFnZWRSdWxlR3JvdXBTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICB2ZW5kb3JOYW1lOiAnQVdTJyxcbiAgICAgICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzU1FMaVJ1bGVTZXQnLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG92ZXJyaWRlQWN0aW9uOiB7IG5vbmU6IHt9IH0sXG4gICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgbWV0cmljTmFtZTogYFNlcmVueWFXQUYtJHtlbnZpcm9ubWVudH0tU1FMaWAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gUnVsZSA0OiBSYXRlIGxpbWl0aW5nIGZvciBhdXRoZW50aWNhdGVkIHVzZXJzICgyMDAvaG91cilcbiAgICBydWxlcy5wdXNoKHtcbiAgICAgIG5hbWU6ICdBdXRoZW50aWNhdGVkVXNlclJhdGVMaW1pdCcsXG4gICAgICBwcmlvcml0eTogMTAsXG4gICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgcmF0ZUJhc2VkU3RhdGVtZW50OiB7XG4gICAgICAgICAgbGltaXQ6IDIwMCwgLy8gMjAwIHJlcXVlc3RzIHBlciA1LW1pbnV0ZSB3aW5kb3dcbiAgICAgICAgICBhZ2dyZWdhdGVLZXlUeXBlOiAnSVAnLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGFjdGlvbjoge1xuICAgICAgICBibG9jazoge1xuICAgICAgICAgIGN1c3RvbVJlc3BvbnNlOiB7XG4gICAgICAgICAgICByZXNwb25zZUNvZGU6IDQyOSxcbiAgICAgICAgICAgIGN1c3RvbVJlc3BvbnNlQm9keUtleTogJ1JhdGVMaW1pdGVkJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICBtZXRyaWNOYW1lOiBgU2VyZW55YVdBRi0ke2Vudmlyb25tZW50fS1BdXRoUmF0ZUxpbWl0YCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBSdWxlIDU6IFJhdGUgbGltaXRpbmcgZm9yIGFub255bW91cyB1c2VycyAoMjAvaG91cilcbiAgICBydWxlcy5wdXNoKHtcbiAgICAgIG5hbWU6ICdBbm9ueW1vdXNVc2VyUmF0ZUxpbWl0JyxcbiAgICAgIHByaW9yaXR5OiAxMSxcbiAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICBhbmRTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHJhdGVCYXNlZFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgIGxpbWl0OiAyMCwgLy8gMjAgcmVxdWVzdHMgcGVyIDUtbWludXRlIHdpbmRvd1xuICAgICAgICAgICAgICAgIGFnZ3JlZ2F0ZUtleVR5cGU6ICdJUCcsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBub3RTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICAgIGJ5dGVNYXRjaFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgICAgICBzZWFyY2hTdHJpbmc6ICdCZWFyZXInLFxuICAgICAgICAgICAgICAgICAgICBmaWVsZFRvTWF0Y2g6IHsgc2luZ2xlSGVhZGVyOiB7IG5hbWU6ICdhdXRob3JpemF0aW9uJyB9IH0sXG4gICAgICAgICAgICAgICAgICAgIHRleHRUcmFuc2Zvcm1hdGlvbnM6IFt7IHByaW9yaXR5OiAwLCB0eXBlOiAnTk9ORScgfV0sXG4gICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uYWxDb25zdHJhaW50OiAnU1RBUlRTX1dJVEgnLFxuICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGFjdGlvbjoge1xuICAgICAgICBibG9jazoge1xuICAgICAgICAgIGN1c3RvbVJlc3BvbnNlOiB7XG4gICAgICAgICAgICByZXNwb25zZUNvZGU6IDQyOSxcbiAgICAgICAgICAgIGN1c3RvbVJlc3BvbnNlQm9keUtleTogJ1JhdGVMaW1pdGVkJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICBtZXRyaWNOYW1lOiBgU2VyZW55YVdBRi0ke2Vudmlyb25tZW50fS1Bbm9uUmF0ZUxpbWl0YCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBSdWxlIDY6IFJlcXVlc3Qgc2l6ZSBsaW1pdHMgKDEwTUIgbWF4aW11bSlcbiAgICBydWxlcy5wdXNoKHtcbiAgICAgIG5hbWU6ICdSZXF1ZXN0U2l6ZUxpbWl0JyxcbiAgICAgIHByaW9yaXR5OiAxMixcbiAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICBzaXplQ29uc3RyYWludFN0YXRlbWVudDoge1xuICAgICAgICAgIGZpZWxkVG9NYXRjaDogeyBib2R5OiB7fSB9LFxuICAgICAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogJ0dUJyxcbiAgICAgICAgICBzaXplOiAxMDQ4NTc2MCwgLy8gMTBNQiBpbiBieXRlc1xuICAgICAgICAgIHRleHRUcmFuc2Zvcm1hdGlvbnM6IFt7IHByaW9yaXR5OiAwLCB0eXBlOiAnTk9ORScgfV0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgYWN0aW9uOiB7XG4gICAgICAgIGJsb2NrOiB7XG4gICAgICAgICAgY3VzdG9tUmVzcG9uc2U6IHtcbiAgICAgICAgICAgIHJlc3BvbnNlQ29kZTogNDEzLFxuICAgICAgICAgICAgY3VzdG9tUmVzcG9uc2VCb2R5S2V5OiAnUmVxdWVzdFRvb0xhcmdlJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICBtZXRyaWNOYW1lOiBgU2VyZW55YVdBRi0ke2Vudmlyb25tZW50fS1TaXplTGltaXRgLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFJ1bGUgNzogQmxvY2sgc3VzcGljaW91cyB1c2VyIGFnZW50c1xuICAgIHJ1bGVzLnB1c2goe1xuICAgICAgbmFtZTogJ0Jsb2NrU3VzcGljaW91c1VzZXJBZ2VudHMnLFxuICAgICAgcHJpb3JpdHk6IDEzLFxuICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgIG9yU3RhdGVtZW50OiB7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBieXRlTWF0Y2hTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICBzZWFyY2hTdHJpbmc6ICdjdXJsJyxcbiAgICAgICAgICAgICAgICBmaWVsZFRvTWF0Y2g6IHsgc2luZ2xlSGVhZGVyOiB7IG5hbWU6ICd1c2VyLWFnZW50JyB9IH0sXG4gICAgICAgICAgICAgICAgdGV4dFRyYW5zZm9ybWF0aW9uczogW3sgcHJpb3JpdHk6IDAsIHR5cGU6ICdMT1dFUkNBU0UnIH1dLFxuICAgICAgICAgICAgICAgIHBvc2l0aW9uYWxDb25zdHJhaW50OiAnQ09OVEFJTlMnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgYnl0ZU1hdGNoU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgc2VhcmNoU3RyaW5nOiAnd2dldCcsXG4gICAgICAgICAgICAgICAgZmllbGRUb01hdGNoOiB7IHNpbmdsZUhlYWRlcjogeyBuYW1lOiAndXNlci1hZ2VudCcgfSB9LFxuICAgICAgICAgICAgICAgIHRleHRUcmFuc2Zvcm1hdGlvbnM6IFt7IHByaW9yaXR5OiAwLCB0eXBlOiAnTE9XRVJDQVNFJyB9XSxcbiAgICAgICAgICAgICAgICBwb3NpdGlvbmFsQ29uc3RyYWludDogJ0NPTlRBSU5TJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGJ5dGVNYXRjaFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgIHNlYXJjaFN0cmluZzogJ2JvdCcsXG4gICAgICAgICAgICAgICAgZmllbGRUb01hdGNoOiB7IHNpbmdsZUhlYWRlcjogeyBuYW1lOiAndXNlci1hZ2VudCcgfSB9LFxuICAgICAgICAgICAgICAgIHRleHRUcmFuc2Zvcm1hdGlvbnM6IFt7IHByaW9yaXR5OiAwLCB0eXBlOiAnTE9XRVJDQVNFJyB9XSxcbiAgICAgICAgICAgICAgICBwb3NpdGlvbmFsQ29uc3RyYWludDogJ0NPTlRBSU5TJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBhY3Rpb246IHsgYmxvY2s6IHt9IH0sXG4gICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgbWV0cmljTmFtZTogYFNlcmVueWFXQUYtJHtlbnZpcm9ubWVudH0tU3VzcGljaW91c1VBYCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICByZXR1cm4gcnVsZXM7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVNlY3VyaXR5QWxhcm1zKGVudmlyb25tZW50OiBzdHJpbmcpIHtcbiAgICAvLyBXQUYgYmxvY2tlZCByZXF1ZXN0cyBhbGFybVxuICAgIG5ldyBjZGsuYXdzX2Nsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ1dBRkJsb2NrZWRSZXF1ZXN0c0FsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiBgU2VyZW55YS0ke2Vudmlyb25tZW50fS1XQUYtSGlnaEJsb2NrZWRgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0IHdoZW4gV0FGIGJsb2NrcyBoaWdoIG51bWJlciBvZiByZXF1ZXN0cycsXG4gICAgICBtZXRyaWM6IG5ldyBjZGsuYXdzX2Nsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiAnQVdTL1dBRlYyJyxcbiAgICAgICAgbWV0cmljTmFtZTogJ0Jsb2NrZWRSZXF1ZXN0cycsXG4gICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICBXZWJBQ0w6IGBTZXJlbnlhV0FGLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgICBSZWdpb246IGNkay5Bd3MuUkVHSU9OLFxuICAgICAgICAgIFJ1bGU6ICdBTEwnLFxuICAgICAgICB9LFxuICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEwMCwgLy8gQWxlcnQgaWYgbW9yZSB0aGFuIDEwMCByZXF1ZXN0cyBibG9ja2VkIGluIDUgbWludXRlc1xuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjZGsuYXdzX2Nsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgLy8gR3VhcmREdXR5IGZpbmRpbmdzIGFsYXJtIHdvdWxkIHJlcXVpcmUgYWRkaXRpb25hbCBzZXR1cCB3aXRoIFNOU1xuICAgIC8vIENsb3VkVHJhaWwgdW5hdXRob3JpemVkIEFQSSBjYWxscyB3b3VsZCByZXF1aXJlIGN1c3RvbSBtZXRyaWMgZmlsdGVyXG4gIH1cbn0iXX0=