import { Router } from 'express';
import { authenticate, requireRoles, AuthRequest } from '../../middleware/auth.js';
import { query } from '../../config/database.js';

const router = Router();

/**
 * @openapi
 * /courses:
 *   get:
 *     summary: List courses
 *     description: Retrieve courses visible to the authenticated user. Students see their enrolled courses; teachers see courses they teach; org_admins see courses in their institution; system_admins see all active courses.
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of courses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                         example: "course-001-uuid"
 *                       institution_id:
 *                         type: string
 *                         format: uuid
 *                         example: "inst-001-uuid"
 *                       teacher_id:
 *                         type: string
 *                         format: uuid
 *                         example: "teacher-001-uuid"
 *                       name:
 *                         type: string
 *                         example: "Data Structures & Algorithms"
 *                       code:
 *                         type: string
 *                         example: "CS-301"
 *                       description:
 *                         type: string
 *                         example: "Fundamental data structures and algorithm analysis"
 *                       credits:
 *                         type: integer
 *                         example: 3
 *                       semester:
 *                         type: string
 *                         example: "Fall 2025"
 *                       section:
 *                         type: string
 *                         example: "A"
 *                       max_students:
 *                         type: integer
 *                         example: 60
 *                       is_active:
 *                         type: boolean
 *                         example: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-09-01T08:00:00Z"
 *                 total:
 *                   type: integer
 *                   example: 5
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 100
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
  // Include the assigned teacher's name so course cards / detail views can show
  // the instructor (the courses table only stores teacher_id).
  let sql = 'SELECT c.*, tu.full_name AS teacher_name FROM courses c LEFT JOIN users tu ON tu.id = c.teacher_id';
  const params: any[] = [];
  let idx = 1;

  if (req.user!.role === 'student' && req.user!.institutionId) {
    sql += ` JOIN enrollments e ON e.course_id = c.id AND e.student_id = $${idx++} AND e.status = 'active'`;
    params.push(req.user!.id);
    sql += ' WHERE c.is_active = true';
  } else {
    sql += ' WHERE c.is_active = true';
  }

  if (req.user!.role !== 'system_admin' && req.user!.institutionId) {
    sql += ` AND c.institution_id = $${idx++}`;
    params.push(req.user!.institutionId);
  }
  if (req.user!.role === 'system_admin' && req.query.institutionId) {
    sql += ` AND c.institution_id = $${idx++}`;
    params.push(req.query.institutionId);
  }
  if (req.user!.role === 'teacher') {
    sql += ` AND c.teacher_id = $${idx++}`;
    params.push(req.user!.id);
  }

  // Paginate only when the client asks for it — dropdowns and drill-down pages
  // call this without page/limit and rely on receiving the full course list.
  if (req.query.page === undefined && req.query.limit === undefined) {
    const result = await query(`${sql} ORDER BY c.created_at DESC`, params);
    return res.json({ data: result.rows, total: result.rows.length, page: 1, limit: result.rows.length || 1 });
  }

  const page = Math.max(1, parseInt(req.query.page as string || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || '20')));
  const offset = (page - 1) * limit;

  const countResult = await query(`SELECT COUNT(*) AS count FROM (${sql}) AS filtered`, params);
  const total = parseInt(countResult.rows[0].count);
  const result = await query(
    `${sql} ORDER BY c.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset],
  );
  res.json({ data: result.rows, total, page, limit, hasMore: page * limit < total });
});

/**
 * @openapi
 * /courses:
 *   post:
 *     summary: Create course
 *     description: Create a new course under the authenticated org_admin's institution.
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code, teacherId, semester, academicYear]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Data Structures & Algorithms"
 *               code:
 *                 type: string
 *                 example: "CS-301"
 *               description:
 *                 type: string
 *                 example: "Fundamental data structures and algorithm analysis"
 *               teacherId:
 *                 type: string
 *                 format: uuid
 *                 example: "teacher-001-uuid"
 *               departmentId:
 *                 type: string
 *                 format: uuid
 *                 example: "dept-001-uuid"
 *               semester:
 *                 type: string
 *                 example: "Fall"
 *               academicYear:
 *                 type: string
 *                 example: "2025-2026"
 *               section:
 *                 type: string
 *                 example: "A"
 *               maxStudents:
 *                 type: integer
 *                 example: 60
 *               credits:
 *                 type: integer
 *                 example: 3
 *     responses:
 *       201:
 *         description: Course created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: "course-001-uuid"
 *                 name:
 *                   type: string
 *                   example: "Data Structures & Algorithms"
 *                 code:
 *                   type: string
 *                   example: "CS-301"
 *                 institution_id:
 *                   type: string
 *                   format: uuid
 *                   example: "inst-001-uuid"
 *                 teacher_id:
 *                   type: string
 *                   format: uuid
 *                   example: "teacher-001-uuid"
 *                 is_active:
 *                   type: boolean
 *                   example: true
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
 *       409:
 *         description: Course code already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Course code already exists"
 *       500:
 *         description: Failed to create course
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to create course"
 */
router.post('/', authenticate, requireRoles('org_admin'), async (req: AuthRequest, res) => {
  const { name, code, description, teacherId, departmentId, semester, academicYear, section, maxStudents, credits } = req.body;
  try {
    const result = await query(
      `INSERT INTO courses (institution_id, teacher_id, department_id, name, code, description, credits, semester, academic_year, section, max_students)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [req.user!.institutionId, teacherId, departmentId, name, code, description || null, credits || 3, semester, academicYear, section || null, maxStudents || 100]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Course code already exists' });
    }
    res.status(500).json({ error: 'Failed to create course' });
  }
});

/**
 * @openapi
 * /courses/{id}:
 *   put:
 *     summary: Update course
 *     description: Partially update a course. Org admins and assigned teachers may update courses.
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Course ID
 *         example: "course-001-uuid"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Advanced Algorithms"
 *               description:
 *                 type: string
 *                 example: "Updated course description"
 *               teacherId:
 *                 type: string
 *                 format: uuid
 *                 example: "teacher-002-uuid"
 *               section:
 *                 type: string
 *                 example: "B"
 *               maxStudents:
 *                 type: integer
 *                 example: 80
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Updated course
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: "course-001-uuid"
 *                 name:
 *                   type: string
 *                   example: "Advanced Algorithms"
 *                 code:
 *                   type: string
 *                   example: "CS-301"
 *                 is_active:
 *                   type: boolean
 *                   example: true
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
router.put('/:id', authenticate, requireRoles('org_admin', 'teacher'), async (req: AuthRequest, res) => {
  const { name, code, description, teacherId, departmentId, semester, academicYear, section, credits, maxStudents, isActive } = req.body;
  if (req.user!.role === 'teacher') {
    const ownership = await query('SELECT teacher_id FROM courses WHERE id = $1', [req.params.id]);
    if (ownership.rows.length === 0) return res.status(404).json({ error: 'Course not found' });
    if (ownership.rows[0].teacher_id !== req.user!.id) {
      return res.status(403).json({ error: 'You can only update your own courses' });
    }
  }
  try {
    // COALESCE: only overwrite a column when the field is provided (non-null).
    const result = await query(
      `UPDATE courses SET
         name = COALESCE($1, name),
         code = COALESCE($2, code),
         description = COALESCE($3, description),
         teacher_id = COALESCE($4, teacher_id),
         department_id = COALESCE($5, department_id),
         semester = COALESCE($6, semester),
         academic_year = COALESCE($7, academic_year),
         section = COALESCE($8, section),
         credits = COALESCE($9, credits),
         max_students = COALESCE($10, max_students),
         is_active = COALESCE($11, is_active)
       WHERE id = $12 RETURNING *`,
      [name, code, description, teacherId, departmentId, semester, academicYear, section, credits, maxStudents, isActive, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Course not found' });
    res.json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') return res.status(409).json({ error: 'Course code already exists' });
    res.status(500).json({ error: 'Failed to update course' });
  }
});

/**
 * @openapi
 * /courses/{id}/enrollments:
 *   get:
 *     summary: List course enrollments
 *     description: Retrieve all active enrollments for a specific course, including student details.
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Course ID
 *         example: "course-001-uuid"
 *     responses:
 *       200:
 *         description: List of enrollments with student info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                         example: "enroll-001-uuid"
 *                       course_id:
 *                         type: string
 *                         format: uuid
 *                         example: "course-001-uuid"
 *                       student_id:
 *                         type: string
 *                         format: uuid
 *                         example: "student-001-uuid"
 *                       status:
 *                         type: string
 *                         example: "active"
 *                       email:
 *                         type: string
 *                         example: "ahmed@nuc.edu.pk"
 *                       full_name:
 *                         type: string
 *                         example: "Ahmed Khan"
 *                       roll_number:
 *                         type: string
 *                         example: "2021-CS-001"
 *                 total:
 *                   type: integer
 *                   example: 45
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
router.get('/:id/enrollments', authenticate, requireRoles('system_admin', 'org_admin', 'teacher'), async (req: AuthRequest, res) => {
  const courseCheck = await query('SELECT institution_id, teacher_id FROM courses WHERE id = $1', [req.params.id]);
  if (courseCheck.rows.length === 0) {
    return res.status(404).json({ error: 'Course not found' });
  }
  if (req.user!.role === 'teacher' && courseCheck.rows[0].teacher_id !== req.user!.id) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  if (req.user!.role === 'org_admin' && courseCheck.rows[0].institution_id !== req.user!.institutionId) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const result = await query(
    `SELECT e.*, u.email, u.full_name, u.roll_number
     FROM enrollments e JOIN users u ON e.student_id = u.id
     WHERE e.course_id = $1 AND e.status = 'active'
     ORDER BY u.full_name`,
    [req.params.id]
  );
  res.json({ data: result.rows, total: result.rows.length });
});

export const courseRouter = router;
