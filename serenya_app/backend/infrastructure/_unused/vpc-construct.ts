import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface VpcConstructProps {
  environment: string;
  region: string;
  enablePrivateLink: boolean;
  enableNatGateway: boolean;
}

export class VpcConstruct extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly bedrockVpcEndpoint?: ec2.VpcEndpoint;
  public readonly s3VpcEndpoint: ec2.VpcEndpoint;
  public readonly secretsManagerVpcEndpoint: ec2.VpcEndpoint;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;
  public readonly databaseSecurityGroup: ec2.SecurityGroup;
  public readonly vpcEndpointSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: VpcConstructProps) {
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
    this.databaseSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Lambda access to PostgreSQL'
    );

    // Allow Lambda to access VPC endpoints
    this.vpcEndpointSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(443),
      'Allow Lambda access to VPC endpoints'
    );

    // Create VPC endpoints for AWS services
    this.createVpcEndpoints(enablePrivateLink);

    // Additional network ACLs for enhanced security
    this.createNetworkAcls();

    // VPC Flow Logs are created in SecurityConstruct
  }

  private createVpcEndpoints(enablePrivateLink: boolean) {
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
      } catch (error) {
        // Bedrock VPC endpoints may not be available in all regions
        console.warn('Bedrock VPC endpoint not available in this region:', error);
      }
    }
  }

  private createNetworkAcls() {
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
  createServiceSecurityGroup(serviceName: string, allowedPorts: number[]): ec2.SecurityGroup {
    const securityGroup = new ec2.SecurityGroup(this, `${serviceName}SecurityGroup`, {
      vpc: this.vpc,
      description: `Security group for ${serviceName}`,
      allowAllOutbound: false,
    });

    // Allow access from Lambda security group
    allowedPorts.forEach(port => {
      securityGroup.addIngressRule(
        this.lambdaSecurityGroup,
        ec2.Port.tcp(port),
        `Allow Lambda access to ${serviceName} on port ${port}`
      );
    });

    return securityGroup;
  }
}