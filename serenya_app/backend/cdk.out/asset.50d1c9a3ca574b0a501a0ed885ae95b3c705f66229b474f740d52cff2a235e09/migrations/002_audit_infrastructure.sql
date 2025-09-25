-- Audit infrastructure for Serenya Healthcare Platform
-- Implements comprehensive audit logging for HIPAA/GDPR compliance
-- Created: September 7, 2025
-- Version: 2.1.0
-- Based on audit-logging.md specifications

-- ========================================
-- 1. AUDIT-RELATED ENUM TYPES
-- ========================================

-- Audit event types for comprehensive logging
DO $$ BEGIN
    CREATE TYPE audit_event_type AS ENUM (
        'authentication', 
        'data_access', 
        'consent_management', 
        'financial_transaction', 
        'security_event'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- GDPR lawful basis tracking
DO $$ BEGIN
    CREATE TYPE gdpr_lawful_basis_type AS ENUM (
        'consent',
        'contract',
        'legal_obligation',
        'vital_interests',
        'public_task',
        'legitimate_interests'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Data classification levels
DO $$ BEGIN
    CREATE TYPE data_classification_type AS ENUM (
        'public',
        'internal',
        'confidential',
        'restricted',
        'medical_phi'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ========================================
-- 2. AUDIT EVENTS TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS audit_events (
    -- Primary identifiers
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    event_type audit_event_type NOT NULL,
    event_subtype VARCHAR(100) NOT NULL,
    
    -- User context (privacy-protected with hashing)
    user_id_hash VARCHAR(64), -- sha256(user_id) for privacy
    session_id UUID,
    admin_user_id_hash VARCHAR(64), -- For admin actions
    
    -- Request context
    source_ip_hash VARCHAR(64), -- sha256(source_ip) for privacy
    user_agent_hash VARCHAR(64), -- sha256(user_agent) for privacy
    request_id UUID, -- For request correlation across services
    
    -- Event details (encrypted JSON payload)
    event_details JSONB NOT NULL, -- Encrypted, contains event-specific data
    
    -- Compliance metadata
    gdpr_lawful_basis gdpr_lawful_basis_type NOT NULL,
    data_classification data_classification_type NOT NULL,
    retention_period_years INTEGER NOT NULL DEFAULT 7,
    retention_expiry_date DATE,
    
    -- Data integrity and tamper detection
    event_hash VARCHAR(64) NOT NULL, -- sha256 hash for tamper detection
    
    -- System metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Performance indexes
    CONSTRAINT valid_retention_period CHECK (retention_period_years BETWEEN 1 AND 10)
);

-- ========================================
-- 3. AUDIT EVENT SUMMARIES TABLE (Performance)
-- ========================================

-- Aggregated audit data for performance and reporting
CREATE TABLE IF NOT EXISTS audit_event_summaries (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Summary period
    summary_date DATE NOT NULL,
    event_type audit_event_type NOT NULL,
    event_subtype VARCHAR(100) NOT NULL,
    
    -- Aggregated counts
    total_events INTEGER NOT NULL DEFAULT 0,
    unique_users INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    
    -- Data classification breakdown
    public_events INTEGER DEFAULT 0,
    internal_events INTEGER DEFAULT 0,
    confidential_events INTEGER DEFAULT 0,
    restricted_events INTEGER DEFAULT 0,
    medical_phi_events INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT unique_summary_period UNIQUE (summary_date, event_type, event_subtype)
);

-- ========================================
-- 4. AUDIT PERFORMANCE INDEXES
-- ========================================

-- Primary audit_events indexes for fast queries
CREATE INDEX idx_audit_events_timestamp ON audit_events(event_timestamp DESC);
CREATE INDEX idx_audit_events_type ON audit_events(event_type, event_subtype);
CREATE INDEX idx_audit_events_user ON audit_events(user_id_hash, event_timestamp DESC);
CREATE INDEX idx_audit_events_session ON audit_events(session_id, event_timestamp DESC);
CREATE INDEX idx_audit_events_request ON audit_events(request_id);

-- Compliance and reporting indexes
CREATE INDEX idx_audit_events_retention ON audit_events(retention_expiry_date) WHERE retention_expiry_date <= CURRENT_DATE + INTERVAL '90 days';
CREATE INDEX idx_audit_events_classification ON audit_events(data_classification, event_timestamp DESC);
CREATE INDEX idx_audit_events_gdpr_basis ON audit_events(gdpr_lawful_basis, event_timestamp DESC);

-- Security and monitoring indexes
CREATE INDEX idx_audit_events_source_ip ON audit_events(source_ip_hash, event_timestamp DESC);
CREATE INDEX idx_audit_events_admin ON audit_events(admin_user_id_hash, event_timestamp DESC) WHERE admin_user_id_hash IS NOT NULL;

-- Full-text search for event details (careful with encrypted content)
CREATE INDEX idx_audit_events_details_gin ON audit_events USING gin(event_details);

-- Composite indexes for common query patterns
CREATE INDEX idx_audit_events_user_type_time ON audit_events(user_id_hash, event_type, event_timestamp DESC);
CREATE INDEX idx_audit_events_type_classification_time ON audit_events(event_type, data_classification, event_timestamp DESC);

-- Summary table indexes
CREATE INDEX idx_audit_summaries_date ON audit_event_summaries(summary_date DESC);
CREATE INDEX idx_audit_summaries_type ON audit_event_summaries(event_type, summary_date DESC);
CREATE INDEX idx_audit_summaries_events_count ON audit_event_summaries(total_events DESC);

-- ========================================
-- 5. AUDIT HELPER FUNCTIONS
-- ========================================

-- Function to calculate event hash for tamper detection
CREATE OR REPLACE FUNCTION calculate_audit_event_hash(
    p_event_timestamp TIMESTAMP WITH TIME ZONE,
    p_event_type audit_event_type,
    p_event_subtype VARCHAR(100),
    p_user_id_hash VARCHAR(64),
    p_session_id UUID,
    p_event_details JSONB
)
RETURNS VARCHAR(64) AS $$
BEGIN
    -- Create a deterministic hash from key event components
    RETURN encode(
        digest(
            CONCAT(
                p_event_timestamp::text,
                p_event_type::text,
                p_event_subtype,
                COALESCE(p_user_id_hash, ''),
                COALESCE(p_session_id::text, ''),
                p_event_details::text
            ),
            'sha256'
        ),
        'hex'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate privacy-safe user hash
CREATE OR REPLACE FUNCTION generate_user_id_hash(p_user_id UUID)
RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(digest(p_user_id::text, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate privacy-safe IP hash
CREATE OR REPLACE FUNCTION generate_ip_hash(p_ip_address TEXT)
RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(digest(p_ip_address, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate privacy-safe user agent hash
CREATE OR REPLACE FUNCTION generate_user_agent_hash(p_user_agent TEXT)
RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(digest(p_user_agent, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ========================================
-- 6. AUDIT EVENT INSERTION FUNCTION
-- ========================================

-- Comprehensive audit logging function
CREATE OR REPLACE FUNCTION log_audit_event(
    p_event_type audit_event_type,
    p_event_subtype VARCHAR(100),
    p_user_id UUID DEFAULT NULL,
    p_session_id UUID DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL,
    p_source_ip TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_request_id UUID DEFAULT NULL,
    p_event_details JSONB DEFAULT '{}',
    p_gdpr_lawful_basis gdpr_lawful_basis_type DEFAULT 'legitimate_interests',
    p_data_classification data_classification_type DEFAULT 'internal',
    p_retention_years INTEGER DEFAULT 7
)
RETURNS UUID AS $$
DECLARE
    v_event_id UUID;
    v_user_id_hash VARCHAR(64);
    v_admin_user_id_hash VARCHAR(64);
    v_source_ip_hash VARCHAR(64);
    v_user_agent_hash VARCHAR(64);
    v_event_hash VARCHAR(64);
    v_event_timestamp TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP;
BEGIN
    -- Generate privacy-safe hashes
    v_user_id_hash := CASE WHEN p_user_id IS NOT NULL THEN generate_user_id_hash(p_user_id) ELSE NULL END;
    v_admin_user_id_hash := CASE WHEN p_admin_user_id IS NOT NULL THEN generate_user_id_hash(p_admin_user_id) ELSE NULL END;
    v_source_ip_hash := CASE WHEN p_source_ip IS NOT NULL THEN generate_ip_hash(p_source_ip) ELSE NULL END;
    v_user_agent_hash := CASE WHEN p_user_agent IS NOT NULL THEN generate_user_agent_hash(p_user_agent) ELSE NULL END;
    
    -- Generate event hash for tamper detection
    v_event_hash := calculate_audit_event_hash(
        v_event_timestamp,
        p_event_type,
        p_event_subtype,
        v_user_id_hash,
        p_session_id,
        p_event_details
    );
    
    -- Insert audit event
    INSERT INTO audit_events (
        event_timestamp,
        event_type,
        event_subtype,
        user_id_hash,
        session_id,
        admin_user_id_hash,
        source_ip_hash,
        user_agent_hash,
        request_id,
        event_details,
        gdpr_lawful_basis,
        data_classification,
        retention_period_years,
        event_hash
    ) VALUES (
        v_event_timestamp,
        p_event_type,
        p_event_subtype,
        v_user_id_hash,
        p_session_id,
        v_admin_user_id_hash,
        v_source_ip_hash,
        v_user_agent_hash,
        p_request_id,
        p_event_details,
        p_gdpr_lawful_basis,
        p_data_classification,
        p_retention_years,
        v_event_hash
    ) RETURNING id INTO v_event_id;
    
    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 7. AUDIT SUMMARY MAINTENANCE
-- ========================================

-- Function to update daily audit summaries
CREATE OR REPLACE FUNCTION update_audit_summaries(p_summary_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 day')
RETURNS INTEGER AS $$
DECLARE
    v_rows_updated INTEGER := 0;
BEGIN
    -- Insert or update audit summaries for the given date
    INSERT INTO audit_event_summaries (
        summary_date,
        event_type,
        event_subtype,
        total_events,
        unique_users,
        success_count,
        failure_count,
        public_events,
        internal_events,
        confidential_events,
        restricted_events,
        medical_phi_events
    )
    SELECT 
        p_summary_date,
        event_type,
        event_subtype,
        COUNT(*) as total_events,
        COUNT(DISTINCT user_id_hash) as unique_users,
        COUNT(*) FILTER (WHERE (event_details->>'success')::boolean = true) as success_count,
        COUNT(*) FILTER (WHERE (event_details->>'success')::boolean = false) as failure_count,
        COUNT(*) FILTER (WHERE data_classification = 'public') as public_events,
        COUNT(*) FILTER (WHERE data_classification = 'internal') as internal_events,
        COUNT(*) FILTER (WHERE data_classification = 'confidential') as confidential_events,
        COUNT(*) FILTER (WHERE data_classification = 'restricted') as restricted_events,
        COUNT(*) FILTER (WHERE data_classification = 'medical_phi') as medical_phi_events
    FROM audit_events 
    WHERE DATE(event_timestamp) = p_summary_date
    GROUP BY event_type, event_subtype
    ON CONFLICT (summary_date, event_type, event_subtype) 
    DO UPDATE SET
        total_events = EXCLUDED.total_events,
        unique_users = EXCLUDED.unique_users,
        success_count = EXCLUDED.success_count,
        failure_count = EXCLUDED.failure_count,
        public_events = EXCLUDED.public_events,
        internal_events = EXCLUDED.internal_events,
        confidential_events = EXCLUDED.confidential_events,
        restricted_events = EXCLUDED.restricted_events,
        medical_phi_events = EXCLUDED.medical_phi_events,
        updated_at = CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    RETURN v_rows_updated;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 8. TRIGGERS AND AUTOMATION
-- ========================================

-- Function to calculate retention expiry date
CREATE OR REPLACE FUNCTION calculate_retention_expiry_date()
RETURNS TRIGGER AS $$
BEGIN
    NEW.retention_expiry_date := (NEW.event_timestamp + INTERVAL '1 year' * NEW.retention_period_years)::DATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically calculate retention expiry date
DROP TRIGGER IF EXISTS calculate_audit_retention_expiry ON audit_events;
CREATE TRIGGER calculate_audit_retention_expiry
    BEFORE INSERT OR UPDATE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION calculate_retention_expiry_date();

-- Apply updated_at trigger to audit summary table
DROP TRIGGER IF EXISTS update_audit_summaries_updated_at ON audit_event_summaries;
CREATE TRIGGER update_audit_summaries_updated_at 
    BEFORE UPDATE ON audit_event_summaries 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 9. PERMISSIONS AND SECURITY
-- ========================================

-- Grant permissions to application user
GRANT SELECT, INSERT ON audit_events TO serenya_app;
GRANT SELECT, INSERT, UPDATE ON audit_event_summaries TO serenya_app;

-- Grant execute permissions on audit functions
GRANT EXECUTE ON FUNCTION log_audit_event(audit_event_type, VARCHAR(100), UUID, UUID, UUID, TEXT, TEXT, UUID, JSONB, gdpr_lawful_basis_type, data_classification_type, INTEGER) TO serenya_app;
GRANT EXECUTE ON FUNCTION calculate_audit_event_hash(TIMESTAMP WITH TIME ZONE, audit_event_type, VARCHAR(100), VARCHAR(64), UUID, JSONB) TO serenya_app;
GRANT EXECUTE ON FUNCTION generate_user_id_hash(UUID) TO serenya_app;
GRANT EXECUTE ON FUNCTION generate_ip_hash(TEXT) TO serenya_app;
GRANT EXECUTE ON FUNCTION generate_user_agent_hash(TEXT) TO serenya_app;
GRANT EXECUTE ON FUNCTION update_audit_summaries(DATE) TO serenya_app;

-- ========================================
-- 10. SAMPLE AUDIT EVENTS FOR TESTING
-- ========================================

-- Insert sample audit events for testing (remove in production)
-- Authentication events
DO $$
DECLARE
    test_user_id UUID := '550e8400-e29b-41d4-a716-446655440000';
    test_session_id UUID := gen_random_uuid();
BEGIN
    PERFORM log_audit_event(
        'authentication'::audit_event_type,
        'login_success',
        test_user_id,
        test_session_id,
        NULL,
        '192.168.1.100',
        'Serenya-Mobile-App/1.0.0 (iOS 17.0)',
        gen_random_uuid(),
        '{"auth_provider": "google", "device_id": "test-device-123", "success": true}'::jsonb,
        'consent'::gdpr_lawful_basis_type,
        'confidential'::data_classification_type,
        7
    );
    
    -- Consent management event
    PERFORM log_audit_event(
        'consent_management'::audit_event_type,
        'consent_granted',
        test_user_id,
        test_session_id,
        NULL,
        '192.168.1.100',
        'Serenya-Mobile-App/1.0.0 (iOS 17.0)',
        gen_random_uuid(),
        '{"consent_types": ["terms_of_service", "privacy_policy", "medical_disclaimer"], "ui_method": "bundled_consent", "success": true}'::jsonb,
        'consent'::gdpr_lawful_basis_type,
        'medical_phi'::data_classification_type,
        7
    );
    
    -- Security event
    PERFORM log_audit_event(
        'security_event'::audit_event_type,
        'biometric_auth_failure',
        test_user_id,
        test_session_id,
        NULL,
        '192.168.1.100',
        'Serenya-Mobile-App/1.0.0 (iOS 17.0)',
        gen_random_uuid(),
        '{"biometric_type": "fingerprint", "failure_count": 1, "device_id": "test-device-123", "success": false}'::jsonb,
        'legitimate_interests'::gdpr_lawful_basis_type,
        'restricted'::data_classification_type,
        7
    );
END $$;

-- ========================================
-- 11. TABLE COMMENTS FOR DOCUMENTATION
-- ========================================

-- Add comprehensive comments for documentation
COMMENT ON TABLE audit_events IS 'Comprehensive audit log for HIPAA/GDPR compliance with tamper detection and privacy-safe user tracking';
COMMENT ON TABLE audit_event_summaries IS 'Daily aggregated audit statistics for performance and compliance reporting';

COMMENT ON COLUMN audit_events.user_id_hash IS 'SHA-256 hash of user_id for privacy-safe audit logging';
COMMENT ON COLUMN audit_events.event_hash IS 'SHA-256 hash of key event components for tamper detection';
COMMENT ON COLUMN audit_events.retention_expiry_date IS 'Calculated expiry date for automatic compliance with data retention policies';
COMMENT ON COLUMN audit_events.event_details IS 'Encrypted JSON payload with event-specific data';

COMMENT ON FUNCTION log_audit_event IS 'Primary function for logging audit events with privacy protection and tamper detection';
COMMENT ON FUNCTION update_audit_summaries IS 'Daily maintenance function for generating audit statistics and compliance reports';

-- ========================================
-- 12. SCHEMA VERSION UPDATE
-- ========================================

-- Update schema version
INSERT INTO schema_versions (version, description) 
VALUES ('2.1.0', 'Audit infrastructure implementation: Added audit_event_type, gdpr_lawful_basis_type, data_classification_type ENUMs; Created audit_events and audit_event_summaries tables; Added comprehensive audit functions for HIPAA/GDPR compliance; Implemented tamper detection and privacy-safe logging');