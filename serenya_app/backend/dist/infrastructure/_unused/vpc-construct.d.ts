import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
interface VpcConstructProps {
    environment: string;
    region: string;
    enablePrivateLink: boolean;
    enableNatGateway: boolean;
}
export declare class VpcConstruct extends Construct {
    readonly vpc: ec2.Vpc;
    readonly bedrockVpcEndpoint?: ec2.VpcEndpoint;
    readonly s3VpcEndpoint: ec2.VpcEndpoint;
    readonly secretsManagerVpcEndpoint: ec2.VpcEndpoint;
    readonly lambdaSecurityGroup: ec2.SecurityGroup;
    readonly databaseSecurityGroup: ec2.SecurityGroup;
    readonly vpcEndpointSecurityGroup: ec2.SecurityGroup;
    constructor(scope: Construct, id: string, props: VpcConstructProps);
    private createVpcEndpoints;
    private createNetworkAcls;
    /**
     * Create additional security groups for specific services
     */
    createServiceSecurityGroup(serviceName: string, allowedPorts: number[]): ec2.SecurityGroup;
}
export {};
