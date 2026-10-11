-- =============================================
-- ATTENDIFY - Main Database Schema
-- PostgreSQL 16+ (Self-hosted, no Supabase)
-- Multi-tenant with institution isolation
-- =============================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- ENUMS
-- =============================================

CREATE TYPE user_role AS ENUM ('system_admin', 'org_admin', 'teacher', 'student');

CREATE TYPE institution_status AS ENUM ('active', 'inactive', 'suspended');

CREATE TYPE session_status AS ENUM ('active', 'completed', 'cancelled');

CREATE TYPE attendance_status AS ENUM ('verified', 'rejected', 'pending');

CREATE TYPE enrollment_status AS ENUM ('active', 'dropped', 'completed');

CREATE TYPE fraud_severity AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TYPE fraud_status AS ENUM ('pending', 'reviewed', 'resolved', 'false_positive');

CREATE TYPE alert_type AS ENUM ('info', 'warning', 'error', 'success', 'session', 'fraud', 'attendance');

CREATE TYPE api_key_status AS ENUM ('active', 'revoked', 'expired');

-- =============================================
-- 0. SUBSCRIPTION PLANS TABLE (referenced by institutions)
-- =============================================

CREATE TABLE subscription_plans (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    max_students INTEGER NOT NULL,
    max_teachers INTEGER NOT NULL,
    max_departments INTEGER NOT NULL,
    price_monthly NUMERIC(10,2) NOT NULL,
    price_yearly NUMERIC(10,2),
    features JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO subscription_plans (id, name, description, max_students, max_teachers, max_departments, price_monthly, price_yearly, features, sort_order) VALUES
('starter',      'Starter',      'For small institutes and individual departments', 500,   20,  5,   29.00, 290.00,  '["Face recognition attendance","QR code attendance","Basic analytics dashboard","Up to 500 students","Email support"]', 1),
('professional', 'Professional', 'For growing universities and colleges',           2000,  100, 20,  79.00, 790.00,  '["Everything in Starter","Anti-spoof liveness detection","Advanced fraud analytics","Real-time notifications","Up to 2,000 students","Priority email support"]', 2),
('enterprise',   'Enterprise',   'For large universities with multiple campuses',   10000, 500, 100, 199.00,1990.00, '["Everything in Professional","Multi-campus support","Custom integrations & API","Dedicated account manager","Up to 10,000 students","24/7 priority support"]', 3),
('unlimited',    'Unlimited',    'For university networks and consortia',           999999,999999,999999,499.00,4990.00,'["Everything in Enterprise","Unlimited students & teachers","White-label branding","On-premise deployment option","SLA guarantee","Custom AI model training"]', 4)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 1. INSTITUTIONS TABLE
-- =============================================

CREATE TABLE institutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    domain TEXT,
    logo_url TEXT,
    address TEXT,
    city TEXT,
    country TEXT DEFAULT 'Pakistan',
    contact_email TEXT,
    contact_phone TEXT,
    max_students INTEGER DEFAULT 10000,
    max_teachers INTEGER DEFAULT 500,
    status institution_status DEFAULT 'inactive',
    settings JSONB DEFAULT '{}',
    created_by UUID,
    plan_id VARCHAR(20) REFERENCES subscription_plans(id),
    plan_status VARCHAR(20) DEFAULT 'trial',
    plan_selected_at TIMESTAMPTZ,
    trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_institutions_code ON institutions(code);
CREATE INDEX idx_institutions_status ON institutions(status);
CREATE INDEX idx_institutions_domain ON institutions(domain);

-- =============================================
-- 2. USERS TABLE (replaces Supabase auth.users)
-- =============================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'student',
    phone TEXT,
    avatar_url TEXT,
    roll_number TEXT,
    department TEXT,
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    must_change_password BOOLEAN DEFAULT false,
    last_login TIMESTAMPTZ,
    last_logout_at TIMESTAMPTZ,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(email, institution_id)
);

CREATE INDEX idx_users_institution ON users(institution_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_is_active ON users(is_active);

-- =============================================
-- 3. DEPARTMENTS TABLE
-- =============================================

CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    head_id UUID REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(institution_id, code)
);

CREATE INDEX idx_departments_institution ON departments(institution_id);

-- =============================================
-- 4. COURSES TABLE
-- =============================================

CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT,
    credits INTEGER DEFAULT 3,
    semester TEXT,
    academic_year TEXT,
    section TEXT,
    max_students INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    require_location BOOLEAN DEFAULT false,
    location_lat FLOAT,
    location_lng FLOAT,
    location_radius INTEGER DEFAULT 50,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(institution_id, code, section)
);

CREATE INDEX idx_courses_institution ON courses(institution_id);
CREATE INDEX idx_courses_teacher ON courses(teacher_id);
CREATE INDEX idx_courses_department ON courses(department_id);
CREATE INDEX idx_courses_active ON courses(institution_id, is_active) WHERE is_active = true;

-- =============================================
-- 5. ENROLLMENTS TABLE
-- =============================================

CREATE TABLE enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status enrollment_status DEFAULT 'active',
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(course_id, student_id)
);

CREATE INDEX idx_enrollments_institution ON enrollments(institution_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);
CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_active ON enrollments(student_id, status) WHERE status = 'active';

-- =============================================
-- 6. ATTENDANCE SESSIONS TABLE
-- =============================================

CREATE TABLE attendance_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lecture_number INTEGER,
    lecture_date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    status session_status DEFAULT 'active',
    qr_code_secret TEXT,
    qr_rotation_enabled BOOLEAN DEFAULT false,
    qr_rotation_interval INTEGER DEFAULT 30,
    qr_token_used_at JSONB DEFAULT '[]',
    location_lat FLOAT,
    location_lng FLOAT,
    location_radius INTEGER DEFAULT 50,
    require_biometric BOOLEAN DEFAULT false,
    require_liveness BOOLEAN DEFAULT false,
    notes TEXT,
    total_enrolled INTEGER DEFAULT 0,
    total_present INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_institution ON attendance_sessions(institution_id);
CREATE INDEX idx_sessions_course ON attendance_sessions(course_id);
CREATE INDEX idx_sessions_teacher ON attendance_sessions(teacher_id);
CREATE INDEX idx_sessions_status ON attendance_sessions(institution_id, status);
CREATE INDEX idx_sessions_date ON attendance_sessions(course_id, lecture_date);

-- =============================================
-- 7. ATTENDANCE TABLE
-- =============================================

CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status attendance_status DEFAULT 'verified',
    face_data TEXT,
    fingerprint_data TEXT,
    liveness_score FLOAT DEFAULT 1.0,
    confidence_score FLOAT,
    verification_method TEXT DEFAULT 'qr',
    device_info TEXT,
    ip_address TEXT,
    location_lat FLOAT,
    location_lng FLOAT,
    device_fingerprint TEXT,
    device_metadata JSONB,
    verification_metadata JSONB,
    marked_at TIMESTAMPTZ DEFAULT NOW(),
    verified_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id, student_id)
);

CREATE INDEX idx_attendance_device_fp ON attendance(session_id, device_fingerprint);

CREATE INDEX idx_attendance_institution ON attendance(institution_id);
CREATE INDEX idx_attendance_session ON attendance(session_id);
CREATE INDEX idx_attendance_student ON attendance(student_id);
CREATE INDEX idx_attendance_status ON attendance(session_id, status);
CREATE INDEX idx_attendance_marked_at ON attendance(marked_at DESC);

-- =============================================
-- 8. FRAUD ALERTS TABLE
-- =============================================

CREATE TABLE fraud_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    attendance_id UUID REFERENCES attendance(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    severity fraud_severity DEFAULT 'medium',
    evidence JSONB,
    status fraud_status DEFAULT 'pending',
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fraud_institution ON fraud_alerts(institution_id);
CREATE INDEX idx_fraud_student ON fraud_alerts(student_id);
CREATE INDEX idx_fraud_session ON fraud_alerts(session_id);
CREATE INDEX idx_fraud_status ON fraud_alerts(institution_id, status);

-- =============================================
-- 9. AUDIT LOGS TABLE
-- =============================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_institution ON audit_logs(institution_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- =============================================
-- 10. NOTIFICATIONS TABLE
-- =============================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type alert_type DEFAULT 'info',
    is_read BOOLEAN DEFAULT false,
    action_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;

-- =============================================
-- 11. PUBLIC API KEYS TABLE
-- =============================================

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    permissions JSONB DEFAULT '["read"]',
    rate_limit INTEGER DEFAULT 100,
    status api_key_status DEFAULT 'active',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_keys_institution ON api_keys(institution_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_status ON api_keys(status);

-- =============================================
-- 12. PASSWORD RESET TOKENS TABLE
-- =============================================

CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX idx_reset_tokens_hash ON password_reset_tokens(token_hash);

-- =============================================
-- 13. EMAIL VERIFICATION TOKENS TABLE
-- =============================================

CREATE TABLE email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_verify_user ON email_verification_tokens(user_id);
CREATE INDEX idx_email_verify_hash ON email_verification_tokens(token_hash);

-- =============================================
-- FUNCTIONS & TRIGGERS
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_institutions_updated_at BEFORE UPDATE ON institutions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_courses_updated_at BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_sessions_updated_at BEFORE UPDATE ON attendance_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_fraud_updated_at BEFORE UPDATE ON fraud_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_api_keys_updated_at BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION calculate_lecture_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lecture_number IS NULL THEN
        SELECT COALESCE(MAX(lecture_number), 0) + 1
        INTO NEW.lecture_number
        FROM attendance_sessions
        WHERE course_id = NEW.course_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_lecture_number BEFORE INSERT ON attendance_sessions
    FOR EACH ROW EXECUTE FUNCTION calculate_lecture_number();

-- =============================================
-- VIEWS
-- =============================================

CREATE OR REPLACE VIEW v_student_attendance_summary AS
SELECT
    u.id AS student_id,
    u.institution_id,
    u.full_name AS student_name,
    u.roll_number,
    c.id AS course_id,
    c.name AS course_name,
    c.code AS course_code,
    COUNT(DISTINCT s.id) AS total_sessions,
    COUNT(DISTINCT CASE WHEN a.status = 'verified' THEN a.id END) AS attended_sessions,
    ROUND(
        COUNT(DISTINCT CASE WHEN a.status = 'verified' THEN a.id END)::NUMERIC /
        NULLIF(COUNT(DISTINCT s.id), 0) * 100,
        2
    ) AS attendance_percentage
FROM users u
JOIN enrollments e ON u.id = e.student_id AND e.status = 'active'
JOIN courses c ON e.course_id = c.id
LEFT JOIN attendance_sessions s ON c.id = s.course_id AND s.status = 'completed'
LEFT JOIN attendance a ON s.id = a.session_id AND u.id = a.student_id
WHERE u.role = 'student'
GROUP BY u.id, u.institution_id, u.full_name, u.roll_number, c.id, c.name, c.code;

CREATE OR REPLACE VIEW v_session_attendance_details AS
SELECT
    s.id AS session_id,
    s.institution_id,
    s.lecture_number,
    s.lecture_date,
    s.start_time,
    s.end_time,
    s.status AS session_status,
    s.total_enrolled,
    s.total_present,
    c.name AS course_name,
    c.code AS course_code,
    t.full_name AS teacher_name,
    u.id AS student_id,
    u.full_name AS student_name,
    u.roll_number,
    a.id AS attendance_id,
    a.status AS attendance_status,
    a.verification_method,
    a.liveness_score,
    a.confidence_score,
    a.marked_at
FROM attendance_sessions s
JOIN courses c ON s.course_id = c.id
JOIN users t ON s.teacher_id = t.id
LEFT JOIN enrollments e ON c.id = e.course_id AND e.status = 'active'
LEFT JOIN users u ON e.student_id = u.id
LEFT JOIN attendance a ON s.id = a.session_id AND u.id = a.student_id;

CREATE OR REPLACE VIEW v_institution_stats AS
SELECT
    i.id AS institution_id,
    i.name AS institution_name,
    (SELECT COUNT(*) FROM users WHERE institution_id = i.id AND role = 'student' AND is_active = true) AS total_students,
    (SELECT COUNT(*) FROM users WHERE institution_id = i.id AND role = 'teacher' AND is_active = true) AS total_teachers,
    (SELECT COUNT(*) FROM courses WHERE institution_id = i.id AND is_active = true) AS total_courses,
    (SELECT COUNT(*) FROM attendance_sessions WHERE institution_id = i.id AND status = 'completed') AS total_sessions,
    (SELECT COUNT(*) FROM fraud_alerts WHERE institution_id = i.id AND status = 'pending') AS pending_fraud_alerts
FROM institutions i;

-- =============================================
-- 14. ORGANIZATION REQUESTS TABLE
-- =============================================

CREATE TABLE organization_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_name VARCHAR(255) NOT NULL,
    organization_code VARCHAR(50),
    contact_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(50),
    institution_domain VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Pakistan',
    expected_students INTEGER,
    expected_teachers INTEGER,
    message TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SEED: System Admin
-- =============================================
-- Seeded accounts have no usable password ('!seed-locked'). Set one after the
-- first start (see README > Quick start); nothing is committed.
INSERT INTO users (id, email, password_hash, full_name, role, institution_id, must_change_password)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin@attendify.app',
    '!seed-locked',
    'System Administrator',
    'system_admin',
    NULL,
    true
) ON CONFLICT (id) DO NOTHING;
