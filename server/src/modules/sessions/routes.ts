import { Router } from 'express';
import { authenticate, requireRoles, AuthRequest } from '../../middleware/auth.js';
import { query } from '../../config/database.js';
import { generateCurrentQRToken, validateQRToken } from '../../utils/qr-token.js';
import { issuePresencePass } from '../../utils/presence-pass.js';

const router = Router();

async function markAbsentStudents(sessionId: string, institutionId: string, courseId: string) {
  const enrolled = await query(
    `SELECT e.student_id FROM enrollments e
     WHERE e.course_id = $1 AND e.status = 'active'
     AND NOT EXISTS (
       SELECT 1 FROM attendance a WHERE a.session_id = $2 AND a.student_id = e.student_id
     )`,
    [courseId, sessionId],
  );

  for (const row of enrolled.rows) {
    await query(
      `INSERT INTO attendance (institution_id, session_id, student_id, status, verification_method, marked_at)
       VALUES ($1, $2, $3, 'absent', 'auto', NOW())
       ON CONFLICT (session_id, student_id) DO NOTHING`,
      [institutionId, sessionId, row.student_id],
    );
  }

  if (enrolled.rows.length > 0) {
    await query(
      'UPDATE attendance_sessions SET total_present = COALESCE(total_present, 0) WHERE id = $1',
      [sessionId],
    );
  }

  return enrolled.rows.length;
}

/**
 * @openapi
 * /sessions:
 *   get:
 *     summary: List attendance sessions
 *     description: Retrieve attendance sessions visible to the current user. Students see sessions for their enrolled courses; teachers see their own sessions; others are scoped by institution. Supports filtering by courseId, status, and date.
 *     tags: [Sessions]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, completed, cancelled]
 *         description: Filter by session status
 *         example: "active"
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by lecture date
 *         example: "2026-05-22"
 *     responses:
 *       200:
 *         description: List of attendance sessions
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
 *                         example: "session-001-uuid"
 *                       institution_id:
 *                         type: string
 *                         format: uuid
 *                         example: "inst-001-uuid"
 *                       course_id:
 *                         type: string
 *                         format: uuid
 *                         example: "course-001-uuid"
 *                       teacher_id:
 *                         type: string
 *                         format: uuid
 *                         example: "teacher-001-uuid"
 *                       course_name:
 *                         type: string
 *                         example: "Data Structures & Algorithms"
 *                       course_code:
 *                         type: string
 *                         example: "CS-301"
 *                       start_time:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-05-22T09:00:00Z"
 *                       end_time:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-05-22T10:30:00Z"
 *                       status:
 *                         type: string
 *                         example: "active"
 *                       total_enrolled:
 *                         type: integer
 *                         example: 45
 *                       total_present:
 *                         type: integer
 *                         example: 38
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-05-22T08:55:00Z"
 *                 total:
 *                   type: integer
 *                   example: 12
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 50
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
  let sql = `SELECT s.id, s.institution_id, s.course_id, s.teacher_id, s.lecture_number, s.lecture_date,
    s.start_time, s.end_time, s.status, s.qr_rotation_enabled, s.qr_rotation_interval,
    s.location_lat, s.location_lng, s.location_radius, s.require_biometric, s.require_liveness,
    s.allow_qr, s.allow_face, s.allow_fingerprint, s.require_qr,
    s.notes, s.total_enrolled, s.total_present, s.created_at, s.updated_at,
    c.name as course_name, c.code as course_code
    FROM attendance_sessions s JOIN courses c ON s.course_id = c.id WHERE 1=1`;
  const params: unknown[] = [];
  let idx = 1;

  if (req.user!.role === 'student') {
    sql += ` AND s.course_id IN (SELECT course_id FROM enrollments WHERE student_id = $${idx++} AND status = 'active')`;
    params.push(req.user!.id);
    if (req.query.status === 'active') {
      sql += ` AND s.id NOT IN (SELECT session_id FROM attendance WHERE student_id = $${idx++})`;
      params.push(req.user!.id);
    }
  } else if (req.user!.role === 'teacher') {
    sql += ` AND s.teacher_id = $${idx++}`;
    params.push(req.user!.id);
  } else if (req.user!.role !== 'system_admin' && req.user!.institutionId) {
    sql += ` AND s.institution_id = $${idx++}`;
    params.push(req.user!.institutionId);
  }

  const { courseId, status, date } = req.query;
  if (courseId) { sql += ` AND s.course_id = $${idx++}`; params.push(courseId); }
  if (status) { sql += ` AND s.status = $${idx++}`; params.push(status); }
  if (date) { sql += ` AND s.lecture_date = $${idx++}`; params.push(date); }

  const page = Math.max(1, parseInt(req.query.page as string || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || '50')));
  const offset = (page - 1) * limit;

  const countResult = await query(`SELECT COUNT(*) AS count FROM (${sql}) AS filtered`, params);
  const total = parseInt(countResult.rows[0].count);
  const result = await query(`${sql} ORDER BY s.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...params, limit, offset]);
  res.json({ data: result.rows, total, page, limit, hasMore: page * limit < total });
});

/**
 * @openapi
 * /sessions:
 *   post:
 *     summary: Create attendance session
 *     description: Start a new attendance session for a course. Only teachers can create sessions. Enrolled students are automatically notified.
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [courseId, startTime, endTime]
 *             properties:
 *               courseId:
 *                 type: string
 *                 format: uuid
 *                 example: "course-001-uuid"
 *               startTime:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-05-22T09:00:00Z"
 *               endTime:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-05-22T10:30:00Z"
 *               qrRotationEnabled:
 *                 type: boolean
 *                 example: true
 *               requireBiometric:
 *                 type: boolean
 *                 example: false
 *               requireLiveness:
 *                 type: boolean
 *                 example: false
 *               locationLat:
 *                 type: number
 *                 example: 33.6844
 *               locationLng:
 *                 type: number
 *                 example: 73.0479
 *               locationRadius:
 *                 type: number
 *                 example: 50
 *               notes:
 *                 type: string
 *                 example: "Lecture 12 — Binary Trees"
 *     responses:
 *       201:
 *         description: Session created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: "session-001-uuid"
 *                 institution_id:
 *                   type: string
 *                   format: uuid
 *                   example: "inst-001-uuid"
 *                 course_id:
 *                   type: string
 *                   format: uuid
 *                   example: "course-001-uuid"
 *                 teacher_id:
 *                   type: string
 *                   format: uuid
 *                   example: "teacher-001-uuid"
 *                 start_time:
 *                   type: string
 *                   format: date-time
 *                   example: "2026-05-22T09:00:00Z"
 *                 end_time:
 *                   type: string
 *                   format: date-time
 *                   example: "2026-05-22T10:30:00Z"
 *                 status:
 *                   type: string
 *                   example: "active"
 *                 qr_rotation_enabled:
 *                   type: boolean
 *                   example: true
 *                 total_enrolled:
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
 *       403:
 *         description: Forbidden — only teachers
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
router.post('/', authenticate, requireRoles('teacher'), async (req: AuthRequest, res) => {
  const {
    courseId, startTime, endTime, qrRotationEnabled, requireBiometric, requireLiveness,
    locationLat, locationLng, locationRadius, notes,
  } = req.body;

  // Allowed attendance methods (teacher controls what students may use).
  // Default to QR + face enabled, fingerprint disabled when omitted.
  const allowQr = req.body.allowQr !== undefined ? !!req.body.allowQr : true;
  const allowFace = req.body.allowFace !== undefined ? !!req.body.allowFace : true;
  const allowFingerprint = req.body.allowFingerprint !== undefined ? !!req.body.allowFingerprint : false;
  // Live-QR presence gate (secure mode): a fast-rotating QR proves the student is
  // physically present before they mark with a biometric. QR alone never marks.
  const requireQr = req.body.requireQr !== undefined ? !!req.body.requireQr : false;

  if (!courseId) return res.status(400).json({ error: 'courseId is required' });
  if (!startTime || !endTime) {
    return res.status(400).json({ error: 'startTime and endTime are required' });
  }

  const start = new Date(startTime);
  const end = new Date(endTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ error: 'Invalid startTime or endTime' });
  }
  if (start >= end) {
    return res.status(400).json({ error: 'End time must be after start time' });
  }
  if (end.getTime() < Date.now()) {
    return res.status(400).json({ error: 'End time is already in the past' });
  }
  // Guard against accidental marathon sessions.
  const durationMs = end.getTime() - start.getTime();
  if (durationMs > 12 * 60 * 60 * 1000) {
    return res.status(400).json({ error: 'A session cannot be longer than 12 hours' });
  }

  if (!allowQr && !allowFace && !allowFingerprint) {
    return res.status(400).json({ error: 'Select at least one attendance method (QR, face, or fingerprint)' });
  }

  const course = await query('SELECT institution_id, teacher_id FROM courses WHERE id = $1', [courseId]);
  if (course.rows.length === 0) return res.status(404).json({ error: 'Course not found' });
  if (course.rows[0].teacher_id !== req.user!.id) {
    return res.status(403).json({ error: 'You are not the teacher of this course' });
  }

  const activeSession = await query(
    `SELECT id FROM attendance_sessions WHERE course_id = $1 AND status = 'active'`,
    [courseId],
  );
  if (activeSession.rows.length > 0) {
    return res.status(409).json({ error: 'An active session already exists for this course', sessionId: activeSession.rows[0].id });
  }

  // One teacher can only run one lecture at a time: reject if this teacher has
  // another active session whose time window overlaps the requested window.
  const overlap = await query(
    `SELECT s.id, c.name AS course_name, c.code AS course_code, s.start_time, s.end_time
     FROM attendance_sessions s JOIN courses c ON s.course_id = c.id
     WHERE s.teacher_id = $1 AND s.status = 'active'
       AND s.start_time < $3 AND s.end_time > $2
     LIMIT 1`,
    [req.user!.id, start.toISOString(), end.toISOString()],
  );
  if (overlap.rows.length > 0) {
    const o = overlap.rows[0];
    return res.status(409).json({
      error: `You already have an active lecture during this time (${o.course_code || o.course_name}). Finish it or pick a non-overlapping time.`,
      conflictSessionId: o.id,
    });
  }

  const totalEnrolled = await query('SELECT COUNT(*) FROM enrollments WHERE course_id = $1 AND status = \'active\'', [courseId]);

  const crypto = await import('crypto');
  const qrSecret = crypto.randomBytes(32).toString('hex');

  // Liveness only makes sense when face is an allowed method.
  const effectiveLiveness = allowFace && !!requireLiveness;
  const effectiveBiometric = allowFace && (requireBiometric !== undefined ? !!requireBiometric : true);

  // When the presence gate is on, force a rotating QR regardless of the other QR
  // settings — the rotation is the anti-sharing mechanism.
  const qrRotationOn = requireQr ? true : (allowQr && (qrRotationEnabled ?? false));
  // 5s rotation. Short, so a screenshotted/saved QR goes stale fast and is
  // rejected — only a student physically watching the live screen can present a
  // current code. Paired with a small validation grace (see verify-presence) so
  // a genuine live scan still survives the scan -> verify round-trip; net token
  // validity is ~10-15s, not the ~60s+ that previously let saved QRs through.
  const qrInterval = 5;

  const result = await query(
    `INSERT INTO attendance_sessions (institution_id, course_id, teacher_id, start_time, end_time, qr_code_secret, qr_rotation_enabled, qr_rotation_interval, require_biometric, require_liveness, require_qr, allow_qr, allow_face, allow_fingerprint, location_lat, location_lng, location_radius, total_enrolled, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING *`,
    [
      course.rows[0].institution_id, courseId, req.user!.id, start.toISOString(), end.toISOString(), qrSecret,
      qrRotationOn, qrInterval, effectiveBiometric, effectiveLiveness, requireQr,
      allowQr, allowFace, allowFingerprint,
      locationLat, locationLng, locationRadius || 50, parseInt(totalEnrolled.rows[0].count), notes || null,
    ],
  );

  const session = result.rows[0];

  try {
    const { createNotification } = await import('../notifications/routes.js');
    const enrolled = await query(
      'SELECT student_id FROM enrollments WHERE course_id = $1 AND status = \'active\'',
      [courseId],
    );
    for (const row of enrolled.rows) {
      createNotification({
        institutionId: session.institution_id,
        userId: row.student_id,
        title: 'Class Session Started',
        message: `Your class is now in session. You can mark attendance.`,
        type: 'session',
        actionUrl: `/student/dashboard`,
      }).catch(() => {});
    }
  } catch {
    // notifications not available
  }

  res.status(201).json(session);
});

/**
 * @openapi
 * /sessions/{id}/status:
 *   patch:
 *     summary: Update session status
 *     description: Update the status of an attendance session (e.g., complete or cancel it). Only the teacher who owns the session may update it. When completing, absent students are automatically marked.
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Session ID
 *         example: "session-001-uuid"
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
 *                 enum: [active, completed, cancelled]
 *                 example: "completed"
 *     responses:
 *       200:
 *         description: Session status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: "session-001-uuid"
 *                 status:
 *                   type: string
 *                   example: "completed"
 *                 autoMarkedAbsent:
 *                   type: integer
 *                   example: 7
 *       400:
 *         description: Session already ended
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Session already ended"
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
 *         description: Forbidden — only teachers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Forbidden"
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Session not found"
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
router.patch('/:id/status', authenticate, requireRoles('teacher'), async (req: AuthRequest, res) => {
  const { status } = req.body;
  const allowedTransitions = ['completed', 'cancelled'];
  if (!status || !allowedTransitions.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowedTransitions.join(', ')}` });
  }

  const sessionCheck = await query(
    'SELECT id, course_id, institution_id, status FROM attendance_sessions WHERE id = $1 AND teacher_id = $2',
    [req.params.id, req.user!.id],
  );
  if (sessionCheck.rows.length === 0) return res.status(404).json({ error: 'Session not found' });

  const sess = sessionCheck.rows[0];
  if (sess.status === 'completed' || sess.status === 'cancelled') {
    return res.status(400).json({ error: 'Session already ended' });
  }

  const result = await query(
    `UPDATE attendance_sessions SET status = $1 WHERE id = $2 RETURNING *`,
    [status, req.params.id],
  );

  let absentCount = 0;
  if (status === 'completed') {
    absentCount = await markAbsentStudents(req.params.id, sess.institution_id, sess.course_id);
  }

  res.json({ ...result.rows[0], autoMarkedAbsent: absentCount });
});

/**
 * @openapi
 * /sessions/{id}/qr:
 *   get:
 *     summary: Get session QR secret
 *     description: Retrieve the QR code secret for an active session. Used by students to validate attendance QR codes.
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Session ID
 *         example: "session-001-uuid"
 *     responses:
 *       200:
 *         description: QR secret for the session
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                   format: uuid
 *                   example: "session-001-uuid"
 *                 qrSecret:
 *                   type: string
 *                   example: "a1b2c3d4e5f6789012345678abcdef1234567890abcdef1234567890abcdef12"
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
 *         description: Active session not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Active session not found"
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
/**
 * @openapi
 * /sessions/{id}/roster:
 *   get:
 *     summary: Get session roster (marked + unmarked students)
 *     description: Retrieve every student enrolled in the session's course along with their attendance record for this session (if any). Used for hierarchical attendance activity views.
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Roster of enrolled students with attendance status
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Session not found
 */
router.get('/:id/roster', authenticate, requireRoles('teacher', 'org_admin', 'system_admin'), async (req: AuthRequest, res) => {
  const sessionCheck = await query(
    'SELECT id, course_id, teacher_id, institution_id FROM attendance_sessions WHERE id = $1',
    [req.params.id],
  );
  if (sessionCheck.rows.length === 0) return res.status(404).json({ error: 'Session not found' });

  const sess = sessionCheck.rows[0];
  if (req.user!.role === 'teacher' && sess.teacher_id !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (req.user!.role === 'org_admin' && sess.institution_id !== req.user!.institutionId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const result = await query(
    `SELECT u.id AS student_id, u.full_name, u.roll_number, u.email,
       a.id AS attendance_id, a.status, a.verification_method, a.marked_at, a.confidence_score
     FROM enrollments e
     JOIN users u ON u.id = e.student_id
     LEFT JOIN attendance a ON a.session_id = $1 AND a.student_id = u.id
     WHERE e.course_id = $2 AND e.status = 'active'
     ORDER BY u.full_name`,
    [req.params.id, sess.course_id],
  );

  res.json({ data: result.rows });
});

router.get('/:id/qr', authenticate, requireRoles('teacher', 'org_admin', 'system_admin'), async (req: AuthRequest, res) => {
  const result = await query('SELECT id, qr_code_secret, qr_rotation_enabled, qr_rotation_interval, end_time FROM attendance_sessions WHERE id = $1 AND status = \'active\'', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Active session not found' });
  res.json({ sessionId: result.rows[0].id, qrSecret: result.rows[0].qr_code_secret });
});

/**
 * @openapi
 * /sessions/{id}/qr/current:
 *   get:
 *     summary: Get current QR token
 *     description: Retrieve the current time-based QR token for a session. If rotation is enabled, the token changes at the configured interval. Only teachers, org admins, and system admins may access this.
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Session ID
 *         example: "session-001-uuid"
 *     responses:
 *       200:
 *         description: Current QR token data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                   format: uuid
 *                   example: "session-001-uuid"
 *                 token:
 *                   type: string
 *                   example: "rotated_token_abc123def456"
 *                 windowIndex:
 *                   type: integer
 *                   example: 4
 *                 expiresAt:
 *                   type: number
 *                   example: 1747910400
 *                 intervalSeconds:
 *                   type: integer
 *                   example: 15
 *                 static:
 *                   type: boolean
 *                   example: false
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
 *         description: Active session not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Active session not found"
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
router.get('/:id/qr/current', authenticate, requireRoles('teacher', 'org_admin', 'system_admin'), async (req: AuthRequest, res) => {
  const result = await query(
    'SELECT id, qr_code_secret, qr_rotation_enabled, qr_rotation_interval, end_time FROM attendance_sessions WHERE id = $1 AND status = \'active\'',
    [req.params.id],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Active session not found' });
  }

  const session = result.rows[0];

  if (!session.qr_rotation_enabled) {
    return res.json({
      sessionId: session.id,
      token: session.qr_code_secret,
      static: true,
      expiresAt: session.end_time ? new Date(session.end_time).getTime() / 1000 : null,
    });
  }

  // Cap the effective rotation at 5s so EVERY gate session (including ones created
  // before the 5s default, which stored 15/30) rotates fast and expires quickly.
  // verify-presence caps to the same value, so the generated/validated tokens match.
  const interval = Math.min(session.qr_rotation_interval || 5, 5);
  const qrToken = generateCurrentQRToken(session.qr_code_secret, interval);

  res.json({
    sessionId: session.id,
    token: qrToken.token,
    windowIndex: qrToken.windowIndex,
    expiresAt: qrToken.expiresAt,
    intervalSeconds: qrToken.intervalSeconds,
    static: false,
  });
});

/**
 * @openapi
 * /sessions/{id}/verify-presence:
 *   post:
 *     summary: Verify a student scanned the live QR (presence gate)
 *     description: Validates the session's CURRENT rotating QR token and, if valid,
 *       issues a short-lived signed presence pass that the student's (slower)
 *       biometric mark then carries. Proves the student was physically in the room.
 *     tags: [Sessions]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Presence verified — returns { pass }" }
 *       403: { description: QR expired or not enrolled }
 */
router.post('/:id/verify-presence', authenticate, requireRoles('student'), async (req: AuthRequest, res) => {
  const { qrToken } = req.body;
  if (!qrToken) return res.status(400).json({ error: 'Scan the QR shown by your teacher.' });

  const result = await query(
    'SELECT id, course_id, qr_code_secret, qr_rotation_interval, status, start_time, end_time FROM attendance_sessions WHERE id = $1',
    [req.params.id],
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
  const s = result.rows[0];
  if (s.status !== 'active') return res.status(400).json({ error: 'This session is not active.' });
  if (s.start_time && new Date() < new Date(s.start_time)) {
    return res.status(403).json({ error: 'This lecture has not started yet.' });
  }
  if (s.end_time && new Date() > new Date(s.end_time)) {
    return res.status(400).json({ error: 'The attendance window has closed.' });
  }

  const enrolled = await query(
    "SELECT 1 FROM enrollments WHERE course_id = $1 AND student_id = $2 AND status = 'active'",
    [s.course_id, req.user!.id],
  );
  if (enrolled.rows.length === 0) return res.status(403).json({ error: 'You are not enrolled in this course.' });

  // Validate the live token — the rotating QR is what proves physical presence.
  // Cap to 5s to match /qr/current (same value → tokens match), and use a small
  // window-end grace so an already-rotated/saved QR dies within ~6s of rotating
  // (net validity ~6-11s), while a genuine live scan still completes.
  const interval = Math.min(s.qr_rotation_interval || 5, 5);
  const check = validateQRToken(s.qr_code_secret, qrToken, interval, 6);
  if (!check.valid) {
    return res.status(403).json({ error: 'That QR has expired — scan the current QR shown on the screen.' });
  }

  // Issue a longer-lived signed pass the biometric mark will carry.
  res.json({ sessionId: s.id, pass: issuePresencePass(s.id, req.user!.id) });
});

/**
 * @openapi
 * /sessions/expire-overdue:
 *   post:
 *     summary: Expire overdue sessions
 *     description: Find all active sessions whose end_time has passed, mark them as completed, and auto-mark absent students. Available to teachers, org admins, and system admins.
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Overdue sessions expired
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "2 expired session(s) completed"
 *                 sessionsExpired:
 *                   type: integer
 *                   example: 2
 *                 studentsMarkedAbsent:
 *                   type: integer
 *                   example: 14
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
router.post('/expire-overdue', authenticate, requireRoles('teacher', 'org_admin', 'system_admin'), async (_req: AuthRequest, res) => {
  const expired = await query(
    `SELECT s.id, s.course_id, s.institution_id FROM attendance_sessions s
     WHERE s.status = 'active' AND s.end_time < NOW()`,
  );

  let totalExpired = 0;
  let totalAbsent = 0;

  for (const sess of expired.rows) {
    const absent = await markAbsentStudents(sess.id, sess.institution_id, sess.course_id);
    await query('UPDATE attendance_sessions SET status = $1 WHERE id = $2', ['completed', sess.id]);
    totalExpired++;
    totalAbsent += absent;
  }

  res.json({
    message: `${totalExpired} expired session(s) completed`,
    sessionsExpired: totalExpired,
    studentsMarkedAbsent: totalAbsent,
  });
});

export const sessionRouter = router;
