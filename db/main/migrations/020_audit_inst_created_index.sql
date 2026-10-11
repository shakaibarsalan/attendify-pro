-- 020: speed up GET /audit.
-- The endpoint filters by institution_id and orders by created_at DESC. The
-- existing single-column indexes (institution_id) and (created_at) forced either
-- a full sort of the institution's rows or a wide created_at scan filtered by
-- institution — both slow on an ever-growing audit_logs table (one row per
-- request). A composite index serves the filter + sort + LIMIT in one range scan.
CREATE INDEX IF NOT EXISTS idx_audit_inst_created ON audit_logs(institution_id, created_at DESC);
