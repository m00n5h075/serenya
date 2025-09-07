-- ENUM Definitions for Serenya Healthcare Platform
-- Consolidated reference for all database ENUM types
-- Created: September 7, 2025
-- Source: database-architecture.md and audit-logging.md specifications

-- ========================================
-- AUTHENTICATION & USER MANAGEMENT ENUMS
-- ========================================

-- OAuth provider types for user authentication
CREATE TYPE auth_provider_type AS ENUM ('google', 'apple', 'facebook');

-- User account status lifecycle
CREATE TYPE account_status_type AS ENUM ('active', 'suspended', 'deactivated', 'deleted');

-- Device management status
CREATE TYPE device_status_type AS ENUM ('active', 'inactive', 'revoked');

-- Biometric authentication types
CREATE TYPE biometric_type AS ENUM ('fingerprint', 'face', 'voice');

-- User session status for JWT management
CREATE TYPE session_status_type AS ENUM ('active', 'expired', 'revoked');

-- ========================================
-- LEGAL COMPLIANCE ENUMS
-- ========================================

-- Consent types for onboarding (5 consent types mapping to 2 UI checkboxes)
-- Checkbox 1 -> terms_of_service, privacy_policy, healthcare_consultation
-- Checkbox 2 -> medical_disclaimer, emergency_care_limitation
CREATE TYPE consent_type AS ENUM (
  'terms_of_service',        -- Legal agreement to app terms and conditions
  'privacy_policy',          -- Agreement to data collection and privacy practices
  'medical_disclaimer',      -- Understanding that Serenya is not a medical device
  'healthcare_consultation', -- Agreement to always consult healthcare professionals
  'emergency_care_limitation' -- Understanding of limitations in emergency situations
);

-- ========================================
-- SUBSCRIPTION & PAYMENT ENUMS
-- ========================================

-- Subscription status lifecycle
CREATE TYPE subscription_status_type AS ENUM ('active', 'expired', 'cancelled', 'pending');

-- Subscription billing periods
CREATE TYPE subscription_type AS ENUM ('monthly', 'yearly');

-- Payment provider integrations
CREATE TYPE payment_provider_type AS ENUM ('apple', 'google', 'stripe');

-- Payment transaction status
CREATE TYPE payment_status_type AS ENUM ('pending', 'completed', 'failed', 'refunded', 'disputed');

-- ========================================
-- CONTENT & UI ENUMS
-- ========================================

-- Content types for AI processing results
CREATE TYPE content_type AS ENUM ('result', 'report');

-- Chat message sender identification
CREATE TYPE message_sender_type AS ENUM ('user', 'serenya');

-- Chat option categorization for UI organization
CREATE TYPE chat_category_type AS ENUM ('explanation', 'doctor_prep', 'clarification', 'general');

-- ========================================
-- MEDICAL DATA ENUMS (Local Device Only)
-- ========================================

-- Test category classification for lab results
CREATE TYPE test_category_type AS ENUM ('blood', 'urine', 'imaging', 'other');

-- Vital signs measurement types
CREATE TYPE vital_type AS ENUM (
    'blood_pressure',    -- Systolic/diastolic measurements
    'heart_rate',        -- Beats per minute
    'temperature',       -- Body temperature in Celsius/Fahrenheit
    'weight',           -- Body weight in kg/lbs
    'height',           -- Body height in cm/inches
    'oxygen_saturation'  -- SpO2 percentage
);

-- ========================================
-- AUDIT & COMPLIANCE ENUMS
-- ========================================

-- Audit event types for comprehensive logging
CREATE TYPE audit_event_type AS ENUM (
    'authentication',      -- Login, logout, token refresh events
    'data_access',        -- Medical data access and processing
    'consent_management', -- Consent grants, withdrawals, updates
    'financial_transaction', -- Payment and subscription events
    'security_event'      -- Security violations, biometric failures
);

-- GDPR lawful basis for data processing
CREATE TYPE gdpr_lawful_basis_type AS ENUM (
    'consent',            -- User has given clear consent
    'contract',           -- Processing necessary for contract performance
    'legal_obligation',   -- Processing required by law
    'vital_interests',    -- Processing necessary to protect vital interests
    'public_task',        -- Processing for public interest or official authority
    'legitimate_interests' -- Processing for legitimate interests
);

-- Data classification levels for security and compliance
CREATE TYPE data_classification_type AS ENUM (
    'public',      -- Information that can be freely shared
    'internal',    -- Information for internal company use
    'confidential', -- Sensitive business information
    'restricted',  -- Highly sensitive information requiring special handling
    'medical_phi'  -- Protected Health Information under HIPAA
);

-- ========================================
-- ENUM VALUE DESCRIPTIONS
-- ========================================

-- Account Status Values:
-- • active: Normal functioning account
-- • suspended: Temporarily disabled (admin action, policy violations)
-- • deactivated: User-initiated deactivation (can be reactivated)
-- • deleted: Permanent deletion (GDPR/user request)

-- Subscription Status Values:
-- • active: Current subscription with valid billing
-- • expired: Subscription period ended, grace period may apply
-- • cancelled: User cancelled, access until period end
-- • pending: New subscription awaiting payment confirmation

-- Payment Status Values:
-- • pending: Payment initiated but not confirmed
-- • completed: Successful payment processed
-- • failed: Payment attempt unsuccessful
-- • refunded: Payment reversed to customer
-- • disputed: Payment under dispute/chargeback

-- Content Type Values:
-- • result: AI analysis of specific medical documents/data (free tier)
-- • report: Comprehensive reports derived from complete medical history (premium tier)

-- Device Status Values:
-- • active: Device is registered and can authenticate
-- • inactive: Device temporarily disabled
-- • revoked: Device permanently disabled (security concern)

-- Session Status Values:
-- • active: Valid session with unexpired tokens
-- • expired: Session expired, requires refresh or re-authentication
-- • revoked: Session invalidated due to security or user action

-- Biometric Type Values:
-- • fingerprint: Touch ID / Fingerprint authentication
-- • face: Face ID / Facial recognition authentication
-- • voice: Voice biometric authentication (future implementation)

-- Chat Category Values:
-- • explanation: Questions about explaining results in simpler terms
-- • doctor_prep: Questions about preparing for doctor visits
-- • clarification: Questions seeking clarification or additional details
-- • general: General health-related questions and advice

-- Audit Event Type Values:
-- • authentication: Login/logout, token refresh, biometric auth events
-- • data_access: Medical document processing, result viewing events
-- • consent_management: Consent grants, withdrawals, policy updates
-- • financial_transaction: Payments, subscriptions, billing events
-- • security_event: Failed authentications, security violations

-- GDPR Lawful Basis Values:
-- • consent: User has explicitly consented to processing
-- • contract: Processing necessary for service delivery
-- • legal_obligation: Required by healthcare or financial regulations
-- • vital_interests: Emergency medical situations
-- • public_task: Public health or safety requirements
-- • legitimate_interests: Business operations with privacy balance

-- Data Classification Values:
-- • public: No sensitivity (app version, public content)
-- • internal: Business data (usage statistics, performance metrics)
-- • confidential: User profile data, preferences, non-medical PII
-- • restricted: Authentication tokens, payment data, admin functions
-- • medical_phi: All medical data, health information under HIPAA protection

-- ========================================
-- USAGE GUIDELINES
-- ========================================

-- 1. All ENUM types should be referenced in application code constants
-- 2. New ENUM values can be added with ALTER TYPE ADD VALUE IF NOT EXISTS
-- 3. ENUM values cannot be removed - use application logic to deprecate
-- 4. Always use database constraints to validate ENUM values
-- 5. Consider impact on existing data when modifying ENUMs
-- 6. Medical data ENUMs are for local device SQLite databases only
-- 7. Audit ENUMs support compliance with HIPAA, GDPR, and PCI DSS
-- 8. Data classification guides encryption and access control decisions

-- ========================================
-- MIGRATION COMPATIBILITY
-- ========================================

-- This file contains CREATE TYPE statements that are idempotent when used with:
-- CREATE TYPE IF NOT EXISTS (PostgreSQL 13+)
-- ALTER TYPE ADD VALUE IF NOT EXISTS (PostgreSQL 13+)

-- For backwards compatibility with existing databases:
-- 1. Check if type exists before creating
-- 2. Use ALTER TYPE to add new values to existing types
-- 3. Test all migrations in development environment first
-- 4. Coordinate with application code to handle new ENUM values

-- Example migration pattern:
-- DO $$ 
-- BEGIN
--     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'new_enum_type') THEN
--         CREATE TYPE new_enum_type AS ENUM ('value1', 'value2');
--     END IF;
-- END $$;