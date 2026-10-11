-- =============================================
-- 016 — Personal (notification) email
-- =============================================
-- Every user now has TWO email addresses:
--   * email          — the ORGANIZATION email, used as the login identifier.
--                      Locked for normal users; only an admin can change it.
--   * personal_email  — the user's own address, where they receive all mail /
--                      notifications. Editable by the user in profile settings.
--
-- Existing users only have their org email, so we seed personal_email with it
-- (idempotent — only fills rows that don't have one yet).

ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_email TEXT;

UPDATE users SET personal_email = email WHERE personal_email IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_personal_email ON users(lower(personal_email));
