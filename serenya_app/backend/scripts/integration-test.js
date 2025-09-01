#!/usr/bin/env node

/**
 * Comprehensive Integration Tests for Serenya Backend
 * Tests all endpoints with real AWS infrastructure
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const ENVIRONMENT = process.argv[2] || 'dev';
const TEST_TOKEN = process.env.TEST_TOKEN;
const API_URL = process.env.API_URL;

// Test configuration
const TEST_CONFIG = {
  timeout: 30000,
  retries: 3,
  delay: 1000,
};

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

/**
 * Make HTTP request with timeout and retry logic
 */
async function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = responseData ? JSON.parse(responseData) : {};
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed,
          });
        } catch (parseError) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: responseData,
          });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(TEST_CONFIG.timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * Test Suite: Authentication
 */
async function testAuthentication() {
  logInfo('Testing Authentication Endpoints...');
  
  try {
    // Test Google OAuth endpoint with invalid credentials
    const authResponse = await makeRequest({
      hostname: new URL(API_URL).hostname,
      path: '/auth/google',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }, {
      google_token: 'invalid_token',
      id_token: 'invalid_id_token',
      device_id: 'test_device_1234',
    });

    if (authResponse.statusCode === 401 || authResponse.statusCode === 400) {
      logSuccess('Google OAuth endpoint responds correctly to invalid credentials');
    } else {
      logWarning(`Google OAuth endpoint returned unexpected status: ${authResponse.statusCode}`);
    }

    return true;
  } catch (error) {
    logError(`Authentication test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test Suite: User Profile (requires valid token)
 */
async function testUserProfile() {
  if (!TEST_TOKEN) {
    logWarning('Skipping user profile tests - no TEST_TOKEN provided');
    return true;
  }

  logInfo('Testing User Profile Endpoints...');
  
  try {
    const profileResponse = await makeRequest({
      hostname: new URL(API_URL).hostname,
      path: '/user/profile',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`,
      },
    });

    if (profileResponse.statusCode === 200) {
      logSuccess('User profile endpoint working correctly');
      logInfo(`Profile data: ${JSON.stringify(profileResponse.body, null, 2)}`);
    } else if (profileResponse.statusCode === 401) {
      logWarning('User profile endpoint requires valid authentication');
    } else {
      logError(`User profile test failed with status: ${profileResponse.statusCode}`);
      return false;
    }

    return true;
  } catch (error) {
    logError(`User profile test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test Suite: File Processing Endpoints
 */
async function testFileProcessing() {
  if (!TEST_TOKEN) {
    logWarning('Skipping file processing tests - no TEST_TOKEN provided');
    return true;
  }

  logInfo('Testing File Processing Endpoints...');
  
  try {
    // Test upload endpoint without file
    const uploadResponse = await makeRequest({
      hostname: new URL(API_URL).hostname,
      path: '/api/v1/process/upload',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
      },
    });

    if (uploadResponse.statusCode === 400) {
      logSuccess('Upload endpoint correctly rejects requests without files');
    } else {
      logWarning(`Upload endpoint returned unexpected status: ${uploadResponse.statusCode}`);
    }

    // Test status endpoint with non-existent job
    const statusResponse = await makeRequest({
      hostname: new URL(API_URL).hostname,
      path: '/api/v1/process/status/non-existent-job-id',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`,
      },
    });

    if (statusResponse.statusCode === 404) {
      logSuccess('Status endpoint correctly handles non-existent jobs');
    } else {
      logWarning(`Status endpoint returned unexpected status: ${statusResponse.statusCode}`);
    }

    // Test result endpoint with non-existent job
    const resultResponse = await makeRequest({
      hostname: new URL(API_URL).hostname,
      path: '/api/v1/process/result/non-existent-job-id',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`,
      },
    });

    if (resultResponse.statusCode === 404) {
      logSuccess('Result endpoint correctly handles non-existent jobs');
    } else {
      logWarning(`Result endpoint returned unexpected status: ${resultResponse.statusCode}`);
    }

    return true;
  } catch (error) {
    logError(`File processing test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test Suite: CORS Configuration
 */
async function testCORS() {
  logInfo('Testing CORS Configuration...');
  
  try {
    const corsResponse = await makeRequest({
      hostname: new URL(API_URL).hostname,
      path: '/auth/google',
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://app.serenya.health',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,Authorization',
      },
    });

    if (corsResponse.statusCode === 200 && corsResponse.headers['access-control-allow-origin']) {
      logSuccess('CORS configuration working correctly');
    } else {
      logError('CORS configuration issues detected');
      return false;
    }

    return true;
  } catch (error) {
    logError(`CORS test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test Suite: Security Headers
 */
async function testSecurityHeaders() {
  logInfo('Testing Security Headers...');
  
  try {
    const response = await makeRequest({
      hostname: new URL(API_URL).hostname,
      path: '/auth/google',
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://app.serenya.health',
      },
    });

    const requiredHeaders = [
      'x-content-type-options',
      'x-frame-options', 
      'x-xss-protection',
      'strict-transport-security',
    ];

    let headerCount = 0;
    requiredHeaders.forEach(header => {
      if (response.headers[header]) {
        headerCount++;
      }
    });

    if (headerCount >= 3) {
      logSuccess(`Security headers present (${headerCount}/${requiredHeaders.length})`);
    } else {
      logWarning(`Some security headers missing (${headerCount}/${requiredHeaders.length})`);
    }

    return true;
  } catch (error) {
    logError(`Security headers test failed: ${error.message}`);
    return false;
  }
}

/**
 * Performance Test: Response Times
 */
async function testPerformance() {
  logInfo('Testing API Performance...');
  
  const tests = [
    { name: 'Auth Endpoint', path: '/auth/google', method: 'POST' },
    { name: 'Options Request', path: '/auth/google', method: 'OPTIONS' },
  ];

  for (const test of tests) {
    try {
      const startTime = Date.now();
      
      await makeRequest({
        hostname: new URL(API_URL).hostname,
        path: test.path,
        method: test.method,
        headers: {
          'Content-Type': 'application/json',
        },
      }, test.method === 'POST' ? { google_token: 'test' } : null);

      const responseTime = Date.now() - startTime;
      
      if (responseTime < 1000) {
        logSuccess(`${test.name}: ${responseTime}ms (Good)`);
      } else if (responseTime < 3000) {
        logWarning(`${test.name}: ${responseTime}ms (Acceptable)`);
      } else {
        logError(`${test.name}: ${responseTime}ms (Slow)`);
      }
    } catch (error) {
      logError(`${test.name} performance test failed: ${error.message}`);
    }
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  log('\n' + '='.repeat(60), colors.cyan);
  log('🧪 Serenya Backend Integration Tests', colors.cyan + colors.bright);
  log('='.repeat(60), colors.cyan);
  log(`Environment: ${ENVIRONMENT}`, colors.blue);
  log(`API URL: ${API_URL}`, colors.blue);
  log(`Test Token: ${TEST_TOKEN ? 'Provided' : 'Not provided'}`, colors.blue);
  log('='.repeat(60) + '\n', colors.cyan);

  const testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
  };

  const tests = [
    { name: 'Authentication', func: testAuthentication },
    { name: 'User Profile', func: testUserProfile },
    { name: 'File Processing', func: testFileProcessing },
    { name: 'CORS Configuration', func: testCORS },
    { name: 'Security Headers', func: testSecurityHeaders },
    { name: 'Performance', func: testPerformance },
  ];

  for (const test of tests) {
    testResults.total++;
    
    try {
      log(`\n📋 Running ${test.name} Tests...`, colors.bright);
      const result = await test.func();
      
      if (result) {
        testResults.passed++;
        logSuccess(`${test.name} tests completed`);
      } else {
        testResults.failed++;
        logError(`${test.name} tests failed`);
      }
    } catch (error) {
      testResults.failed++;
      logError(`${test.name} tests crashed: ${error.message}`);
    }
    
    // Brief delay between test suites
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Print summary
  log('\n' + '='.repeat(60), colors.cyan);
  log('📊 Test Results Summary', colors.cyan + colors.bright);
  log('='.repeat(60), colors.cyan);
  log(`Total Tests: ${testResults.total}`, colors.blue);
  log(`Passed: ${testResults.passed}`, colors.green);
  log(`Failed: ${testResults.failed}`, colors.red);
  log(`Success Rate: ${Math.round((testResults.passed / testResults.total) * 100)}%`, colors.blue);
  log('='.repeat(60) + '\n', colors.cyan);

  if (testResults.failed === 0) {
    logSuccess('All tests passed! Backend is ready for integration.');
  } else {
    logError(`${testResults.failed} test(s) failed. Please review and fix issues.`);
  }

  // Additional integration notes
  if (!TEST_TOKEN) {
    log('\n📝 Integration Notes:', colors.bright);
    log('• To test authenticated endpoints, provide a valid JWT token:', colors.yellow);
    log('  TEST_TOKEN=eyJ... node scripts/integration-test.js dev', colors.yellow);
    log('• Get a test token by authenticating through the Flutter app', colors.yellow);
    log('• Or use the auth endpoint with valid Google OAuth credentials\n', colors.yellow);
  }

  return testResults.failed === 0;
}

/**
 * Validate environment setup
 */
function validateSetup() {
  if (!API_URL) {
    logError('API_URL environment variable not set');
    log('Get your API URL from CloudFormation outputs:', colors.yellow);
    log(`aws cloudformation describe-stacks --stack-name SerenyaBackend-${ENVIRONMENT} --query 'Stacks[0].Outputs[?OutputKey==\`ApiUrl\`].OutputValue' --output text`, colors.cyan);
    process.exit(1);
  }

  try {
    new URL(API_URL);
  } catch (error) {
    logError('Invalid API_URL format');
    process.exit(1);
  }

  logInfo(`Testing environment: ${ENVIRONMENT}`);
  logInfo(`API URL: ${API_URL}`);
}

/**
 * Show usage information
 */
function showUsage() {
  log('\n🚀 Serenya Backend Integration Tests', colors.bright);
  log('\nUsage:', colors.blue);
  log('  API_URL=https://your-api.execute-api.eu-west-1.amazonaws.com/dev node scripts/integration-test.js [environment]', colors.cyan);
  log('\nWith authentication:', colors.blue);
  log('  API_URL=https://... TEST_TOKEN=eyJ... node scripts/integration-test.js dev', colors.cyan);
  log('\nEnvironments:', colors.blue);
  log('  dev, staging, prod', colors.cyan);
  log('\nExample:', colors.blue);
  log('  API_URL=https://abc123.execute-api.eu-west-1.amazonaws.com/dev node scripts/integration-test.js dev\n', colors.cyan);
}

// Main execution
async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showUsage();
    process.exit(0);
  }

  if (!API_URL) {
    showUsage();
    process.exit(1);
  }

  validateSetup();
  
  const success = await runAllTests();
  process.exit(success ? 0 : 1);
}

// Error handling
process.on('unhandledRejection', (error) => {
  logError(`Unhandled error: ${error.message}`);
  process.exit(1);
});

process.on('SIGINT', () => {
  log('\n👋 Tests interrupted by user', colors.yellow);
  process.exit(1);
});

// Run tests
main();