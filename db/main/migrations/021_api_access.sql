-- 021 — Organization API access (integration with an institution's own ERP/portal).
-- An org_admin REQUESTS API access from their dashboard; a system_admin ENABLES it.
-- API access is a paid-plan feature: institutions on the Free plan cannot request it.
-- When enabled, the org may create API keys and call the public integration
-- endpoints; disabling immediately blocks those keys (enforced in apiKeyAuth).
--
-- api_access_status: 'none' | 'requested' | 'enabled' | 'disabled'

ALTER TABLE institutions ADD COLUMN IF NOT EXISTS api_access_enabled      BOOLEAN     DEFAULT false;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS api_access_status       TEXT        DEFAULT 'none';
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS api_access_requested_at TIMESTAMPTZ;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS api_access_decided_at   TIMESTAMPTZ;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS api_access_decided_by   UUID;

-- Fast lookup of pending requests for the system-admin queue.
CREATE INDEX IF NOT EXISTS idx_institutions_api_access_status
  ON institutions(api_access_status) WHERE api_access_status = 'requested';
