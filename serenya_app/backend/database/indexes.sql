-- Performance Indexes for Serenya Healthcare Platform
-- Consolidated reference for all database indexes
-- Created: September 7, 2025
-- Source: database-architecture.md performance requirements

-- ========================================
-- USERS TABLE INDEXES
-- ========================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_users_external_id ON users(external_id);
CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_email_hash ON users(email_hash);
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);

-- Timeline and analytics indexes
CREATE INDEX IF NOT EXISTS idx_users_created_timeline ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at DESC) WHERE last_login_at IS NOT NULL;

-- Composite indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_users_provider_external ON users(auth_provider, external_id);
CREATE INDEX IF NOT EXISTS idx_users_status_created ON users(account_status, created_at DESC);

-- Unique constraint indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_hash_unique ON users(email_hash) WHERE email_hash IS NOT NULL;

-- ========================================
-- CONSENT RECORDS TABLE INDEXES
-- ========================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_consent_user_id ON consent_records(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_type ON consent_records(consent_type);
CREATE INDEX IF NOT EXISTS idx_consent_withdrawn ON consent_records(withdrawn_at);
CREATE INDEX IF NOT EXISTS idx_consent_method ON consent_records(consent_method);

-- Compliance and audit indexes
CREATE INDEX IF NOT EXISTS idx_consent_given_status ON consent_records(consent_given, consent_type);
CREATE INDEX IF NOT EXISTS idx_consent_version ON consent_records(consent_version, created_at DESC);

-- Composite indexes for reporting
CREATE INDEX IF NOT EXISTS idx_consent_user_type_status ON consent_records(user_id, consent_type, consent_given);
CREATE INDEX IF NOT EXISTS idx_consent_user_method ON consent_records(user_id, consent_method);

-- ========================================
-- SUBSCRIPTIONS TABLE INDEXES
-- ========================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(subscription_status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider ON subscriptions(provider);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON subscriptions(end_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_external_id_hash ON subscriptions(external_subscription_id_hash);

-- Timeline and billing indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_created_timeline ON subscriptions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_billing_cycle ON subscriptions(start_date, end_date);

-- Composite indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(user_id, subscription_status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_status ON subscriptions(provider, subscription_status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_users ON subscriptions(user_id, end_date DESC) WHERE subscription_status = 'active';

-- Expiration management
CREATE INDEX IF NOT EXISTS idx_subscriptions_expiring ON subscriptions(end_date, subscription_status) WHERE subscription_status = 'active';

-- ========================================
-- SUBSCRIPTION TIERS TABLE INDEXES
-- ========================================

-- Feature lookup indexes
CREATE INDEX IF NOT EXISTS idx_subscription_tiers_medical_reports ON subscription_tiers(medical_reports);
CREATE INDEX IF NOT EXISTS idx_subscription_tiers_pricing ON subscription_tiers(monthly_price_usd, yearly_price_usd);

-- Feature matrix queries
CREATE INDEX IF NOT EXISTS idx_subscription_tiers_features ON subscription_tiers(medical_reports, priority_processing, advanced_analytics);

-- ========================================
-- PAYMENTS TABLE INDEXES
-- ========================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_provider_transaction ON payments(provider_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_transaction_hash ON payments(provider_transaction_id_hash);

-- Timeline and reporting indexes
CREATE INDEX IF NOT EXISTS idx_payments_created_timeline ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_processed_timeline ON payments(processed_at DESC) WHERE processed_at IS NOT NULL;

-- Financial analytics indexes
CREATE INDEX IF NOT EXISTS idx_payments_amount_date ON payments(created_at DESC, payment_status) WHERE payment_status = 'completed';
CREATE INDEX IF NOT EXISTS idx_payments_monthly_revenue ON payments(date_trunc('month', created_at), payment_status) WHERE payment_status = 'completed';

-- Composite indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_payments_user_status ON payments(user_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_status ON payments(subscription_id, payment_status);

-- Failed payment tracking
CREATE INDEX IF NOT EXISTS idx_payments_failed ON payments(user_id, created_at DESC) WHERE payment_status IN ('failed', 'disputed');

-- ========================================
-- CHAT OPTIONS TABLE INDEXES
-- ========================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_chat_options_content_type ON chat_options(content_type, is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_chat_options_category ON chat_options(category);

-- UI rendering optimization
CREATE INDEX IF NOT EXISTS idx_chat_options_active ON chat_options(is_active, content_type, category, display_order);

-- ========================================
-- USER DEVICES TABLE INDEXES
-- ========================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_devices_device_id ON user_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_active ON user_devices(status, last_active_at);
CREATE INDEX IF NOT EXISTS idx_user_devices_biometric ON user_devices(biometric_type, secure_element);

-- Device management indexes
CREATE INDEX IF NOT EXISTS idx_user_devices_platform ON user_devices(platform, os_version);
CREATE INDEX IF NOT EXISTS idx_user_devices_app_version ON user_devices(app_version, created_at DESC);

-- Security and monitoring
CREATE INDEX IF NOT EXISTS idx_user_devices_last_active ON user_devices(last_active_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_user_devices_stale ON user_devices(last_active_at ASC) WHERE status = 'active' AND last_active_at < CURRENT_TIMESTAMP - INTERVAL '30 days';

-- ========================================
-- USER SESSIONS TABLE INDEXES
-- ========================================

-- Primary session management indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_device ON user_sessions(user_id, device_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_id, status);
CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh ON user_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at, status);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, status, last_accessed_at);

-- Biometric authentication indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_biometric ON user_sessions(biometric_expires_at, requires_biometric_reauth);
CREATE INDEX IF NOT EXISTS idx_user_sessions_biometric_user ON user_sessions(user_id, biometric_expires_at) WHERE requires_biometric_reauth = true;

-- Session cleanup and maintenance
CREATE INDEX IF NOT EXISTS idx_user_sessions_expired ON user_sessions(expires_at ASC) WHERE status IN ('active', 'expired');
CREATE INDEX IF NOT EXISTS idx_user_sessions_cleanup ON user_sessions(created_at ASC) WHERE status = 'expired';

-- Security monitoring
CREATE INDEX IF NOT EXISTS idx_user_sessions_concurrent ON user_sessions(user_id, status, created_at DESC) WHERE status = 'active';

-- ========================================
-- BIOMETRIC REGISTRATIONS TABLE INDEXES
-- ========================================

-- Primary biometric management indexes
CREATE INDEX IF NOT EXISTS idx_biometric_registrations_device ON biometric_registrations(device_id, is_active);
CREATE INDEX IF NOT EXISTS idx_biometric_registrations_id ON biometric_registrations(registration_id);
CREATE INDEX IF NOT EXISTS idx_biometric_registrations_challenge ON biometric_registrations(challenge_expires_at, is_active);
CREATE INDEX IF NOT EXISTS idx_biometric_registrations_failures ON biometric_registrations(verification_failures, is_active);
CREATE INDEX IF NOT EXISTS idx_biometric_registrations_type ON biometric_registrations(biometric_type, is_verified);

-- Security and monitoring indexes
CREATE INDEX IF NOT EXISTS idx_biometric_registrations_verified ON biometric_registrations(device_id, biometric_type, is_verified) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_biometric_registrations_failed_auth ON biometric_registrations(verification_failures DESC, last_verified_at ASC) WHERE is_active = true;

-- Challenge cleanup
CREATE INDEX IF NOT EXISTS idx_biometric_registrations_expired_challenges ON biometric_registrations(challenge_expires_at ASC) WHERE challenge_expires_at < CURRENT_TIMESTAMP;

-- ========================================
-- AUDIT EVENTS TABLE INDEXES
-- ========================================

-- Primary audit query indexes
CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_type ON audit_events(event_type, event_subtype);
CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events(user_id_hash, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_session ON audit_events(session_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_request ON audit_events(request_id);

-- Compliance and reporting indexes
CREATE INDEX IF NOT EXISTS idx_audit_events_retention ON audit_events(retention_expiry_date) WHERE retention_expiry_date <= CURRENT_DATE + INTERVAL '90 days';
CREATE INDEX IF NOT EXISTS idx_audit_events_classification ON audit_events(data_classification, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_gdpr_basis ON audit_events(gdpr_lawful_basis, event_timestamp DESC);

-- Security and monitoring indexes
CREATE INDEX IF NOT EXISTS idx_audit_events_source_ip ON audit_events(source_ip_hash, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_admin ON audit_events(admin_user_id_hash, event_timestamp DESC) WHERE admin_user_id_hash IS NOT NULL;

-- Full-text search and details
CREATE INDEX IF NOT EXISTS idx_audit_events_details_gin ON audit_events USING gin(event_details);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_events_user_type_time ON audit_events(user_id_hash, event_type, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_type_classification_time ON audit_events(event_type, data_classification, event_timestamp DESC);

-- Data retention and cleanup
CREATE INDEX IF NOT EXISTS idx_audit_events_cleanup ON audit_events(retention_expiry_date ASC) WHERE retention_expiry_date <= CURRENT_DATE;

-- ========================================
-- AUDIT EVENT SUMMARIES TABLE INDEXES
-- ========================================

-- Primary summary lookup indexes
CREATE INDEX IF NOT EXISTS idx_audit_summaries_date ON audit_event_summaries(summary_date DESC);
CREATE INDEX IF NOT EXISTS idx_audit_summaries_type ON audit_event_summaries(event_type, summary_date DESC);
CREATE INDEX IF NOT EXISTS idx_audit_summaries_events_count ON audit_event_summaries(total_events DESC);

-- Analytics and reporting indexes
CREATE INDEX IF NOT EXISTS idx_audit_summaries_monthly ON audit_event_summaries(date_trunc('month', summary_date), event_type);
CREATE INDEX IF NOT EXISTS idx_audit_summaries_failures ON audit_event_summaries(failure_count DESC, summary_date DESC) WHERE failure_count > 0;

-- ========================================
-- SCHEMA VERSION TABLE INDEXES
-- ========================================

-- Version tracking indexes
CREATE INDEX IF NOT EXISTS idx_schema_versions_applied ON schema_versions(applied_at DESC);

-- ========================================
-- PERFORMANCE OPTIMIZATION NOTES
-- ========================================

-- GENERAL GUIDELINES:
-- 1. Indexes on foreign keys (user_id, device_id, etc.) for JOIN performance
-- 2. Indexes on frequently filtered columns (status, type, active flags)
-- 3. Composite indexes for common WHERE clause combinations
-- 4. Timeline indexes (created_at DESC) for recent data queries
-- 5. Partial indexes with WHERE clauses to reduce index size

-- QUERY PATTERNS OPTIMIZED:
-- • User authentication and session management
-- • Subscription status and billing queries
-- • Audit log searches and compliance reporting
-- • Device and biometric authentication flows
-- • Payment processing and financial analytics
-- • Content delivery and chat options

-- INDEX MAINTENANCE:
-- • Monitor index usage with pg_stat_user_indexes
-- • Remove unused indexes to improve write performance
-- • Consider covering indexes for frequently accessed columns
-- • Update statistics regularly with ANALYZE
-- • Monitor index bloat and rebuild as needed

-- SPECIFIC OPTIMIZATIONS:
-- • Hash indexes for encrypted field lookups (email_hash, transaction_id_hash)
-- • GIN indexes for JSONB columns (audit event details, biometric metadata)
-- • Partial indexes for active records to reduce size
-- • Functional indexes for computed values (date_trunc for monthly aggregates)

-- SCALABILITY CONSIDERATIONS:
-- • Index only scans for queries that only need indexed columns
-- • Parallel index builds for large data sets
-- • Index-only tables for frequently accessed summary data
-- • Partitioning strategy for large audit tables

-- MONITORING QUERIES:
-- Check index usage:
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch 
-- FROM pg_stat_user_indexes ORDER BY idx_scan DESC;

-- Check index size:
-- SELECT schemaname, tablename, indexname, pg_size_pretty(pg_relation_size(indexrelid))
-- FROM pg_stat_user_indexes ORDER BY pg_relation_size(indexrelid) DESC;

-- Find missing indexes:
-- SELECT schemaname, tablename, seq_scan, seq_tup_read, seq_tup_read / seq_scan as avg_tup_read
-- FROM pg_stat_user_tables WHERE seq_scan > 0 ORDER BY seq_tup_read DESC;