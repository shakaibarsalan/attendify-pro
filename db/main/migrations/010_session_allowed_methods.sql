-- =============================================
-- 010: Per-session allowed attendance methods
-- Teachers choose which methods students may use to mark attendance
-- for a given session: QR, face, and/or fingerprint.
-- Idempotent.
-- =============================================

ALTER TABLE attendance_sessions
  ADD COLUMN IF NOT EXISTS allow_qr          BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_face        BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_fingerprint BOOLEAN DEFAULT false;

-- Backfill any existing rows that predate these columns.
UPDATE attendance_sessions
SET allow_qr          = COALESCE(allow_qr, true),
    allow_face        = COALESCE(allow_face, true),
    allow_fingerprint = COALESCE(allow_fingerprint, false)
WHERE allow_qr IS NULL OR allow_face IS NULL OR allow_fingerprint IS NULL;
