-- Migration 009: Efficient v_institution_stats view + department_id FK on users

-- Add department_id FK to users (replaces free-text department column, non-destructive)
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_department_id ON users(department_id);

-- Replace correlated-subquery view with JOIN aggregation + avg_attendance_rate
CREATE OR REPLACE VIEW v_institution_stats AS
SELECT
    i.id                                                    AS institution_id,
    i.name                                                  AS institution_name,
    COALESCE(u_counts.total_students, 0)                    AS total_students,
    COALESCE(u_counts.total_teachers, 0)                    AS total_teachers,
    COALESCE(c_counts.total_courses, 0)                     AS total_courses,
    COALESCE(s_counts.total_sessions, 0)                    AS total_sessions,
    COALESCE(f_counts.pending_fraud_alerts, 0)              AS pending_fraud_alerts,
    COALESCE(att_stats.avg_attendance_rate, 0)              AS avg_attendance_rate
FROM institutions i

LEFT JOIN LATERAL (
    SELECT
        COUNT(*) FILTER (WHERE role = 'student' AND is_active) AS total_students,
        COUNT(*) FILTER (WHERE role = 'teacher' AND is_active) AS total_teachers
    FROM users
    WHERE institution_id = i.id
) u_counts ON true

LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total_courses
    FROM courses
    WHERE institution_id = i.id AND is_active
) c_counts ON true

LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total_sessions
    FROM attendance_sessions
    WHERE institution_id = i.id AND status = 'completed'
) s_counts ON true

LEFT JOIN LATERAL (
    SELECT COUNT(*) AS pending_fraud_alerts
    FROM fraud_alerts
    WHERE institution_id = i.id AND status = 'pending'
) f_counts ON true

LEFT JOIN LATERAL (
    SELECT ROUND(
        100.0 * SUM(total_present)::NUMERIC / NULLIF(SUM(total_enrolled), 0),
        2
    ) AS avg_attendance_rate
    FROM attendance_sessions
    WHERE institution_id = i.id AND status = 'completed' AND total_enrolled > 0
) att_stats ON true;
