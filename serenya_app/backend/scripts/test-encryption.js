#!/usr/bin/env node

/**
 * Comprehensive encryption testing script
 * Tests KMS encryption functionality and database integration
 * 
 * Usage: node scripts/test-encryption.js
 * Environment: Requires AWS credentials and KMS_KEY_ID
 */

const { encryptData, decryptData, encryptFields, decryptFields, hashEmail, hashForIndex, getCacheStats, clearDataKeyCache } = require('../lambdas/shared/encryption');
const { UserService, SubscriptionService, PaymentService, query } = require('../lambdas/shared/database');

// Test configuration
const TEST_KMS_KEY_ID = process.env.KMS_KEY_ID || process.env.TEST_KMS_KEY_ID;
const RUN_DATABASE_TESTS = process.env.RUN_DATABASE_TESTS === 'true';

// Test data
const testUser = {
  externalId: 'test_user_' + Date.now(),
  authProvider: 'google',
  email: 'test.encryption@example.com',
  emailVerified: true,
  name: 'Test Encryption User',
  givenName: 'Test',
  familyName: 'User'
};

const testSubscription = {
  subscriptionType: 'monthly',
  provider: 'apple',
  externalSubscriptionId: 'test_sub_' + Date.now(),
  startDate: new Date().toISOString(),
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
};

const testPayment = {
  amount: 9.99,
  currency: 'USD',
  providerTransactionId: 'test_txn_' + Date.now(),
  paymentMethod: 'apple_pay',
  status: 'completed'
};

/**
 * Main test runner
 */
async function runTests() {
  console.log('🔒 Starting Serenya Encryption System Tests');
  console.log('==========================================');
  
  if (!TEST_KMS_KEY_ID) {
    console.error('❌ KMS_KEY_ID environment variable is required');
    process.exit(1);
  }
  
  console.log(`🔑 Using KMS Key: ${TEST_KMS_KEY_ID}`);
  console.log(`🗄️  Database tests: ${RUN_DATABASE_TESTS ? 'ENABLED' : 'DISABLED'}`);
  console.log('');
  
  let testResults = {
    passed: 0,
    failed: 0,
    errors: []
  };
  
  try {
    // Test 1: Basic encryption/decryption
    await testBasicEncryption(testResults);
    
    // Test 2: Field-level encryption
    await testFieldEncryption(testResults);
    
    // Test 3: Hash functions
    await testHashFunctions(testResults);
    
    // Test 4: Cache performance
    await testCachePerformance(testResults);
    
    // Test 5: Error handling
    await testErrorHandling(testResults);
    
    if (RUN_DATABASE_TESTS) {
      // Test 6: User service encryption
      await testUserServiceEncryption(testResults);
      
      // Test 7: Subscription service encryption
      await testSubscriptionServiceEncryption(testResults);
      
      // Test 8: Payment service encryption
      await testPaymentServiceEncryption(testResults);
      
      // Test 9: Database performance
      await testDatabasePerformance(testResults);
    }
    
  } catch (error) {
    testResults.failed++;
    testResults.errors.push(`Global test error: ${error.message}`);
    console.error('❌ Global test error:', error);
  }
  
  // Print results
  console.log('\n📊 Test Results Summary');
  console.log('=======================');
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  
  if (testResults.errors.length > 0) {
    console.log('\n🚨 Errors:');
    testResults.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error}`);
    });
  }
  
  // Performance metrics
  console.log('\n⚡ Performance Metrics:');
  const cacheStats = getCacheStats();
  console.log(`Cache entries: ${cacheStats.totalEntries}`);
  console.log(`Valid entries: ${cacheStats.validEntries}`);
  console.log(`Expired entries: ${cacheStats.expiredEntries}`);
  
  const success = testResults.failed === 0;
  console.log(`\n🎯 Overall Result: ${success ? 'SUCCESS' : 'FAILURE'}`);
  
  process.exit(success ? 0 : 1);
}

/**
 * Test basic encryption and decryption
 */
async function testBasicEncryption(results) {
  console.log('🧪 Test 1: Basic Encryption/Decryption');
  
  try {
    const plaintext = 'This is sensitive medical data that needs encryption';
    const context = { userId: 'test-user', dataType: 'medical_data' };
    
    const startTime = Date.now();
    const encrypted = await encryptData(plaintext, TEST_KMS_KEY_ID, context);
    const encryptTime = Date.now() - startTime;
    
    if (!encrypted || typeof encrypted !== 'string') {
      throw new Error('Encryption failed - no encrypted data returned');
    }
    
    const decryptStart = Date.now();
    const decrypted = await decryptData(encrypted);
    const decryptTime = Date.now() - decryptStart;
    
    if (decrypted !== plaintext) {
      throw new Error('Decryption failed - data mismatch');
    }
    
    console.log(`   ✅ Basic encryption/decryption works`);
    console.log(`   ⏱️  Encrypt time: ${encryptTime}ms, Decrypt time: ${decryptTime}ms`);
    
    // Test null/empty values
    const nullEncrypted = await encryptData(null, TEST_KMS_KEY_ID, context);
    const nullDecrypted = await decryptData(nullEncrypted);
    
    if (nullDecrypted !== null) {
      throw new Error('Null encryption/decryption failed');
    }
    
    console.log(`   ✅ Null value handling works`);
    results.passed++;
    
  } catch (error) {
    console.log(`   ❌ Basic encryption test failed: ${error.message}`);
    results.failed++;
    results.errors.push(`Basic encryption: ${error.message}`);
  }
}

/**
 * Test field-level encryption
 */
async function testFieldEncryption(results) {
  console.log('🧪 Test 2: Field-Level Encryption');
  
  try {
    const testData = {
      id: 'user-123',
      email: 'patient@hospital.com',
      name: 'John Doe',
      age: 45,
      diagnosis: 'Type 2 Diabetes',
      public_field: 'This should not be encrypted'
    };
    
    const fieldsToEncrypt = ['email', 'name', 'diagnosis'];
    const context = { userId: testData.id, dataType: 'patient_data' };
    
    const startTime = Date.now();
    const encryptedData = await encryptFields(testData, fieldsToEncrypt, TEST_KMS_KEY_ID, context);
    const encryptTime = Date.now() - startTime;
    
    // Verify encrypted fields are different
    if (encryptedData.email === testData.email || 
        encryptedData.name === testData.name || 
        encryptedData.diagnosis === testData.diagnosis) {
      throw new Error('Fields were not encrypted');
    }
    
    // Verify unencrypted fields remain the same
    if (encryptedData.id !== testData.id || 
        encryptedData.age !== testData.age || 
        encryptedData.public_field !== testData.public_field) {
      throw new Error('Unencrypted fields were modified');
    }
    
    const decryptStart = Date.now();
    const decryptedData = await decryptFields(encryptedData, fieldsToEncrypt);
    const decryptTime = Date.now() - decryptStart;
    
    // Verify decrypted data matches original
    if (decryptedData.email !== testData.email ||
        decryptedData.name !== testData.name ||
        decryptedData.diagnosis !== testData.diagnosis) {
      throw new Error('Field decryption failed - data mismatch');
    }
    
    console.log(`   ✅ Field encryption/decryption works`);
    console.log(`   ⏱️  Encrypt time: ${encryptTime}ms, Decrypt time: ${decryptTime}ms`);
    console.log(`   🔢 Encrypted fields: ${fieldsToEncrypt.length}`);
    results.passed++;
    
  } catch (error) {
    console.log(`   ❌ Field encryption test failed: ${error.message}`);
    results.failed++;
    results.errors.push(`Field encryption: ${error.message}`);
  }
}

/**
 * Test hash functions for searchable encryption
 */
async function testHashFunctions(results) {
  console.log('🧪 Test 3: Hash Functions');
  
  try {
    const testEmail = 'patient@example.com';
    const testTransactionId = 'txn_1234567890';
    
    // Test email hashing
    const emailHash1 = hashEmail(testEmail);
    const emailHash2 = hashEmail(testEmail);
    const emailHash3 = hashEmail(testEmail.toUpperCase()); // Should be same (normalized)
    
    if (emailHash1 !== emailHash2 || emailHash1 !== emailHash3) {
      throw new Error('Email hashing is not consistent');
    }
    
    if (emailHash1.length !== 64) { // SHA-256 produces 64-char hex string
      throw new Error('Email hash has incorrect length');
    }
    
    // Test generic hashing
    const genericHash1 = hashForIndex(testTransactionId);
    const genericHash2 = hashForIndex(testTransactionId);
    
    if (genericHash1 !== genericHash2) {
      throw new Error('Generic hashing is not consistent');
    }
    
    // Test null handling
    const nullEmailHash = hashEmail(null);
    const nullGenericHash = hashForIndex(null);
    
    if (nullEmailHash !== null || nullGenericHash !== null) {
      throw new Error('Null hash handling failed');
    }
    
    console.log(`   ✅ Email hashing works (${emailHash1.substring(0, 16)}...)`);
    console.log(`   ✅ Generic hashing works (${genericHash1.substring(0, 16)}...)`);
    console.log(`   ✅ Null handling works`);
    results.passed++;
    
  } catch (error) {
    console.log(`   ❌ Hash function test failed: ${error.message}`);
    results.failed++;
    results.errors.push(`Hash functions: ${error.message}`);
  }
}

/**
 * Test cache performance and functionality
 */
async function testCachePerformance(results) {
  console.log('🧪 Test 4: Cache Performance');
  
  try {
    // Clear cache to start fresh
    clearDataKeyCache();
    
    const plaintext = 'Cache performance test data';
    const context = { userId: 'cache-test', dataType: 'performance' };
    
    // First encryption (cold cache)
    const coldStart = Date.now();
    const encrypted1 = await encryptData(plaintext, TEST_KMS_KEY_ID, context);
    const coldTime = Date.now() - coldStart;
    
    // Second encryption (warm cache)
    const warmStart = Date.now();
    const encrypted2 = await encryptData(plaintext, TEST_KMS_KEY_ID, context);
    const warmTime = Date.now() - warmStart;
    
    // Cache should improve performance
    if (warmTime >= coldTime) {
      console.log(`   ⚠️  Cache may not be working optimally (cold: ${coldTime}ms, warm: ${warmTime}ms)`);
    } else {
      console.log(`   ✅ Cache improves performance (cold: ${coldTime}ms, warm: ${warmTime}ms)`);
    }
    
    // Test cache statistics
    const stats = getCacheStats();
    if (stats.totalEntries > 0) {
      console.log(`   ✅ Cache statistics working (${stats.totalEntries} entries)`);
    }
    
    // Both encryptions should decrypt to same value
    const decrypted1 = await decryptData(encrypted1);
    const decrypted2 = await decryptData(encrypted2);
    
    if (decrypted1 !== plaintext || decrypted2 !== plaintext) {
      throw new Error('Cache interfered with encryption/decryption');
    }
    
    console.log(`   ✅ Cache doesn't interfere with encryption accuracy`);
    results.passed++;
    
  } catch (error) {
    console.log(`   ❌ Cache performance test failed: ${error.message}`);
    results.failed++;
    results.errors.push(`Cache performance: ${error.message}`);
  }
}

/**
 * Test error handling and edge cases
 */
async function testErrorHandling(results) {
  console.log('🧪 Test 5: Error Handling');
  
  try {
    let errorCount = 0;
    
    // Test invalid KMS key
    try {
      await encryptData('test', 'invalid-key-id', {});
      throw new Error('Should have failed with invalid key');
    } catch (error) {
      if (error.message.includes('Should have failed')) {
        throw error;
      }
      errorCount++;
      console.log(`   ✅ Invalid KMS key handled correctly`);
    }
    
    // Test malformed encrypted data
    try {
      await decryptData('invalid-encrypted-data');
      throw new Error('Should have failed with invalid data');
    } catch (error) {
      if (error.message.includes('Should have failed')) {
        throw error;
      }
      errorCount++;
      console.log(`   ✅ Invalid encrypted data handled correctly`);
    }
    
    // Test empty field arrays
    const testData = { field1: 'value1', field2: 'value2' };
    const emptyEncrypt = await encryptFields(testData, [], TEST_KMS_KEY_ID, {});
    if (JSON.stringify(emptyEncrypt) !== JSON.stringify(testData)) {
      throw new Error('Empty field array handling failed');
    }
    console.log(`   ✅ Empty field arrays handled correctly`);
    
    if (errorCount >= 2) {
      results.passed++;
    } else {
      throw new Error('Not all error cases were tested');
    }
    
  } catch (error) {
    console.log(`   ❌ Error handling test failed: ${error.message}`);
    results.failed++;
    results.errors.push(`Error handling: ${error.message}`);
  }
}

/**
 * Test UserService encryption integration
 */
async function testUserServiceEncryption(results) {
  console.log('🧪 Test 6: User Service Encryption');
  
  try {
    // Create user with encrypted PII
    const startTime = Date.now();
    const createdUser = await UserService.create(testUser);
    const createTime = Date.now() - startTime;
    
    if (!createdUser.id || createdUser.email !== testUser.email) {
      throw new Error('User creation failed');
    }
    
    // Find user by external ID
    const foundUser = await UserService.findByExternalId(testUser.externalId, testUser.authProvider);
    if (!foundUser || foundUser.email !== testUser.email) {
      throw new Error('User lookup by external ID failed');
    }
    
    // Find user by email hash
    const foundByEmail = await UserService.findByEmailHash(testUser.email);
    if (!foundByEmail || foundByEmail.id !== createdUser.id) {
      throw new Error('User lookup by email hash failed');
    }
    
    // Update user data
    const updateStart = Date.now();
    const updatedUser = await UserService.update(createdUser.id, {
      name: 'Updated Test User',
      given_name: 'Updated'
    });
    const updateTime = Date.now() - updateStart;
    
    if (updatedUser.name !== 'Updated Test User' || updatedUser.given_name !== 'Updated') {
      throw new Error('User update failed');
    }
    
    console.log(`   ✅ User creation works (${createTime}ms)`);
    console.log(`   ✅ User lookup by external ID works`);
    console.log(`   ✅ User lookup by email hash works`);
    console.log(`   ✅ User update works (${updateTime}ms)`);
    
    // Cleanup
    await UserService.deleteUser(createdUser.id);
    console.log(`   ✅ User deletion works`);
    
    results.passed++;
    
  } catch (error) {
    console.log(`   ❌ User service test failed: ${error.message}`);
    results.failed++;
    results.errors.push(`User service: ${error.message}`);
  }
}

/**
 * Test SubscriptionService encryption
 */
async function testSubscriptionServiceEncryption(results) {
  console.log('🧪 Test 7: Subscription Service Encryption');
  
  try {
    // First create a test user
    const user = await UserService.create({
      ...testUser,
      externalId: 'sub_test_' + Date.now()
    });
    
    // Create subscription with encrypted data
    const subscriptionData = {
      ...testSubscription,
      userId: user.id
    };
    
    const createdSubscription = await SubscriptionService.createSubscription(subscriptionData);
    if (!createdSubscription.id || createdSubscription.external_subscription_id !== testSubscription.externalSubscriptionId) {
      throw new Error('Subscription creation failed');
    }
    
    // Get active subscription
    const activeSubscription = await SubscriptionService.getUserActiveSubscription(user.id);
    if (!activeSubscription || activeSubscription.id !== createdSubscription.id) {
      throw new Error('Active subscription lookup failed');
    }
    
    // Update subscription status
    const updatedSubscription = await SubscriptionService.updateSubscriptionStatus(createdSubscription.id, 'expired');
    if (updatedSubscription.subscription_status !== 'expired') {
      throw new Error('Subscription status update failed');
    }
    
    console.log(`   ✅ Subscription creation works`);
    console.log(`   ✅ Active subscription lookup works`);
    console.log(`   ✅ Subscription status update works`);
    
    // Cleanup
    await UserService.deleteUser(user.id);
    
    results.passed++;
    
  } catch (error) {
    console.log(`   ❌ Subscription service test failed: ${error.message}`);
    results.failed++;
    results.errors.push(`Subscription service: ${error.message}`);
  }
}

/**
 * Test PaymentService encryption (PCI DSS compliance)
 */
async function testPaymentServiceEncryption(results) {
  console.log('🧪 Test 8: Payment Service Encryption (PCI DSS)');
  
  try {
    // Create test user and subscription
    const user = await UserService.create({
      ...testUser,
      externalId: 'payment_test_' + Date.now()
    });
    
    const subscription = await SubscriptionService.createSubscription({
      ...testSubscription,
      userId: user.id
    });
    
    // Create payment with full encryption
    const paymentData = {
      ...testPayment,
      subscriptionId: subscription.id,
      userId: user.id
    };
    
    const startTime = Date.now();
    const createdPayment = await PaymentService.createPayment(paymentData);
    const createTime = Date.now() - startTime;
    
    if (!createdPayment.id || createdPayment.amount !== testPayment.amount) {
      throw new Error('Payment creation failed');
    }
    
    // Get payment (minimal data)
    const minimalPayment = await PaymentService.getPayment(createdPayment.id, false);
    if (minimalPayment.amount || minimalPayment.currency) {
      throw new Error('Minimal payment data should not include encrypted fields');
    }
    
    // Get payment (full decrypted data)
    const fullPayment = await PaymentService.getPayment(createdPayment.id, true);
    if (fullPayment.amount !== testPayment.amount || fullPayment.currency !== testPayment.currency) {
      throw new Error('Full payment decryption failed');
    }
    
    // Find by transaction ID
    const foundPayment = await PaymentService.findByTransactionId(testPayment.providerTransactionId);
    if (!foundPayment || foundPayment.id !== createdPayment.id) {
      throw new Error('Payment lookup by transaction ID failed');
    }
    
    console.log(`   ✅ Payment creation works (${createTime}ms)`);
    console.log(`   ✅ Minimal payment data access works`);
    console.log(`   ✅ Full payment decryption works`);
    console.log(`   ✅ Payment lookup by transaction ID works`);
    
    // Cleanup
    await UserService.deleteUser(user.id);
    
    results.passed++;
    
  } catch (error) {
    console.log(`   ❌ Payment service test failed: ${error.message}`);
    results.failed++;
    results.errors.push(`Payment service: ${error.message}`);
  }
}

/**
 * Test database performance with encryption
 */
async function testDatabasePerformance(results) {
  console.log('🧪 Test 9: Database Performance');
  
  try {
    const iterations = 10;
    const users = [];
    
    // Bulk user creation
    const createStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      const user = await UserService.create({
        ...testUser,
        externalId: `perf_test_${i}_${Date.now()}`,
        email: `perf_test_${i}@example.com`
      });
      users.push(user);
    }
    const createTime = Date.now() - createStart;
    const avgCreateTime = createTime / iterations;
    
    // Bulk user retrieval
    const readStart = Date.now();
    for (const user of users) {
      const retrieved = await UserService.findById(user.id);
      if (!retrieved || retrieved.email !== user.email) {
        throw new Error(`User ${user.id} retrieval failed`);
      }
    }
    const readTime = Date.now() - readStart;
    const avgReadTime = readTime / iterations;
    
    console.log(`   ✅ Bulk user creation: ${createTime}ms (avg: ${avgCreateTime.toFixed(2)}ms/user)`);
    console.log(`   ✅ Bulk user retrieval: ${readTime}ms (avg: ${avgReadTime.toFixed(2)}ms/user)`);
    
    // Performance target: < 100ms per operation (as per requirements)
    if (avgCreateTime > 100 || avgReadTime > 100) {
      console.log(`   ⚠️  Performance warning: Create ${avgCreateTime.toFixed(2)}ms, Read ${avgReadTime.toFixed(2)}ms (target: <100ms)`);
    } else {
      console.log(`   ✅ Performance targets met`);
    }
    
    // Cleanup
    for (const user of users) {
      await UserService.deleteUser(user.id);
    }
    
    results.passed++;
    
  } catch (error) {
    console.log(`   ❌ Database performance test failed: ${error.message}`);
    results.failed++;
    results.errors.push(`Database performance: ${error.message}`);
  }
}

// Run the tests
if (require.main === module) {
  runTests().catch(error => {
    console.error('❌ Test runner crashed:', error);
    process.exit(1);
  });
}

module.exports = {
  runTests,
  testBasicEncryption,
  testFieldEncryption,
  testHashFunctions,
  testCachePerformance,
  testErrorHandling
};