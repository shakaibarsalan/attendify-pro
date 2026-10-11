-- 024 — Outbound webhooks for ERP integration.
-- An institution registers HTTPS endpoint(s) to receive signed event callbacks
-- (e.g. attendance.marked) instead of polling. Each webhook has its own secret;
-- deliveries are signed with HMAC-SHA256 in the X-Attendify-Signature header.

CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events JSONB NOT NULL DEFAULT '["attendance.marked"]',
    is_active BOOLEAN DEFAULT true,
    last_status INTEGER,
    last_delivered_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_institution ON webhooks(institution_id) WHERE is_active = true;
