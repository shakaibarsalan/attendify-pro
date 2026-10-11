-- 026: Student/Teacher -> Org-admin support queries (lightweight help desk).
-- A student or teacher submits a query to their org admin, optionally referencing
-- another user in the institution ("this is about <person>"). The admin can reply
-- and mark it open/resolved; the sender sees the reply + status on their own list.
CREATE TABLE IF NOT EXISTS support_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  category VARCHAR(30) NOT NULL DEFAULT 'other', -- attendance | technical | account | other
  message TEXT NOT NULL,
  about_user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- optional "regarding" reference
  status VARCHAR(20) NOT NULL DEFAULT 'open',                 -- open | resolved
  admin_response TEXT,
  responded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_queries_inst_status ON support_queries(institution_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_queries_creator ON support_queries(created_by, created_at DESC);
