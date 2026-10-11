import { Router } from 'express';
import { authenticate, requireRoles, AuthRequest } from '../../middleware/auth.js';
import { query } from '../../config/database.js';

const router = Router();

/**
 * @openapi
 * /enrollment-requests/students:
 *   get:
 *     summary: Search students in the caller's organization (for enrolment requests)
 *     tags: [EnrollmentRequests]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/students', authenticate, requireRoles('teacher', 'org_admin'), async (req: AuthRequest, res) => {
  const q = String(req.query.q ?? '').trim();
  const inst = req.user!.institutionId;
  if (!inst) return res.json([]);
  const like = `%${q}%`;
  const result = await query(
    `SELECT id, full_name, roll_number, department, email
       FROM users
      WHERE institution_id = $1 AND role = 'student' AND is_active = true
        AND ($2 = '' OR roll_number ILIKE $3 OR full_name ILIKE $3 OR email ILIKE $3)
      ORDER BY full_name ASC
      LIMIT 20`,
    [inst, q, like],
  );
  res.json(result.rows);
});

/**
 * @openapi
 * /enrollment-requests:
 *   get:
 *     summary: List enrolment requests (teacher = own, org_admin = institution)
 *     tags: [EnrollmentRequests]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', authenticate, requireRoles('teacher', 'org_admin'), async (req: AuthRequest, res) => {
  const { status } = req.query;
  let sql = `SELECT er.id, er.status, er.note, er.admin_note, er.created_at, er.reviewed_at,
                    c.name AS course_name, c.code AS course_code, c.section,
                    s.full_name AS student_name, s.roll_number, s.department AS student_department, s.email AS student_email,
                    t.full_name AS teacher_name
               FROM enrollment_requests er
               JOIN courses c ON er.course_id = c.id
               JOIN users s ON er.student_id = s.id
               JOIN users t ON er.teacher_id = t.id
              WHERE 1=1`;
  const params: any[] = [];
  let idx = 1;
  if (req.user!.role === 'teacher') { sql += ` AND er.teacher_id = $${idx++}`; params.push(req.user!.id); }
  else { sql += ` AND er.institution_id = $${idx++}`; params.push(req.user!.institutionId); }
  if (status) { sql += ` AND er.status = $${idx++}`; params.push(status); }
  sql += ` ORDER BY (er.status = 'pending') DESC, er.created_at DESC`;
  const result = await query(sql, params);
  res.json(result.rows);
});

/**
 * @openapi
 * /enrollment-requests:
 *   post:
 *     summary: Teacher requests a student be added to one of their courses
 *     tags: [EnrollmentRequests]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/', authenticate, requireRoles('teacher'), async (req: AuthRequest, res) => {
  const { courseId, studentId, note } = req.body;
  if (!courseId || !studentId) return res.status(400).json({ error: 'courseId and studentId are required' });

  // The teacher must own the course.
  const course = await query('SELECT id, institution_id FROM courses WHERE id = $1 AND teacher_id = $2', [courseId, req.user!.id]);
  if (course.rows.length === 0) return res.status(403).json({ error: 'You are not the teacher of this course' });
  const institutionId = course.rows[0].institution_id;

  // The student must belong to the same organization.
  const student = await query("SELECT id FROM users WHERE id = $1 AND institution_id = $2 AND role = 'student'", [studentId, institutionId]);
  if (student.rows.length === 0) return res.status(404).json({ error: 'Student not found in your organization' });

  const enrolled = await query("SELECT 1 FROM enrollments WHERE course_id = $1 AND student_id = $2 AND status = 'active'", [courseId, studentId]);
  if (enrolled.rows.length > 0) return res.status(409).json({ error: 'Student is already enrolled in this course' });

  const dup = await query("SELECT 1 FROM enrollment_requests WHERE course_id = $1 AND student_id = $2 AND status = 'pending'", [courseId, studentId]);
  if (dup.rows.length > 0) return res.status(409).json({ error: 'A pending request for this student already exists' });

  const result = await query(
    `INSERT INTO enrollment_requests (institution_id, teacher_id, course_id, student_id, note)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [institutionId, req.user!.id, courseId, studentId, (note || '').trim() || null],
  );
  res.status(201).json({ id: result.rows[0].id, message: 'Request submitted' });
});

/**
 * @openapi
 * /enrollment-requests/{id}:
 *   patch:
 *     summary: Org admin approves (enrols) or rejects a request
 *     tags: [EnrollmentRequests]
 *     security: [{ bearerAuth: [] }]
 */
router.patch('/:id', authenticate, requireRoles('org_admin'), async (req: AuthRequest, res) => {
  const { status, adminNote } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'status must be approved or rejected' });

  const reqRow = await query(
    `SELECT er.*, c.name AS course_name FROM enrollment_requests er JOIN courses c ON er.course_id = c.id
      WHERE er.id = $1 AND er.institution_id = $2`,
    [req.params.id, req.user!.institutionId],
  );
  if (reqRow.rows.length === 0) return res.status(404).json({ error: 'Request not found' });
  const er = reqRow.rows[0];
  if (er.status !== 'pending') return res.status(409).json({ error: 'This request has already been reviewed' });

  if (status === 'approved') {
    await query(
      `INSERT INTO enrollments (course_id, institution_id, student_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [er.course_id, er.institution_id, er.student_id],
    );
  }
  await query(
    `UPDATE enrollment_requests SET status = $1, admin_note = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $4`,
    [status, (adminNote || '').trim() || null, req.user!.id, req.params.id],
  );

  // Notify the requesting teacher (best effort).
  try {
    await query(
      `INSERT INTO notifications (institution_id, user_id, title, message, type) VALUES ($1, $2, $3, $4, $5)`,
      [er.institution_id, er.teacher_id,
        status === 'approved' ? 'Enrollment request approved' : 'Enrollment request rejected',
        `Your request to add a student to ${er.course_name} was ${status}.`,
        status === 'approved' ? 'success' : 'warning'],
    );
  } catch { /* ignore */ }

  res.json({ message: `Request ${status}` });
});

export const enrollmentRequestRouter = router;
