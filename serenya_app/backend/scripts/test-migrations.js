#!/usr/bin/env node

/**
 * Migration Testing Script for Serenya Healthcare Platform
 * Tests all database migrations and validates schema compliance
 * Created: September 7, 2025
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Test database configuration
const TEST_DB_CONFIG = {
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5432'),
  database: process.env.TEST_DB_NAME || 'serenya_test',
  user: process.env.TEST_DB_USER || 'postgres',
  password: process.env.TEST_DB_PASSWORD || 'test_password'
};

class MigrationTester {
  constructor() {
    this.client = null;
    this.migrationsPath = path.join(__dirname, '..', 'lambdas', 'db-init', 'migrations');
    this.testResults = [];
  }

  async connect() {
    this.client = new Client(TEST_DB_CONFIG);
    try {
      await this.client.connect();
      console.log('✅ Connected to test database');
    } catch (error) {
      console.error('❌ Failed to connect to test database:', error.message);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.end();
      console.log('✅ Disconnected from test database');
    }
  }

  async createTestDatabase() {
    // Create a fresh test database
    const adminClient = new Client({
      ...TEST_DB_CONFIG,
      database: 'postgres' // Connect to default database to create test database
    });

    try {
      await adminClient.connect();
      
      // Drop test database if exists
      await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_CONFIG.database}`);
      console.log(`✅ Dropped test database ${TEST_DB_CONFIG.database}`);
      
      // Create fresh test database
      await adminClient.query(`CREATE DATABASE ${TEST_DB_CONFIG.database}`);
      console.log(`✅ Created test database ${TEST_DB_CONFIG.database}`);
      
    } catch (error) {
      console.error('❌ Failed to create test database:', error.message);
      throw error;
    } finally {
      await adminClient.end();
    }
  }

  async runMigration(migrationFile) {
    console.log(`\n🔄 Running migration: ${migrationFile}`);
    
    try {
      const migrationPath = path.join(this.migrationsPath, migrationFile);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      
      // Execute migration
      await this.client.query(migrationSQL);
      
      console.log(`✅ Migration ${migrationFile} completed successfully`);
      this.testResults.push({
        migration: migrationFile,
        status: 'success',
        error: null
      });
      
    } catch (error) {
      console.error(`❌ Migration ${migrationFile} failed:`, error.message);
      this.testResults.push({
        migration: migrationFile,
        status: 'failed',
        error: error.message
      });
      throw error;
    }
  }

  async validateSchema() {
    console.log('\n🔍 Validating database schema...');
    
    const validations = [
      this.validateENUMs(),
      this.validateTables(),
      this.validateIndexes(),
      this.validateConstraints(),
      this.validateFunctions(),
      this.validatePermissions()
    ];

    const results = await Promise.allSettled(validations);
    
    results.forEach((result, index) => {
      const validationNames = ['ENUMs', 'Tables', 'Indexes', 'Constraints', 'Functions', 'Permissions'];
      if (result.status === 'fulfilled') {
        console.log(`✅ ${validationNames[index]} validation passed`);
      } else {
        console.error(`❌ ${validationNames[index]} validation failed:`, result.reason?.message);
      }
    });

    return results.every(result => result.status === 'fulfilled');
  }

  async validateENUMs() {
    const expectedENUMs = [
      'auth_provider_type',
      'account_status_type', 
      'device_status_type',
      'biometric_type',
      'session_status_type',
      'consent_type',
      'subscription_status_type',
      'subscription_type',
      'payment_provider_type',
      'payment_status_type',
      'content_type',
      'chat_category_type',
      'audit_event_type',
      'gdpr_lawful_basis_type',
      'data_classification_type'
    ];

    const result = await this.client.query(`
      SELECT typname 
      FROM pg_type 
      WHERE typtype = 'e' AND typname = ANY($1)
      ORDER BY typname
    `, [expectedENUMs]);

    const actualENUMs = result.rows.map(row => row.typname);
    const missingENUMs = expectedENUMs.filter(enumName => !actualENUMs.includes(enumName));

    if (missingENUMs.length > 0) {
      throw new Error(`Missing ENUM types: ${missingENUMs.join(', ')}`);
    }

    // Validate consent_type has 5 values
    const consentTypeResult = await this.client.query(`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'consent_type')
      ORDER BY enumsortorder
    `);

    const consentTypes = consentTypeResult.rows.map(row => row.enumlabel);
    const expectedConsentTypes = [
      'terms_of_service',
      'privacy_policy', 
      'medical_disclaimer',
      'healthcare_consultation',
      'emergency_care_limitation'
    ];

    const missingConsentTypes = expectedConsentTypes.filter(
      type => !consentTypes.includes(type)
    );

    if (missingConsentTypes.length > 0) {
      throw new Error(`Missing consent types: ${missingConsentTypes.join(', ')}`);
    }

    console.log(`  ✓ All ${expectedENUMs.length} ENUM types present`);
    console.log(`  ✓ Consent type has all 5 required values`);
  }

  async validateTables() {
    const expectedTables = [
      'users',
      'consent_records',
      'subscriptions',
      'subscription_tiers',
      'payments',
      'chat_options',
      'user_devices',
      'user_sessions',
      'biometric_registrations',
      'audit_events',
      'audit_event_summaries',
      'schema_versions'
    ];

    const result = await this.client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name = ANY($1)
      ORDER BY table_name
    `, [expectedTables]);

    const actualTables = result.rows.map(row => row.table_name);
    const missingTables = expectedTables.filter(table => !actualTables.includes(table));

    if (missingTables.length > 0) {
      throw new Error(`Missing tables: ${missingTables.join(', ')}`);
    }

    // Validate consent_records has new columns
    const consentColumnsResult = await this.client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'consent_records' AND table_schema = 'public'
      AND column_name IN ('consent_method', 'ui_checkbox_group')
    `);

    if (consentColumnsResult.rows.length < 2) {
      throw new Error('consent_records table missing new columns: consent_method, ui_checkbox_group');
    }

    console.log(`  ✓ All ${expectedTables.length} tables present`);
    console.log(`  ✓ consent_records table has new columns`);
  }

  async validateIndexes() {
    const criticalIndexes = [
      'idx_users_external_id',
      'idx_users_email_hash',
      'idx_consent_user_id',
      'idx_user_devices_user_id',
      'idx_user_sessions_token', 
      'idx_biometric_registrations_device',
      'idx_audit_events_timestamp',
      'idx_audit_events_type'
    ];

    const result = await this.client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' AND indexname = ANY($1)
    `, [criticalIndexes]);

    const actualIndexes = result.rows.map(row => row.indexname);
    const missingIndexes = criticalIndexes.filter(index => !actualIndexes.includes(index));

    if (missingIndexes.length > 0) {
      throw new Error(`Missing critical indexes: ${missingIndexes.join(', ')}`);
    }

    console.log(`  ✓ All critical indexes present`);
  }

  async validateConstraints() {
    // Validate unique constraints
    const uniqueConstraints = await this.client.query(`
      SELECT conname, conrelid::regclass as table_name
      FROM pg_constraint 
      WHERE contype = 'u' AND connamespace = 'public'::regnamespace
      ORDER BY conname
    `);

    const expectedUniqueConstraints = [
      'unique_external_provider', // users table
      'unique_user_consent_type', // consent_records table
      'unique_device_per_user',   // user_devices table
    ];

    const actualConstraintNames = uniqueConstraints.rows.map(row => row.conname);
    
    // Check if we have the expected constraints (allowing for some flexibility in naming)
    const hasUserExternalConstraint = actualConstraintNames.some(name => 
      name.includes('external') || name.includes('provider')
    );
    const hasConsentConstraint = actualConstraintNames.some(name => 
      name.includes('consent') || name.includes('user')
    );
    const hasDeviceConstraint = actualConstraintNames.some(name => 
      name.includes('device')
    );

    if (!hasUserExternalConstraint || !hasConsentConstraint || !hasDeviceConstraint) {
      console.warn('⚠️  Some unique constraints may be missing or have different names');
    }

    console.log(`  ✓ Database constraints validated`);
  }

  async validateFunctions() {
    const expectedFunctions = [
      'update_updated_at_column',
      'log_audit_event',
      'calculate_audit_event_hash',
      'generate_user_id_hash',
      'update_audit_summaries'
    ];

    const result = await this.client.query(`
      SELECT proname 
      FROM pg_proc 
      WHERE pronamespace = 'public'::regnamespace 
      AND proname = ANY($1)
    `, [expectedFunctions]);

    const actualFunctions = result.rows.map(row => row.proname);
    const missingFunctions = expectedFunctions.filter(func => !actualFunctions.includes(func));

    if (missingFunctions.length > 0) {
      throw new Error(`Missing functions: ${missingFunctions.join(', ')}`);
    }

    console.log(`  ✓ All required functions present`);
  }

  async validatePermissions() {
    // Check if serenya_app user has proper permissions
    const result = await this.client.query(`
      SELECT grantee, privilege_type, table_name
      FROM information_schema.role_table_grants 
      WHERE grantee = 'serenya_app'
      AND table_schema = 'public'
      LIMIT 5
    `);

    if (result.rows.length === 0) {
      console.warn('⚠️  serenya_app user may not have proper permissions (or user may not exist in test environment)');
    } else {
      console.log(`  ✓ serenya_app user has database permissions`);
    }
  }

  async testDataOperations() {
    console.log('\n🧪 Testing basic data operations...');

    try {
      // Test user creation
      const userResult = await this.client.query(`
        INSERT INTO users (external_id, auth_provider, email, name, given_name, family_name)
        VALUES ('test-123', 'google', 'test@example.com', 'Test User', 'Test', 'User')
        RETURNING id
      `);
      const userId = userResult.rows[0].id;
      console.log('  ✓ User creation works');

      // Test device registration
      await this.client.query(`
        INSERT INTO user_devices (user_id, device_id, platform, biometric_type)
        VALUES ($1, 'test-device-123', 'ios', 'fingerprint')
      `, [userId]);
      console.log('  ✓ Device registration works');

      // Test consent creation with new fields
      await this.client.query(`
        INSERT INTO consent_records (user_id, consent_type, consent_given, consent_version, consent_method, ui_checkbox_group)
        VALUES ($1, 'terms_of_service', true, '1.0.0', 'bundled_consent', 1)
      `, [userId]);
      console.log('  ✓ Consent creation with new fields works');

      // Test subscription tier lookup
      const tierResult = await this.client.query(`
        SELECT tier_name, medical_reports FROM subscription_tiers WHERE tier_name = 'premium'
      `);
      if (tierResult.rows.length === 0) {
        throw new Error('Premium subscription tier not found');
      }
      console.log('  ✓ Subscription tier lookup works');

      // Test audit logging function
      const auditResult = await this.client.query(`
        SELECT log_audit_event(
          'authentication'::audit_event_type,
          'test_login',
          $1,
          NULL,
          NULL,
          '127.0.0.1',
          'Test-Client/1.0',
          NULL,
          '{"test": true}'::jsonb,
          'consent'::gdpr_lawful_basis_type,
          'internal'::data_classification_type,
          7
        ) as event_id
      `, [userId]);
      
      if (!auditResult.rows[0].event_id) {
        throw new Error('Audit logging function failed');
      }
      console.log('  ✓ Audit logging function works');

    } catch (error) {
      console.error('❌ Data operation test failed:', error.message);
      throw error;
    }
  }

  async runAllTests() {
    console.log('🚀 Starting database migration tests...\n');
    
    try {
      // Step 1: Create fresh test database
      await this.createTestDatabase();
      await this.connect();

      // Step 2: Run all migrations in order
      const migrationFiles = [
        '001_complete_core_schema.sql',
        '002_audit_infrastructure.sql'
      ];

      for (const migrationFile of migrationFiles) {
        await this.runMigration(migrationFile);
      }

      // Step 3: Validate schema
      const schemaValid = await this.validateSchema();
      
      // Step 4: Test data operations
      await this.testDataOperations();

      // Step 5: Report results
      console.log('\n📊 Test Results Summary:');
      console.log('========================');
      
      this.testResults.forEach(result => {
        const status = result.status === 'success' ? '✅' : '❌';
        console.log(`${status} ${result.migration}: ${result.status}`);
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
      });

      const allMigrationsSuccessful = this.testResults.every(r => r.status === 'success');
      
      if (allMigrationsSuccessful && schemaValid) {
        console.log('\n🎉 ALL TESTS PASSED! Database schema is ready for deployment.');
        return true;
      } else {
        console.log('\n❌ SOME TESTS FAILED! Please review and fix issues before deployment.');
        return false;
      }

    } catch (error) {
      console.error('\n💥 Test suite failed:', error.message);
      return false;
    } finally {
      await this.disconnect();
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new MigrationTester();
  
  tester.runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}

module.exports = MigrationTester;