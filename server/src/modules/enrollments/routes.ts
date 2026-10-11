import { Router } from 'express';
import { authenticate, requireRoles, AuthRequest } from '../../middleware/auth.js';
import { query } from '../../config/database.js';

const router = Router();

/**
 * @openapi
 * /enrollments:
 *   get:
 *     summary: List enrollments
 *     description: Retrieve enrollment records with student and course details. Scoped by institution for non-system-admin roles. Supports filtering by courseId, studentId, and status.
 *     tags: [Enrollments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: courseId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by course ID
 *         example: "course-001-uuid"
 *       - in: query
 *         name: studentId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by student ID
 *         example: "student-001-uuid"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, dropped]
 *         description: Filter by enrollment status
 *         example: "active"
 *     responses:
 *       200:
 *         description: List of enrollments
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                     example: "enroll-001-uuid"
 *                   course_id:
 *                     type: string
 *                     format: uuid
 *                     example: "course-001-uuid"
 *                   student_id:
 *                     type: string
 *                     format: uuid
 *                     example: "student-001-uuid"
 *                   institution_id:
 *                     type: string
 *                     format: uuid
 *                     example: "inst-001-uuid"
 *                   status:
 *                     type: string
 *                     example: "active"
 *                   course_name:
 *                     type: string
 *                     example: "Data Structures & Algorithms"
 *                   course_code:
 *                     type: string
 *                     example: "CS-301"
 *                   student_name:
 *                     type: string
 *                     example: "Ahmed Khan"
 *                   roll_number:
 *                     type: string
 *                     example: "2021-CS-001"
 *       401:
 *         description: Unauthorized — missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Unauthorized"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  const { courseId, studentId, status } = req.query;
  let sql = 'SELECT e.*, c.name as course_name, c.code as course_code, u.full_name as student_name, u.roll_number FROM enrollments e JOIN courses c ON e.course_id = c.id JOIN users u ON e.student_id = u.id WHERE 1=1';
  const params: any[] = [];
  let idx = 1;

  if (req.user!.role !== 'system_admin' && req.user!.institutionId) {
    sql += ` AND e.institution_id = $${idx++}`;
    params.push(req.user!.institutionId);
  }
  if (courseId) { sql += ` AND e.course_id = $${idx++}`; params.push(courseId); }
  if (studentId) { sql += ` AND e.student_id = $${idx++}`; params.push(studentId); }
  if (status) { sql += ` AND e.status = $${idx++}`; params.push(status); }

  const result = await query(sql, params);
  res.json(result.rows);
});

/**
 * @openapi
 * /enrollments:
 *   post:
 *     summary: Enroll students in a course
 *     description: Bulk enroll one or more students into a course. Only org_admin and teacher roles may create enrollments. Duplicate enrollments are silently skipped (ON CONFLICT DO NOTHING).
 *     tags: [Enrollments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [courseId, studentIds]
 *             properties:
 *               courseId:
 *                 type: string
 *                 format: uuid
 *                 example: "course-001-uuid"
 *               studentIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 example: ["student-001-uuid", "student-002-uuid"]
 *     responses:
 *       201:
 *         description: Students enrolled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enrolled:
 *                   type: integer
 *                   example: 2
 *       400:
 *         description: Missing courseId or studentIds
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "courseId and studentIds are required"
 *       401:
 *         description: Unauthorized — missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Unauthorized"
 *       403:
 *         description: Forbidden — insufficient role
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Forbidden"
 *       404:
 *         description: Course not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Course not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */
router.post('/', authenticate, requireRoles('org_admin', 'teacher'), async (req: AuthRequest, res) => {
  const { courseId, studentIds } = req.body;
  if (!courseId || !studentIds?.length) {
    return res.status(400).json({ error: 'courseId and studentIds are required' });
  }

  const course = await query('SELECT institution_id FROM courses WHERE id = $1', [courseId]);
  if (course.rows.length === 0) return res.status(404).json({ error: 'Course not found' });
  const courseInst = course.rows[0].institution_id;

  // Tenant isolation: a non-system-admin may only enroll into a course in their
  // OWN institution. 404 (not 403) so a foreign course id can't be confirmed.
  if (req.user!.role !== 'system_admin' && courseInst !== req.user!.institutionId) {
    return res.status(404).json({ error: 'Course not found' });
  }

  // Only students that belong to the course's institution may be enrolled — this
  // blocks pulling another org's students into a course. Foreign/invalid ids are
  // skipped rather than failing the whole request.
  const valid = await query(
    `SELECT id FROM users WHERE id = ANY($1::uuid[]) AND role = 'student' AND institution_id = $2`,
    [studentIds, courseInst],
  );
  const validIds = valid.rows.map((r) => r.id);
  if (validIds.length === 0) {
    return res.status(400).json({ error: 'No valid students from this institution to enroll' });
  }

  const values = validIds.map((_sid: string, i: number) => `($1, $2, $${i + 3})`).join(',');
  const params = [courseId, courseInst, ...validIds];
  const result = await query(
    `INSERT INTO enrollments (course_id, institution_id, student_id) VALUES ${values} ON CONFLICT DO NOTHING RETURNING *`,
    params
  );

  res.status(201).json({ enrolled: result.rows.length, skipped: studentIds.length - validIds.length });
});

/**
 * @openapi
 * /enrollments/{id}:
 *   delete:
 *     summary: Remove enrollment
 *     description: Soft-delete an enrollment by setting its status to 'dropped'. Only org_admin may remove enrollments.
 *     tags: [Enrollments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Enrollment ID
 *         example: "enroll-001-uuid"
 *     responses:
 *       200:
 *         description: Enrollment removed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Enrollment removed"
 *       401:
 *         description: Unauthorized — missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Unauthorized"
 *       403:
 *         description: Forbidden — only org_admin
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Forbidden"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */
router.delete('/:id', authenticate, requireRoles('org_admin'), async (req: AuthRequest, res) => {
  // Tenant isolation: an org_admin may only drop an enrollment in their OWN
  // institution. 404 for both "missing" and "belongs to another org" so a
  // foreign enrollment id can't be confirmed by probing.
  const existing = await query('SELECT institution_id FROM enrollments WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0 || existing.rows[0].institution_id !== req.user!.institutionId) {
    return res.status(404).json({ error: 'Enrollment not found' });
  }
  await query(`UPDATE enrollments SET status = 'dropped' WHERE id = $1`, [req.params.id]);
  res.json({ message: 'Enrollment removed' });
});

export const enrollmentRouter = router;
