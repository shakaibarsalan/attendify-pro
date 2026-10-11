-- =============================================
-- 017 — Registration numbers + org-scoped login emails
-- =============================================
-- Students and Teachers get a unique registration number (e.g. F2022123456,
-- where F=Fall / S=Spring admission). The official login email is derived from
-- it using the organization's own domain: f2022123456@umt.edu.pk. Two orgs may
-- reuse the same registration number because the domain makes the email unique.
--
-- Constraints added here:
--   * registration_number unique WITHIN an institution (case-insensitive).
--   * institutions.domain unique across the system (case-insensitive) — so the
--     generated login emails can never collide between orgs.
--   * login email globally unique (case-insensitive) — belt-and-suspenders on
--     top of the per-org uniqueness; added only if existing data has no dupes
--     so the migration can never hard-fail a deploy.

ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_number TEXT;

-- Registration number is unique per organization (ignore NULLs / legacy rows).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_regnum_org
  ON users (institution_id, upper(registration_number))
  WHERE registration_number IS NOT NULL;

-- Each organization owns a unique email domain. Created only if current data
-- permits, so an unexpected legacy duplicate never aborts the deploy (app-level
-- checks still prevent new duplicates).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM institutions
    WHERE domain IS NOT NULL AND domain <> ''
    GROUP BY lower(domain)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE '017: duplicate institution domains exist — skipping unique index (app-level checks still apply)';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_institutions_domain_unique
      ON institutions (lower(domain))
      WHERE domain IS NOT NULL AND domain <> '';
  END IF;
END $$;

-- Global login-email uniqueness — only created if current data permits, so an
-- unexpected legacy duplicate never aborts the deploy.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users
    WHERE email IS NOT NULL
    GROUP BY lower(email)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE '017: duplicate login emails exist — skipping global unique index (per-org uniqueness still enforced)';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_global ON users (lower(email));
  END IF;
END $$;
