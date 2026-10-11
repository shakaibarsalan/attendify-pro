-- 005: subject_ref for the public Biometric API.
-- External customers enroll/verify their OWN users (subjects) via API key. Those
-- embeddings are keyed by (institution_id, subject_ref) and kept separate from
-- attendance students (subject_ref IS NULL). The AI service also applies this at
-- startup (embedding_service.ensure_schema), since this directory only runs on a
-- fresh database init.

ALTER TABLE face_embeddings ADD COLUMN IF NOT EXISTS subject_ref TEXT;

CREATE INDEX IF NOT EXISTS idx_face_subject
  ON face_embeddings(institution_id, subject_ref) WHERE subject_ref IS NOT NULL;
