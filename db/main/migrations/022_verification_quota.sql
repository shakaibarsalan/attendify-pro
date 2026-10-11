-- 022 — Monthly biometric-verification quota per plan (Biometric API metering).
-- Each plan carries a monthly cap on billable biometric verifications (face
-- verify/identify + fingerprint verify). Enforcement reads the cap via the
-- institution's current plan; usage is counted from verification_logs (biometric
-- DB). Enroll/status/delete are setup ops and are NOT counted. Unlimited uses a
-- very large sentinel rather than NULL so the check is a simple "used >= cap".

ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_verifications BIGINT DEFAULT 0;

UPDATE subscription_plans SET max_verifications = 0          WHERE id = 'free';
UPDATE subscription_plans SET max_verifications = 2000       WHERE id = 'starter';
UPDATE subscription_plans SET max_verifications = 20000      WHERE id = 'professional';
UPDATE subscription_plans SET max_verifications = 200000     WHERE id = 'enterprise';
UPDATE subscription_plans SET max_verifications = 100000000  WHERE id = 'unlimited';
