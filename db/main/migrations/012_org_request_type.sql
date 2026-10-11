-- 012: distinguish demo requests from direct signup requests, and track demo outreach.
-- request_type: 'demo' (wants a demo/meeting first) or 'signup' (wants an account directly).
-- contacted_at: set when a system admin sends the demo invitation email.

ALTER TABLE organization_requests ADD COLUMN IF NOT EXISTS request_type VARCHAR(20) NOT NULL DEFAULT 'demo';
ALTER TABLE organization_requests ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ;

-- Backfill any pre-existing rows as demo requests (that was the only path before).
UPDATE organization_requests SET request_type = 'demo' WHERE request_type IS NULL;
