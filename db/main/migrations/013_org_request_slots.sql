-- 013: demo scheduling — the requester proposes two preferred 30-minute slots,
-- and the system admin confirms one of them (which triggers the confirmation email).

ALTER TABLE organization_requests ADD COLUMN IF NOT EXISTS preferred_slot_1 TIMESTAMPTZ;
ALTER TABLE organization_requests ADD COLUMN IF NOT EXISTS preferred_slot_2 TIMESTAMPTZ;
ALTER TABLE organization_requests ADD COLUMN IF NOT EXISTS confirmed_slot TIMESTAMPTZ;
