#!/usr/bin/env node

/**
 * Database Schema Validation Script for Serenya Healthcare Platform
 * Validates production database against Task 1 requirements
 * Created: September 7, 2025
 */

const { Client } = require('pg');
const { UserService, ConsentService, DeviceService, SessionService, BiometricService, AuditService } = require('../lambdas/shared/database');

class DatabaseValidator {
  constructor() {
    this.client = null;
    this.validationResults = [];
  }

  async connect() {
    this.client = new Client({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'serenya',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
      await this.client.connect();
      console.log('✅ Connected to database');
      return true;
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      return false;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.end();
      console.log('✅ Disconnected from database');
    }
  }

  logResult(test, passed, details = '') {
    const status = passed ? '✅' : '❌';
    const message = `${status} ${test}`;
    console.log(details ? `${message}: ${details}` : message);
    
    this.validationResults.push({
      test,
      passed,
      details
    });
  }

  async validateTask1Requirements() {
    console.log('\n🎯 Validating Task 1: Database Schema Setup Requirements\n');
    
    // 1. Validate ENUM Types
    await this.validateENUMTypes();
    
    // 2. Validate Core Tables
    await this.validateCoreTables();
    
    // 3. Validate Device Management Tables
    await this.validateDeviceManagement();
    
    // 4. Validate Session Management
    await this.validateSessionManagement();
    
    // 5. Validate Biometric Authentication
    await this.validateBiometricAuth();
    
    // 6. Validate Audit Infrastructure
    await this.validateAuditInfrastructure();
    
    // 7. Validate Consent Management
    await this.validateConsentManagement();
    
    // 8. Validate Subscription System
    await this.validateSubscriptionSystem();
    
    // 9. Validate Performance Indexes
    await this.validatePerformanceIndexes();
    
    // 10. Validate Security Constraints
    await this.validateSecurityConstraints();
  }

  async validateENUMTypes() {
    console.log('📋 Validating ENUM Types...');
    
    const requiredENUMs = {
      'auth_provider_type': ['google', 'apple', 'facebook'],
      'account_status_type': ['active', 'suspended', 'deactivated', 'deleted'],
      'device_status_type': ['active', 'inactive', 'revoked'],
      'biometric_type': ['fingerprint', 'face', 'voice'],
      'session_status_type': ['active', 'expired', 'revoked'],
      'consent_type': ['terms_of_service', 'privacy_policy', 'medical_disclaimer', 'healthcare_consultation', 'emergency_care_limitation'],
      'subscription_status_type': ['active', 'expired', 'cancelled', 'pending'],
      'subscription_type': ['monthly', 'yearly'],
      'payment_provider_type': ['apple', 'google', 'stripe'],
      'payment_status_type': ['pending', 'completed', 'failed', 'refunded', 'disputed'],
      'content_type': ['result', 'report'],
      'chat_category_type': ['explanation', 'doctor_prep', 'clarification', 'general'],
      'audit_event_type': ['authentication', 'data_access', 'consent_management', 'financial_transaction', 'security_event'],
      'gdpr_lawful_basis_type': ['consent', 'contract', 'legal_obligation', 'vital_interests', 'public_task', 'legitimate_interests'],
      'data_classification_type': ['public', 'internal', 'confidential', 'restricted', 'medical_phi']
    };

    for (const [enumName, expectedValues] of Object.entries(requiredENUMs)) {
      try {
        const result = await this.client.query(`
          SELECT enumlabel 
          FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = $1
          ORDER BY e.enumsortorder
        `, [enumName]);

        if (result.rows.length === 0) {
          this.logResult(`ENUM ${enumName}`, false, 'Does not exist');
          continue;
        }

        const actualValues = result.rows.map(row => row.enumlabel);
        const missingValues = expectedValues.filter(val => !actualValues.includes(val));
        
        if (missingValues.length === 0) {
          this.logResult(`ENUM ${enumName}`, true, `All ${expectedValues.length} values present`);
        } else {
          this.logResult(`ENUM ${enumName}`, false, `Missing values: ${missingValues.join(', ')}`);
        }
      } catch (error) {
        this.logResult(`ENUM ${enumName}`, false, error.message);
      }
    }
  }

  async validateCoreTables() {
    console.log('\n👤 Validating Core Tables...');
    
    const coreTables = [
      { name: 'users', requiredColumns: ['id', 'external_id', 'auth_provider', 'email', 'email_hash', 'name', 'account_status'] },
      { name: 'consent_records', requiredColumns: ['id', 'user_id', 'consent_type', 'consent_given', 'consent_method', 'ui_checkbox_group'] },
      { name: 'subscriptions', requiredColumns: ['id', 'user_id', 'subscription_status', 'provider', 'external_subscription_id'] },
      { name: 'subscription_tiers', requiredColumns: ['tier_name', 'medical_reports', 'monthly_price_usd'] },
      { name: 'payments', requiredColumns: ['id', 'user_id', 'amount', 'payment_status', 'provider_transaction_id_hash'] },
      { name: 'chat_options', requiredColumns: ['id', 'content_type', 'category', 'option_text', 'is_active'] }
    ];

    for (const table of coreTables) {
      await this.validateTableStructure(table.name, table.requiredColumns);
    }
  }

  async validateDeviceManagement() {
    console.log('\n📱 Validating Device Management...');
    
    await this.validateTableStructure('user_devices', [
      'id', 'user_id', 'device_id', 'platform', 'biometric_type', 'secure_element', 'status'
    ]);

    // Test device service functionality
    try {
      const deviceCount = await this.client.query('SELECT COUNT(*) FROM user_devices');
      this.logResult('Device table accessible', true, `${deviceCount.rows[0].count} devices`);
    } catch (error) {
      this.logResult('Device table accessible', false, error.message);
    }
  }

  async validateSessionManagement() {
    console.log('\n🔐 Validating Session Management...');
    
    await this.validateTableStructure('user_sessions', [
      'id', 'user_id', 'device_id', 'session_id', 'refresh_token_hash', 'status', 
      'expires_at', 'last_biometric_auth_at', 'biometric_expires_at', 'requires_biometric_reauth'
    ]);

    // Validate session constraints
    try {
      const constraintResult = await this.client.query(`
        SELECT conname FROM pg_constraint 
        WHERE conrelid = 'user_sessions'::regclass 
        AND conname = 'session_lifetime_check'
      `);
      
      this.logResult('Session lifetime constraint', constraintResult.rows.length > 0, 
        constraintResult.rows.length > 0 ? 'Present' : 'Missing');
    } catch (error) {
      this.logResult('Session lifetime constraint', false, error.message);
    }
  }

  async validateBiometricAuth() {
    console.log('\n👆 Validating Biometric Authentication...');
    
    await this.validateTableStructure('biometric_registrations', [
      'id', 'device_id', 'registration_id', 'biometric_type', 'challenge', 
      'is_verified', 'verification_failures', 'device_attestation_data'
    ]);

    // Validate biometric constraints
    try {
      const uniqueConstraintResult = await this.client.query(`
        SELECT conname FROM pg_constraint 
        WHERE conrelid = 'biometric_registrations'::regclass 
        AND contype = 'u'
        AND conname LIKE '%device%biometric%'
      `);
      
      this.logResult('Device-biometric unique constraint', uniqueConstraintResult.rows.length > 0);
    } catch (error) {
      this.logResult('Device-biometric unique constraint', false, error.message);
    }
  }

  async validateAuditInfrastructure() {
    console.log('\n📊 Validating Audit Infrastructure...');
    
    await this.validateTableStructure('audit_events', [
      'id', 'event_timestamp', 'event_type', 'event_subtype', 'user_id_hash',
      'event_details', 'gdpr_lawful_basis', 'data_classification', 'event_hash'
    ]);

    await this.validateTableStructure('audit_event_summaries', [
      'id', 'summary_date', 'event_type', 'total_events', 'unique_users'
    ]);

    // Validate audit functions
    const auditFunctions = [
      'log_audit_event',
      'calculate_audit_event_hash', 
      'generate_user_id_hash',
      'update_audit_summaries'
    ];

    for (const funcName of auditFunctions) {
      try {
        const result = await this.client.query(`
          SELECT proname FROM pg_proc WHERE proname = $1
        `, [funcName]);
        
        this.logResult(`Audit function ${funcName}`, result.rows.length > 0);
      } catch (error) {
        this.logResult(`Audit function ${funcName}`, false, error.message);
      }
    }
  }

  async validateConsentManagement() {
    console.log('\n📝 Validating Consent Management...');
    
    // Validate consent_type ENUM has 5 values (expanded from original 3)
    try {
      const result = await this.client.query(`
        SELECT COUNT(*) as count FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'consent_type'
      `);
      
      const count = parseInt(result.rows[0].count);
      this.logResult('Consent type ENUM values', count === 5, `${count}/5 values`);
    } catch (error) {
      this.logResult('Consent type ENUM values', false, error.message);
    }

    // Validate new consent fields
    try {
      const result = await this.client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'consent_records' 
        AND column_name IN ('consent_method', 'ui_checkbox_group')
      `);
      
      this.logResult('Consent new fields', result.rows.length === 2, 
        `${result.rows.length}/2 new fields present`);
    } catch (error) {
      this.logResult('Consent new fields', false, error.message);
    }
  }

  async validateSubscriptionSystem() {
    console.log('\n💰 Validating Subscription System...');
    
    // Check subscription tiers are populated
    try {
      const result = await this.client.query(`
        SELECT tier_name, medical_reports FROM subscription_tiers ORDER BY tier_name
      `);
      
      const tiers = result.rows.map(row => row.tier_name);
      const hasFree = tiers.includes('free');
      const hasPremium = tiers.includes('premium');
      
      this.logResult('Subscription tiers populated', hasFree && hasPremium, 
        `Tiers: ${tiers.join(', ')}`);
        
      // Validate premium tier has medical reports enabled
      const premiumTier = result.rows.find(row => row.tier_name === 'premium');
      this.logResult('Premium tier medical reports', premiumTier?.medical_reports === true);
      
    } catch (error) {
      this.logResult('Subscription tiers populated', false, error.message);
    }
  }

  async validatePerformanceIndexes() {
    console.log('\n⚡ Validating Performance Indexes...');
    
    const criticalIndexes = [
      'idx_users_external_id',
      'idx_users_email_hash', 
      'idx_consent_user_id',
      'idx_subscriptions_user_id',
      'idx_payments_user_id',
      'idx_user_devices_user_id',
      'idx_user_sessions_token',
      'idx_biometric_registrations_device',
      'idx_audit_events_timestamp',
      'idx_audit_events_user'
    ];

    for (const indexName of criticalIndexes) {
      try {
        const result = await this.client.query(`
          SELECT indexname FROM pg_indexes 
          WHERE schemaname = 'public' AND indexname = $1
        `, [indexName]);
        
        this.logResult(`Index ${indexName}`, result.rows.length > 0);
      } catch (error) {
        this.logResult(`Index ${indexName}`, false, error.message);
      }
    }
  }

  async validateSecurityConstraints() {
    console.log('\n🔒 Validating Security Constraints...');
    
    // Check unique constraints
    const uniqueConstraints = [
      { table: 'users', constraint: 'unique_external_provider' },
      { table: 'consent_records', constraint: 'unique_user_consent_type' },
      { table: 'user_devices', constraint: 'unique_device_per_user' }
    ];

    for (const { table, constraint } of uniqueConstraints) {
      try {
        const result = await this.client.query(`
          SELECT conname FROM pg_constraint 
          WHERE conrelid = $1::regclass AND conname = $2
        `, [table, constraint]);
        
        this.logResult(`Constraint ${constraint}`, result.rows.length > 0);
      } catch (error) {
        this.logResult(`Constraint ${constraint}`, false, error.message);
      }
    }

    // Validate triggers for updated_at columns
    const tablesWithTriggers = ['users', 'consent_records', 'subscriptions', 'user_devices', 'user_sessions'];
    
    for (const tableName of tablesWithTriggers) {
      try {
        const result = await this.client.query(`
          SELECT trigger_name FROM information_schema.triggers 
          WHERE event_object_table = $1 AND trigger_name LIKE '%updated_at%'
        `, [tableName]);
        
        this.logResult(`Trigger ${tableName}_updated_at`, result.rows.length > 0);
      } catch (error) {
        this.logResult(`Trigger ${tableName}_updated_at`, false, error.message);
      }
    }
  }

  async validateTableStructure(tableName, requiredColumns) {
    try {
      const result = await this.client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [tableName]);

      if (result.rows.length === 0) {
        this.logResult(`Table ${tableName}`, false, 'Does not exist');
        return;
      }

      const actualColumns = result.rows.map(row => row.column_name);
      const missingColumns = requiredColumns.filter(col => !actualColumns.includes(col));

      if (missingColumns.length === 0) {
        this.logResult(`Table ${tableName}`, true, `All ${requiredColumns.length} required columns present`);
      } else {
        this.logResult(`Table ${tableName}`, false, `Missing columns: ${missingColumns.join(', ')}`);
      }
    } catch (error) {
      this.logResult(`Table ${tableName}`, false, error.message);
    }
  }

  async generateReport() {
    console.log('\n📊 VALIDATION REPORT');
    console.log('==================');
    
    const totalTests = this.validationResults.length;
    const passedTests = this.validationResults.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(`Success Rate: ${((passedTests/totalTests)*100).toFixed(1)}%`);
    
    if (failedTests > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.validationResults
        .filter(r => !r.passed)
        .forEach(r => console.log(`  • ${r.test}: ${r.details || 'Failed'}`));
    }

    const isReady = passedTests === totalTests;
    
    console.log('\n' + '='.repeat(50));
    if (isReady) {
      console.log('🎉 DATABASE IS READY FOR PRODUCTION!');
      console.log('✅ Task 1: Database Schema Setup - COMPLETE');
    } else {
      console.log('⚠️  DATABASE NEEDS ATTENTION');
      console.log('❌ Please fix failed validations before deployment');
    }
    console.log('='.repeat(50));
    
    return isReady;
  }

  async runValidation() {
    try {
      const connected = await this.connect();
      if (!connected) {
        return false;
      }

      await this.validateTask1Requirements();
      const isReady = await this.generateReport();
      
      return isReady;
    } catch (error) {
      console.error('💥 Validation failed:', error.message);
      return false;
    } finally {
      await this.disconnect();
    }
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new DatabaseValidator();
  
  validator.runValidation().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Validation runner error:', error);
    process.exit(1);
  });
}

module.exports = DatabaseValidator;