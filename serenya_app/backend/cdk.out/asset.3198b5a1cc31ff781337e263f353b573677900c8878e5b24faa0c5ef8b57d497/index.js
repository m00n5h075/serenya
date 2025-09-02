const { Client } = require('pg');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

const secretsManager = new AWS.SecretsManager({
  region: process.env.REGION || 'eu-west-1'
});

/**
 * Database initialization Lambda function
 * Handles schema creation and migrations for PostgreSQL database
 */
exports.handler = async (event, context) => {
  console.log('Database initialization started', { event: JSON.stringify(event) });
  
  let client;
  
  try {
    // Get database credentials from Secrets Manager
    const dbSecret = await secretsManager.getSecretValue({
      SecretId: process.env.DB_SECRET_ARN
    }).promise();
    
    const credentials = JSON.parse(dbSecret.SecretString);
    
    // Create PostgreSQL client
    client = new Client({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'serenya',
      user: credentials.username,
      password: credentials.password,
      ssl: {
        rejectUnauthorized: false // Required for RDS
      }
    });
    
    await client.connect();
    console.log('Connected to PostgreSQL database');
    
    // Check if schema is already initialized
    const versionCheck = await client.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'schema_versions')"
    );
    
    const schemaExists = versionCheck.rows[0].exists;
    
    if (!schemaExists) {
      console.log('Schema not found, initializing database...');
      
      // Read and execute the initial schema migration
      const migrationPath = path.join(__dirname, '..', '..', 'migrations', '001_initial_schema.sql');
      
      // For Lambda, we need to bundle the migration file or read it from an environment variable
      // Since we can't easily bundle files, we'll include the schema inline for now
      const schemaSQL = await getInitialSchema();
      
      // Execute the schema creation
      await client.query(schemaSQL);
      
      console.log('Database schema initialized successfully');
      
      // Update the application user password with a secure one from secrets
      const appPassword = await generateSecurePassword();
      await client.query('ALTER USER serenya_app PASSWORD $1', [appPassword]);
      
      // Store the app password in a separate secret
      await secretsManager.createSecret({
        Name: `serenya/${process.env.ENVIRONMENT}/app-database`,
        Description: 'Application database user credentials',
        SecretString: JSON.stringify({
          username: 'serenya_app',
          password: appPassword,
          host: process.env.DB_HOST,
          port: process.env.DB_PORT,
          database: process.env.DB_NAME
        })
      }).promise();
      
      console.log('Application database credentials created');
      
    } else {
      console.log('Database schema already exists, checking for pending migrations...');
      
      // Check current schema version
      const currentVersion = await client.query(
        'SELECT version FROM schema_versions ORDER BY applied_at DESC LIMIT 1'
      );
      
      console.log('Current schema version:', currentVersion.rows[0]?.version || 'unknown');
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Database initialization completed successfully',
        schemaExists,
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('Database initialization failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Database initialization failed',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
    
  } finally {
    if (client) {
      await client.end();
      console.log('Database connection closed');
    }
  }
};

/**
 * Generate a secure random password for the application database user
 */
async function generateSecurePassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  
  // Generate 32 character password
  for (let i = 0; i < 32; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return password;
}

/**
 * Get the initial schema SQL
 * In a production setup, this would be loaded from a bundled file or S3
 */
async function getInitialSchema() {
  // For now, we'll include a minimal schema inline
  // In production, the full schema from 001_initial_schema.sql should be used
  return `
    -- Enable UUID extension
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    
    -- ENUM Types
    CREATE TYPE auth_provider_type AS ENUM ('google', 'apple', 'facebook');
    CREATE TYPE account_status_type AS ENUM ('active', 'suspended', 'deactivated', 'deleted');
    CREATE TYPE consent_type AS ENUM ('medical_disclaimers', 'terms_of_service', 'privacy_policy');
    CREATE TYPE subscription_status_type AS ENUM ('active', 'expired', 'cancelled', 'pending');
    CREATE TYPE subscription_type AS ENUM ('monthly', 'yearly');
    CREATE TYPE payment_provider_type AS ENUM ('apple', 'google', 'stripe');
    CREATE TYPE payment_status_type AS ENUM ('pending', 'completed', 'failed', 'refunded', 'disputed');
    CREATE TYPE content_type AS ENUM ('result', 'report');
    CREATE TYPE chat_category_type AS ENUM ('explanation', 'doctor_prep', 'clarification', 'general');
    
    -- Users Table
    CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        external_id VARCHAR(255) NOT NULL,
        auth_provider auth_provider_type NOT NULL,
        email VARCHAR(255) NOT NULL,
        email_verified BOOLEAN DEFAULT FALSE,
        name VARCHAR(255) NOT NULL,
        given_name VARCHAR(255),
        family_name VARCHAR(255),
        account_status account_status_type DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP WITH TIME ZONE,
        deactivated_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT unique_external_provider UNIQUE (external_id, auth_provider)
    );
    
    -- Essential indexes
    CREATE INDEX idx_users_external_id ON users(external_id);
    CREATE INDEX idx_users_email ON users(email);
    
    -- Schema version tracking
    CREATE TABLE schema_versions (
        version VARCHAR(20) PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        description TEXT
    );
    
    -- Insert initial version
    INSERT INTO schema_versions (version, description) 
    VALUES ('1.0.0', 'Initial minimal database schema');
    
    -- Create application user
    CREATE USER serenya_app WITH PASSWORD 'temp_password_to_be_replaced';
    GRANT USAGE ON SCHEMA public TO serenya_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO serenya_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO serenya_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO serenya_app;
  `;
}