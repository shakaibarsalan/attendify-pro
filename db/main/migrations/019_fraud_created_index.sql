-- =============================================
-- 019 — Index fraud_alerts for the listing sort
-- =============================================
-- GET /fraud filters by institution and ORDER BY created_at DESC. Without an
-- index on created_at the sort cost grows with the table; add a composite that
-- matches the access pattern.

CREATE INDEX IF NOT EXISTS idx_fraud_created
  ON fraud_alerts(institution_id, created_at DESC);
