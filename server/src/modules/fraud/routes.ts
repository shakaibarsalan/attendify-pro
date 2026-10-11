import { Router } from 'express';
import { authenticate, requireRoles, AuthRequest } from '../../middleware/auth.js';
import { query } from '../../config/database.js';

const router = Router();

/**
 * @openapi
 * /fraud:
 *   get:
 *     summary: List fraud alerts
 *     description: Retrieve fraud alerts scoped to the authenticated user's role and institution. System admins see all; org admins see their institution; teachers see alerts from their sessions. Supports filtering by status and severity.
 *     tags: [Fraud]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, reviewed, dismissed, confirmed]
 *         description: Filter by alert status
 *         example: "pending"
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by severity level
 *         example: "high"
 *     responses:
 *       200:
 *         description: List of fraud alerts
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
 *                         example: "alert-001-uuid"
 *                       institution_id:
 *                         type: string
 *                         format: uuid
 *                         example: "inst-001-uuid"
 *                       session_id:
 *                         type: string
 *                         format: uuid
 *                         example: "session-001-uuid"
 *                       student_id:
 *                         type: string
 *                         format: uuid
 *                         example: "student-001-uuid"
 *                       alert_type:
 *                         type: string
 *                         example: "location_spoof"
 *                       severity:
 *                         type: string
 *                         example: "high"
 *                       status:
 *                         type: string
 *                         example: "pending"
 *                       details:
 *                         type: object
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-05-22T09:15:00Z"
 *                 total:
 *                   type: integer
 *                   example: 8
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
router.get('/', authenticate, requireRoles('system_admin', 'org_admin', 'teacher'), async (req: AuthRequest, res) => {
  // Join student + course context so clients can show names instead of raw UUIDs.
  let sql = `SELECT f.id, f.institution_id, f.student_id, f.session_id, f.attendance_id, f.reason, f.severity, f.evidence,
    f.status, f.reviewed_by, f.reviewed_at, f.resolution_notes, f.created_at, f.updated_at,
    u.full_name AS student_name, u.roll_number,
    s.lecture_number, c.name AS course_name, c.code AS course_code
    FROM fraud_alerts f
    LEFT JOIN users u ON u.id = f.student_id
    LEFT JOIN attendance_sessions s ON s.id = f.session_id
    LEFT JOIN courses c ON c.id = s.course_id
    WHERE 1=1`;
  const params: any[] = [];
  let idx = 1;

  if (req.user!.institutionId) {
    sql += ` AND f.institution_id = $${idx++}`;
    params.push(req.user!.institutionId);
  }
  if (req.user!.role === 'teacher') {
    sql += ` AND f.session_id IN (SELECT id FROM attendance_sessions WHERE teacher_id = $${idx++})`;
    params.push(req.user!.id);
  }

  const { status, severity } = req.query;
  if (status) { sql += ` AND f.status = $${idx++}`; params.push(status); }
  if (severity) { sql += ` AND f.severity = $${idx++}`; params.push(severity); }

  const page = Math.max(1, parseInt(req.query.page as string || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || '50')));
  const offset = (page - 1) * limit;

  const countResult = await query(`SELECT COUNT(*) AS count FROM (${sql}) AS filtered`, params);
  const total = parseInt(countResult.rows[0].count);
  const result = await query(`${sql} ORDER BY f.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...params, limit, offset]);
  res.json({ data: result.rows, total, page, limit, hasMore: page * limit < total });
});

/**
 * @openapi
 * /fraud/analytics:
 *   get:
 *     summary: Get fraud analytics
 *     description: Retrieve aggregated fraud analytics including totals, pending count, breakdown by severity, daily trends (last 30 days), and top courses with fraud. Available to system_admin and org_admin.
 *     tags: [Fraud]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Fraud analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   example: 42
 *                 pending:
 *                   type: integer
 *                   example: 12
 *                 bySeverity:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       severity:
 *                         type: string
 *                         example: "high"
 *                       count:
 *                         type: string
 *                         example: "15"
 *                 byDay:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                         example: "2026-05-22"
 *                       count:
 *                         type: string
 *                         example: "3"
 *                 byCourse:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       course_name:
 *                         type: string
 *                         example: "Data Structures & Algorithms"
 *                       count:
 *                         type: string
 *                         example: "8"
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
router.get('/analytics', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res) => {
  let instFilter = '';
  let instFilterQualified = '';
  const params: unknown[] = [];
  let idx = 1;

  if (req.user!.institutionId) {
    instFilter = ` AND institution_id = $${idx}`;
    instFilterQualified = ` AND f.institution_id = $${idx}`;
    idx++;
    params.push(req.user!.institutionId);
  }

  const filterParams = params.slice(0, idx - 1);
  const total = await query(`SELECT COUNT(*) as count FROM fraud_alerts WHERE 1=1${instFilter}`, filterParams);
  const pending = await query(`SELECT COUNT(*) as count FROM fraud_alerts WHERE status = 'pending'${instFilter}`, filterParams);
  const bySeverity = await query(
    `SELECT severity, COUNT(*) as count FROM fraud_alerts WHERE 1=1${instFilter} GROUP BY severity`,
    filterParams,
  );
  const byDay = await query(
    `SELECT DATE(created_at) as date, COUNT(*) as count FROM fraud_alerts WHERE created_at > NOW() - INTERVAL '30 days'${instFilter} GROUP BY DATE(created_at) ORDER BY date`,
    filterParams,
  );
  const byCourse = await query(
    `SELECT c.name as course_name, COUNT(f.id) as count FROM fraud_alerts f JOIN attendance_sessions s ON f.session_id = s.id JOIN courses c ON s.course_id = c.id WHERE 1=1${instFilterQualified} GROUP BY c.name ORDER BY count DESC LIMIT 5`,
    filterParams,
  );

  res.json({
    total: parseInt(total.rows[0]?.count || '0'),
    pending: parseInt(pending.rows[0]?.count || '0'),
    bySeverity: bySeverity.rows,
    byDay: byDay.rows,
    byCourse: byCourse.rows,
  });
});

/**
 * @openapi
 * /fraud/{id}:
 *   patch:
 *     summary: Resolve fraud alert
 *     description: Update the status and add resolution notes for a fraud alert. Records who reviewed the alert and when. Available to org_admin and teacher roles.
 *     tags: [Fraud]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Fraud alert ID
 *         example: "alert-001-uuid"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [reviewed, dismissed, confirmed]
 *                 example: "confirmed"
 *               resolutionNotes:
 *                 type: string
 *                 example: "Student confirmed location mismatch. Disciplinary action recommended."
 *     responses:
 *       200:
 *         description: Alert updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: "alert-001-uuid"
 *                 status:
 *                   type: string
 *                   example: "confirmed"
 *                 resolution_notes:
 *                   type: string
 *                   example: "Student confirmed location mismatch. Disciplinary action recommended."
 *                 reviewed_by:
 *                   type: string
 *                   format: uuid
 *                   example: "admin-001-uuid"
 *                 reviewed_at:
 *                   type: string
 *                   format: date-time
 *                   example: "2026-05-22T11:00:00Z"
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
 *         description: Alert not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Alert not found"
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
router.patch('/:id', authenticate, requireRoles('system_admin', 'org_admin', 'teacher'), async (req: AuthRequest, res) => {
  const { status, resolutionNotes } = req.body;
  const allowed = ['reviewed', 'resolved', 'false_positive'];
  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }

  const alertRow = await query(
    `SELECT id, institution_id, attendance_id, student_id FROM fraud_alerts WHERE id = $1`,
    [req.params.id],
  );
  if (alertRow.rows.length === 0) return res.status(404).json({ error: 'Alert not found' });

  const alert = alertRow.rows[0];
  if (req.user!.role !== 'system_admin' && alert.institution_id !== req.user!.institutionId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const result = await query(
    `UPDATE fraud_alerts
     SET status = $1, resolution_notes = $2, reviewed_by = $3, reviewed_at = NOW()
     WHERE id = $4
     RETURNING id, status, resolution_notes, reviewed_by, reviewed_at, attendance_id, student_id`,
    [status, resolutionNotes || null, req.user!.id, req.params.id],
  );

  // Sync attendance status based on resolution
  if (alert.attendance_id) {
    const newAttendanceStatus = status === 'false_positive' ? 'verified' : status === 'resolved' ? 'rejected' : null;
    if (newAttendanceStatus) {
      await query('UPDATE attendance SET status = $1 WHERE id = $2', [newAttendanceStatus, alert.attendance_id]);
    }
  }

  res.json(result.rows[0]);
});

export const fraudRouter = router;
