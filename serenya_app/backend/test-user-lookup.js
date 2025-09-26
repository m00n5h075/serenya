#!/usr/bin/env node
/**
 * Test script to debug user lookup issues
 * This will help us understand why duplicate users are being created
 */

const AWS = require('aws-sdk');
const { Client } = require('pg');

// Configure AWS region
AWS.config.update({region: 'eu-west-1'});
const secretsManager = new AWS.SecretsManager();

// Import encryption utilities 
const { hashEmail } = require('./lambdas/auth/encryption');

async function getDatabaseCredentials() {
  try {
    const secret = await secretsManager.getSecretValue({
      SecretId: process.env.DB_SECRET_ARN || 'serenya/dev/database'
    }).promise();
    
    return JSON.parse(secret.SecretString);
  } catch (error) {
    console.error('Failed to get database credentials:', error);
    throw error;
  }
}

async function testUserLookup() {
  let client;
  
  try {
    // Get database connection
    const credentials = await getDatabaseCredentials();
    client = new Client({
      host: process.env.DB_HOST || credentials.host,
      port: credentials.port,
      database: credentials.dbname,
      user: credentials.username,
      password: credentials.password,
      ssl: { rejectUnauthorized: false }
    });
    
    await client.connect();
    console.log('✅ Connected to database');
    
    // Test email from your logs
    const testEmail = 'serenyatester@gmail.com';
    const testGoogleSub = '113426185144286227617'; // From your JWT token
    
    console.log('\n=== TESTING USER LOOKUP ===');
    console.log('Test Email:', testEmail);
    console.log('Test Google Sub:', testGoogleSub);
    
    // 1. Check by email hash
    console.log('\n--- Testing findByEmailHash ---');
    const emailHash = hashEmail(testEmail);
    console.log('Email hash:', emailHash);
    
    const emailResult = await client.query(
      'SELECT user_id, email_hash, external_id, auth_provider, created_at FROM users WHERE email_hash = $1',
      [emailHash]
    );
    
    console.log(`Found ${emailResult.rows.length} users by email hash:`);
    emailResult.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ID: ${row.user_id}, External ID: ${row.external_id}, Provider: ${row.auth_provider}, Created: ${row.created_at}`);
    });
    
    // 2. Check by external ID
    console.log('\n--- Testing findByExternalId ---');
    const externalResult = await client.query(
      'SELECT user_id, email_hash, external_id, auth_provider, created_at FROM users WHERE external_id = $1 AND auth_provider = $2',
      [testGoogleSub, 'google']
    );
    
    console.log(`Found ${externalResult.rows.length} users by external ID:`);
    externalResult.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ID: ${row.user_id}, External ID: ${row.external_id}, Provider: ${row.auth_provider}, Created: ${row.created_at}`);
    });
    
    // 3. Show all users with this email (to check for duplicates)
    console.log('\n--- All users with this email ---');
    const allEmailUsers = await client.query(
      'SELECT user_id, email_hash, external_id, auth_provider, created_at FROM users WHERE email_hash = $1 ORDER BY created_at DESC',
      [emailHash]
    );
    
    console.log(`Total users with email ${testEmail}: ${allEmailUsers.rows.length}`);
    allEmailUsers.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ID: ${row.user_id}, External ID: ${row.external_id}, Provider: ${row.auth_provider}, Created: ${row.created_at}`);
    });
    
    // 4. Show recent users (last 10)
    console.log('\n--- Recent users (last 10) ---');
    const recentUsers = await client.query(
      'SELECT user_id, email_hash, external_id, auth_provider, created_at FROM users ORDER BY created_at DESC LIMIT 10'
    );
    
    recentUsers.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ID: ${row.user_id}, External ID: ${row.external_id}, Provider: ${row.auth_provider}, Created: ${row.created_at}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

// Run the test
if (require.main === module) {
  testUserLookup().catch(console.error);
}