import { Router } from 'express';
import { authenticate, requireRoles, AuthRequest } from '../../middleware/auth.js';
import { query } from '../../config/database.js';

const router = Router();

/**
 * @openapi
 * /reports/student/{studentId}:
 *   get:
 *     summary: Get student attendance summary
 *     description: Retrieve attendance summary data for a specific student from the v_student_attendance_summary view.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Student ID
 *         example: "student-001-uuid"
 *     responses:
 *       200:
 *         description: Student attendance summary
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
 *                       student_id:
 *                         type: string
 *                         format: uuid
 *                         example: "student-001-uuid"
 *                       course_id:
 *                         type: string
 *                         format: uuid
 *                         example: "course-001-uuid"
 *                       course_name:
 *                         type: string
 *                         example: "Data Structures & Algorithms"
 *                       total_sessions:
 *                         type: integer
 *                         example: 20
 *                       total_present:
 *                         type: integer
 *                         example: 18
 *                       attendance_rate:
 *                         type: number
 *                         example: 90.0
 *                 total:
 *                   type: integer
 *                   example: 3
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
router.get('/student/:studentId', authenticate, async (req: AuthRequest, res) => {
  if (req.user!.role === 'student' && req.user!.id !== req.params.studentId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const result = await query('SELECT * FROM v_student_attendance_summary WHERE student_id = $1', [req.params.studentId]);
  res.json({ data: result.rows, total: result.rows.length });
});

/**
 * @openapi
 * /reports/student/{studentId}/sessions:
 *   get:
 *     summary: Per-session attendance history for a student
 *     description: Returns the student's attendance across individual sessions, newest first, optionally filtered by course. Results are scoped by role (teacher = own sessions, org_admin = own institution).
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: courseId
 *         schema: { type: string, format: uuid }
 *         description: Optional course filter
 *     responses:
 *       200:
 *         description: Array of per-session attendance records (course, lecture, date, status, method, marked_at)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { type: object }
 */
router.get('/student/:studentId/sessions', authenticate, async (req: AuthRequest, res) => {
  const { courseId } = req.query;
  const params: any[] = [req.params.studentId];
  let courseFilter = '';
  if (courseId) {
    params.push(courseId);
    courseFilter = `AND s.course_id = $${params.length}`;
  }

  if (req.user!.role === 'teacher') {
    params.push(req.user!.id);
    courseFilter += ` AND s.teacher_id = $${params.length}`;
  } else if (req.user!.role === 'org_admin') {
    params.push(req.user!.institutionId);
    courseFilter += ` AND s.institution_id = $${params.length}`;
  }

  const result = await query(
    `SELECT
       a.id, a.status, a.marked_at, a.verification_method, a.confidence_score, a.liveness_score,
       s.id AS session_id, s.lecture_number, s.start_time, s.end_time,
       c.id AS course_id, c.name AS course_name, c.code AS course_code
     FROM attendance a
     JOIN attendance_sessions s ON a.session_id = s.id
     JOIN courses c ON s.course_id = c.id
     WHERE a.student_id = $1 ${courseFilter}
     ORDER BY s.start_time ASC`,
    params,
  );
  res.json({ data: result.rows });
});

/**
 * @openapi
 * /reports/session/{sessionId}:
 *   get:
 *     summary: Get session attendance details
 *     description: Retrieve detailed attendance records for a specific session from the v_session_attendance_details view.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Session ID
 *         example: "session-001-uuid"
 *     responses:
 *       200:
 *         description: Session attendance details
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
 *                       session_id:
 *                         type: string
 *                         format: uuid
 *                         example: "session-001-uuid"
 *                       student_id:
 *                         type: string
 *                         format: uuid
 *                         example: "student-001-uuid"
 *                       student_name:
 *                         type: string
 *                         example: "Ahmed Khan"
 *                       roll_number:
 *                         type: string
 *                         example: "2021-CS-001"
 *                       status:
 *                         type: string
 *                         example: "present"
 *                       marked_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-05-22T09:05:00Z"
 *                       verification_method:
 *                         type: string
 *                         example: "qr"
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
router.get('/session/:sessionId', authenticate, requireRoles('system_admin', 'org_admin', 'teacher'), async (req: AuthRequest, res) => {
  const result = await query('SELECT * FROM v_session_attendance_details WHERE session_id = $1', [req.params.sessionId]);
  res.json({ data: result.rows, total: result.rows.length });
});

/**
 * @openapi
 * /reports/institution/{institutionId}:
 *   get:
 *     summary: Get institution statistics
 *     description: Retrieve aggregated statistics for a specific institution from the v_institution_stats view.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: institutionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Institution ID
 *         example: "inst-001-uuid"
 *     responses:
 *       200:
 *         description: Institution statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 institution_id:
 *                   type: string
 *                   format: uuid
 *                   example: "inst-001-uuid"
 *                 total_students:
 *                   type: integer
 *                   example: 1200
 *                 total_teachers:
 *                   type: integer
 *                   example: 45
 *                 total_courses:
 *                   type: integer
 *                   example: 80
 *                 total_sessions:
 *                   type: integer
 *                   example: 1500
 *                 avg_attendance_rate:
 *                   type: number
 *                   example: 87.5
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
 *       404:
 *         description: No stats found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "No stats found"
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
router.get('/institution/:institutionId', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res) => {
  if (req.user!.role === 'org_admin' && req.params.institutionId !== req.user!.institutionId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const result = await query('SELECT * FROM v_institution_stats WHERE institution_id = $1', [req.params.institutionId]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'No stats found' });
  res.json(result.rows[0]);
});

/**
 * @openapi
 * /reports/stats:
 *   get:
 *     summary: Get dashboard statistics
 *     description: Retrieve platform-wide or institution-level statistics. System admins see global counts (institutions, users, sessions, pending fraud alerts). Other roles see their institution's stats from the v_institution_stats view.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics (system admin response shown)
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   description: System admin response
 *                   properties:
 *                     totalInstitutions:
 *                       type: integer
 *                       example: 5
 *                     totalUsers:
 *                       type: integer
 *                       example: 3500
 *                     totalSessions:
 *                       type: integer
 *                       example: 12000
 *                     pendingFraudAlerts:
 *                       type: integer
 *                       example: 12
 *                 - type: object
 *                   description: Institution-level response
 *                   properties:
 *                     institution_id:
 *                       type: string
 *                       format: uuid
 *                       example: "inst-001-uuid"
 *                     total_students:
 *                       type: integer
 *                       example: 1200
 *                     total_teachers:
 *                       type: integer
 *                       example: 45
 *                     avg_attendance_rate:
 *                       type: number
 *                       example: 87.5
 *       400:
 *         description: Cannot determine stats scope
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Cannot determine stats scope"
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
 *       404:
 *         description: No stats found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "No stats found"
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
router.get('/stats', authenticate, async (req: AuthRequest, res) => {
  if (req.user!.role === 'system_admin') {
    const institutions = await query('SELECT COUNT(*) FROM institutions');
    const users = await query('SELECT COUNT(*) FROM users');
    const sessions = await query('SELECT COUNT(*) FROM attendance_sessions');
    const fraudAlerts = await query("SELECT COUNT(*) FROM fraud_alerts WHERE status = 'pending'");
    return res.json({
      totalInstitutions: parseInt(institutions.rows[0].count),
      totalUsers: parseInt(users.rows[0].count),
      totalSessions: parseInt(sessions.rows[0].count),
      pendingFraudAlerts: parseInt(fraudAlerts.rows[0].count),
    });
  }
  if (req.user!.institutionId) {
    const result = await query('SELECT * FROM v_institution_stats WHERE institution_id = $1', [req.user!.institutionId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'No stats found' });
    return res.json(result.rows[0]);
  }
  res.status(400).json({ error: 'Cannot determine stats scope' });
});

/**
 * @openapi
 * /reports/my-stats:
 *   get:
 *     summary: Get my statistics
 *     description: Retrieve statistics scoped to the authenticated user. Students see their own attendance summary; other roles see their institution's stats.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Personal or institution statistics
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: array
 *                   description: Student attendance summary
 *                   items:
 *                     type: object
 *                     properties:
 *                       student_id:
 *                         type: string
 *                         format: uuid
 *                         example: "student-001-uuid"
 *                       course_name:
 *                         type: string
 *                         example: "Data Structures & Algorithms"
 *                       total_sessions:
 *                         type: integer
 *                         example: 20
 *                       total_present:
 *                         type: integer
 *                         example: 18
 *                       attendance_rate:
 *                         type: number
 *                         example: 90.0
 *                 - type: object
 *                   description: Institution stats for non-student roles
 *                   properties:
 *                     institution_id:
 *                       type: string
 *                       format: uuid
 *                       example: "inst-001-uuid"
 *                     total_students:
 *                       type: integer
 *                       example: 1200
 *                     avg_attendance_rate:
 *                       type: number
 *                       example: 87.5
 *       400:
 *         description: Cannot determine stats scope
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Cannot determine stats scope"
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
 *       404:
 *         description: No stats found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "No stats found"
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
router.get('/my-stats', authenticate, async (req: AuthRequest, res) => {
  if (req.user!.role === 'student') {
    const result = await query('SELECT * FROM v_student_attendance_summary WHERE student_id = $1', [req.user!.id]);
    return res.json(result.rows);
  }
  if (req.user!.institutionId) {
    const result = await query('SELECT * FROM v_institution_stats WHERE institution_id = $1', [req.user!.institutionId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'No stats found' });
    return res.json(result.rows[0]);
  }
  res.status(400).json({ error: 'Cannot determine stats scope' });
});

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * @openapi
 * /reports/session/{sessionId}/export:
 *   get:
 *     summary: Export a session's attendance as CSV
 *     description: Returns a CSV file (text/csv attachment) of every attendance record for the session — student name, roll number, status, verification method, scores and timestamp.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema: { type: string }
 *       404:
 *         description: Session not found
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.get('/session/:sessionId/export', authenticate, async (req: AuthRequest, res) => {
  const sessionRow = await query(
    `SELECT s.id, s.lecture_number, s.lecture_date, c.name AS course_name, c.code AS course_code
     FROM attendance_sessions s JOIN courses c ON s.course_id = c.id WHERE s.id = $1`,
    [req.params.sessionId],
  );
  if (sessionRow.rows.length === 0) return res.status(404).json({ error: 'Session not found' });

  const result = await query(
    `SELECT u.full_name AS student_name, u.roll_number, a.status, a.verification_method,
            a.liveness_score, a.confidence_score, a.marked_at
     FROM attendance a
     JOIN users u ON a.student_id = u.id
     WHERE a.session_id = $1
     ORDER BY u.full_name`,
    [req.params.sessionId],
  );

  const s = sessionRow.rows[0];
  const filename = `session_${s.course_code}_lecture${s.lecture_number}_${s.lecture_date}.csv`;
  const headers = ['Student Name', 'Roll Number', 'Status', 'Verification Method', 'Liveness Score', 'Confidence Score', 'Marked At'];
  const rows = result.rows.map(r =>
    [r.student_name, r.roll_number, r.status, r.verification_method, r.liveness_score, r.confidence_score, r.marked_at]
      .map(escapeCsv).join(',')
  );

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send([headers.join(','), ...rows].join('\n'));
});

/**
 * @openapi
 * /reports/student/{studentId}/export:
 *   get:
 *     summary: Export a student's attendance as CSV
 *     description: Returns a CSV file (text/csv attachment) of the student's attendance across all courses. A student may only export their own record.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema: { type: string }
 *       403:
 *         description: A student tried to export another student's record
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       404:
 *         description: Student not found
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.get('/student/:studentId/export', authenticate, async (req: AuthRequest, res) => {
  if (req.user!.role === 'student' && req.user!.id !== req.params.studentId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const studentRow = await query('SELECT full_name, roll_number FROM users WHERE id = $1', [req.params.studentId]);
  if (studentRow.rows.length === 0) return res.status(404).json({ error: 'Student not found' });

  const result = await query(
    `SELECT c.name AS course_name, c.code AS course_code, s.lecture_number, s.lecture_date,
            a.status, a.verification_method, a.marked_at
     FROM attendance a
     JOIN attendance_sessions s ON a.session_id = s.id
     JOIN courses c ON s.course_id = c.id
     WHERE a.student_id = $1
     ORDER BY c.code, s.lecture_date, s.lecture_number`,
    [req.params.studentId],
  );

  const student = studentRow.rows[0];
  const filename = `attendance_${student.roll_number || req.params.studentId}.csv`;
  const headers = ['Course Name', 'Course Code', 'Lecture #', 'Date', 'Status', 'Verification Method', 'Marked At'];
  const rows = result.rows.map(r =>
    [r.course_name, r.course_code, r.lecture_number, r.lecture_date, r.status, r.verification_method, r.marked_at]
      .map(escapeCsv).join(',')
  );

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send([headers.join(','), ...rows].join('\n'));
});

export const reportRouter = router;
