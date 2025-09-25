import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
interface EnhancedApiConstructProps {
    environment: string;
    region: string;
    allowOrigins: string[];
    enableDetailedLogging: boolean;
    lambdaFunctions: Record<string, lambda.Function>;
    authorizer: apigateway.TokenAuthorizer;
}
export declare class EnhancedApiConstruct extends Construct {
    readonly api: apigateway.RestApi;
    readonly requestValidator: apigateway.RequestValidator;
    constructor(scope: Construct, id: string, props: EnhancedApiConstructProps);
    private createGatewayResponses;
    private setupEnhancedApiRoutes;
    private createApiAlarms;
}
export {};
