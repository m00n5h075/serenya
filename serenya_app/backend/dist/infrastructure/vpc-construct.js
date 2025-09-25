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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidnBjLWNvbnN0cnVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2luZnJhc3RydWN0dXJlL3ZwYy1jb25zdHJ1Y3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsMkNBQXVDO0FBU3ZDLE1BQWEsWUFBYSxTQUFRLHNCQUFTO0lBU3pDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBd0I7UUFDaEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxpQkFBaUIsRUFBRSxnQkFBZ0IsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUUzRSxpREFBaUQ7UUFDakQsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUN6QyxNQUFNLEVBQUUsQ0FBQyxFQUFFLGlDQUFpQztZQUM1QyxXQUFXLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLG9CQUFvQjtZQUMzRCxXQUFXLEVBQUUsR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDO1lBQ2hELGtCQUFrQixFQUFFLElBQUk7WUFDeEIsZ0JBQWdCLEVBQUUsSUFBSTtZQUN0QixtQkFBbUIsRUFBRTtnQkFDbkI7b0JBQ0UsUUFBUSxFQUFFLEVBQUU7b0JBQ1osSUFBSSxFQUFFLFFBQVE7b0JBQ2QsVUFBVSxFQUFFLEdBQUcsQ0FBQyxVQUFVLENBQUMsTUFBTTtpQkFDbEM7Z0JBQ0Q7b0JBQ0UsUUFBUSxFQUFFLEVBQUU7b0JBQ1osSUFBSSxFQUFFLFNBQVM7b0JBQ2YsVUFBVSxFQUFFLGdCQUFnQixDQUFDLENBQUM7d0JBQzVCLEdBQUcs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RUgsa0NBQWtDO1FBQ2xDLElBQUksQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUNqRCxJQUFJLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLEVBQUUsMEJBQTBCLEtBQUssRUFBRSxFQUFFO2dCQUMzRSxVQUFVLEVBQUUsa0JBQWtCO2dCQUM5QixNQUFNLEVBQUUsTUFBTTthQUNmLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0gsMEJBQTBCLENBQUMsV0FBbUIsRUFBRSxZQUFzQjtRQUNwRSxNQUFNLGFBQWEsR0FBRyxJQUFJLEdBQUcsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLEdBQUcsV0FBVyxlQUFlLEVBQUU7WUFDL0UsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHO1lBQ2IsV0FBVyxFQUFFLHNCQUFzQixXQUFXLEVBQUU7WUFDaEQsZ0JBQWdCLEVBQUUsS0FBSztTQUN4QixDQUFDLENBQUM7UUFFSCwwQ0FBMEM7UUFDMUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUMxQixhQUFhLENBQUMsY0FBYyxDQUMxQixJQUFJLENBQUMsbUJBQW1CLEVBQ3hCLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUNsQiwwQkFBMEIsV0FBVyxZQUFZLElBQUksRUFBRSxDQUN4RCxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxPQUFPLGFBQWEsQ0FBQztJQUN2QixDQUFDO0NBQ0Y7QUFoVEQsb0NBZ1RDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5pbnRlcmZhY2UgVnBjQ29uc3RydWN0UHJvcHMge1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuICByZWdpb246IHN0cmluZztcbiAgZW5hYmxlUHJpdmF0ZUxpbms6IGJvb2xlYW47XG4gIGVuYWJsZU5hdEdhdGV3YXk6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBWcGNDb25zdHJ1Y3QgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgdnBjOiBlYzIuVnBjO1xuICBwdWJsaWMgcmVhZG9ubHkgYmVkcm9ja1ZwY0VuZHBvaW50PzogZWMyLlZwY0VuZHBvaW50O1xuICBwdWJsaWMgcmVhZG9ubHkgczNWcGNFbmRwb2ludDogZWMyLlZwY0VuZHBvaW50O1xuICBwdWJsaWMgcmVhZG9ubHkgc2VjcmV0c01hbmFnZXJWcGNFbmRwb2ludDogZWMyLlZwY0VuZHBvaW50O1xuICBwdWJsaWMgcmVhZG9ubHkgbGFtYmRhU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXA7XG4gIHB1YmxpYyByZWFkb25seSBkYXRhYmFzZVNlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwO1xuICBwdWJsaWMgcmVhZG9ubHkgdnBjRW5kcG9pbnRTZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogVnBjQ29uc3RydWN0UHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgeyBlbnZpcm9ubWVudCwgcmVnaW9uLCBlbmFibGVQcml2YXRlTGluaywgZW5hYmxlTmF0R2F0ZXdheSB9ID0gcHJvcHM7XG5cbiAgICAvLyBWUEMgZm9yIGhlYWx0aGNhcmUtY29tcGxpYW50IG5ldHdvcmsgaXNvbGF0aW9uXG4gICAgdGhpcy52cGMgPSBuZXcgZWMyLlZwYyh0aGlzLCAnU2VyZW55YVZwYycsIHtcbiAgICAgIG1heEF6czogMiwgLy8gTXVsdGktQVogZm9yIGhpZ2ggYXZhaWxhYmlsaXR5XG4gICAgICBuYXRHYXRld2F5czogZW5hYmxlTmF0R2F0ZXdheSA/IDEgOiAwLCAvLyBDb3N0IG9wdGltaXphdGlvblxuICAgICAgaXBBZGRyZXNzZXM6IGVjMi5JcEFkZHJlc3Nlcy5jaWRyKCcxMC4wLjAuMC8xNicpLFxuICAgICAgZW5hYmxlRG5zSG9zdG5hbWVzOiB0cnVlLFxuICAgICAgZW5hYmxlRG5zU3VwcG9ydDogdHJ1ZSxcbiAgICAgIHN1Ym5ldENvbmZpZ3VyYXRpb246IFtcbiAgICAgICAge1xuICAgICAgICAgIGNpZHJNYXNrOiAyNCxcbiAgICAgICAgICBuYW1lOiAnUHVibGljJyxcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QVUJMSUMsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBjaWRyTWFzazogMjQsXG4gICAgICAgICAgbmFtZTogJ1ByaXZhdGUnLFxuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVuYWJsZU5hdEdhdGV3YXkgPyBcbiAgICAgICAgICAgIGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MgOiBcbiAgICAgICAgICAgIGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBjaWRyTWFzazogMjQsXG4gICAgICAgICAgbmFtZTogJ0RhdGFiYXNlJyxcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVELFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIFNlY3VyaXR5IGdyb3VwIGZvciBWUEMgZW5kcG9pbnRzXG4gICAgdGhpcy52cGNFbmRwb2ludFNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ1ZwY0VuZHBvaW50U2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBWUEMgZW5kcG9pbnRzJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgLy8gU2VjdXJpdHkgZ3JvdXAgZm9yIExhbWJkYSBmdW5jdGlvbnNcbiAgICB0aGlzLmxhbWJkYVNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0xhbWJkYVNlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGM6IHRoaXMudnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgTGFtYmRhIGZ1bmN0aW9ucycsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gU2VjdXJpdHkgZ3JvdXAgZm9yIGRhdGFiYXNlXG4gICAgdGhpcy5kYXRhYmFzZVNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0RhdGFiYXNlU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBQb3N0Z3JlU1FMIGRhdGFiYXNlJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgTGFtYmRhIHRvIGFjY2VzcyBkYXRhYmFzZSBvbiBwb3J0IDU0MzJcbiAgICB0aGlzLmRhdGFiYXNlU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIHRoaXMubGFtYmRhU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjMi5Qb3J0LnRjcCg1NDMyKSxcbiAgICAgICdBbGxvdyBMYW1iZGEgYWNjZXNzIHRvIFBvc3RncmVTUUwnXG4gICAgKTtcblxuICAgIC8vIEFsbG93IExhbWJkYSB0byBhY2Nlc3MgVlBDIGVuZHBvaW50c1xuICAgIHRoaXMudnBjRW5kcG9pbnRTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgdGhpcy5sYW1iZGFTZWN1cml0eUdyb3VwLFxuICAgICAgZWMyLlBvcnQudGNwKDQ0MyksXG4gICAgICAnQWxsb3cgTGFtYmRhIGFjY2VzcyB0byBWUEMgZW5kcG9pbnRzJ1xuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgVlBDIGVuZHBvaW50cyBmb3IgQVdTIHNlcnZpY2VzXG4gICAgdGhpcy5jcmVhdGVWcGNFbmRwb2ludHMoZW5hYmxlUHJpdmF0ZUxpbmspO1xuXG4gICAgLy8gQWRkaXRpb25hbCBuZXR3b3JrIEFDTHMgZm9yIGVuaGFuY2VkIHNlY3VyaXR5XG4gICAgdGhpcy5jcmVhdGVOZXR3b3JrQWNscygpO1xuXG4gICAgLy8gVlBDIEZsb3cgTG9ncyBhcmUgY3JlYXRlZCBpbiBTZWN1cml0eUNvbnN0cnVjdFxuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVWcGNFbmRwb2ludHMoZW5hYmxlUHJpdmF0ZUxpbms6IGJvb2xlYW4pIHtcbiAgICAvLyBTMyBHYXRld2F5IGVuZHBvaW50IChmcmVlKVxuICAgIHRoaXMuczNWcGNFbmRwb2ludCA9IHRoaXMudnBjLmFkZEdhdGV3YXlFbmRwb2ludCgnUzNWcGNFbmRwb2ludCcsIHtcbiAgICAgIHNlcnZpY2U6IGVjMi5HYXRld2F5VnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlMzLFxuICAgICAgc3VibmV0czogW1xuICAgICAgICB7IHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MgfSxcbiAgICAgICAgeyBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVEIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gU2VjcmV0cyBNYW5hZ2VyIFZQQyBlbmRwb2ludFxuICAgIHRoaXMuc2VjcmV0c01hbmFnZXJWcGNFbmRwb2ludCA9IHRoaXMudnBjLmFkZEludGVyZmFjZUVuZHBvaW50KCdTZWNyZXRzTWFuYWdlclZwY0VuZHBvaW50Jywge1xuICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5TRUNSRVRTX01BTkFHRVIsXG4gICAgICBzdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFt0aGlzLnZwY0VuZHBvaW50U2VjdXJpdHlHcm91cF0sXG4gICAgICBwcml2YXRlRG5zRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHBvbGljeURvY3VtZW50OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLkFueVByaW5jaXBhbCgpXSxcbiAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlJyxcbiAgICAgICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkRlc2NyaWJlU2VjcmV0JyxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICAgICAnYXdzOlByaW5jaXBhbFZwYyc6IHRoaXMudnBjLnZwY0lkLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSxcbiAgICAgIH0pLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBMb2dzIFZQQyBlbmRwb2ludFxuICAgIHRoaXMudnBjLmFkZEludGVyZmFjZUVuZHBvaW50KCdDbG91ZFdhdGNoTG9nc1ZwY0VuZHBvaW50Jywge1xuICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5DTE9VRFdBVENIX0xPR1MsXG4gICAgICBzdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFt0aGlzLnZwY0VuZHBvaW50U2VjdXJpdHlHcm91cF0sXG4gICAgICBwcml2YXRlRG5zRW5hYmxlZDogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIENsb3VkV2F0Y2ggTW9uaXRvcmluZyBWUEMgZW5kcG9pbnRcbiAgICB0aGlzLnZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludCgnQ2xvdWRXYXRjaE1vbml0b3JpbmdWcGNFbmRwb2ludCcsIHtcbiAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuQ0xPVURXQVRDSF9NT05JVE9SSU5HLFxuICAgICAgc3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbdGhpcy52cGNFbmRwb2ludFNlY3VyaXR5R3JvdXBdLFxuICAgICAgcHJpdmF0ZURuc0VuYWJsZWQ6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBLTVMgVlBDIGVuZHBvaW50XG4gICAgdGhpcy52cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ0ttc1ZwY0VuZHBvaW50Jywge1xuICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5LTVMsXG4gICAgICBzdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFt0aGlzLnZwY0VuZHBvaW50U2VjdXJpdHlHcm91cF0sXG4gICAgICBwcml2YXRlRG5zRW5hYmxlZDogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIEFXUyBCZWRyb2NrIFZQQyBlbmRwb2ludCAoaWYgZW5hYmxlZCBhbmQgc3VwcG9ydGVkIGluIHJlZ2lvbilcbiAgICBpZiAoZW5hYmxlUHJpdmF0ZUxpbmspIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHRoaXMuYmVkcm9ja1ZwY0VuZHBvaW50ID0gdGhpcy52cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ0JlZHJvY2tWcGNFbmRwb2ludCcsIHtcbiAgICAgICAgICBzZXJ2aWNlOiBuZXcgZWMyLkludGVyZmFjZVZwY0VuZHBvaW50U2VydmljZShgY29tLmFtYXpvbmF3cy4ke2Nkay5Bd3MuUkVHSU9OfS5iZWRyb2NrLXJ1bnRpbWVgKSxcbiAgICAgICAgICBzdWJuZXRzOiB7XG4gICAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgc2VjdXJpdHlHcm91cHM6IFt0aGlzLnZwY0VuZHBvaW50U2VjdXJpdHlHcm91cF0sXG4gICAgICAgICAgcHJpdmF0ZURuc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgcG9saWN5RG9jdW1lbnQ6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLkFueVByaW5jaXBhbCgpXSxcbiAgICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgICAnYmVkcm9jazpJbnZva2VNb2RlbCcsXG4gICAgICAgICAgICAgICAgICAnYmVkcm9jazpJbnZva2VNb2RlbFdpdGhSZXNwb25zZVN0cmVhbScsXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgICAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgICAgICAgICAnYXdzOlByaW5jaXBhbFZwYyc6IHRoaXMudnBjLnZwY0lkLFxuICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfSksXG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgLy8gQmVkcm9jayBWUEMgZW5kcG9pbnRzIG1heSBub3QgYmUgYXZhaWxhYmxlIGluIGFsbCByZWdpb25zXG4gICAgICAgIGNvbnNvbGUud2FybignQmVkcm9jayBWUEMgZW5kcG9pbnQgbm90IGF2YWlsYWJsZSBpbiB0aGlzIHJlZ2lvbjonLCBlcnJvcik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVOZXR3b3JrQWNscygpIHtcbiAgICAvLyBOZXR3b3JrIEFDTCBmb3IgcHJpdmF0ZSBzdWJuZXRzIHdpdGggYWRkaXRpb25hbCBzZWN1cml0eVxuICAgIGNvbnN0IHByaXZhdGVOZXR3b3JrQWNsID0gbmV3IGVjMi5OZXR3b3JrQWNsKHRoaXMsICdQcml2YXRlTmV0d29ya0FjbCcsIHtcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICBuZXR3b3JrQWNsTmFtZTogJ3NlcmVueWEtcHJpdmF0ZS1uYWNsJyxcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IGluYm91bmQgSFRUUFMgdHJhZmZpY1xuICAgIHByaXZhdGVOZXR3b3JrQWNsLmFkZEVudHJ5KCdBbGxvd0luYm91bmRIdHRwcycsIHtcbiAgICAgIHJ1bGVOdW1iZXI6IDEwMCxcbiAgICAgIHByb3RvY29sOiBlYzIuQWNsUHJvdG9jb2wuVENQLFxuICAgICAgcnVsZUFjdGlvbjogZWMyLkFjbFRyYWZmaWNEaXJlY3Rpb24uSU5HUkVTUyxcbiAgICAgIGNpZHI6IGVjMi5BY2xDaWRyLmlwdjQoJzEwLjAuMC4wLzE2JyksXG4gICAgICBwb3J0UmFuZ2U6IHsgZnJvbTogNDQzLCB0bzogNDQzIH0sXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBpbmJvdW5kIFBvc3RncmVTUUwgdHJhZmZpY1xuICAgIHByaXZhdGVOZXR3b3JrQWNsLmFkZEVudHJ5KCdBbGxvd0luYm91bmRQb3N0Z3JlU1FMJywge1xuICAgICAgcnVsZU51bWJlcjogMTEwLFxuICAgICAgcHJvdG9jb2w6IGVjMi5BY2xQcm90b2NvbC5UQ1AsXG4gICAgICBydWxlQWN0aW9uOiBlYzIuQWNsVHJhZmZpY0RpcmVjdGlvbi5JTkdSRVNTLFxuICAgICAgY2lkcjogZWMyLkFjbENpZHIuaXB2NCgnMTAuMC4wLjAvMTYnKSxcbiAgICAgIHBvcnRSYW5nZTogeyBmcm9tOiA1NDMyLCB0bzogNTQzMiB9LFxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgZXBoZW1lcmFsIHBvcnRzIGZvciByZXR1cm4gdHJhZmZpY1xuICAgIHByaXZhdGVOZXR3b3JrQWNsLmFkZEVudHJ5KCdBbGxvd0luYm91bmRFcGhlbWVyYWwnLCB7XG4gICAgICBydWxlTnVtYmVyOiAxMjAsXG4gICAgICBwcm90b2NvbDogZWMyLkFjbFByb3RvY29sLlRDUCxcbiAgICAgIHJ1bGVBY3Rpb246IGVjMi5BY2xUcmFmZmljRGlyZWN0aW9uLklOR1JFU1MsXG4gICAgICBjaWRyOiBlYzIuQWNsQ2lkci5pcHY0KCcwLjAuMC4wLzAnKSxcbiAgICAgIHBvcnRSYW5nZTogeyBmcm9tOiAxMDI0LCB0bzogNjU1MzUgfSxcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IG91dGJvdW5kIEhUVFBTIHRyYWZmaWNcbiAgICBwcml2YXRlTmV0d29ya0FjbC5hZGRFbnRyeSgnQWxsb3dPdXRib3VuZEh0dHBzJywge1xuICAgICAgcnVsZU51bWJlcjogMTAwLFxuICAgICAgcHJvdG9jb2w6IGVjMi5BY2xQcm90b2NvbC5UQ1AsXG4gICAgICBydWxlQWN0aW9uOiBlYzIuQWNsVHJhZmZpY0RpcmVjdGlvbi5FR1JFU1MsXG4gICAgICBjaWRyOiBlYzIuQWNsQ2lkci5pcHY0KCcwLjAuMC4wLzAnKSxcbiAgICAgIHBvcnRSYW5nZTogeyBmcm9tOiA0NDMsIHRvOiA0NDMgfSxcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IG91dGJvdW5kIFBvc3RncmVTUUwgdHJhZmZpY1xuICAgIHByaXZhdGVOZXR3b3JrQWNsLmFkZEVudHJ5KCdBbGxvd091dGJvdW5kUG9zdGdyZVNRTCcsIHtcbiAgICAgIHJ1bGVOdW1iZXI6IDExMCxcbiAgICAgIHByb3RvY29sOiBlYzIuQWNsUHJvdG9jb2wuVENQLFxuICAgICAgcnVsZUFjdGlvbjogZWMyLkFjbFRyYWZmaWNEaXJlY3Rpb24uRUdSRVNTLFxuICAgICAgY2lkcjogZWMyLkFjbENpZHIuaXB2NCgnMTAuMC4wLjAvMTYnKSxcbiAgICAgIHBvcnRSYW5nZTogeyBmcm9tOiA1NDMyLCB0bzogNTQzMiB9LFxuICAgIH0pO1xuXG4gICAgLy8gQXNzb2NpYXRlIHdpdGggcHJpdmF0ZSBzdWJuZXRzXG4gICAgdGhpcy52cGMucHJpdmF0ZVN1Ym5ldHMuZm9yRWFjaCgoc3VibmV0LCBpbmRleCkgPT4ge1xuICAgICAgbmV3IGVjMi5TdWJuZXROZXR3b3JrQWNsQXNzb2NpYXRpb24odGhpcywgYFByaXZhdGVTdWJuZXROYWNsQXNzb2Mke2luZGV4fWAsIHtcbiAgICAgICAgbmV0d29ya0FjbDogcHJpdmF0ZU5ldHdvcmtBY2wsXG4gICAgICAgIHN1Ym5ldDogc3VibmV0LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBOZXR3b3JrIEFDTCBmb3IgZGF0YWJhc2Ugc3VibmV0cyAobW9yZSByZXN0cmljdGl2ZSlcbiAgICBjb25zdCBkYXRhYmFzZU5ldHdvcmtBY2wgPSBuZXcgZWMyLk5ldHdvcmtBY2wodGhpcywgJ0RhdGFiYXNlTmV0d29ya0FjbCcsIHtcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICBuZXR3b3JrQWNsTmFtZTogJ3NlcmVueWEtZGF0YWJhc2UtbmFjbCcsXG4gICAgfSk7XG5cbiAgICAvLyBPbmx5IGFsbG93IFBvc3RncmVTUUwgdHJhZmZpYyBmcm9tIHByaXZhdGUgc3VibmV0c1xuICAgIGRhdGFiYXNlTmV0d29ya0FjbC5hZGRFbnRyeSgnQWxsb3dQb3N0Z3JlU1FMRnJvbVByaXZhdGUnLCB7XG4gICAgICBydWxlTnVtYmVyOiAxMDAsXG4gICAgICBwcm90b2NvbDogZWMyLkFjbFByb3RvY29sLlRDUCxcbiAgICAgIHJ1bGVBY3Rpb246IGVjMi5BY2xUcmFmZmljRGlyZWN0aW9uLklOR1JFU1MsXG4gICAgICBjaWRyOiBlYzIuQWNsQ2lkci5pcHY0KCcxMC4wLjEuMC8yNCcpLCAvLyBQcml2YXRlIHN1Ym5ldCBDSURSXG4gICAgICBwb3J0UmFuZ2U6IHsgZnJvbTogNTQzMiwgdG86IDU0MzIgfSxcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IGVwaGVtZXJhbCBwb3J0cyBmb3IgcmV0dXJuIHRyYWZmaWNcbiAgICBkYXRhYmFzZU5ldHdvcmtBY2wuYWRkRW50cnkoJ0FsbG93RXBoZW1lcmFsT3V0Ym91bmQnLCB7XG4gICAgICBydWxlTnVtYmVyOiAxMDAsXG4gICAgICBwcm90b2NvbDogZWMyLkFjbFByb3RvY29sLlRDUCxcbiAgICAgIHJ1bGVBY3Rpb246IGVjMi5BY2xUcmFmZmljRGlyZWN0aW9uLkVHUkVTUyxcbiAgICAgIGNpZHI6IGVjMi5BY2xDaWRyLmlwdjQoJzEwLjAuMS4wLzI0JyksXG4gICAgICBwb3J0UmFuZ2U6IHsgZnJvbTogMTAyNCwgdG86IDY1NTM1IH0sXG4gICAgfSk7XG5cbiAgICAvLyBBc3NvY2lhdGUgd2l0aCBpc29sYXRlZCBzdWJuZXRzXG4gICAgdGhpcy52cGMuaXNvbGF0ZWRTdWJuZXRzLmZvckVhY2goKHN1Ym5ldCwgaW5kZXgpID0+IHtcbiAgICAgIG5ldyBlYzIuU3VibmV0TmV0d29ya0FjbEFzc29jaWF0aW9uKHRoaXMsIGBJc29sYXRlZFN1Ym5ldE5hY2xBc3NvYyR7aW5kZXh9YCwge1xuICAgICAgICBuZXR3b3JrQWNsOiBkYXRhYmFzZU5ldHdvcmtBY2wsXG4gICAgICAgIHN1Ym5ldDogc3VibmV0LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGFkZGl0aW9uYWwgc2VjdXJpdHkgZ3JvdXBzIGZvciBzcGVjaWZpYyBzZXJ2aWNlc1xuICAgKi9cbiAgY3JlYXRlU2VydmljZVNlY3VyaXR5R3JvdXAoc2VydmljZU5hbWU6IHN0cmluZywgYWxsb3dlZFBvcnRzOiBudW1iZXJbXSk6IGVjMi5TZWN1cml0eUdyb3VwIHtcbiAgICBjb25zdCBzZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsIGAke3NlcnZpY2VOYW1lfVNlY3VyaXR5R3JvdXBgLCB7XG4gICAgICB2cGM6IHRoaXMudnBjLFxuICAgICAgZGVzY3JpcHRpb246IGBTZWN1cml0eSBncm91cCBmb3IgJHtzZXJ2aWNlTmFtZX1gLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2UsXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBhY2Nlc3MgZnJvbSBMYW1iZGEgc2VjdXJpdHkgZ3JvdXBcbiAgICBhbGxvd2VkUG9ydHMuZm9yRWFjaChwb3J0ID0+IHtcbiAgICAgIHNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICAgIHRoaXMubGFtYmRhU2VjdXJpdHlHcm91cCxcbiAgICAgICAgZWMyLlBvcnQudGNwKHBvcnQpLFxuICAgICAgICBgQWxsb3cgTGFtYmRhIGFjY2VzcyB0byAke3NlcnZpY2VOYW1lfSBvbiBwb3J0ICR7cG9ydH1gXG4gICAgICApO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHNlY3VyaXR5R3JvdXA7XG4gIH1cbn0iXX0=