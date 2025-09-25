import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
interface SecurityConstructProps {
    environment: string;
    region: string;
    vpc: ec2.Vpc;
    api: apigateway.RestApi;
    enableVpcFlowLogs: boolean;
}
export declare class SecurityConstruct extends Construct {
    readonly webAcl: wafv2.CfnWebACL;
    readonly cloudTrail: cloudtrail.Trail;
    readonly guardDutyDetector: guardduty.CfnDetector;
    constructor(scope: Construct, id: string, props: SecurityConstructProps);
    private createWafRules;
    private createSecurityAlarms;
}
export {};
