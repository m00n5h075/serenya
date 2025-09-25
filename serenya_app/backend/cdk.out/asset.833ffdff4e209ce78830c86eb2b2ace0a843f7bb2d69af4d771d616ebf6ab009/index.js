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
    
    // If fixUserFields parameter is passed, update the existing users table field sizes
    if (event.fixUserFields) {
      console.log('FIX MODE: Updating existing users table to increase VARCHAR field sizes for encrypted data...');
      
      // Drop and recreate the users table with larger fields and correct ENUM types
      const fixUsersSQL = `
        -- Create required ENUM types if they don't exist
        DO $$ BEGIN
            CREATE TYPE auth_provider_type AS ENUM ('google', 'apple', 'facebook');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;

        DO $$ BEGIN
            CREATE TYPE account_status_type AS ENUM ('active', 'suspended', 'deactivated', 'deleted');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        
        -- Drop existing users table and recreate with larger fields and correct types
        DROP TABLE IF EXISTS users CASCADE;
        
        -- Recreate users table with larger VARCHAR fields for encrypted data and correct ENUM types
        CREATE TABLE users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          
          -- Authentication identifiers  
          external_id VARCHAR(255) NOT NULL,
          auth_provider auth_provider_type NOT NULL DEFAULT 'google',
          
          -- Profile information with larger fields for encrypted data
          email VARCHAR(1000) NOT NULL,         -- Increased from 255 for encrypted data
          email_hash VARCHAR(64),               -- SHA-256 hash for searchable encryption
          email_verified BOOLEAN DEFAULT FALSE,
          name VARCHAR(1000) NOT NULL,          -- Increased from 255 for encrypted data
          given_name VARCHAR(1000),             -- Increased from 255 for encrypted data
          family_name VARCHAR(1000),            -- Increased from 255 for encrypted data
          
          -- Account management with correct ENUM type
          account_status account_status_type DEFAULT 'active',
          
          -- Timestamps
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          last_login_at TIMESTAMP WITH TIME ZONE,
          deactivated_at TIMESTAMP WITH TIME ZONE,
          
          -- Unique constraints (matching original schema)
          CONSTRAINT unique_external_provider UNIQUE (external_id, auth_provider)
        );
        
        -- Create indexes for performance (matching original schema)
        CREATE INDEX IF NOT EXISTS idx_users_external_id ON users(external_id);
        CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);
        CREATE INDEX IF NOT EXISTS idx_users_email_hash ON users(email_hash);
      `;
      
      await client.query(fixUsersSQL);
      console.log('✅ Users table recreated with larger VARCHAR fields');
      
      // Verify table update
      const verification = await client.query(`
        SELECT column_name, data_type, character_maximum_length 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND table_schema = 'public'
        ORDER BY ordinal_position
      `);
      
      console.log('UPDATED USERS TABLE STRUCTURE:');
      verification.rows.forEach(row => {
        console.log(`  ${row.column_name}: ${row.data_type}${row.character_maximum_length ? `(${row.character_maximum_length})` : ''}`);
      });
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Users table updated with larger field sizes',
          columns: verification.rows,
          timestamp: new Date().toISOString()
        })
      };
    }

    // If testUsersOnly parameter is passed, create only the users table for testing
    if (event.testUsersOnly) {
      console.log('TEST MODE: Creating only users table with larger fields for encrypted data testing...');
      
      // Create minimal users table with larger VARCHAR fields for encrypted data
      const createUsersSQL = `
        -- Create minimal users table for authentication testing
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          
          -- Authentication identifiers
          external_id VARCHAR(255) NOT NULL,
          auth_provider VARCHAR(50) NOT NULL DEFAULT 'google',
          
          -- Profile information with larger fields for encrypted data
          email VARCHAR(1000) NOT NULL,         -- Increased from 255 for encrypted data
          email_hash VARCHAR(64),               -- SHA-256 hash for searchable encryption
          email_verified BOOLEAN DEFAULT FALSE,
          name VARCHAR(1000) NOT NULL,          -- Increased from 255 for encrypted data
          given_name VARCHAR(1000),             -- Increased from 255 for encrypted data
          family_name VARCHAR(1000),            -- Increased from 255 for encrypted data
          
          -- Account management
          account_status VARCHAR(20) DEFAULT 'active',
          
          -- Timestamps
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          last_login_at TIMESTAMP WITH TIME ZONE,
          
          -- Unique constraints
          UNIQUE(external_id, auth_provider),
          UNIQUE(email_hash)
        );
        
        -- Create index on email_hash for fast lookups
        CREATE INDEX IF NOT EXISTS idx_users_email_hash ON users(email_hash);
        
        -- Create basic schema_versions table to track this test setup
        CREATE TABLE IF NOT EXISTS schema_versions (
          id SERIAL PRIMARY KEY,
          version VARCHAR(10) NOT NULL,
          description TEXT,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Record this as test schema
        INSERT INTO schema_versions (version, description) 
        VALUES ('TEST', 'Minimal users table for authentication testing')
        ON CONFLICT DO NOTHING;
      `;
      
      await client.query(createUsersSQL);
      console.log('✅ Test users table created with larger VARCHAR fields');
      
      // Verify table creation
      const verification = await client.query(`
        SELECT column_name, data_type, character_maximum_length 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND table_schema = 'public'
        ORDER BY ordinal_position
      `);
      
      console.log('USERS TABLE STRUCTURE:');
      verification.rows.forEach(row => {
        console.log(`  ${row.column_name}: ${row.data_type}${row.character_maximum_length ? `(${row.character_maximum_length})` : ''}`);
      });
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Test users table created successfully',
          columns: verification.rows,
          timestamp: new Date().toISOString()
        })
      };
    }

    // If checkTables parameter is passed, list all tables and return
    if (event.checkTables) {
      console.log('CHECKING TABLES - Listing all tables in database...');
      
      const tablesResult = await client.query(`
        SELECT table_name, table_schema 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name
      `);
      
      console.log('TABLES FOUND:', tablesResult.rows.length);
      tablesResult.rows.forEach(row => {
        console.log(`  - ${row.table_name} (schema: ${row.table_schema})`);
      });
      
      if (tablesResult.rows.length === 0) {
        console.log('❌ NO TABLES FOUND IN PUBLIC SCHEMA');
      }
      
      // Check if users table specifically exists
      const usersCheck = await client.query(`
        SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users' AND table_schema = 'public')
      `);
      console.log('USERS TABLE EXISTS:', usersCheck.rows[0].exists);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Table check completed',
          tableCount: tablesResult.rows.length,
          tables: tablesResult.rows.map(r => r.table_name),
          usersTableExists: usersCheck.rows[0].exists,
          timestamp: new Date().toISOString()
        })
      };
    }
    
    // Handle force drop and recreate
    if (event.dropAndRecreate || event.force) {
      console.log('FORCE MODE: Dropping all Serenya schema objects to force complete re-initialization...');
      
      // Drop all tables first (in dependency order)
      const tablesToDrop = [
        'audit_events', 'audit_event_summaries', 'biometric_registrations', 
        'user_sessions', 'user_devices', 'payments', 'subscriptions', 
        'consent_records', 'users', 'subscription_tiers', 'chat_options', 'schema_versions'
      ];
      
      for (const table of tablesToDrop) {
        try {
          await client.query('DROP TABLE IF EXISTS ' + table + ' CASCADE');
          console.log(`Dropped table: ${table}`);
        } catch (error) {
          console.log(`Error dropping table ${table}:`, error.message);
        }
      }
      
      // Drop all custom ENUM types
      const enumsToDrop = [
        'auth_provider_type', 'account_status_type', 'device_status_type',
        'biometric_type', 'session_status_type', 'consent_type',
        'subscription_status_type', 'subscription_type', 'payment_provider_type',
        'payment_status_type', 'content_type', 'chat_category_type',
        'audit_event_type', 'gdpr_lawful_basis_type', 'data_classification_type'
      ];
      
      for (const enumType of enumsToDrop) {
        try {
          await client.query('DROP TYPE IF EXISTS ' + enumType + ' CASCADE');
          console.log(`Dropped ENUM type: ${enumType}`);
        } catch (error) {
          console.log(`Error dropping ENUM ${enumType}:`, error.message);
        }
      }
      
      // Drop all custom functions
      const functionsToDrop = [
        'update_updated_at_column()', 'log_audit_event(text, text, uuid, uuid, uuid, inet, text, text, jsonb, text, text, integer)',
        'calculate_audit_event_hash(text, uuid, inet, jsonb)', 'generate_user_id_hash(uuid)', 'update_audit_summaries(date)'
      ];
      
      for (const func of functionsToDrop) {
        try {
          await client.query('DROP FUNCTION IF EXISTS ' + func + ' CASCADE');
          console.log(`Dropped function: ${func}`);
        } catch (error) {
          console.log(`Error dropping function ${func}:`, error.message);
        }
      }
      
      console.log('✅ Complete schema cleanup completed');
    }
    
    // Check if schema is already initialized
    const versionCheck = await client.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'schema_versions')"
    );
    
    const schemaExists = versionCheck.rows[0].exists;
    
    if (!schemaExists) {
      console.log('Schema not found, initializing database...');
      
      // Create the complete database schema directly without external files
      console.log('Creating complete database schema...');
      await createCompleteSchema(client);
      console.log('✅ Complete database schema created successfully');
      
      // Skip password management for now - focus on getting schema working
      console.log('Database schema creation completed successfully');
      
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
  const sqlPath = path.join(__dirname, 'migrations/001_complete_core_schema.sql');
  try {
    return fs.readFileSync(sqlPath, 'utf8');
  } catch (error) {
    console.error('CRITICAL ERROR: Could not load migration file:', error);
    throw new Error(`Migration file not found: ${sqlPath}. Database initialization cannot proceed without the complete schema.`);
  }
}

/**
 * Get the audit infrastructure SQL (Migration 002 - v2.1.0)
 * Loads from 002_audit_infrastructure.sql
 */
async function getAuditSchemaSQL() {
  const sqlPath = path.join(__dirname, 'migrations/002_audit_infrastructure.sql');
  try {
    return fs.readFileSync(sqlPath, 'utf8');
  } catch (error) {
    console.error('CRITICAL ERROR: Could not load audit migration file:', error);
    throw new Error(`Audit migration file not found: ${sqlPath}. Database initialization cannot proceed without the complete audit schema.`);
  }
}

/**
 * Execute multi-statement SQL by properly parsing PostgreSQL statements
 */
async function executeMultiStatementSQL(client, sql, migrationName) {
  console.log(`Executing ${migrationName} migration...`);
  
  // Parse SQL statements properly handling PostgreSQL syntax
  const statements = parsePostgreSQLStatements(sql);
    
  console.log(`Found ${statements.length} SQL statements to execute`);
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    console.log(`Executing statement ${i + 1}/${statements.length}...`);
    console.log('Statement preview:', statement.substring(0, 100) + '...');
    
    try {
      await client.query(statement);
      console.log(`✓ Statement ${i + 1} completed`);
    } catch (error) {
      console.error(`✗ Statement ${i + 1} failed:`, error.message);
      console.error('Failed statement:', statement.substring(0, 300) + '...');
      throw error;
    }
  }
  
  console.log(`${migrationName} migration completed successfully`);
}

/**
 * Create the complete database schema directly
 */
async function createCompleteSchema(client) {
  console.log('Creating ENUM types...');
  
  // Create all ENUM types
  await client.query(`
    DO $$ BEGIN
        CREATE TYPE auth_provider_type AS ENUM ('google', 'apple', 'facebook');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  
  await client.query(`
    DO $$ BEGIN
        CREATE TYPE account_status_type AS ENUM ('active', 'suspended', 'deactivated', 'deleted');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  
  await client.query(`
    DO $$ BEGIN
        CREATE TYPE consent_type AS ENUM (
            'medical_disclaimers', 
            'terms_of_service', 
            'privacy_policy',
            'healthcare_consultation',
            'emergency_care_limitation'
        );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  
  await client.query(`
    DO $$ BEGIN
        CREATE TYPE subscription_status_type AS ENUM ('active', 'expired', 'cancelled', 'pending');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  
  await client.query(`
    DO $$ BEGIN
        CREATE TYPE device_status_type AS ENUM ('active', 'inactive', 'revoked');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  
  await client.query(`
    DO $$ BEGIN
        CREATE TYPE session_status_type AS ENUM ('active', 'expired', 'revoked');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  
  await client.query(`
    DO $$ BEGIN
        CREATE TYPE biometric_type AS ENUM ('fingerprint', 'face', 'voice');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  
  console.log('Creating users table...');
  
  // Create users table with correct schema and field sizes
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
        -- Primary identification
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        external_id VARCHAR(255) NOT NULL,
        auth_provider auth_provider_type NOT NULL,
        
        -- Profile information with larger fields for encrypted data
        email VARCHAR(1000) NOT NULL,
        email_hash VARCHAR(64),
        email_verified BOOLEAN DEFAULT FALSE,
        name VARCHAR(1000) NOT NULL,
        given_name VARCHAR(1000),
        family_name VARCHAR(1000),
        
        -- Account management
        account_status account_status_type DEFAULT 'active',
        
        -- Timestamps
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP WITH TIME ZONE,
        deactivated_at TIMESTAMP WITH TIME ZONE,
        
        -- Constraints
        CONSTRAINT unique_external_provider UNIQUE (external_id, auth_provider)
    );
  `);
  
  console.log('Creating user_devices table...');
  
  // Create user_devices table
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_devices (
        -- Primary identification
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        
        -- User association
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        
        -- Device identification
        device_id TEXT NOT NULL,                    -- Client-generated unique device ID
        device_name TEXT,                          -- User-friendly device name
        
        -- Device information
        platform TEXT NOT NULL,                   -- 'ios' or 'android'
        model TEXT,                               -- Device model (e.g., 'iPhone 14 Pro')
        os_version TEXT,                          -- Operating system version
        app_version TEXT,                         -- App version at registration
        
        -- Biometric capability
        biometric_type biometric_type,            -- Primary biometric method
        secure_element BOOLEAN DEFAULT FALSE,     -- Hardware security support
        public_key TEXT,                          -- Device hardware public key for verification
        
        -- Device status
        status device_status_type DEFAULT 'active',
        last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        
        -- Timestamps
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        
        -- Constraints
        CONSTRAINT unique_device_per_user UNIQUE (user_id, device_id)
    );
  `);

  console.log('Creating user sessions table...');
  
  // Create user_sessions table
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id UUID NOT NULL REFERENCES user_devices(id) ON DELETE CASCADE,
        session_token VARCHAR(255) NOT NULL UNIQUE,
        refresh_token_hash VARCHAR(64),
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        device_info JSONB,
        ip_address INET,
        user_agent TEXT,
        last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        session_status session_status_type DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  console.log('Creating consent records table...');
  
  // Create consent_records table
  await client.query(`
    CREATE TABLE IF NOT EXISTS consent_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        consent_type consent_type NOT NULL,
        consent_given BOOLEAN NOT NULL,
        consent_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        consent_version VARCHAR(50),
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  console.log('Creating indexes...');
  
  // Create indexes for users table
  await client.query('CREATE INDEX IF NOT EXISTS idx_users_external_id ON users(external_id);');
  await client.query('CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);');
  await client.query('CREATE INDEX IF NOT EXISTS idx_users_email_hash ON users(email_hash);');
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_hash_unique ON users(email_hash) WHERE email_hash IS NOT NULL;');
  
  // Create indexes for user_sessions table
  await client.query('CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);');
  await client.query('CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);');
  await client.query('CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh ON user_sessions(refresh_token_hash);');
  await client.query('CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);');
  
  // Create indexes for consent_records table
  await client.query('CREATE INDEX IF NOT EXISTS idx_consent_records_user_id ON consent_records(user_id);');
  await client.query('CREATE INDEX IF NOT EXISTS idx_consent_records_type ON consent_records(consent_type);');
  
  console.log('Creating schema versions table...');
  
  // Create schema_versions table to track migrations
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_versions (
        id SERIAL PRIMARY KEY,
        version VARCHAR(10) NOT NULL,
        description TEXT,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Record this schema version
  await client.query(`
    INSERT INTO schema_versions (version, description) 
    VALUES ('3.0.0', 'Complete clean schema with authentication tables')
    ON CONFLICT DO NOTHING;
  `);
  
  console.log('Database schema creation completed successfully');
}

/**
 * Parse PostgreSQL statements properly handling dollar-quoted strings and complex syntax
 */
function parsePostgreSQLStatements(sql) {
  const statements = [];
  let currentStatement = '';
  let inDollarQuote = false;
  let dollarTag = '';
  let inComment = false;
  
  const lines = sql.split('\n');
  
  for (let line of lines) {
    // Skip comment lines
    if (line.trim().startsWith('--')) {
      continue;
    }
    
    // Handle dollar-quoted strings
    if (!inDollarQuote) {
      // Look for start of dollar quote
      const dollarMatch = line.match(/\$([^$]*)\$/);
      if (dollarMatch) {
        inDollarQuote = true;
        dollarTag = dollarMatch[0];
      }
    } else {
      // Look for end of dollar quote
      if (line.includes(dollarTag)) {
        inDollarQuote = false;
        dollarTag = '';
      }
    }
    
    currentStatement += line + '\n';
    
    // If we're not in a dollar quote and the line ends with semicolon, we have a complete statement
    if (!inDollarQuote && line.trim().endsWith(';')) {
      const trimmedStatement = currentStatement.trim();
      if (trimmedStatement.length > 0) {
        statements.push(trimmedStatement);
      }
      currentStatement = '';
    }
  }
  
  // Add any remaining statement
  const trimmedStatement = currentStatement.trim();
  if (trimmedStatement.length > 0) {
    statements.push(trimmedStatement);
  }
  
  return statements.filter(stmt => stmt.length > 0);
}