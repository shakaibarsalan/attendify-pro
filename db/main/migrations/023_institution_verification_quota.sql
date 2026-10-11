-- 023 — Per-institution verification-quota override.
-- Like max_students/teachers/departments, an institution carries its own
-- max_verifications which a system admin can override per org. Enforcement reads
-- COALESCE(institution.max_verifications, plan.max_verifications, 0), so:
--   - admin-assigned plans copy the plan cap into the institution column (below + app),
--   - an explicit per-org override wins,
--   - a NULL falls back to the plan cap.

ALTER TABLE institutions ADD COLUMN IF NOT EXISTS max_verifications BIGINT;

-- Backfill existing planned institutions from their plan's cap.
UPDATE institutions i
   SET max_verifications = sp.max_verifications
  FROM subscription_plans sp
 WHERE i.plan_id = sp.id AND i.max_verifications IS NULL;
