export interface EnvironmentConfig {
    region: string;
    allowOrigins: string[];
    retentionDays: number;
    enableDetailedLogging: boolean;
    enableXRayTracing: boolean;
    memorySize: {
        small: number;
        medium: number;
        large: number;
    };
    timeout: {
        short: number;
        medium: number;
        long: number;
    };
    apiGateway: {
        throttlingRateLimit: number;
        throttlingBurstLimit: number;
        cacheKeyTtl: number;
    };
    s3: {
        lifecycleHours: number;
        failsafeHours: number;
    };
    security: {
        jwtExpirationHours: number;
        maxRetryAttempts: number;
        rateLimitPerMinute: number;
    };
}
export declare const environments: Record<string, EnvironmentConfig>;
export declare function getEnvironmentConfig(environment: string): EnvironmentConfig;
