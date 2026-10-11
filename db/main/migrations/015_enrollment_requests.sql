-- 015: Teacher -> Org-admin "add this student to my section" requests.
-- A teacher requests a student (from their organization) be enrolled in one of
-- their courses; the org admin approves (creates the enrollment) or rejects.
CREATE TABLE IF NOT EXISTS enrollment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  admin_note TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enroll_req_inst_status ON enrollment_requests(institution_id, status);
CREATE INDEX IF NOT EXISTS idx_enroll_req_teacher ON enrollment_requests(teacher_id);
CREATE INDEX IF NOT EXISTS idx_enroll_req_course_student ON enrollment_requests(course_id, student_id);
