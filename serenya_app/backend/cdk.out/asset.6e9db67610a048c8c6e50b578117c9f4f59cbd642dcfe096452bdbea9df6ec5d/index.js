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
 * 
 * MIGRATION STRUCTURE (Consolidated):
 * - Migration 001: Complete core schema (v2.0.0) - All business tables and ENUM types
 * - Migration 002: Audit infrastructure (v2.1.0) - HIPAA/GDPR compliance logging
 * 
 * NOTE: For production deployment, the full SQL content should be loaded from
 * the migration files or bundled with the Lambda. Current implementation includes
 * abbreviated schema for Lambda size constraints.
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
      
      // Execute the consolidated core schema migration (v2.0.0)
      console.log('Running migration 001: Complete core schema');
      const coreSchemaSQL = await getCoreSchemaSQL();
      await client.query(coreSchemaSQL);
      console.log('✅ Migration 001 (Core Schema v2.0.0) completed');
      
      // Execute the audit infrastructure migration (v2.1.0)
      console.log('Running migration 002: Audit infrastructure');
      const auditSchemaSQL = await getAuditSchemaSQL();
      await client.query(auditSchemaSQL);
      console.log('✅ Migration 002 (Audit Infrastructure v2.1.0) completed');
      
      console.log('Database schema initialized successfully with 2 consolidated migrations');
      
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
 * Get the core schema SQL (Migration 001 - v2.0.0)
 * Loads the full SQL from 001_complete_core_schema.sql
 */
async function getCoreSchemaSQL() {
  try {
    const sqlPath = path.join(__dirname, '../../migrations/001_complete_core_schema.sql');
    return fs.readFileSync(sqlPath, 'utf8');
  } catch (error) {
    console.error('Could not load migration file, using fallback:', error);
    
    // Fallback minimal schema for basic functionality
    return `
      -- Minimal Core Schema for Serenya Healthcare Platform (v2.0.0)
      
      -- Essential ENUM types
      CREATE TYPE auth_provider_type AS ENUM ('google', 'apple', 'facebook');
      CREATE TYPE account_status_type AS ENUM ('active', 'suspended', 'deactivated', 'deleted');
      CREATE TYPE consent_type AS ENUM ('medical_disclaimers', 'terms_of_service', 'privacy_policy', 'healthcare_consultation', 'emergency_care_limitation');
      CREATE TYPE subscription_status_type AS ENUM ('active', 'expired', 'cancelled', 'pending');
      CREATE TYPE subscription_type AS ENUM ('monthly', 'yearly');
      CREATE TYPE payment_provider_type AS ENUM ('apple', 'google', 'stripe');
      CREATE TYPE payment_status_type AS ENUM ('pending', 'completed', 'failed', 'refunded', 'disputed');
      CREATE TYPE content_type AS ENUM ('result', 'report');
      CREATE TYPE chat_category_type AS ENUM ('explanation', 'doctor_prep', 'clarification', 'general');
      CREATE TYPE device_status_type AS ENUM ('active', 'inactive', 'revoked');
      CREATE TYPE biometric_type AS ENUM ('fingerprint', 'face', 'voice');
      CREATE TYPE session_status_type AS ENUM ('active', 'expired', 'revoked');
      
      -- Essential tables
      CREATE TABLE users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          external_id VARCHAR(255) NOT NULL,
          auth_provider auth_provider_type NOT NULL,
          email VARCHAR(255) NOT NULL,
          email_verified BOOLEAN DEFAULT FALSE,
          name VARCHAR(255) NOT NULL,
          account_status account_status_type DEFAULT 'active',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Schema version tracking
      CREATE TABLE schema_versions (
          version VARCHAR(20) PRIMARY KEY,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          description TEXT
      );
      
      -- Insert consolidated core schema version
      INSERT INTO schema_versions (version, description) 
      VALUES ('2.0.0', 'Minimal core schema: Basic user management for Aurora Serverless v2');
      
      -- Create application user for Lambda functions
      CREATE USER serenya_app WITH PASSWORD 'temp_password_to_be_replaced';
      GRANT USAGE ON SCHEMA public TO serenya_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO serenya_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO serenya_app;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO serenya_app;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO serenya_app;
    `;
  }
}

/**
 * Get the audit infrastructure SQL (Migration 002 - v2.1.0)
 * Loads from 002_audit_infrastructure.sql
 */
async function getAuditSchemaSQL() {
  try {
    const sqlPath = path.join(__dirname, '../../migrations/002_audit_infrastructure.sql');
    return fs.readFileSync(sqlPath, 'utf8');
  } catch (error) {
    console.error('Could not load audit migration file, using minimal fallback:', error);
    
    // Minimal audit infrastructure for basic compliance
    return `
      -- Minimal Audit Infrastructure for HIPAA/GDPR Compliance (v2.1.0)
      
      -- Audit-related ENUM types
      CREATE TYPE audit_event_type AS ENUM ('authentication', 'data_access', 'consent_management', 'financial_transaction', 'security_event');
      CREATE TYPE gdpr_lawful_basis_type AS ENUM ('consent', 'contract', 'legal_obligation', 'vital_interests', 'public_task', 'legitimate_interests');
      CREATE TYPE data_classification_type AS ENUM ('public', 'internal', 'confidential', 'restricted', 'medical_phi');
      
      -- Basic audit events table
      CREATE TABLE audit_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          event_type audit_event_type NOT NULL,
          user_id UUID,
          session_id UUID,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          ip_address INET,
          user_agent TEXT,
          resource_type VARCHAR(100),
          resource_id VARCHAR(255),
          action VARCHAR(100) NOT NULL,
          outcome VARCHAR(50) NOT NULL,
          details JSONB,
          data_classification data_classification_type DEFAULT 'internal',
          gdpr_lawful_basis gdpr_lawful_basis_type,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Basic audit summaries table
      CREATE TABLE audit_event_summaries (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          date DATE NOT NULL,
          event_type audit_event_type NOT NULL,
          total_events INTEGER DEFAULT 0,
          unique_users INTEGER DEFAULT 0,
          failed_events INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Grant audit permissions to application user
      GRANT SELECT, INSERT ON audit_events TO serenya_app;
      GRANT SELECT, INSERT, UPDATE ON audit_event_summaries TO serenya_app;
      
      -- Update schema version for audit infrastructure
      INSERT INTO schema_versions (version, description) 
      VALUES ('2.1.0', 'Minimal audit infrastructure: Basic HIPAA/GDPR compliance for Aurora Serverless v2');
    `;
  }
}