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
exports.VpcConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const constructs_1 = require("constructs");
class VpcConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { environment, region, enablePrivateLink, enableNatGateway } = props;
        // VPC for healthcare-compliant network isolation
        this.vpc = new ec2.Vpc(this, 'SerenyaVpc', {
            maxAzs: 2, // Multi-AZ for high availability
            natGateways: enableNatGateway ? 1 : 0, // Cost optimization
            ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
            enableDnsHostnames: true,
            enableDnsSupport: true,
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'Public',
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                {
                    cidrMask: 24,
                    name: 'Private',
                    subnetType: enableNatGateway ?
                        ec2.SubnetType.PRIVATE_WITH_EGRESS :
                        ec2.SubnetType.PRIVATE_ISOLATED,
                },
                {
                    cidrMask: 24,
                    name: 'Database',
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                },
            ],
        });
        // Security group for VPC endpoints
        this.vpcEndpointSecurityGroup = new ec2.SecurityGroup(this, 'VpcEndpointSecurityGroup', {
            vpc: this.vpc,
            description: 'Security group for VPC endpoints',
            allowAllOutbound: false,
        });
        // Security group for Lambda functions
        this.lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
            vpc: this.vpc,
            description: 'Security group for Lambda functions',
            allowAllOutbound: true,
        });
        // Security group for database
        this.databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
            vpc: this.vpc,
            description: 'Security group for PostgreSQL database',
            allowAllOutbound: false,
        });
        // Allow Lambda to access database on port 5432
        this.databaseSecurityGroup.addIngressRule(this.lambdaSecurityGroup, ec2.Port.tcp(5432), 'Allow Lambda access to PostgreSQL');
        // Allow Lambda to access VPC endpoints
        this.vpcEndpointSecurityGroup.addIngressRule(this.lambdaSecurityGroup, ec2.Port.tcp(443), 'Allow Lambda access to VPC endpoints');
        // Create VPC endpoints for AWS services
        this.createVpcEndpoints(enablePrivateLink);
        // Additional network ACLs for enhanced security
        this.createNetworkAcls();
        // VPC Flow Logs are created in SecurityConstruct
    }
    createVpcEndpoints(enablePrivateLink) {
        // S3 Gateway endpoint (free)
        this.s3VpcEndpoint = this.vpc.addGatewayEndpoint('S3VpcEndpoint', {
            service: ec2.GatewayVpcEndpointAwsService.S3,
            subnets: [
                { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
                { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
            ],
        });
        // Secrets Manager VPC endpoint
        this.secretsManagerVpcEndpoint = this.vpc.addInterfaceEndpoint('SecretsManagerVpcEndpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
            subnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [this.vpcEndpointSecurityGroup],
            privateDnsEnabled: true,
            policyDocument: new iam.PolicyDocument({
                statements: [
                    new iam.PolicyStatement({
                        effect: iam.Effect.ALLOW,
                        principals: [new iam.AnyPrincipal()],
                        actions: [
                            'secretsmanager:GetSecretValue',
                            'secretsmanager:DescribeSecret',
                        ],
                        resources: ['*'],
                        conditions: {
                            StringEquals: {
                                'aws:PrincipalVpc': this.vpc.vpcId,
                            },
                        },
                    }),
                ],
            }),
        });
        // CloudWatch Logs VPC endpoint
        this.vpc.addInterfaceEndpoint('CloudWatchLogsVpcEndpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
            subnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [this.vpcEndpointSecurityGroup],
            privateDnsEnabled: true,
        });
        // CloudWatch Monitoring VPC endpoint
        this.vpc.addInterfaceEndpoint('CloudWatchMonitoringVpcEndpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_MONITORING,
            subnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [this.vpcEndpointSecurityGroup],
            privateDnsEnabled: true,
        });
        // KMS VPC endpoint
        this.vpc.addInterfaceEndpoint('KmsVpcEndpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.KMS,
            subnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [this.vpcEndpointSecurityGroup],
            privateDnsEnabled: true,
        });
        // AWS Bedrock VPC endpoint (if enabled and supported in region)
        if (enablePrivateLink) {
            try {
                this.bedrockVpcEndpoint = this.vpc.addInterfaceEndpoint('BedrockVpcEndpoint', {
                    service: new ec2.InterfaceVpcEndpointService(`com.amazonaws.${cdk.Aws.REGION}.bedrock-runtime`),
                    subnets: {
                        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    },
                    securityGroups: [this.vpcEndpointSecurityGroup],
                    privateDnsEnabled: true,
                    policyDocument: new iam.PolicyDocument({
                        statements: [
                            new iam.PolicyStatement({
                                effect: iam.Effect.ALLOW,
                                principals: [new iam.AnyPrincipal()],
                                actions: [
                                    'bedrock:InvokeModel',
                                    'bedrock:InvokeModelWithResponseStream',
                                ],
                                resources: ['*'],
                                conditions: {
                                    StringEquals: {
                                        'aws:PrincipalVpc': this.vpc.vpcId,
                                    },
                                },
                            }),
                        ],
                    }),
                });
            }
            catch (error) {
                // Bedrock VPC endpoints may not be available in all regions
                console.warn('Bedrock VPC endpoint not available in this region:', error);
            }
        }
    }
    createNetworkAcls() {
        // Network ACL for private subnets with additional security
        const privateNetworkAcl = new ec2.NetworkAcl(this, 'PrivateNetworkAcl', {
            vpc: this.vpc,
            networkAclName: 'serenya-private-nacl',
        });
        // Allow inbound HTTPS traffic
        privateNetworkAcl.addEntry('AllowInboundHttps', {
            ruleNumber: 100,
            protocol: ec2.AclProtocol.TCP,
            ruleAction: ec2.AclTrafficDirection.INGRESS,
            cidr: ec2.AclCidr.ipv4('10.0.0.0/16'),
            portRange: { from: 443, to: 443 },
        });
        // Allow inbound PostgreSQL traffic
        privateNetworkAcl.addEntry('AllowInboundPostgreSQL', {
            ruleNumber: 110,
            protocol: ec2.AclProtocol.TCP,
            ruleAction: ec2.AclTrafficDirection.INGRESS,
            cidr: ec2.AclCidr.ipv4('10.0.0.0/16'),
            portRange: { from: 5432, to: 5432 },
        });
        // Allow ephemeral ports for return traffic
        privateNetworkAcl.addEntry('AllowInboundEphemeral', {
            ruleNumber: 120,
            protocol: ec2.AclProtocol.TCP,
            ruleAction: ec2.AclTrafficDirection.INGRESS,
            cidr: ec2.AclCidr.ipv4('0.0.0.0/0'),
            portRange: { from: 1024, to: 65535 },
        });
        // Allow outbound HTTPS traffic
        privateNetworkAcl.addEntry('AllowOutboundHttps', {
            ruleNumber: 100,
            protocol: ec2.AclProtocol.TCP,
            ruleAction: ec2.AclTrafficDirection.EGRESS,
            cidr: ec2.AclCidr.ipv4('0.0.0.0/0'),
            portRange: { from: 443, to: 443 },
        });
        // Allow outbound PostgreSQL traffic
        privateNetworkAcl.addEntry('AllowOutboundPostgreSQL', {
            ruleNumber: 110,
            protocol: ec2.AclProtocol.TCP,
            ruleAction: ec2.AclTrafficDirection.EGRESS,
            cidr: ec2.AclCidr.ipv4('10.0.0.0/16'),
            portRange: { from: 5432, to: 5432 },
        });
        // Associate with private subnets
        this.vpc.privateSubnets.forEach((subnet, index) => {
            new ec2.SubnetNetworkAclAssociation(this, `PrivateSubnetNaclAssoc${index}`, {
                networkAcl: privateNetworkAcl,
                subnet: subnet,
            });
        });
        // Network ACL for database subnets (more restrictive)
        const databaseNetworkAcl = new ec2.NetworkAcl(this, 'DatabaseNetworkAcl', {
            vpc: this.vpc,
            networkAclName: 'serenya-database-nacl',
        });
        // Only allow PostgreSQL traffic from private subnets
        databaseNetworkAcl.addEntry('AllowPostgreSQLFromPrivate', {
            ruleNumber: 100,
            protocol: ec2.AclProtocol.TCP,
            ruleAction: ec2.AclTrafficDirection.INGRESS,
            cidr: ec2.AclCidr.ipv4('10.0.1.0/24'), // Private subnet CIDR
            portRange: { from: 5432, to: 5432 },
        });
        // Allow ephemeral ports for return traffic
        databaseNetworkAcl.addEntry('AllowEphemeralOutbound', {
            ruleNumber: 100,
            protocol: ec2.AclProtocol.TCP,
            ruleAction: ec2.AclTrafficDirection.EGRESS,
            cidr: ec2.AclCidr.ipv4('10.0.1.0/24'),
            portRange: { from: 1024, to: 65535 },
        });
        // Associate with isolated subnets
        this.vpc.isolatedSubnets.forEach((subnet, index) => {
            new ec2.SubnetNetworkAclAssociation(this, `IsolatedSubnetNaclAssoc${index}`, {
                networkAcl: databaseNetworkAcl,
                subnet: subnet,
            });
        });
    }
    /**
     * Create additional security groups for specific services
     */
    createServiceSecurityGroup(serviceName, allowedPorts) {
        const securityGroup = new ec2.SecurityGroup(this, `${serviceName}SecurityGroup`, {
            vpc: this.vpc,
            description: `Security group for ${serviceName}`,
            allowAllOutbound: false,
        });
        // Allow access from Lambda security group
        allowedPorts.forEach(port => {
            securityGroup.addIngressRule(this.lambdaSecurityGroup, ec2.Port.tcp(port), `Allow Lambda access to ${serviceName} on port ${port}`);
        });
        return securityGroup;
    }
}
exports.VpcConstruct = VpcConstruct;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidnBjLWNvbnN0cnVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL2luZnJhc3RydWN0dXJlL191bnVzZWQvdnBjLWNvbnN0cnVjdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQywyQ0FBdUM7QUFTdkMsTUFBYSxZQUFhLFNBQVEsc0JBQVM7SUFTekMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF3QjtRQUNoRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRTNFLGlEQUFpRDtRQUNqRCxJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ3pDLE1BQU0sRUFBRSxDQUFDLEVBQUUsaUNBQWlDO1lBQzVDLFdBQVcsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsb0JBQW9CO1lBQzNELFdBQVcsRUFBRSxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUM7WUFDaEQsa0JBQWtCLEVBQUUsSUFBSTtZQUN4QixnQkFBZ0IsRUFBRSxJQUFJO1lBQ3RCLG1CQUFtQixFQUFFO2dCQUNuQjtvQkFDRSxRQUFRLEVBQUUsRUFBRTtvQkFDWixJQUFJLEVBQUUsUUFBUTtvQkFDZCxVQUFVLEVBQUUsR0FBRyxDQUFDLFVBQVUsQ0FBQyxNQUFNO2lCQUNsQztnQkFDRDtvQkFDRSxRQUFRLEVBQUUsRUFBRTtvQkFDWixJQUFJLEVBQUUsU0FBUztvQkFDZixVQUFVLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQzt3QkFDNUIsR0FBRyxDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO3dCQUNwQyxHQUFHLENBQUMsVUFBVSxDQUFDLGdCQUFnQjtpQkFDbEM7Z0JBQ0Q7b0JBQ0UsUUFBUSxFQUFFLEVBQUU7b0JBQ1osSUFBSSxFQUFFLFVBQVU7b0JBQ2hCLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLGdCQUFnQjtpQkFDNUM7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILG1DQUFtQztRQUNuQyxJQUFJLENBQUMsd0JBQXdCLEdBQUcsSUFBSSxHQUFHLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSwwQkFBMEIsRUFBRTtZQUN0RixHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUc7WUFDYixXQUFXLEVBQUUsa0NBQWtDO1lBQy9DLGdCQUFnQixFQUFFLEtBQUs7U0FDeEIsQ0FBQyxDQUFDO1FBRUgsc0NBQXNDO1FBQ3RDLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLHFCQUFxQixFQUFFO1lBQzVFLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRztZQUNiLFdBQVcsRUFBRSxxQ0FBcUM7WUFDbEQsZ0JBQWdCLEVBQUUsSUFBSTtTQUN2QixDQUFDLENBQUM7UUFFSCw4QkFBOEI7UUFDOUIsSUFBSSxDQUFDLHFCQUFxQixHQUFHLElBQUksR0FBRyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDaEYsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHO1lBQ2IsV0FBVyxFQUFFLHdDQUF3QztZQUNyRCxnQkFBZ0IsRUFBRSxLQUFLO1NBQ3hCLENBQUMsQ0FBQztRQUVILCtDQUErQztRQUMvQyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUN2QyxJQUFJLENBQUMsbUJBQW1CLEVBQ3hCLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUNsQixtQ0FBbUMsQ0FDcEMsQ0FBQztRQUVGLHVDQUF1QztRQUN2QyxJQUFJLENBQUMsd0JBQXdCLENBQUMsY0FBYyxDQUMxQyxJQUFJLENBQUMsbUJBQW1CLEVBQ3hCLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUNqQixzQ0FBc0MsQ0FDdkMsQ0FBQztRQUVGLHdDQUF3QztRQUN4QyxJQUFJLENBQUMsa0JBQWtCLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUUzQyxnREFBZ0Q7UUFDaEQsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFFekIsaURBQWlEO0lBQ25ELENBQUM7SUFFTyxrQkFBa0IsQ0FBQyxpQkFBMEI7UUFDbkQsNkJBQTZCO1FBQzdCLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxlQUFlLEVBQUU7WUFDaEUsT0FBTyxFQUFFLEdBQUcsQ0FBQyw0QkFBNEIsQ0FBQyxFQUFFO1lBQzVDLE9BQU8sRUFBRTtnQkFDUCxFQUFFLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLG1CQUFtQixFQUFFO2dCQUNsRCxFQUFFLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLGdCQUFnQixFQUFFO2FBQ2hEO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsK0JBQStCO1FBQy9CLElBQUksQ0FBQyx5QkFBeUIsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLDJCQUEyQixFQUFFO1lBQzFGLE9BQU8sRUFBRSxHQUFHLENBQUMsOEJBQThCLENBQUMsZUFBZTtZQUMzRCxPQUFPLEVBQUU7Z0JBQ1AsVUFBVSxFQUFFLEdBQUcsQ0FBQyxVQUFVLENBQUMsbUJBQW1CO2FBQy9DO1lBQ0QsY0FBYyxFQUFFLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDO1lBQy9DLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsY0FBYyxFQUFFLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQztnQkFDckMsVUFBVSxFQUFFO29CQUNWLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQzt3QkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSzt3QkFDeEIsVUFBVSxFQUFFLENBQUMsSUFBSSxHQUFHLENBQUMsWUFBWSxFQUFFLENBQUM7d0JBQ3BDLE9BQU8sRUFBRTs0QkFDUCwrQkFBK0I7NEJBQy9CLCtCQUErQjt5QkFDaEM7d0JBQ0QsU0FBUyxFQUFFLENBQUMsR0FBRyxDQUFDO3dCQUNoQixVQUFVLEVBQUU7NEJBQ1YsWUFBWSxFQUFFO2dDQUNaLGtCQUFrQixFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSzs2QkFDbkM7eUJBQ0Y7cUJBQ0YsQ0FBQztpQkFDSDthQUNGLENBQUM7U0FDSCxDQUFDLENBQUM7UUFFSCwrQkFBK0I7UUFDL0IsSUFBSSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQywyQkFBMkIsRUFBRTtZQUN6RCxPQUFPLEVBQUUsR0FBRyxDQUFDLDhCQUE4QixDQUFDLGVBQWU7WUFDM0QsT0FBTyxFQUFFO2dCQUNQLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLG1CQUFtQjthQUMvQztZQUNELGNBQWMsRUFBRSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQztZQUMvQyxpQkFBaUIsRUFBRSxJQUFJO1NBQ3hCLENBQUMsQ0FBQztRQUVILHFDQUFxQztRQUNyQyxJQUFJLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGlDQUFpQyxFQUFFO1lBQy9ELE9BQU8sRUFBRSxHQUFHLENBQUMsOEJBQThCLENBQUMscUJBQXFCO1lBQ2pFLE9BQU8sRUFBRTtnQkFDUCxVQUFVLEVBQUUsR0FBRyxDQUFDLFVBQVUsQ0FBQyxtQkFBbUI7YUFDL0M7WUFDRCxjQUFjLEVBQUUsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUM7WUFDL0MsaUJBQWlCLEVBQUUsSUFBSTtTQUN4QixDQUFDLENBQUM7UUFFSCxtQkFBbUI7UUFDbkIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxnQkFBZ0IsRUFBRTtZQUM5QyxPQUFPLEVBQUUsR0FBRyxDQUFDLDhCQUE4QixDQUFDLEdBQUc7WUFDL0MsT0FBTyxFQUFFO2dCQUNQLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLG1CQUFtQjthQUMvQztZQUNELGNBQWMsRUFBRSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQztZQUMvQyxpQkFBaUIsRUFBRSxJQUFJO1NBQ3hCLENBQUMsQ0FBQztRQUVILGdFQUFnRTtRQUNoRSxJQUFJLGlCQUFpQixFQUFFLENBQUM7WUFDdEIsSUFBSSxDQUFDO2dCQUNILElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLG9CQUFvQixFQUFFO29CQUM1RSxPQUFPLEVBQUUsSUFBSSxHQUFHLENBQUMsMkJBQTJCLENBQUMsaUJBQWlCLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxrQkFBa0IsQ0FBQztvQkFDL0YsT0FBTyxFQUFFO3dCQUNQLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLG1CQUFtQjtxQkFDL0M7b0JBQ0QsY0FBYyxFQUFFLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDO29CQUMvQyxpQkFBaUIsRUFBRSxJQUFJO29CQUN2QixjQUFjLEVBQUUsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDO3dCQUNyQyxVQUFVLEVBQUU7NEJBQ1YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO2dDQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO2dDQUN4QixVQUFVLEVBQUUsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQ0FDcEMsT0FBTyxFQUFFO29DQUNQLHFCQUFxQjtvQ0FDckIsdUNBQXVDO2lDQUN4QztnQ0FDRCxTQUFTLEVBQUUsQ0FBQyxHQUFHLENBQUM7Z0NBQ2hCLFVBQVUsRUFBRTtvQ0FDVixZQUFZLEVBQUU7d0NBQ1osa0JBQWtCLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLO3FDQUNuQztpQ0FDRjs2QkFDRixDQUFDO3lCQUNIO3FCQUNGLENBQUM7aUJBQ0gsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2YsNERBQTREO2dCQUM1RCxPQUFPLENBQUMsSUFBSSxDQUFDLG9EQUFvRCxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzVFLENBQUM7UUFDSCxDQUFDO0lBQ0gsQ0FBQztJQUVPLGlCQUFpQjtRQUN2QiwyREFBMkQ7UUFDM0QsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQ3RFLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRztZQUNiLGNBQWMsRUFBRSxzQkFBc0I7U0FDdkMsQ0FBQyxDQUFDO1FBRUgsOEJBQThCO1FBQzlCLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRTtZQUM5QyxVQUFVLEVBQUUsR0FBRztZQUNmLFFBQVEsRUFBRSxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUc7WUFDN0IsVUFBVSxFQUFFLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPO1lBQzNDLElBQUksRUFBRSxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUM7WUFDckMsU0FBUyxFQUFFLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFO1NBQ2xDLENBQUMsQ0FBQztRQUVILG1DQUFtQztRQUNuQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsd0JBQXdCLEVBQUU7WUFDbkQsVUFBVSxFQUFFLEdBQUc7WUFDZixRQUFRLEVBQUUsR0FBRyxDQUFDLFdBQVcsQ0FBQyxHQUFHO1lBQzdCLFVBQVUsRUFBRSxHQUFHLENBQUMsbUJBQW1CLENBQUMsT0FBTztZQUMzQyxJQUFJLEVBQUUsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDO1lBQ3JDLFNBQVMsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRTtTQUNwQyxDQUFDLENBQUM7UUFFSCwyQ0FBMkM7UUFDM0MsaUJBQWlCLENBQUMsUUFBUSxDQUFDLHVCQUF1QixFQUFFO1lBQ2xELFVBQVUsRUFBRSxHQUFHO1lBQ2YsUUFBUSxFQUFFLEdBQUcsQ0FBQyxXQUFXLENBQUMsR0FBRztZQUM3QixVQUFVLEVBQUUsR0FBRyxDQUFDLG1CQUFtQixDQUFDLE9BQU87WUFDM0MsSUFBSSxFQUFFLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQztZQUNuQyxTQUFTLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUU7U0FDckMsQ0FBQyxDQUFDO1FBRUgsK0JBQStCO1FBQy9CLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRTtZQUMvQyxVQUFVLEVBQUUsR0FBRztZQUNmLFFBQVEsRUFBRSxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUc7WUFDN0IsVUFBVSxFQUFFLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNO1lBQzFDLElBQUksRUFBRSxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUM7WUFDbkMsU0FBUyxFQUFFLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFO1NBQ2xDLENBQUMsQ0FBQztRQUVILG9DQUFvQztRQUNwQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMseUJBQXlCLEVBQUU7WUFDcEQsVUFBVSxFQUFFLEdBQUc7WUFDZixRQUFRLEVBQUUsR0FBRyxDQUFDLFdBQVcsQ0FBQyxHQUFHO1lBQzdCLFVBQVUsRUFBRSxHQUFHLENBQUMsbUJBQW1CLENBQUMsTUFBTTtZQUMxQyxJQUFJLEVBQUUsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDO1lBQ3JDLFNBQVMsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRTtTQUNwQyxDQUFDLENBQUM7UUFFSCxpQ0FBaUM7UUFDakMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ2hELElBQUksR0FBRyxDQUFDLDJCQUEyQixDQUFDLElBQUksRUFBRSx5QkFBeUIsS0FBSyxFQUFFLEVBQUU7Z0JBQzFFLFVBQVUsRUFBRSxpQkFBaUI7Z0JBQzdCLE1BQU0sRUFBRSxNQUFNO2FBQ2YsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxzREFBc0Q7UUFDdEQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ3hFLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRztZQUNiLGNBQWMsRUFBRSx1QkFBdUI7U0FDeEMsQ0FBQyxDQUFDO1FBRUgscURBQXFEO1FBQ3JELGtCQUFrQixDQUFDLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRTtZQUN4RCxVQUFVLEVBQUUsR0FBRztZQUNmLFFBQVEsRUFBRSxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUc7WUFDN0IsVUFBVSxFQUFFLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPO1lBQzNDLElBQUksRUFBRSxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsRUFBRSxzQkFBc0I7WUFDN0QsU0FBUyxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFO1NBQ3BDLENBQUMsQ0FBQztRQUVILDJDQUEyQztRQUMzQyxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsd0JBQXdCLEVBQUU7WUFDcEQsVUFBVSxFQUFFLEdBQUc7WUFDZixRQUFRLEVBQUUsR0FBRyxDQUFDLFdBQVcsQ0FBQyxHQUFHO1lBQzdCLFVBQVUsRUFBRSxHQUFHLENBQUMsbUJBQW1CLENBQUMsTUFBTTtZQUMxQyxJQUFJLEVBQUUsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDO1lBQ3JDLFNBQVMsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRTtTQUNyQyxDQUFDLENBQUM7UUFFSCxrQ0FBa0M7UUFDbEMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ2pELElBQUksR0FBRyxDQUFDLDJCQUEyQixDQUFDLElBQUksRUFBRSwwQkFBMEIsS0FBSyxFQUFFLEVBQUU7Z0JBQzNFLFVBQVUsRUFBRSxrQkFBa0I7Z0JBQzlCLE1BQU0sRUFBRSxNQUFNO2FBQ2YsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQ7O09BRUc7SUFDSCwwQkFBMEIsQ0FBQyxXQUFtQixFQUFFLFlBQXNCO1FBQ3BFLE1BQU0sYUFBYSxHQUFHLElBQUksR0FBRyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsR0FBRyxXQUFXLGVBQWUsRUFBRTtZQUMvRSxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUc7WUFDYixXQUFXLEVBQUUsc0JBQXNCLFdBQVcsRUFBRTtZQUNoRCxnQkFBZ0IsRUFBRSxLQUFLO1NBQ3hCLENBQUMsQ0FBQztRQUVILDBDQUEwQztRQUMxQyxZQUFZLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQzFCLGFBQWEsQ0FBQyxjQUFjLENBQzFCLElBQUksQ0FBQyxtQkFBbUIsRUFDeEIsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQ2xCLDBCQUEwQixXQUFXLFlBQVksSUFBSSxFQUFFLENBQ3hELENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILE9BQU8sYUFBYSxDQUFDO0lBQ3ZCLENBQUM7Q0FDRjtBQWhURCxvQ0FnVEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmludGVyZmFjZSBWcGNDb25zdHJ1Y3RQcm9wcyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG4gIHJlZ2lvbjogc3RyaW5nO1xuICBlbmFibGVQcml2YXRlTGluazogYm9vbGVhbjtcbiAgZW5hYmxlTmF0R2F0ZXdheTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFZwY0NvbnN0cnVjdCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSB2cGM6IGVjMi5WcGM7XG4gIHB1YmxpYyByZWFkb25seSBiZWRyb2NrVnBjRW5kcG9pbnQ/OiBlYzIuVnBjRW5kcG9pbnQ7XG4gIHB1YmxpYyByZWFkb25seSBzM1ZwY0VuZHBvaW50OiBlYzIuVnBjRW5kcG9pbnQ7XG4gIHB1YmxpYyByZWFkb25seSBzZWNyZXRzTWFuYWdlclZwY0VuZHBvaW50OiBlYzIuVnBjRW5kcG9pbnQ7XG4gIHB1YmxpYyByZWFkb25seSBsYW1iZGFTZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cDtcbiAgcHVibGljIHJlYWRvbmx5IGRhdGFiYXNlU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXA7XG4gIHB1YmxpYyByZWFkb25seSB2cGNFbmRwb2ludFNlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBWcGNDb25zdHJ1Y3RQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCB7IGVudmlyb25tZW50LCByZWdpb24sIGVuYWJsZVByaXZhdGVMaW5rLCBlbmFibGVOYXRHYXRld2F5IH0gPSBwcm9wcztcblxuICAgIC8vIFZQQyBmb3IgaGVhbHRoY2FyZS1jb21wbGlhbnQgbmV0d29yayBpc29sYXRpb25cbiAgICB0aGlzLnZwYyA9IG5ldyBlYzIuVnBjKHRoaXMsICdTZXJlbnlhVnBjJywge1xuICAgICAgbWF4QXpzOiAyLCAvLyBNdWx0aS1BWiBmb3IgaGlnaCBhdmFpbGFiaWxpdHlcbiAgICAgIG5hdEdhdGV3YXlzOiBlbmFibGVOYXRHYXRld2F5ID8gMSA6IDAsIC8vIENvc3Qgb3B0aW1pemF0aW9uXG4gICAgICBpcEFkZHJlc3NlczogZWMyLklwQWRkcmVzc2VzLmNpZHIoJzEwLjAuMC4wLzE2JyksXG4gICAgICBlbmFibGVEbnNIb3N0bmFtZXM6IHRydWUsXG4gICAgICBlbmFibGVEbnNTdXBwb3J0OiB0cnVlLFxuICAgICAgc3VibmV0Q29uZmlndXJhdGlvbjogW1xuICAgICAgICB7XG4gICAgICAgICAgY2lkck1hc2s6IDI0LFxuICAgICAgICAgIG5hbWU6ICdQdWJsaWMnLFxuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQyxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGNpZHJNYXNrOiAyNCxcbiAgICAgICAgICBuYW1lOiAnUHJpdmF0ZScsXG4gICAgICAgICAgc3VibmV0VHlwZTogZW5hYmxlTmF0R2F0ZXdheSA/IFxuICAgICAgICAgICAgZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyA6IFxuICAgICAgICAgICAgZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGNpZHJNYXNrOiAyNCxcbiAgICAgICAgICBuYW1lOiAnRGF0YWJhc2UnLFxuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gU2VjdXJpdHkgZ3JvdXAgZm9yIFZQQyBlbmRwb2ludHNcbiAgICB0aGlzLnZwY0VuZHBvaW50U2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnVnBjRW5kcG9pbnRTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIFZQQyBlbmRwb2ludHMnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2UsXG4gICAgfSk7XG5cbiAgICAvLyBTZWN1cml0eSBncm91cCBmb3IgTGFtYmRhIGZ1bmN0aW9uc1xuICAgIHRoaXMubGFtYmRhU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnTGFtYmRhU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBMYW1iZGEgZnVuY3Rpb25zJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBTZWN1cml0eSBncm91cCBmb3IgZGF0YWJhc2VcbiAgICB0aGlzLmRhdGFiYXNlU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnRGF0YWJhc2VTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIFBvc3RncmVTUUwgZGF0YWJhc2UnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2UsXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBMYW1iZGEgdG8gYWNjZXNzIGRhdGFiYXNlIG9uIHBvcnQgNTQzMlxuICAgIHRoaXMuZGF0YWJhc2VTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgdGhpcy5sYW1iZGFTZWN1cml0eUdyb3VwLFxuICAgICAgZWMyLlBvcnQudGNwKDU0MzIpLFxuICAgICAgJ0FsbG93IExhbWJkYSBhY2Nlc3MgdG8gUG9zdGdyZVNRTCdcbiAgICApO1xuXG4gICAgLy8gQWxsb3cgTGFtYmRhIHRvIGFjY2VzcyBWUEMgZW5kcG9pbnRzXG4gICAgdGhpcy52cGNFbmRwb2ludFNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICB0aGlzLmxhbWJkYVNlY3VyaXR5R3JvdXAsXG4gICAgICBlYzIuUG9ydC50Y3AoNDQzKSxcbiAgICAgICdBbGxvdyBMYW1iZGEgYWNjZXNzIHRvIFZQQyBlbmRwb2ludHMnXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBWUEMgZW5kcG9pbnRzIGZvciBBV1Mgc2VydmljZXNcbiAgICB0aGlzLmNyZWF0ZVZwY0VuZHBvaW50cyhlbmFibGVQcml2YXRlTGluayk7XG5cbiAgICAvLyBBZGRpdGlvbmFsIG5ldHdvcmsgQUNMcyBmb3IgZW5oYW5jZWQgc2VjdXJpdHlcbiAgICB0aGlzLmNyZWF0ZU5ldHdvcmtBY2xzKCk7XG5cbiAgICAvLyBWUEMgRmxvdyBMb2dzIGFyZSBjcmVhdGVkIGluIFNlY3VyaXR5Q29uc3RydWN0XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVZwY0VuZHBvaW50cyhlbmFibGVQcml2YXRlTGluazogYm9vbGVhbikge1xuICAgIC8vIFMzIEdhdGV3YXkgZW5kcG9pbnQgKGZyZWUpXG4gICAgdGhpcy5zM1ZwY0VuZHBvaW50ID0gdGhpcy52cGMuYWRkR2F0ZXdheUVuZHBvaW50KCdTM1ZwY0VuZHBvaW50Jywge1xuICAgICAgc2VydmljZTogZWMyLkdhdGV3YXlWcGNFbmRwb2ludEF3c1NlcnZpY2UuUzMsXG4gICAgICBzdWJuZXRzOiBbXG4gICAgICAgIHsgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyB9LFxuICAgICAgICB7IHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBTZWNyZXRzIE1hbmFnZXIgVlBDIGVuZHBvaW50XG4gICAgdGhpcy5zZWNyZXRzTWFuYWdlclZwY0VuZHBvaW50ID0gdGhpcy52cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ1NlY3JldHNNYW5hZ2VyVnBjRW5kcG9pbnQnLCB7XG4gICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNFQ1JFVFNfTUFOQUdFUixcbiAgICAgIHN1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW3RoaXMudnBjRW5kcG9pbnRTZWN1cml0eUdyb3VwXSxcbiAgICAgIHByaXZhdGVEbnNFbmFibGVkOiB0cnVlLFxuICAgICAgcG9saWN5RG9jdW1lbnQ6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uQW55UHJpbmNpcGFsKCldLFxuICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6R2V0U2VjcmV0VmFsdWUnLFxuICAgICAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6RGVzY3JpYmVTZWNyZXQnLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgICAgICdhd3M6UHJpbmNpcGFsVnBjJzogdGhpcy52cGMudnBjSWQsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgfSksXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIExvZ3MgVlBDIGVuZHBvaW50XG4gICAgdGhpcy52cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ0Nsb3VkV2F0Y2hMb2dzVnBjRW5kcG9pbnQnLCB7XG4gICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLkNMT1VEV0FUQ0hfTE9HUyxcbiAgICAgIHN1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW3RoaXMudnBjRW5kcG9pbnRTZWN1cml0eUdyb3VwXSxcbiAgICAgIHByaXZhdGVEbnNFbmFibGVkOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBNb25pdG9yaW5nIFZQQyBlbmRwb2ludFxuICAgIHRoaXMudnBjLmFkZEludGVyZmFjZUVuZHBvaW50KCdDbG91ZFdhdGNoTW9uaXRvcmluZ1ZwY0VuZHBvaW50Jywge1xuICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5DTE9VRFdBVENIX01PTklUT1JJTkcsXG4gICAgICBzdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFt0aGlzLnZwY0VuZHBvaW50U2VjdXJpdHlHcm91cF0sXG4gICAgICBwcml2YXRlRG5zRW5hYmxlZDogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIEtNUyBWUEMgZW5kcG9pbnRcbiAgICB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludCgnS21zVnBjRW5kcG9pbnQnLCB7XG4gICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLktNUyxcbiAgICAgIHN1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW3RoaXMudnBjRW5kcG9pbnRTZWN1cml0eUdyb3VwXSxcbiAgICAgIHByaXZhdGVEbnNFbmFibGVkOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQVdTIEJlZHJvY2sgVlBDIGVuZHBvaW50IChpZiBlbmFibGVkIGFuZCBzdXBwb3J0ZWQgaW4gcmVnaW9uKVxuICAgIGlmIChlbmFibGVQcml2YXRlTGluaykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgdGhpcy5iZWRyb2NrVnBjRW5kcG9pbnQgPSB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludCgnQmVkcm9ja1ZwY0VuZHBvaW50Jywge1xuICAgICAgICAgIHNlcnZpY2U6IG5ldyBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRTZXJ2aWNlKGBjb20uYW1hem9uYXdzLiR7Y2RrLkF3cy5SRUdJT059LmJlZHJvY2stcnVudGltZWApLFxuICAgICAgICAgIHN1Ym5ldHM6IHtcbiAgICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBzZWN1cml0eUdyb3VwczogW3RoaXMudnBjRW5kcG9pbnRTZWN1cml0eUdyb3VwXSxcbiAgICAgICAgICBwcml2YXRlRG5zRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBwb2xpY3lEb2N1bWVudDogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uQW55UHJpbmNpcGFsKCldLFxuICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICdiZWRyb2NrOkludm9rZU1vZGVsJyxcbiAgICAgICAgICAgICAgICAgICdiZWRyb2NrOkludm9rZU1vZGVsV2l0aFJlc3BvbnNlU3RyZWFtJyxcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICAgICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAgICAgICAgICdhd3M6UHJpbmNpcGFsVnBjJzogdGhpcy52cGMudnBjSWQsXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAvLyBCZWRyb2NrIFZQQyBlbmRwb2ludHMgbWF5IG5vdCBiZSBhdmFpbGFibGUgaW4gYWxsIHJlZ2lvbnNcbiAgICAgICAgY29uc29sZS53YXJuKCdCZWRyb2NrIFZQQyBlbmRwb2ludCBub3QgYXZhaWxhYmxlIGluIHRoaXMgcmVnaW9uOicsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZU5ldHdvcmtBY2xzKCkge1xuICAgIC8vIE5ldHdvcmsgQUNMIGZvciBwcml2YXRlIHN1Ym5ldHMgd2l0aCBhZGRpdGlvbmFsIHNlY3VyaXR5XG4gICAgY29uc3QgcHJpdmF0ZU5ldHdvcmtBY2wgPSBuZXcgZWMyLk5ldHdvcmtBY2wodGhpcywgJ1ByaXZhdGVOZXR3b3JrQWNsJywge1xuICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgIG5ldHdvcmtBY2xOYW1lOiAnc2VyZW55YS1wcml2YXRlLW5hY2wnLFxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgaW5ib3VuZCBIVFRQUyB0cmFmZmljXG4gICAgcHJpdmF0ZU5ldHdvcmtBY2wuYWRkRW50cnkoJ0FsbG93SW5ib3VuZEh0dHBzJywge1xuICAgICAgcnVsZU51bWJlcjogMTAwLFxuICAgICAgcHJvdG9jb2w6IGVjMi5BY2xQcm90b2NvbC5UQ1AsXG4gICAgICBydWxlQWN0aW9uOiBlYzIuQWNsVHJhZmZpY0RpcmVjdGlvbi5JTkdSRVNTLFxuICAgICAgY2lkcjogZWMyLkFjbENpZHIuaXB2NCgnMTAuMC4wLjAvMTYnKSxcbiAgICAgIHBvcnRSYW5nZTogeyBmcm9tOiA0NDMsIHRvOiA0NDMgfSxcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IGluYm91bmQgUG9zdGdyZVNRTCB0cmFmZmljXG4gICAgcHJpdmF0ZU5ldHdvcmtBY2wuYWRkRW50cnkoJ0FsbG93SW5ib3VuZFBvc3RncmVTUUwnLCB7XG4gICAgICBydWxlTnVtYmVyOiAxMTAsXG4gICAgICBwcm90b2NvbDogZWMyLkFjbFByb3RvY29sLlRDUCxcbiAgICAgIHJ1bGVBY3Rpb246IGVjMi5BY2xUcmFmZmljRGlyZWN0aW9uLklOR1JFU1MsXG4gICAgICBjaWRyOiBlYzIuQWNsQ2lkci5pcHY0KCcxMC4wLjAuMC8xNicpLFxuICAgICAgcG9ydFJhbmdlOiB7IGZyb206IDU0MzIsIHRvOiA1NDMyIH0sXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBlcGhlbWVyYWwgcG9ydHMgZm9yIHJldHVybiB0cmFmZmljXG4gICAgcHJpdmF0ZU5ldHdvcmtBY2wuYWRkRW50cnkoJ0FsbG93SW5ib3VuZEVwaGVtZXJhbCcsIHtcbiAgICAgIHJ1bGVOdW1iZXI6IDEyMCxcbiAgICAgIHByb3RvY29sOiBlYzIuQWNsUHJvdG9jb2wuVENQLFxuICAgICAgcnVsZUFjdGlvbjogZWMyLkFjbFRyYWZmaWNEaXJlY3Rpb24uSU5HUkVTUyxcbiAgICAgIGNpZHI6IGVjMi5BY2xDaWRyLmlwdjQoJzAuMC4wLjAvMCcpLFxuICAgICAgcG9ydFJhbmdlOiB7IGZyb206IDEwMjQsIHRvOiA2NTUzNSB9LFxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgb3V0Ym91bmQgSFRUUFMgdHJhZmZpY1xuICAgIHByaXZhdGVOZXR3b3JrQWNsLmFkZEVudHJ5KCdBbGxvd091dGJvdW5kSHR0cHMnLCB7XG4gICAgICBydWxlTnVtYmVyOiAxMDAsXG4gICAgICBwcm90b2NvbDogZWMyLkFjbFByb3RvY29sLlRDUCxcbiAgICAgIHJ1bGVBY3Rpb246IGVjMi5BY2xUcmFmZmljRGlyZWN0aW9uLkVHUkVTUyxcbiAgICAgIGNpZHI6IGVjMi5BY2xDaWRyLmlwdjQoJzAuMC4wLjAvMCcpLFxuICAgICAgcG9ydFJhbmdlOiB7IGZyb206IDQ0MywgdG86IDQ0MyB9LFxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgb3V0Ym91bmQgUG9zdGdyZVNRTCB0cmFmZmljXG4gICAgcHJpdmF0ZU5ldHdvcmtBY2wuYWRkRW50cnkoJ0FsbG93T3V0Ym91bmRQb3N0Z3JlU1FMJywge1xuICAgICAgcnVsZU51bWJlcjogMTEwLFxuICAgICAgcHJvdG9jb2w6IGVjMi5BY2xQcm90b2NvbC5UQ1AsXG4gICAgICBydWxlQWN0aW9uOiBlYzIuQWNsVHJhZmZpY0RpcmVjdGlvbi5FR1JFU1MsXG4gICAgICBjaWRyOiBlYzIuQWNsQ2lkci5pcHY0KCcxMC4wLjAuMC8xNicpLFxuICAgICAgcG9ydFJhbmdlOiB7IGZyb206IDU0MzIsIHRvOiA1NDMyIH0sXG4gICAgfSk7XG5cbiAgICAvLyBBc3NvY2lhdGUgd2l0aCBwcml2YXRlIHN1Ym5ldHNcbiAgICB0aGlzLnZwYy5wcml2YXRlU3VibmV0cy5mb3JFYWNoKChzdWJuZXQsIGluZGV4KSA9PiB7XG4gICAgICBuZXcgZWMyLlN1Ym5ldE5ldHdvcmtBY2xBc3NvY2lhdGlvbih0aGlzLCBgUHJpdmF0ZVN1Ym5ldE5hY2xBc3NvYyR7aW5kZXh9YCwge1xuICAgICAgICBuZXR3b3JrQWNsOiBwcml2YXRlTmV0d29ya0FjbCxcbiAgICAgICAgc3VibmV0OiBzdWJuZXQsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIE5ldHdvcmsgQUNMIGZvciBkYXRhYmFzZSBzdWJuZXRzIChtb3JlIHJlc3RyaWN0aXZlKVxuICAgIGNvbnN0IGRhdGFiYXNlTmV0d29ya0FjbCA9IG5ldyBlYzIuTmV0d29ya0FjbCh0aGlzLCAnRGF0YWJhc2VOZXR3b3JrQWNsJywge1xuICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgIG5ldHdvcmtBY2xOYW1lOiAnc2VyZW55YS1kYXRhYmFzZS1uYWNsJyxcbiAgICB9KTtcblxuICAgIC8vIE9ubHkgYWxsb3cgUG9zdGdyZVNRTCB0cmFmZmljIGZyb20gcHJpdmF0ZSBzdWJuZXRzXG4gICAgZGF0YWJhc2VOZXR3b3JrQWNsLmFkZEVudHJ5KCdBbGxvd1Bvc3RncmVTUUxGcm9tUHJpdmF0ZScsIHtcbiAgICAgIHJ1bGVOdW1iZXI6IDEwMCxcbiAgICAgIHByb3RvY29sOiBlYzIuQWNsUHJvdG9jb2wuVENQLFxuICAgICAgcnVsZUFjdGlvbjogZWMyLkFjbFRyYWZmaWNEaXJlY3Rpb24uSU5HUkVTUyxcbiAgICAgIGNpZHI6IGVjMi5BY2xDaWRyLmlwdjQoJzEwLjAuMS4wLzI0JyksIC8vIFByaXZhdGUgc3VibmV0IENJRFJcbiAgICAgIHBvcnRSYW5nZTogeyBmcm9tOiA1NDMyLCB0bzogNTQzMiB9LFxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgZXBoZW1lcmFsIHBvcnRzIGZvciByZXR1cm4gdHJhZmZpY1xuICAgIGRhdGFiYXNlTmV0d29ya0FjbC5hZGRFbnRyeSgnQWxsb3dFcGhlbWVyYWxPdXRib3VuZCcsIHtcbiAgICAgIHJ1bGVOdW1iZXI6IDEwMCxcbiAgICAgIHByb3RvY29sOiBlYzIuQWNsUHJvdG9jb2wuVENQLFxuICAgICAgcnVsZUFjdGlvbjogZWMyLkFjbFRyYWZmaWNEaXJlY3Rpb24uRUdSRVNTLFxuICAgICAgY2lkcjogZWMyLkFjbENpZHIuaXB2NCgnMTAuMC4xLjAvMjQnKSxcbiAgICAgIHBvcnRSYW5nZTogeyBmcm9tOiAxMDI0LCB0bzogNjU1MzUgfSxcbiAgICB9KTtcblxuICAgIC8vIEFzc29jaWF0ZSB3aXRoIGlzb2xhdGVkIHN1Ym5ldHNcbiAgICB0aGlzLnZwYy5pc29sYXRlZFN1Ym5ldHMuZm9yRWFjaCgoc3VibmV0LCBpbmRleCkgPT4ge1xuICAgICAgbmV3IGVjMi5TdWJuZXROZXR3b3JrQWNsQXNzb2NpYXRpb24odGhpcywgYElzb2xhdGVkU3VibmV0TmFjbEFzc29jJHtpbmRleH1gLCB7XG4gICAgICAgIG5ldHdvcmtBY2w6IGRhdGFiYXNlTmV0d29ya0FjbCxcbiAgICAgICAgc3VibmV0OiBzdWJuZXQsXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYWRkaXRpb25hbCBzZWN1cml0eSBncm91cHMgZm9yIHNwZWNpZmljIHNlcnZpY2VzXG4gICAqL1xuICBjcmVhdGVTZXJ2aWNlU2VjdXJpdHlHcm91cChzZXJ2aWNlTmFtZTogc3RyaW5nLCBhbGxvd2VkUG9ydHM6IG51bWJlcltdKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IHNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgYCR7c2VydmljZU5hbWV9U2VjdXJpdHlHcm91cGAsIHtcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICBkZXNjcmlwdGlvbjogYFNlY3VyaXR5IGdyb3VwIGZvciAke3NlcnZpY2VOYW1lfWAsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZSxcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IGFjY2VzcyBmcm9tIExhbWJkYSBzZWN1cml0eSBncm91cFxuICAgIGFsbG93ZWRQb3J0cy5mb3JFYWNoKHBvcnQgPT4ge1xuICAgICAgc2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgICAgdGhpcy5sYW1iZGFTZWN1cml0eUdyb3VwLFxuICAgICAgICBlYzIuUG9ydC50Y3AocG9ydCksXG4gICAgICAgIGBBbGxvdyBMYW1iZGEgYWNjZXNzIHRvICR7c2VydmljZU5hbWV9IG9uIHBvcnQgJHtwb3J0fWBcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gc2VjdXJpdHlHcm91cDtcbiAgfVxufSJdfQ==