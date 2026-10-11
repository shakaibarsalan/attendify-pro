-- =============================================
-- Migration 003: QR Rotation, Geofence, Device Fingerprint
-- =============================================

-- QR rotation: token replay prevention
ALTER TABLE attendance_sessions
    ADD COLUMN IF NOT EXISTS qr_token_used_at JSONB DEFAULT '[]';

-- Device fingerprint columns on attendance
ALTER TABLE attendance
    ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;

ALTER TABLE attendance
    ADD COLUMN IF NOT EXISTS device_metadata JSONB;

ALTER TABLE attendance
    ADD COLUMN IF NOT EXISTS verification_metadata JSONB;

-- Courses: require_location flag
ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS require_location BOOLEAN DEFAULT false;

-- Courses: location columns (may already exist in sessions but let's also allow course-level defaults)
ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION;

ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION;

ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS location_radius INTEGER DEFAULT 50;

-- Index for device fingerprint duplicate detection
CREATE INDEX IF NOT EXISTS idx_attendance_device_fp ON attendance(session_id, device_fingerprint);

-- Index for verification metadata
CREATE INDEX IF NOT EXISTS idx_attendance_verification_meta ON attendance USING gin (verification_metadata);
