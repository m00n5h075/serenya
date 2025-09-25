#!/usr/bin/env node

const { Client } = require('pg');
const AWS = require('aws-sdk');

const secretsManager = new AWS.SecretsManager({
  region: process.env.AWS_REGION || 'eu-west-1'
});

async function getDatabaseCredentials() {
  const environment = process.env.ENVIRONMENT || 'dev';
  const secretName = `serenya/${environment}/database`;
  
  try {
    const secret = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
    return JSON.parse(secret.SecretString);
  } catch (error) {
    throw new Error(`Failed to get database credentials from ${secretName}: ${error.message}`);
  }
}

async function checkTables() {
  let client;
  
  try {
    console.log('🔐 Getting database credentials from AWS Secrets Manager...');
    const credentials = await getDatabaseCredentials();
    
    client = new Client({
      host: credentials.host,
      port: credentials.port || 5432,
      database: credentials.database,
      user: credentials.username,
      password: credentials.password,
      ssl: { rejectUnauthorized: false }
    });
    
    await client.connect();
    console.log('✅ Connected to database securely');
    
    // Check if users table exists
    const result = await client.query(`
      SELECT table_name, table_schema 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('📋 Tables in public schema:');
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
    if (result.rows.length === 0) {
      console.log('❌ NO TABLES FOUND IN PUBLIC SCHEMA');
    }
    
    // Check if there are any schemas
    const schemaResult = await client.query(`
      SELECT schema_name FROM information_schema.schemata 
      WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ORDER BY schema_name
    `);
    
    console.log('\n📋 Available schemas:');
    schemaResult.rows.forEach(row => {
      console.log(`  - ${row.schema_name}`);
    });
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    if (client) {
      await client.end();
      console.log('🔐 Database connection closed');
    }
  }
}

checkTables();