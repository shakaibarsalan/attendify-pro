-- =============================================
-- Migration 002: Add metadata JSONB + update constraints
-- =============================================

ALTER TABLE verification_logs
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

ALTER TABLE verification_logs
    DROP CONSTRAINT IF EXISTS verification_logs_verification_type_check;

ALTER TABLE verification_logs
    ADD CONSTRAINT verification_logs_verification_type_check
    CHECK (verification_type IN ('face', 'fingerprint', 'face_liveness', 'spoof', 'face_multi'));

ALTER TABLE verification_logs
    DROP CONSTRAINT IF EXISTS verification_logs_result_check;

ALTER TABLE verification_logs
    ADD CONSTRAINT verification_logs_result_check
    CHECK (result IN ('match', 'no_match', 'liveness_failed', 'quality_failed', 'spoof_detected', 'error'));

CREATE INDEX IF NOT EXISTS idx_verification_metadata ON verification_logs USING gin (metadata);
