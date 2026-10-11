-- Migration 004: Performance indexes
CREATE INDEX IF NOT EXISTS idx_attendance_student_created ON attendance(student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attendance_session_status ON attendance(session_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_inst_status_severity ON fraud_alerts(institution_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON notifications(user_id, is_read, created_at);
