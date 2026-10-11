-- 004: Adapt fingerprint_templates (from 001) for contactless camera-based
-- fingerprint recognition.
--
-- Templates are enhanced ridge-map PNGs (template_format 'ridge_png') produced
-- from close-range fingertip photos; matching is 1:1 against the user's own
-- templates. Multi-sample enrollment (3-5 captures per user) is core to
-- matching accuracy, so the legacy one-template-per-finger UNIQUE constraint
-- and the finger_position whitelist CHECK are dropped.
-- NOTE: the AI service also applies this at startup (idempotent), since this
-- migrations directory only runs on a fresh database init.

CREATE TABLE IF NOT EXISTS fingerprint_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    institution_id UUID,
    finger_position TEXT NOT NULL DEFAULT 'right_index',
    template_data BYTEA NOT NULL,
    template_format TEXT NOT NULL DEFAULT 'ridge_png',
    quality_score DOUBLE PRECISION,
    is_primary BOOLEAN DEFAULT false,
    capture_device TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fingerprint_templates DROP CONSTRAINT IF EXISTS fingerprint_templates_user_id_finger_position_key;
ALTER TABLE fingerprint_templates DROP CONSTRAINT IF EXISTS fingerprint_templates_finger_position_check;

CREATE INDEX IF NOT EXISTS idx_fp_templates_user ON fingerprint_templates(user_id);
