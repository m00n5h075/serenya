module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'lambdas/**/*.js',
    '!lambdas/**/node_modules/**',
    '!lambdas/**/package*.json',
    '!cdk.out/**',
    '!dist/**',
    '!coverage/**'
  ],
  
  // Module paths
  modulePaths: ['<rootDir>'],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Test timeout
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Transform configuration
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // Test suites
  projects: [
    {
      displayName: 'Unit Tests',
      testMatch: ['**/tests/unit/**/*.test.js']
    },
    {
      displayName: 'Integration Tests',
      testMatch: ['**/tests/integration/**/*.test.js'],
      testTimeout: 60000
    },
    {
      displayName: 'Security Tests',
      testMatch: ['**/tests/security/**/*.test.js'],
      testTimeout: 45000
    },
    {
      displayName: 'Performance Tests',
      testMatch: ['**/tests/performance/**/*.test.js'],
      testTimeout: 120000
    }
  ]
};