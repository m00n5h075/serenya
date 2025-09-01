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

export const environments: Record<string, EnvironmentConfig> = {
  dev: {
    region: 'eu-west-1',
    allowOrigins: ['http://localhost:*', 'https://localhost:*'],
    retentionDays: 7,
    enableDetailedLogging: true,
    enableXRayTracing: true,
    memorySize: {
      small: 256,
      medium: 512,
      large: 1024,
    },
    timeout: {
      short: 15,
      medium: 60,
      long: 180,
    },
    apiGateway: {
      throttlingRateLimit: 100,
      throttlingBurstLimit: 200,
      cacheKeyTtl: 300, // 5 minutes
    },
    s3: {
      lifecycleHours: 1,
      failsafeHours: 24,
    },
    security: {
      jwtExpirationHours: 1,
      maxRetryAttempts: 3,
      rateLimitPerMinute: 60,
    },
  },
  
  staging: {
    region: 'eu-west-1',
    allowOrigins: ['https://staging.serenya.health'],
    retentionDays: 14,
    enableDetailedLogging: true,
    enableXRayTracing: true,
    memorySize: {
      small: 256,
      medium: 512,
      large: 1024,
    },
    timeout: {
      short: 15,
      medium: 60,
      long: 180,
    },
    apiGateway: {
      throttlingRateLimit: 200,
      throttlingBurstLimit: 400,
      cacheKeyTtl: 300,
    },
    s3: {
      lifecycleHours: 1,
      failsafeHours: 24,
    },
    security: {
      jwtExpirationHours: 1,
      maxRetryAttempts: 3,
      rateLimitPerMinute: 100,
    },
  },
  
  prod: {
    region: 'eu-west-1',
    allowOrigins: ['https://app.serenya.health'],
    retentionDays: 30,
    enableDetailedLogging: false,
    enableXRayTracing: true,
    memorySize: {
      small: 512,
      medium: 1024,
      large: 2048,
    },
    timeout: {
      short: 15,
      medium: 60,
      long: 180,
    },
    apiGateway: {
      throttlingRateLimit: 500,
      throttlingBurstLimit: 1000,
      cacheKeyTtl: 600, // 10 minutes
    },
    s3: {
      lifecycleHours: 1,
      failsafeHours: 24,
    },
    security: {
      jwtExpirationHours: 1,
      maxRetryAttempts: 3,
      rateLimitPerMinute: 200,
    },
  },
};

export function getEnvironmentConfig(environment: string): EnvironmentConfig {
  const config = environments[environment];
  if (!config) {
    throw new Error(`Unknown environment: ${environment}. Available: ${Object.keys(environments).join(', ')}`);
  }
  return config;
}