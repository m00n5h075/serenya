-- Complete Core Schema for Serenya Healthcare Platform
-- Consolidated from original migrations 001, 002, and 003
-- Created: September 7, 2025
-- Version: 2.0.0

-- ========================================
-- 1. ALL ENUM TYPE DEFINITIONS
-- ========================================

-- Core business ENUM types
CREATE TYPE auth_provider_type AS ENUM ('google', 'apple', 'facebook');
CREATE TYPE account_status_type AS ENUM ('active', 'suspended', 'deactivated', 'deleted');
CREATE TYPE consent_type AS ENUM (
    'medical_disclaimers', 
    'terms_of_service', 
    'privacy_policy',
    'healthcare_consultation',
    'emergency_care_limitation'
);
CREATE TYPE subscription_status_type AS ENUM ('active', 'expired', 'cancelled', 'pending');
CREATE TYPE subscription_type AS ENUM ('monthly', 'yearly');
CREATE TYPE payment_provider_type AS ENUM ('apple', 'google', 'stripe');
CREATE TYPE payment_status_type AS ENUM ('pending', 'completed', 'failed', 'refunded', 'disputed');
CREATE TYPE content_type AS ENUM ('result', 'report');
CREATE TYPE chat_category_type AS ENUM ('explanation', 'doctor_prep', 'clarification', 'general', 'metrics');

-- Device and session management ENUM types
CREATE TYPE device_status_type AS ENUM ('active', 'inactive', 'revoked');
CREATE TYPE biometric_type AS ENUM ('fingerprint', 'face', 'voice');
CREATE TYPE session_status_type AS ENUM ('active', 'expired', 'revoked');

-- ========================================
-- 2. USERS TABLE - Core user authentication and profile
-- ========================================

CREATE TABLE users (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255) NOT NULL,  -- Provider's user ID (e.g., Google 'sub')
    auth_provider auth_provider_type NOT NULL,
    
    -- Profile information  
    email VARCHAR(255) NOT NULL,
    email_hash VARCHAR(64),              -- SHA-256 hash of email for searchable encryption
    email_verified BOOLEAN DEFAULT FALSE,
    name VARCHAR(255) NOT NULL,          -- Full display name
    given_name VARCHAR(255),             -- First name
    family_name VARCHAR(255),            -- Last name
    
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

-- Users table indexes for performance and encryption
CREATE INDEX idx_users_external_id ON users(external_id);
CREATE INDEX idx_users_auth_provider ON users(auth_provider);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_email_hash ON users(email_hash);
CREATE INDEX idx_users_account_status ON users(account_status);
CREATE INDEX idx_users_created_timeline ON users(created_at DESC);
CREATE INDEX idx_users_provider_external ON users(auth_provider, external_id);

-- Unique constraint for email hashes (prevent duplicate encrypted emails)
CREATE UNIQUE INDEX idx_users_email_hash_unique ON users(email_hash) WHERE email_hash IS NOT NULL;

-- ========================================
-- 3. CONSENT RECORDS TABLE - Legal compliance tracking
-- ========================================

CREATE TABLE consent_records (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Consent details
    consent_type consent_type NOT NULL,
    consent_given BOOLEAN NOT NULL,
    consent_version VARCHAR(50) NOT NULL,    -- e.g., "v2.1.0"
    
    -- Consent method tracking (from migration 003)
    consent_method VARCHAR(20) DEFAULT 'bundled_consent',
    ui_checkbox_group INTEGER,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    withdrawn_at TIMESTAMP WITH TIME ZONE,   -- NULL when consent is active
    
    -- Constraints: One record per consent type per user
    CONSTRAINT unique_user_consent_type UNIQUE (user_id, consent_type)
);

-- Consent records indexes for compliance queries
CREATE INDEX idx_consent_user_id ON consent_records(user_id);
CREATE INDEX idx_consent_type ON consent_records(consent_type);
CREATE INDEX idx_consent_withdrawn ON consent_records(withdrawn_at);
CREATE INDEX idx_consent_method ON consent_records(consent_method);

-- ========================================
-- 4. USER DEVICES TABLE - Device tracking and biometric authentication
-- ========================================

CREATE TABLE user_devices (
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

-- User devices indexes for authentication queries
CREATE INDEX idx_user_devices_user_id ON user_devices(user_id, status);
CREATE INDEX idx_user_devices_device_id ON user_devices(device_id);
CREATE INDEX idx_user_devices_active ON user_devices(status, last_active_at);
CREATE INDEX idx_user_devices_biometric ON user_devices(biometric_type, secure_element);

-- ========================================
-- 5. USER SESSIONS TABLE - Session management
-- ========================================

CREATE TABLE user_sessions (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User and device association
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES user_devices(id) ON DELETE CASCADE,
    
    -- Session tokens
    session_id TEXT NOT NULL UNIQUE,          -- JWT session identifier
    refresh_token_hash TEXT NOT NULL,        -- Hashed refresh token
    access_token_hash TEXT,                  -- Optional: hashed access token
    
    -- Session lifecycle
    status session_status_type DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Biometric authentication tracking
    last_biometric_auth_at TIMESTAMP WITH TIME ZONE,
    biometric_expires_at TIMESTAMP WITH TIME ZONE,
    requires_biometric_reauth BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT session_lifetime_check CHECK (expires_at > created_at),
    CONSTRAINT biometric_session_check CHECK (biometric_expires_at IS NULL OR biometric_expires_at > last_biometric_auth_at)
);

-- User sessions indexes for session management
CREATE INDEX idx_user_sessions_user_device ON user_sessions(user_id, device_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(session_id, status);
CREATE INDEX idx_user_sessions_refresh ON user_sessions(refresh_token_hash);
CREATE INDEX idx_user_sessions_expiry ON user_sessions(expires_at, status);
CREATE INDEX idx_user_sessions_biometric ON user_sessions(biometric_expires_at, requires_biometric_reauth);
CREATE INDEX idx_user_sessions_active ON user_sessions(user_id, status, last_accessed_at);

-- ========================================
-- 6. BIOMETRIC REGISTRATIONS TABLE - Biometric authentication
-- ========================================

CREATE TABLE biometric_registrations (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Device association
    device_id UUID NOT NULL REFERENCES user_devices(id) ON DELETE CASCADE,
    
    -- Registration details
    registration_id TEXT NOT NULL UNIQUE,     -- Client-facing registration ID
    biometric_type biometric_type NOT NULL,  -- Type of biometric registered
    
    -- Challenge-response data
    challenge TEXT NOT NULL,                  -- Current verification challenge
    challenge_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Registration status
    is_verified BOOLEAN DEFAULT FALSE,       -- Initial registration verified
    is_active BOOLEAN DEFAULT TRUE,          -- Registration is active
    verification_failures INTEGER DEFAULT 0, -- Failed verification attempts
    
    -- Security metadata
    device_attestation_data JSONB,           -- Device security attestation
    registration_metadata JSONB,             -- Additional registration context
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_verified_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT unique_device_biometric UNIQUE (device_id, biometric_type),
    CONSTRAINT valid_verification_failures CHECK (verification_failures >= 0 AND verification_failures <= 10),
    CONSTRAINT challenge_lifetime_check CHECK (challenge_expires_at > created_at)
);

-- Biometric registrations indexes for biometric operations
CREATE INDEX idx_biometric_registrations_device ON biometric_registrations(device_id, is_active);
CREATE INDEX idx_biometric_registrations_id ON biometric_registrations(registration_id);
CREATE INDEX idx_biometric_registrations_challenge ON biometric_registrations(challenge_expires_at, is_active);
CREATE INDEX idx_biometric_registrations_failures ON biometric_registrations(verification_failures, is_active);
CREATE INDEX idx_biometric_registrations_type ON biometric_registrations(biometric_type, is_verified);

-- ========================================
-- 7. SUBSCRIPTIONS TABLE - Premium subscription management
-- ========================================

CREATE TABLE subscriptions (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Subscription details
    subscription_status subscription_status_type DEFAULT 'pending',
    subscription_type subscription_type NOT NULL,
    
    -- Provider integration
    provider payment_provider_type NOT NULL,
    external_subscription_id VARCHAR(255) NOT NULL,  -- Apple/Google subscription ID
    external_subscription_id_hash VARCHAR(64),       -- SHA-256 hash for searchable encryption
    
    -- Billing periods
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT unique_external_subscription UNIQUE (provider, external_subscription_id)
);

-- Subscriptions indexes for subscription management and encryption
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(subscription_status);
CREATE INDEX idx_subscriptions_provider ON subscriptions(provider);
CREATE INDEX idx_subscriptions_end_date ON subscriptions(end_date);
CREATE INDEX idx_subscriptions_external_id_hash ON subscriptions(external_subscription_id_hash);
CREATE INDEX idx_subscriptions_created_timeline ON subscriptions(created_at DESC);
CREATE INDEX idx_subscriptions_user_status ON subscriptions(user_id, subscription_status);
CREATE INDEX idx_subscriptions_active_users ON subscriptions(user_id, end_date DESC) WHERE subscription_status = 'active';

-- ========================================
-- 8. SUBSCRIPTION TIERS TABLE - Feature management
-- ========================================

CREATE TABLE subscription_tiers (
    -- Primary identification
    tier_name VARCHAR(20) PRIMARY KEY,  -- 'free', 'premium'
    
    -- Feature flags
    medical_reports BOOLEAN DEFAULT FALSE,  -- AI-generated professional analysis
    max_documents_per_month INTEGER DEFAULT NULL,  -- NULL = unlimited
    priority_processing BOOLEAN DEFAULT FALSE,     -- Faster AI processing
    advanced_analytics BOOLEAN DEFAULT FALSE,      -- Enhanced health insights
    export_capabilities BOOLEAN DEFAULT FALSE,     -- PDF export, sharing
    
    -- Pricing information
    monthly_price_usd DECIMAL(6,2) DEFAULT 0.00,
    yearly_price_usd DECIMAL(7,2) DEFAULT 0.00,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Subscription tiers indexes for efficient tier lookups
CREATE INDEX idx_subscription_tiers_medical_reports ON subscription_tiers(medical_reports);
CREATE INDEX idx_subscription_tiers_pricing ON subscription_tiers(monthly_price_usd, yearly_price_usd);

-- ========================================
-- 9. PAYMENTS TABLE - Financial transaction records
-- ========================================

CREATE TABLE payments (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Payment details
    amount DECIMAL(10,2) NOT NULL,           -- e.g., 9.99
    currency CHAR(3) NOT NULL,               -- ISO 4217: USD, EUR, etc.
    payment_status payment_status_type DEFAULT 'pending',
    
    -- Provider integration
    provider_transaction_id VARCHAR(255) NOT NULL,    -- Apple/Google/Stripe transaction ID
    provider_transaction_id_hash VARCHAR(64),         -- SHA-256 hash for searchable encryption (PCI DSS)
    payment_method VARCHAR(100) NOT NULL,             -- 'apple_pay', 'google_pay', 'credit_card'
    
    -- Timestamps
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Payments indexes for payment tracking and encryption
CREATE INDEX idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(payment_status);
CREATE INDEX idx_payments_provider_transaction ON payments(provider_transaction_id);
CREATE INDEX idx_payments_provider_transaction_hash ON payments(provider_transaction_id_hash);
CREATE INDEX idx_payments_created_timeline ON payments(created_at DESC);
CREATE INDEX idx_payments_user_status ON payments(user_id, payment_status);
CREATE INDEX idx_payments_processed_timeline ON payments(processed_at DESC) WHERE processed_at IS NOT NULL;

-- ========================================
-- 10. CHAT OPTIONS TABLE - Predefined chat prompts/questions
-- ========================================

CREATE TABLE chat_options (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Content categorization
    content_type content_type NOT NULL,     -- 'result' or 'report'
    category chat_category_type NOT NULL,   -- grouping for UI organization
    
    -- Option details
    option_text TEXT NOT NULL,              -- The suggested question/prompt
    display_order INTEGER NOT NULL,         -- For consistent UI ordering
    has_sub_options BOOLEAN DEFAULT FALSE,  -- Whether this option needs sub-option selection
    is_active BOOLEAN DEFAULT TRUE,         -- Enable/disable without deletion
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT unique_content_category_order UNIQUE (content_type, category, display_order)
);

-- Chat options indexes for UI queries
CREATE INDEX idx_chat_options_content_type ON chat_options(content_type, is_active, display_order);
CREATE INDEX idx_chat_options_category ON chat_options(category);

-- ========================================
-- 11. SCHEMA VERSION TRACKING
-- ========================================

CREATE TABLE schema_versions (
    version VARCHAR(20) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

-- ========================================
-- 12. HELPER FUNCTIONS AND TRIGGERS
-- ========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply the trigger to all tables with updated_at columns
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_consent_records_updated_at BEFORE UPDATE ON consent_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_devices_updated_at BEFORE UPDATE ON user_devices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_sessions_updated_at BEFORE UPDATE ON user_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_biometric_registrations_updated_at BEFORE UPDATE ON biometric_registrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscription_tiers_updated_at BEFORE UPDATE ON subscription_tiers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_chat_options_updated_at BEFORE UPDATE ON chat_options FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 13. APPLICATION USER SETUP
-- ========================================

-- Create application user for Lambda functions
CREATE USER serenya_app WITH PASSWORD 'temp_password_to_be_replaced';

-- Grant necessary permissions to application user
GRANT USAGE ON SCHEMA public TO serenya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO serenya_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO serenya_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO serenya_app;

-- Grant permissions on future tables and sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO serenya_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO serenya_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO serenya_app;

-- ========================================
-- 14. DEFAULT DATA INSERTION
-- ========================================

-- Insert default subscription tiers
INSERT INTO subscription_tiers (tier_name, medical_reports, max_documents_per_month, priority_processing, advanced_analytics, export_capabilities, monthly_price_usd, yearly_price_usd) VALUES
('free', FALSE, 5, FALSE, FALSE, FALSE, 0.00, 0.00),      -- Free: 5 docs/month, basic features
('premium', TRUE, NULL, TRUE, TRUE, TRUE, 9.99, 99.99)     -- Premium: Unlimited docs, all features
ON CONFLICT (tier_name) DO UPDATE SET
    medical_reports = EXCLUDED.medical_reports,
    max_documents_per_month = EXCLUDED.max_documents_per_month,
    priority_processing = EXCLUDED.priority_processing,
    advanced_analytics = EXCLUDED.advanced_analytics,
    export_capabilities = EXCLUDED.export_capabilities,
    monthly_price_usd = EXCLUDED.monthly_price_usd,
    yearly_price_usd = EXCLUDED.yearly_price_usd,
    updated_at = CURRENT_TIMESTAMP;

-- Insert default chat options
INSERT INTO chat_options (content_type, category, option_text, display_order, has_sub_options) VALUES
-- Result chat options
('result', 'explanation', 'Can you explain this in simpler terms?', 1, false),
('result', 'explanation', 'What do these numbers mean for my health?', 2, false),
('result', 'doctor_prep', 'What should I ask my doctor about these results?', 1, false),
('result', 'doctor_prep', 'What questions should I prepare for my next appointment?', 2, false),
('result', 'clarification', 'Are there any immediate concerns I should know about?', 1, false),
('result', 'clarification', 'How do these results compare to normal ranges?', 2, false),
('result', 'metrics', 'Explain specific metric', 1, true),
('result', 'general', 'What lifestyle changes might help improve these results?', 1, false),

-- Report chat options  
('report', 'explanation', 'Can you summarize the key findings?', 1, false),
('report', 'explanation', 'What are the most important points in this report?', 2, false),
('report', 'doctor_prep', 'How should I present this to my doctor?', 1, false),
('report', 'doctor_prep', 'What questions should I ask based on this analysis?', 2, false),
('report', 'clarification', 'Are there any patterns or trends I should be aware of?', 1, false),
('report', 'clarification', 'What do these recommendations mean for my care?', 2, false),
('report', 'general', 'How can I use this information to improve my health?', 1, false);

-- ========================================
-- 15. TABLE COMMENTS FOR DOCUMENTATION
-- ========================================

-- Add comprehensive comments for documentation
COMMENT ON TABLE users IS 'Core user authentication and profile information with encryption support';
COMMENT ON TABLE consent_records IS 'Legal compliance tracking for medical disclaimers, terms of service, and privacy policy';
COMMENT ON TABLE user_devices IS 'Track registered devices for authentication and session management';
COMMENT ON TABLE user_sessions IS 'Track user sessions, refresh tokens, and biometric re-authentication requirements';
COMMENT ON TABLE biometric_registrations IS 'Manage biometric authentication registrations and challenge-response flow';
COMMENT ON TABLE subscriptions IS 'Premium subscription management for enhanced features';
COMMENT ON TABLE subscription_tiers IS 'Define available features and pricing for each subscription tier';
COMMENT ON TABLE payments IS 'Financial transaction records for subscription billing';
COMMENT ON TABLE chat_options IS 'Predefined chat prompts and questions for user interface';
COMMENT ON TABLE schema_versions IS 'Database schema version tracking for migrations';

-- Add comments for encryption fields
COMMENT ON COLUMN users.email_hash IS 'SHA-256 hash of email for searchable encrypted data';
COMMENT ON COLUMN subscriptions.external_subscription_id_hash IS 'SHA-256 hash of external subscription ID for searchable encrypted data';
COMMENT ON COLUMN payments.provider_transaction_id_hash IS 'SHA-256 hash of provider transaction ID for searchable encrypted data (PCI DSS compliance)';

-- Add comments for consent tracking
COMMENT ON COLUMN consent_records.consent_method IS 'Method of consent collection: bundled_consent or granular_consent';
COMMENT ON COLUMN consent_records.ui_checkbox_group IS 'UI checkbox group that collected this consent (1 or 2)';

-- Add comments for device and biometric security
COMMENT ON COLUMN user_devices.secure_element IS 'Whether device supports hardware-backed secure element';
COMMENT ON COLUMN user_devices.public_key IS 'Device hardware public key for biometric authentication verification';
COMMENT ON COLUMN user_sessions.biometric_expires_at IS 'When biometric authentication expires (typically 7 days)';
COMMENT ON COLUMN user_sessions.requires_biometric_reauth IS 'Whether user needs to re-authenticate with biometrics';
COMMENT ON COLUMN biometric_registrations.challenge IS 'Current verification challenge for biometric authentication';
COMMENT ON COLUMN biometric_registrations.device_attestation_data IS 'Device security attestation data for hardware validation';
COMMENT ON COLUMN subscription_tiers.max_documents_per_month IS 'Maximum documents per month (NULL = unlimited)';

-- ========================================
-- 16. DOCUMENT PROCESSING TABLES
-- ========================================

-- Document processing job statuses
CREATE TYPE processing_status AS ENUM (
    'uploaded',      -- File uploaded, waiting for processing
    'processing',    -- Currently being processed by AI
    'completed',     -- Processing completed successfully  
    'failed',        -- Processing failed
    'timeout',       -- Processing timed out
    'retrying'       -- Retry in progress
);

-- Document file types supported
CREATE TYPE document_file_type AS ENUM (
    'pdf',
    'jpg', 
    'jpeg',
    'png'
);

-- Document processing jobs table
CREATE TABLE processing_jobs (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id TEXT NOT NULL UNIQUE,               -- Client-facing job identifier
    
    -- User association (encrypted PII reference)
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- File information
    original_filename TEXT NOT NULL,           -- User's original filename (encrypted)
    sanitized_filename TEXT NOT NULL,          -- Sanitized filename for storage (encrypted)
    file_type document_file_type NOT NULL,     -- File type enum
    file_size BIGINT NOT NULL,                 -- File size in bytes
    file_checksum TEXT,                        -- SHA-256 checksum for integrity
    
    -- S3 storage information
    s3_bucket TEXT NOT NULL,                   -- S3 bucket name
    s3_key TEXT NOT NULL,                      -- S3 object key
    s3_encryption_key_id TEXT,                 -- KMS key ID used for encryption
    
    -- Processing status and timing
    status processing_status NOT NULL DEFAULT 'uploaded',
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    
    -- Timestamps for processing pipeline
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processing_started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    
    -- Retry management
    retry_count INTEGER DEFAULT 0 CHECK (retry_count >= 0 AND retry_count <= 3),
    last_retry_at TIMESTAMP WITH TIME ZONE,
    scheduled_retry_at TIMESTAMP WITH TIME ZONE,
    max_retries INTEGER DEFAULT 3,
    
    -- Processing duration tracking
    processing_duration_ms BIGINT,             -- Total processing time in milliseconds
    upload_to_start_delay_ms BIGINT,           -- Time from upload to processing start
    
    -- Error information
    error_message TEXT,                        -- Error details for failed jobs
    error_code TEXT,                           -- Structured error codes
    timeout_reason TEXT,                       -- Timeout classification
    
    -- Request context
    user_agent TEXT,                           -- Client user agent
    source_ip INET,                            -- Source IP for audit trail
    session_id TEXT,                           -- User session identifier
    correlation_id TEXT,                       -- Request correlation identifier
    api_version TEXT DEFAULT 'v1',             -- API version used
    
    -- Security validation results
    security_scan_passed BOOLEAN DEFAULT FALSE,
    magic_number_validated BOOLEAN DEFAULT FALSE,
    file_integrity_verified BOOLEAN DEFAULT FALSE,
    
    -- S3 result location (replaces processing_results table)
    s3_result_bucket TEXT,
    s3_result_key TEXT,
    confidence_score INTEGER CHECK (confidence_score >= 1 AND confidence_score <= 10),
    ai_model_used TEXT,
    ai_processing_time_ms BIGINT,
    extracted_text_length INTEGER,
    text_extraction_method TEXT,
    
    -- Data retention (HIPAA compliance)
    ttl_expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- Processing job audit events table
CREATE TABLE processing_job_events (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
    
    -- Event information
    event_type TEXT NOT NULL,                  -- 'upload', 'process_start', 'process_complete', etc.
    event_subtype TEXT,                        -- More specific event classification
    event_status TEXT NOT NULL,                -- 'success', 'error', 'warning'
    
    -- Event context
    event_message TEXT,                        -- Human-readable event description
    event_details JSONB DEFAULT '{}'::jsonb,   -- Structured event data
    error_code TEXT,                           -- Error code if applicable
    
    -- User and session context (privacy-safe)
    user_id_hash TEXT NOT NULL,               -- SHA-256 hash of user ID
    session_id TEXT,                           -- Session identifier
    correlation_id TEXT,                       -- Request correlation ID
    
    -- Request metadata
    user_agent TEXT,
    source_ip INET,
    api_endpoint TEXT,                         -- Which API endpoint was called
    request_method TEXT,                       -- HTTP method
    
    -- Performance metrics
    processing_time_ms BIGINT,                 -- Time for this specific operation
    memory_usage_mb INTEGER,                   -- Memory usage if available
    
    -- Security context
    security_scan_results JSONB,               -- Security validation results
    data_classification TEXT DEFAULT 'medical_phi',
    
    -- Compliance and retention
    gdpr_lawful_basis TEXT DEFAULT 'consent',
    retention_years INTEGER DEFAULT 7,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- 17. DOCUMENT PROCESSING INDEXES
-- ========================================

-- Processing jobs indexes
CREATE INDEX idx_processing_jobs_user_id ON processing_jobs(user_id);
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status, created_at DESC);
CREATE INDEX idx_processing_jobs_job_id ON processing_jobs(job_id);
CREATE INDEX idx_processing_jobs_retry ON processing_jobs(status, retry_count, scheduled_retry_at) WHERE status = 'retrying';
CREATE INDEX idx_processing_jobs_cleanup ON processing_jobs(ttl_expires_at) WHERE status IN ('completed', 'failed');
CREATE INDEX idx_processing_jobs_timeout ON processing_jobs(processing_started_at, status) WHERE status = 'processing';

-- Processing results indexes

-- Processing job events indexes  
CREATE INDEX idx_processing_job_events_job_id ON processing_job_events(job_id, created_at DESC);
CREATE INDEX idx_processing_job_events_user_hash ON processing_job_events(user_id_hash, created_at DESC);
CREATE INDEX idx_processing_job_events_type ON processing_job_events(event_type, event_status, created_at DESC);
CREATE INDEX idx_processing_job_events_correlation ON processing_job_events(correlation_id);

-- ========================================
-- 18. DOCUMENT PROCESSING TRIGGERS
-- ========================================

-- Auto-update updated_at timestamp for processing tables
CREATE TRIGGER update_processing_jobs_updated_at 
    BEFORE UPDATE ON processing_jobs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ========================================
-- 19. DOCUMENT PROCESSING RLS POLICIES
-- ========================================

-- Enable RLS on processing tables
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_job_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for application access
CREATE POLICY processing_jobs_user_policy ON processing_jobs
    USING (user_id = current_setting('app.current_user_id')::uuid);


CREATE POLICY processing_job_events_user_policy ON processing_job_events
    USING (job_id IN (SELECT id FROM processing_jobs WHERE user_id = current_setting('app.current_user_id')::uuid));

-- ========================================
-- 20. DOCUMENT PROCESSING FUNCTIONS
-- ========================================

-- Function to create a new processing job
CREATE OR REPLACE FUNCTION create_processing_job(
    p_job_id TEXT,
    p_user_id UUID,
    p_original_filename TEXT,
    p_sanitized_filename TEXT,
    p_file_type document_file_type,
    p_file_size BIGINT,
    p_s3_bucket TEXT,
    p_s3_key TEXT,
    p_file_checksum TEXT DEFAULT NULL,
    p_s3_encryption_key_id TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_source_ip INET DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL,
    p_correlation_id TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_job_uuid UUID;
BEGIN
    INSERT INTO processing_jobs (
        job_id, user_id, original_filename, sanitized_filename,
        file_type, file_size, s3_bucket, s3_key,
        file_checksum, s3_encryption_key_id, user_agent, source_ip,
        session_id, correlation_id
    ) VALUES (
        p_job_id, p_user_id, p_original_filename, p_sanitized_filename,
        p_file_type, p_file_size, p_s3_bucket, p_s3_key,
        p_file_checksum, p_s3_encryption_key_id, p_user_agent, p_source_ip,
        p_session_id, p_correlation_id
    ) RETURNING id INTO v_job_uuid;
    
    RETURN v_job_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update job status with timing
CREATE OR REPLACE FUNCTION update_job_status(
    p_job_id TEXT,
    p_status processing_status,
    p_error_message TEXT DEFAULT NULL,
    p_retry_count INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_now TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP;
BEGIN
    UPDATE processing_jobs 
    SET 
        status = p_status,
        processing_started_at = CASE WHEN p_status = 'processing' THEN v_now ELSE processing_started_at END,
        completed_at = CASE WHEN p_status = 'completed' THEN v_now ELSE completed_at END,
        failed_at = CASE WHEN p_status = 'failed' THEN v_now ELSE failed_at END,
        error_message = COALESCE(p_error_message, error_message),
        retry_count = COALESCE(p_retry_count, retry_count),
        last_retry_at = CASE WHEN p_status = 'retrying' THEN v_now ELSE last_retry_at END,
        processing_duration_ms = CASE 
            WHEN p_status = 'completed' AND processing_started_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (v_now - processing_started_at)) * 1000
            ELSE processing_duration_ms 
        END
    WHERE job_id = p_job_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup expired jobs
CREATE OR REPLACE FUNCTION cleanup_expired_jobs()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Delete expired job results (no longer needed - results stored in S3)
    
    -- Delete expired job events
    DELETE FROM processing_job_events 
    WHERE job_id IN (
        SELECT id FROM processing_jobs 
        WHERE ttl_expires_at < CURRENT_TIMESTAMP
    );
    
    -- Delete expired jobs
    DELETE FROM processing_jobs 
    WHERE ttl_expires_at < CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- 21. DOCUMENT PROCESSING PERMISSIONS
-- ========================================

-- Grant permissions to application user for processing tables
GRANT SELECT, INSERT, UPDATE, DELETE ON processing_jobs TO serenya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON processing_job_events TO serenya_app;

GRANT EXECUTE ON FUNCTION create_processing_job TO serenya_app;
GRANT EXECUTE ON FUNCTION update_job_status TO serenya_app;
GRANT EXECUTE ON FUNCTION cleanup_expired_jobs TO serenya_app;

-- ========================================
-- 22. SCHEMA VERSION RECORD
-- ========================================

-- Insert consolidated schema version including document processing
INSERT INTO schema_versions (version, description) 
VALUES ('3.0.0', 'Complete core schema: User management, device/session tracking, biometric authentication, subscriptions, payments, chat options, and document processing pipeline with encryption support and HIPAA compliance');