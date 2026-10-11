-- Migration 008: ENUM fixes, CASCADE safety, indexes, coordinate constraints

-- Add missing attendance status values
ALTER TYPE attendance_status ADD VALUE IF NOT EXISTS 'absent';
ALTER TYPE attendance_status ADD VALUE IF NOT EXISTS 'late';
ALTER TYPE attendance_status ADD VALUE IF NOT EXISTS 'excused';

-- Fix dangerous CASCADE: deleting a teacher should NOT cascade-delete attendance sessions
ALTER TABLE attendance_sessions DROP CONSTRAINT IF EXISTS attendance_sessions_teacher_id_fkey;
ALTER TABLE attendance_sessions
    ADD CONSTRAINT attendance_sessions_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL;

-- Composite index for background job that expires active sessions by end_time
CREATE INDEX IF NOT EXISTS idx_sessions_active_expired
    ON attendance_sessions(status, end_time) WHERE status = 'active';

-- Coordinate range constraints on courses (idempotent)
DO $$ BEGIN
    ALTER TABLE courses ADD CONSTRAINT chk_course_lat CHECK (location_lat IS NULL OR location_lat BETWEEN -90 AND 90);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE courses ADD CONSTRAINT chk_course_lng CHECK (location_lng IS NULL OR location_lng BETWEEN -180 AND 180);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Coordinate range constraints on attendance_sessions (idempotent)
DO $$ BEGIN
    ALTER TABLE attendance_sessions ADD CONSTRAINT chk_session_lat CHECK (location_lat IS NULL OR location_lat BETWEEN -90 AND 90);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE attendance_sessions ADD CONSTRAINT chk_session_lng CHECK (location_lng IS NULL OR location_lng BETWEEN -180 AND 180);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Session time ordering: end must be after start (idempotent)
DO $$ BEGIN
    ALTER TABLE attendance_sessions ADD CONSTRAINT chk_session_time_order CHECK (end_time > start_time);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
