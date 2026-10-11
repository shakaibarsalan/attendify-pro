-- =============================================
-- 018 — Plan refresh (+ Free tier) and per-institution authoritative limits
-- =============================================
-- 1) Plan templates: add a Free tier (adoption + price-sensitive markets) and
--    bump capacity on Professional/Enterprise for better per-student value.
--    Headline prices are unchanged — the analysis found them competitive, not
--    over-priced; the missing piece was a free entry point + per-org overrides.
-- 2) institutions.max_departments column.
-- 3) When a plan is assigned, its limits are COPIED into the institution's own
--    max_* columns (done in the app). Enforcement reads those columns, so a
--    system admin can override one org's limits without touching the plan.

ALTER TABLE institutions ADD COLUMN IF NOT EXISTS max_departments INTEGER DEFAULT 50;

-- Free tier.
INSERT INTO subscription_plans (id, name, description, max_students, max_teachers, max_departments, price_monthly, price_yearly, features, sort_order)
VALUES ('free', 'Free', 'For small departments and pilots — no credit card', 100, 5, 2, 0, 0,
  '["Face recognition attendance","QR code attendance","Basic analytics dashboard","Up to 100 students","Community support"]', 0)
ON CONFLICT (id) DO NOTHING;

-- Capacity bumps (prices unchanged).
UPDATE subscription_plans SET max_students = 500,   max_teachers = 25,  max_departments = 8,
  features = '["Everything in Free","Up to 500 students","Email support"]'::jsonb WHERE id = 'starter';
UPDATE subscription_plans SET max_students = 2500,  max_teachers = 120, max_departments = 25,
  features = '["Everything in Starter","Anti-spoof liveness detection","Advanced fraud analytics","Real-time notifications","Up to 2,500 students","Priority support"]'::jsonb WHERE id = 'professional';
UPDATE subscription_plans SET max_students = 12000, max_teachers = 600, max_departments = 120,
  features = '["Everything in Professional","Multi-campus support","Custom integrations & API","Dedicated account manager","Up to 12,000 students","24/7 priority support"]'::jsonb WHERE id = 'enterprise';

-- Sync existing planned institutions' limits from their (now-updated) plan, so
-- the institution columns are the single source of truth for enforcement.
UPDATE institutions i SET
  max_students    = sp.max_students,
  max_teachers    = sp.max_teachers,
  max_departments = sp.max_departments
FROM subscription_plans sp
WHERE i.plan_id = sp.id;
