-- =============================================
-- ATTENDIFY - Biometric Database Schema
-- Separate PostgreSQL instance with pgvector
-- Stores ONLY embeddings/templates, no raw images
-- =============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- =============================================
-- 1. FACE EMBEDDINGS TABLE
-- Stores 512-dim face embeddings (InsightFace/ArcFace)
-- =============================================

CREATE TABLE face_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    institution_id UUID,
    embedding vector(512) NOT NULL,
    model_name TEXT NOT NULL DEFAULT 'arcface',
    quality_score FLOAT,
    is_primary BOOLEAN DEFAULT true,
    capture_device TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_face_user ON face_embeddings(user_id);
CREATE INDEX idx_face_institution ON face_embeddings(institution_id);
CREATE INDEX idx_face_is_primary ON face_embeddings(user_id) WHERE is_primary = true;

-- HNSW index for fast approximate nearest neighbor search
CREATE INDEX idx_face_embedding_vector ON face_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- =============================================
-- 2. FINGERPRINT TEMPLATES TABLE
-- Stores minutiae-based fingerprint templates
-- =============================================

CREATE TABLE fingerprint_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    institution_id UUID,
    finger_position TEXT NOT NULL CHECK (finger_position IN (
        'left_thumb', 'left_index', 'left_middle', 'left_ring', 'left_pinky',
        'right_thumb', 'right_index', 'right_middle', 'right_ring', 'right_pinky'
    )),
    template_data BYTEA NOT NULL,
    template_format TEXT NOT NULL DEFAULT 'iso19794_2',
    quality_score FLOAT,
    is_primary BOOLEAN DEFAULT false,
    capture_device TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, finger_position)
);

CREATE INDEX idx_fingerprint_user ON fingerprint_templates(user_id);
CREATE INDEX idx_fingerprint_institution ON fingerprint_templates(institution_id);
CREATE INDEX idx_fingerprint_primary ON fingerprint_templates(user_id) WHERE is_primary = true;

-- =============================================
-- 3. BIOMETRIC VERIFICATION LOGS TABLE
-- Stores verification attempts for audit
-- =============================================

CREATE TABLE verification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    institution_id UUID,
    verification_type TEXT NOT NULL CHECK (verification_type IN ('face', 'fingerprint', 'face_liveness')),
    session_id UUID,
    result TEXT NOT NULL CHECK (result IN ('match', 'no_match', 'liveness_failed', 'quality_failed', 'error')),
    confidence_score FLOAT,
    liveness_score FLOAT,
    best_match_user_id UUID,
    best_match_score FLOAT,
    processing_time_ms INTEGER,
    error_message TEXT,
    device_info TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_verification_user ON verification_logs(user_id);
CREATE INDEX idx_verification_institution ON verification_logs(institution_id);
CREATE INDEX idx_verification_type ON verification_logs(verification_type);
CREATE INDEX idx_verification_created ON verification_logs(created_at DESC);

-- =============================================
-- 4. LIVENESS SESSIONS TABLE
-- Tracks gesture/liveness challenge sessions
-- =============================================

CREATE TABLE liveness_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    institution_id UUID,
    session_id UUID,
    challenge_type TEXT NOT NULL CHECK (challenge_type IN ('blink', 'turn_left', 'turn_right', 'smile', 'random_gesture')),
    challenge_data JSONB,
    response_data JSONB,
    result TEXT NOT NULL CHECK (result IN ('passed', 'failed', 'timeout')),
    score FLOAT,
    processing_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_liveness_user ON liveness_sessions(user_id);
CREATE INDEX idx_liveness_session ON liveness_sessions(session_id);

-- =============================================
-- FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION update_biometric_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_face_updated_at BEFORE UPDATE ON face_embeddings
    FOR EACH ROW EXECUTE FUNCTION update_biometric_updated_at();

CREATE TRIGGER trg_fingerprint_updated_at BEFORE UPDATE ON fingerprint_templates
    FOR EACH ROW EXECUTE FUNCTION update_biometric_updated_at();

-- Function to find best face match using cosine similarity
-- Returns top N matches above a threshold
CREATE OR REPLACE FUNCTION find_face_match(
    query_embedding vector(512),
    p_institution_id UUID DEFAULT NULL,
    match_threshold FLOAT DEFAULT 0.5,
    max_results INTEGER DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    institution_id UUID,
    similarity FLOAT,
    quality_score FLOAT,
    is_primary BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        fe.id,
        fe.user_id,
        fe.institution_id,
        1 - (fe.embedding <=> query_embedding) AS similarity,
        fe.quality_score,
        fe.is_primary
    FROM face_embeddings fe
    WHERE
        (p_institution_id IS NULL OR fe.institution_id = p_institution_id)
        AND fe.is_primary = true
    ORDER BY fe.embedding <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- SEED: System Admin User (not used: accounts live in the main DB)
-- =============================================

-- NOTE: Generate a proper bcrypt hash in your application
-- This is a placeholder - replace with actual hash from your auth service
-- INSERT INTO users (email, password_hash, full_name, role)
-- VALUES ('admin@attendify.app', '$2b$10$...', 'System Administrator', 'system_admin');
