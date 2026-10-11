-- =============================================
-- 025: Live-QR presence gate for a session.
--
-- When require_qr is ON, a student must scan the session's CURRENT fast-rotating
-- QR (proving they are physically in the room / in front of the projector) AND
-- then pass a biometric (face or fingerprint) to mark attendance. QR alone can no
-- longer mark anyone present — it is only a presence key, not the attendance.
-- Idempotent.
-- =============================================

ALTER TABLE attendance_sessions
  ADD COLUMN IF NOT EXISTS require_qr BOOLEAN DEFAULT false;
