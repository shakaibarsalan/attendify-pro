import { Router } from 'express';
import { authenticate, requireRoles, AuthRequest } from '../../middleware/auth.js';
import { query } from '../../config/database.js';
import { validateQRToken } from '../../utils/qr-token.js';
import { verifyPresencePass } from '../../utils/presence-pass.js';
import { haversineDistance, isValidCoordinate } from '../../utils/geo.js';

const router = Router();

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

async function notifyOrgAdminOfFraud(institutionId: string, alert: { reason: string; severity: string; studentName?: string }) {
  if (alert.severity !== 'critical' && alert.severity !== 'high') return;
  try {
    const orgAdmins = await query(
      `SELECT COALESCE(personal_email, email) AS notify_email FROM users
        WHERE institution_id = $1 AND role = 'org_admin' AND is_active = true LIMIT 3`,
      [institutionId],
    );
    if (orgAdmins.rows.length === 0) return;
    const { emailService } = await import('../../services/email.js');
    for (const admin of orgAdmins.rows) {
      await emailService.sendFraudAlertToOrgAdmin(admin.notify_email, {
        type: alert.reason.split(':')[0] || 'Fraud Detection',
        message: alert.reason,
        severity: alert.severity,
        studentName: alert.studentName,
      });
    }
  } catch (e) {
    console.error('[FraudEmail] Failed to notify org admin:', e);
  }
}

// Fire-and-forget: notify ERP integrations of a fraud alert via the `fraud.alert`
// webhook (all severities). Best-effort — never blocks or fails attendance marking.
function fireFraudAlertWebhook(
  institutionId: string,
  payload: { studentId: string; sessionId: string; reason: string; severity: string },
) {
  import('../../services/webhooks.js')
    .then(({ dispatchWebhook }) => dispatchWebhook(institutionId, 'fraud.alert', { ...payload, detectedAt: new Date().toISOString() }))
    .catch(() => {});
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count++;
  return entry.count <= 5;
}

/**
 * @openapi
 * /attendance:
 *   get:
 *     summary: List attendance records
 *     description: >
 *       Retrieve attendance records filtered by session, course, student, date range, and status.
 *       Students can only view their own records. Teachers see records for their institution.
 *       System admins see all records. Results are ordered by marked_at descending, capped at 200.
 *     tags:
 *       - Attendance
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: sessionId
 *         in: query
 *         description: Filter by attendance session UUID
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: courseId
 *         in: query
 *         description: Filter by course UUID
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: studentId
 *         in: query
 *         description: Filter by student UUID (ignored for student role — forced to own ID)
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: dateFrom
 *         in: query
 *         description: Only include records marked on or after this ISO timestamp
 *         required: false
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: dateTo
 *         in: query
 *         description: Only include records marked on or before this ISO timestamp
 *         required: false
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: status
 *         in: query
 *         description: Filter by attendance status value
 *         required: false
 *         schema:
 *           type: string
 *           enum: [verified, absent, late, excused]
 *     responses:
 *       '200':
 *         description: Array of attendance records with joined student, session, and course details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [data, total, page, limit]
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required:
 *                       - id
 *                       - institution_id
 *                       - session_id
 *                       - student_id
 *                       - status
 *                       - face_verified
 *                       - fingerprint_verified
 *                       - marked_at
 *                       - student_name
 *                       - roll_number
 *                       - lecture_number
 *                       - course_name
 *                       - course_code
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                         example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                       institution_id:
 *                         type: string
 *                         format: uuid
 *                         example: "11111111-2222-3333-4444-555555555555"
 *                       session_id:
 *                         type: string
 *                         format: uuid
 *                         example: "22222222-3333-4444-5555-666666666666"
 *                       student_id:
 *                         type: string
 *                         format: uuid
 *                         example: "33333333-4444-5555-6666-777777777777"
 *                       status:
 *                         type: string
 *                         example: "verified"
 *                       face_verified:
 *                         type: boolean
 *                         example: true
 *                       fingerprint_verified:
 *                         type: boolean
 *                         example: false
 *                       liveness_score:
 *                         type: number
 *                         nullable: true
 *                         example: 0.97
 *                       confidence_score:
 *                         type: number
 *                         nullable: true
 *                         example: 0.95
 *                       verification_method:
 *                         type: string
 *                         nullable: true
 *                         enum: [qr, face, face_multi, qr_face, qr_fallback]
 *                         example: "qr_face"
 *                       device_info:
 *                         type: string
 *                         nullable: true
 *                         example: "Chrome/120.0 Windows/10"
 *                       ip_address:
 *                         type: string
 *                         nullable: true
 *                         example: "192.168.1.100"
 *                       location_lat:
 *                         type: number
 *                         nullable: true
 *                         example: 24.8607
 *                       location_lng:
 *                         type: number
 *                         nullable: true
 *                         example: 67.0011
 *                       marked_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-05-22T09:30:00.000Z"
 *                       student_name:
 *                         type: string
 *                         example: "Ahmed Ali"
 *                       roll_number:
 *                         type: string
 *                         nullable: true
 *                         example: "2021-CS-042"
 *                       lecture_number:
 *                         type: integer
 *                         nullable: true
 *                         example: 7
 *                       course_name:
 *                         type: string
 *                         example: "Data Structures & Algorithms"
 *                       course_code:
 *                         type: string
 *                         example: "CS201"
 *                 total:
 *                   type: integer
 *                   example: 42
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 200
 *       '401':
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authentication required"
 *       '500':
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
  const { sessionId, courseId, studentId, dateFrom, dateTo, status } = req.query;
  let sql = 'SELECT a.id, a.institution_id, a.session_id, a.student_id, a.status, CASE WHEN a.face_data IS NOT NULL THEN true ELSE false END as face_verified, CASE WHEN a.fingerprint_data IS NOT NULL THEN true ELSE false END as fingerprint_verified, a.liveness_score, a.confidence_score, a.verification_method, a.device_info, a.ip_address, a.location_lat, a.location_lng, a.marked_at, u.full_name as student_name, u.roll_number, s.lecture_number, s.course_id AS course_id, c.name as course_name, c.code as course_code FROM attendance a JOIN users u ON a.student_id = u.id JOIN attendance_sessions s ON a.session_id = s.id JOIN courses c ON s.course_id = c.id WHERE 1=1';
  const params: unknown[] = [];
  let idx = 1;

  if (req.user!.role === 'student') {
    sql += ` AND a.student_id = $${idx++}`;
    params.push(req.user!.id);
  } else if (req.user!.role !== 'system_admin' && req.user!.institutionId) {
    sql += ` AND a.institution_id = $${idx++}`;
    params.push(req.user!.institutionId);
  }

  if (sessionId) { sql += ` AND a.session_id = $${idx++}`; params.push(sessionId); }
  if (courseId) { sql += ` AND s.course_id = $${idx++}`; params.push(courseId); }
  if (studentId) { sql += ` AND a.student_id = $${idx++}`; params.push(studentId); }
  if (status) { sql += ` AND a.status = $${idx++}`; params.push(status); }
  if (dateFrom) { sql += ` AND a.marked_at >= $${idx++}`; params.push(dateFrom); }
  if (dateTo) { sql += ` AND a.marked_at <= $${idx++}`; params.push(dateTo); }

  const page = Math.max(1, parseInt(req.query.page as string || '1'));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string || '50')));
  const offset = (page - 1) * limit;

  const countResult = await query(`SELECT COUNT(*) AS count FROM (${sql}) AS filtered`, params);
  const total = parseInt(countResult.rows[0].count);
  const result = await query(`${sql} ORDER BY a.marked_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...params, limit, offset]);
  res.json({ data: result.rows, total, page, limit, hasMore: page * limit < total });
});

/**
 * @openapi
 * /attendance/mark:
 *   post:
 *     summary: Mark attendance for a session
 *     description: Mark attendance via QR code, face biometric, or both. Enforces geofence, device fingerprint detection, rate limiting (5/min), and fraud alert creation.
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: X-Device-Fingerprint
 *         in: header
 *         schema:
 *           type: string
 *       - name: Idempotency-Key
 *         in: header
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId]
 *             properties:
 *               sessionId:
 *                 type: string
 *                 format: uuid
 *               qrSecret:
 *                 type: string
 *                 description: QR code token (static or rotating)
 *               faceData:
 *                 type: string
 *                 description: Base64 single face image (deprecated, use frames)
 *               frames:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Base64 face image frames for multi-frame verification
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *     responses:
 *       201:
 *         description: Attendance marked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 status: { type: string, example: verified }
 *                 marked_at: { type: string, format: date-time }
 *                 message: { type: string }
 *       400:
 *         description: Missing or invalid input
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error: { type: string }
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Forbidden - not enrolled, outside geofence, or biometric failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error: { type: string }
 *                 reason: { type: string }
 *       409:
 *         description: Attendance already marked
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Server error
 */
router.post('/mark', authenticate, async (req: AuthRequest, res) => {
  const {
    sessionId, qrSecret, presencePass, faceData, frames, fingerprintData,
    deviceInfo, ip, lat, lng, livenessSessionId, livenessToken, expectedChallenges,
  } = req.body;

  if (req.user!.role !== 'student') {
    return res.status(403).json({ error: 'Only students can mark attendance' });
  }

  if (!checkRateLimit(req.user!.id)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
  }

  const session = await query(
    `SELECT s.*, c.require_location, c.location_lat as course_lat, c.location_lng as course_lng, c.location_radius as course_radius
     FROM attendance_sessions s JOIN courses c ON s.course_id = c.id WHERE s.id = $1 AND s.status = 'active'`,
    [sessionId],
  );
  if (session.rows.length === 0) return res.status(404).json({ error: 'Active session not found' });

  const s = session.rows[0];
  if (s.start_time && new Date() < new Date(s.start_time)) {
    return res.status(403).json({
      error: `This lecture hasn't started yet. Attendance opens at ${new Date(s.start_time).toLocaleString()}.`,
      startsAt: s.start_time,
    });
  }
  if (s.end_time && new Date() > new Date(s.end_time)) {
    return res.status(400).json({ error: 'Attendance window has closed' });
  }

  const enrolled = await query('SELECT id FROM enrollments WHERE course_id = $1 AND student_id = $2 AND status = \'active\'', [s.course_id, req.user!.id]);
  if (enrolled.rows.length === 0) {
    return res.status(403).json({ error: 'Not enrolled in this course' });
  }

  const existing = await query('SELECT id FROM attendance WHERE session_id = $1 AND student_id = $2', [sessionId, req.user!.id]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'Attendance already marked' });
  }

  if (!qrSecret && !faceData && !frames && !fingerprintData) {
    return res.status(400).json({ error: 'QR code or face data required' });
  }

  // Enforce the methods the teacher allowed for this session.
  // (Older sessions created before this column may be NULL → treat as allowed.)
  const usingQr = !!qrSecret;
  const usingFace = !!(frames || faceData);
  const usingFingerprint = !!fingerprintData;
  // In presence-gate mode the QR is a presence key (not a marking method), so it
  // is always permitted regardless of allow_qr.
  if (usingQr && s.allow_qr === false && s.require_qr !== true) {
    return res.status(403).json({ error: 'QR check-in is not allowed for this session' });
  }
  if (usingFace && s.allow_face === false) {
    return res.status(403).json({ error: 'Face check-in is not allowed for this session' });
  }
  if (usingFingerprint && s.allow_fingerprint === false) {
    return res.status(403).json({ error: 'Fingerprint check-in is not allowed for this session' });
  }

  // QR validation
  if (qrSecret) {
    if (s.qr_rotation_enabled) {
      const interval = s.qr_rotation_interval || 15;
      const qrResult = validateQRToken(s.qr_code_secret, qrSecret, interval);
      if (!qrResult.valid) {
        return res.status(400).json({ error: 'Invalid or expired QR token' });
      }

      // Single-use replay protection applies only to legacy QR-as-marking. In
      // presence-gate mode (require_qr) the SAME live token is scanned by every
      // student in the room within its short window, so it must NOT be single-use;
      // the fast rotation + one-mark-per-student rule prevent sharing/replay.
      if (s.require_qr !== true) {
        const usedTokens: Array<{ token: string; windowIndex: number; usedAt: string }> =
          typeof s.qr_token_used_at === 'string' ? JSON.parse(s.qr_token_used_at) : (s.qr_token_used_at || []);
        const alreadyUsed = usedTokens.some((t) => t.token === qrSecret);
        if (alreadyUsed) {
          return res.status(400).json({ error: 'QR token already used' });
        }
        usedTokens.push({ token: qrSecret, windowIndex: qrResult.windowIndex, usedAt: new Date().toISOString() });
        await query(
          'UPDATE attendance_sessions SET qr_token_used_at = $1 WHERE id = $2',
          [JSON.stringify(usedTokens), sessionId],
        );
      }
    } else {
      if (qrSecret !== s.qr_code_secret) {
        return res.status(400).json({ error: 'Invalid QR code' });
      }
    }
  }

  // ── Live-QR presence gate ──────────────────────────────────────────────────
  // When the teacher requires it, the student must carry a valid PRESENCE PASS
  // (issued by POST /sessions/:id/verify-presence after they scanned the live 3s
  // QR) AND a biometric. The pass — not the raw rotating token — is checked here,
  // because the QR's 3s window would expire during the slower biometric capture.
  if (s.require_qr === true) {
    if (!verifyPresencePass(presencePass, sessionId, req.user!.id)) {
      return res.status(403).json({ error: 'Scan the live QR shown by your teacher to confirm you are in the classroom. If you already scanned it, it may have expired — scan the current QR again.' });
    }
    if (!usingFace && !usingFingerprint) {
      return res.status(400).json({ error: 'After scanning the QR, mark your attendance with face or fingerprint.' });
    }
  }

  // Geofence validation: session location overrides course-level location
  const targetLat = s.location_lat || s.course_lat;
  const targetLng = s.location_lng || s.course_lng;
  const geoRequired = s.require_location || (targetLat && targetLng);
  if (geoRequired) {
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'Location required for this session' });
    }
    const studentLat = parseFloat(String(lat));
    const studentLng = parseFloat(String(lng));
    if (!isValidCoordinate(studentLat, studentLng)) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    const radius = s.location_radius || s.course_radius || 50;

    if (targetLat && targetLng) {
      const distance = haversineDistance(studentLat, studentLng, targetLat, targetLng);
      if (distance > radius) {
        await query(
          `INSERT INTO fraud_alerts (institution_id, student_id, session_id, reason, severity, evidence, status)
           VALUES ($1, $2, $3, $4, 'high', $5, 'pending')`,
          [
            s.institution_id,
            req.user!.id,
            sessionId,
            `Location outside geofence (${distance.toFixed(1)}m > ${radius}m)`,
            JSON.stringify({ distance, radius, studentLat, studentLng, targetLat, targetLng }),
          ],
        );
        fireFraudAlertWebhook(s.institution_id, { studentId: req.user!.id, sessionId, reason: `Location outside geofence (${distance.toFixed(1)}m > ${radius}m)`, severity: 'high' });

        try {
          const { createNotification } = await import('../notifications/routes.js');
          await createNotification({
            institutionId: s.institution_id,
            userId: req.user!.id,
            title: 'Geofence Alert',
            message: `Your attendance was rejected: you appear to be outside the classroom (${distance.toFixed(0)}m away).`,
            type: 'fraud',
          });
        } catch {}

        return res.status(403).json({ error: `Outside geofence (${distance.toFixed(1)}m > ${radius}m)`, distance, radius });
      }
    }
  }

  // Device fingerprint
  const deviceFingerprint = req.headers['x-device-fingerprint'] as string | undefined;
  if (deviceFingerprint) {
    const dupDevice = await query(
      `SELECT a.student_id, u.full_name FROM attendance a JOIN users u ON a.student_id = u.id
       WHERE a.session_id = $1 AND a.device_fingerprint = $2 AND a.student_id != $3`,
      [sessionId, deviceFingerprint, req.user!.id],
    );
    if (dupDevice.rows.length > 0) {
      await query(
        `INSERT INTO fraud_alerts (institution_id, student_id, session_id, reason, severity, evidence, status)
         VALUES ($1, $2, $3, $4, 'critical', $5, 'pending')`,
        [
          s.institution_id,
          req.user!.id,
          sessionId,
          `Duplicate device: same device used by ${dupDevice.rows[0].full_name}`,
          JSON.stringify({ deviceFingerprint, otherStudent: dupDevice.rows[0].student_id }),
        ],
      );
      fireFraudAlertWebhook(s.institution_id, { studentId: req.user!.id, sessionId, reason: `Duplicate device: same device used by ${dupDevice.rows[0].full_name}`, severity: 'critical' });
      notifyOrgAdminOfFraud(s.institution_id, {
        reason: `Duplicate device: same device used by ${dupDevice.rows[0].full_name}`,
        severity: 'critical',
        studentName: (req.user as any).fullName,
      });
    }
  }

  // Same IP + different student check
  const clientIp = ip || req.ip || req.headers['x-forwarded-for']?.toString() || null;
  if (clientIp) {
    const sameIp = await query(
      `SELECT a.student_id FROM attendance a
       WHERE a.session_id = $1 AND a.ip_address = $2 AND a.student_id != $3`,
      [sessionId, clientIp, req.user!.id],
    );
    if (sameIp.rows.length > 0) {
      await query(
        `INSERT INTO fraud_alerts (institution_id, student_id, session_id, reason, severity, evidence, status)
         VALUES ($1, $2, $3, $4, 'medium', $5, 'pending')`,
        [
          s.institution_id,
          req.user!.id,
          sessionId,
          'Same IP used by different student',
          JSON.stringify({ ip: clientIp, otherStudents: sameIp.rows.map((r: any) => r.student_id) }),
        ],
      );
      fireFraudAlertWebhook(s.institution_id, { studentId: req.user!.id, sessionId, reason: 'Same IP used by different student', severity: 'medium' });
    }
  }

  let verificationMethod = 'qr';
  let confidenceScore = 1.0;
  let livenessScore = 1.0;
  let verificationMetadata: Record<string, unknown> | null = null;
  let faceVerified: boolean | null = null;
  let fingerprintVerified: boolean | null = null;

  // Face verification: multi-frame or single-frame
  const framesToVerify = frames || (faceData ? [faceData] : null);

  if (framesToVerify && framesToVerify.length > 0) {
    verificationMethod = framesToVerify.length > 1 ? 'face_multi' : 'face';

    if (!livenessSessionId || !livenessToken) {
      return res.status(403).json({ error: 'Liveness verification required', reason: 'liveness_missing' });
    }

    try {
      const { config } = await import('../../config/index.js');

      const livenessCheck = await fetch(`${config.ai.serviceUrl}/api/v1/face/liveness/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': config.ai.apiKey },
        body: JSON.stringify({
          sessionId: livenessSessionId,
          token: livenessToken,
          frames: framesToVerify,
          expectedChallenges: expectedChallenges || ['mouth_open', 'smile'],
        }),
      });
      const livenessResult: any = await livenessCheck.json();
      if (!livenessResult.passed) {
        return res.status(403).json({ error: 'Liveness verification failed', reason: livenessResult.reason || 'gesture_not_verified' });
      }
      livenessScore = livenessResult.score || 0;

      if (framesToVerify.length >= 3) {
        const sampledFrames = framesToVerify.length > 5
          ? framesToVerify.filter((_: any, i: number) => i % Math.ceil(framesToVerify.length / 5) === 0 || i === framesToVerify.length - 1).slice(0, 5)
          : framesToVerify;
        const aiResponse = await fetch(`${config.ai.serviceUrl}/api/v1/face/verify-multi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': config.ai.apiKey },
          body: JSON.stringify({
            userId: req.user!.id,
            institutionId: s.institution_id,
            frames: sampledFrames,
            sessionId,
          }),
        });
        const aiResult: any = await aiResponse.json();
        confidenceScore = aiResult.confidence || 0;
        verificationMetadata = aiResult;

        if (!aiResult.verified) {
          let severity = 'medium';
          const reason = aiResult.reason || 'Face verification failed';
          if (reason.includes('spoof') || reason.includes('static_replay')) severity = 'high';
          if (aiResult.spoof_score > 0.9) severity = 'critical';

          await query(
            `INSERT INTO fraud_alerts (institution_id, student_id, session_id, reason, severity, evidence, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
            [s.institution_id, req.user!.id, sessionId, reason, severity, JSON.stringify(aiResult)],
          );

          try {
            const { createNotification } = await import('../notifications/routes.js');
            await createNotification({
              institutionId: s.institution_id,
              userId: req.user!.id,
              title: 'Verification Failed',
              message: `A fraud alert has been raised on your attendance for session ${sessionId.slice(0, 8)}...`,
              type: 'fraud',
            });
          } catch {}

          notifyOrgAdminOfFraud(s.institution_id, {
            reason,
            severity,
            studentName: (req.user as any).fullName,
          });

          return res.status(403).json({ error: 'Biometric verification failed', reason });
        }
        faceVerified = true;
        livenessScore = livenessScore || aiResult.spoof_score || 1.0;
      } else {
        const aiResponse = await fetch(`${config.ai.serviceUrl}/api/v1/face/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': config.ai.apiKey },
          body: JSON.stringify({
            userId: req.user!.id,
            institutionId: s.institution_id,
            faceImage: framesToVerify[0],
            sessionId,
          }),
        });
        const aiResult: any = await aiResponse.json();
        confidenceScore = aiResult.confidence || 0;
        verificationMetadata = aiResult;

        if (!aiResult.verified) {
          const reason = aiResult.reason || 'Face verification failed';
          let severity: string = 'medium';
          const spoofCheck = aiResult.spoof_check;
          if (spoofCheck && !spoofCheck.is_real) severity = 'high';

          await query(
            `INSERT INTO fraud_alerts (institution_id, student_id, session_id, reason, severity, evidence, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
            [s.institution_id, req.user!.id, sessionId, reason, severity, JSON.stringify(aiResult)],
          );

          notifyOrgAdminOfFraud(s.institution_id, {
            reason,
            severity,
            studentName: (req.user as any).fullName,
          });

          return res.status(403).json({ error: 'Biometric verification failed', reason });
        }
        faceVerified = true;

        if (qrSecret) verificationMethod = 'qr_face';
      }
    } catch (error) {
      if (!qrSecret) {
        return res.status(500).json({ error: 'Face verification service unavailable. Please use QR code.' });
      }
      verificationMethod = 'qr_fallback';
    }
  }

  // Contactless fingerprint verification: a close-range fingertip photo is
  // quality-gated, enhanced into a ridge map, and 1:1-matched by the AI service
  // against the student's enrolled templates.
  if (usingFingerprint) {
    // New: { fingers: [{ position, image }] } (4-finger capture). Legacy: { image } or a raw string.
    const fpFingers = Array.isArray(fingerprintData?.fingers) ? fingerprintData.fingers : null;
    const fpImage = typeof fingerprintData === 'string' ? fingerprintData : fingerprintData?.image;
    if (!fpFingers && !fpImage) {
      return res.status(400).json({ error: 'Fingerprint image required' });
    }
    try {
      const { config } = await import('../../config/index.js');
      const aiResponse = await fetch(`${config.ai.serviceUrl}/api/v1/fingerprint/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': config.ai.apiKey },
        body: JSON.stringify({
          userId: req.user!.id,
          institutionId: s.institution_id,
          ...(fpFingers ? { fingers: fpFingers } : { fingerImage: fpImage }),
          sessionId,
        }),
      });
      const aiResult: any = await aiResponse.json();

      if (!aiResponse.ok) {
        const detail = aiResult?.detail;
        if (detail?.error === 'quality_failed') {
          return res.status(400).json({
            error: detail.hints?.[0]?.message || 'Fingerprint photo quality is too low',
            reason: 'quality_failed',
            hints: detail.hints,
          });
        }
        return res.status(502).json({ error: 'Fingerprint verification service error' });
      }

      if (!aiResult.verified) {
        if (aiResult.reason === 'not_enrolled') {
          return res.status(403).json({
            error: 'No fingerprint enrolled. Register your fingerprint from the Biometrics page first.',
            reason: 'not_enrolled',
          });
        }
        const matchedCount = aiResult.matched_count ?? 0;
        const required = aiResult.required ?? 2;
        await query(
          `INSERT INTO fraud_alerts (institution_id, student_id, session_id, reason, severity, evidence, status)
           VALUES ($1, $2, $3, $4, 'medium', $5, 'pending')`,
          [s.institution_id, req.user!.id, sessionId, 'Fingerprint did not match enrolled templates',
           JSON.stringify({ matchedCount, required, fingers: aiResult.fingers, reason: aiResult.reason })],
        );
        return res.status(403).json({
          error: `Fingerprints didn't match (${matchedCount}/${required} needed). Try again with the flash on.`,
          reason: aiResult.reason || 'no_match',
        });
      }

      fingerprintVerified = true;
      // Confidence from the strongest matching finger.
      const bestInliers = Math.max(0, ...((aiResult.fingers || []).map((f: any) => f.inliers || 0)));
      confidenceScore = Math.min(1, bestInliers / 100);
      if (!framesToVerify) verificationMethod = qrSecret ? 'qr_fingerprint' : 'fingerprint';
      verificationMetadata = {
        ...((verificationMetadata as Record<string, unknown>) || {}),
        fingerprint: {
          matchedCount: aiResult.matched_count,
          matchedPositions: aiResult.matched_positions,
          required: aiResult.required,
          templates: aiResult.templates_count,
        },
      };
    } catch (error) {
      return res.status(502).json({ error: 'Fingerprint verification service unavailable. Please use another method.' });
    }
  }

  if (faceData && !framesToVerify) {
    res.setHeader('X-Deprecation-Warning', 'Single image faceData field is deprecated. Use frames array for multi-frame verification.');
  }

  const result = await query(
    `INSERT INTO attendance (institution_id, session_id, student_id, status, face_data, fingerprint_data, liveness_score, confidence_score, verification_method, device_info, ip_address, location_lat, location_lng, device_fingerprint, device_metadata, verification_metadata)
     VALUES ($1, $2, $3, 'verified', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (session_id, student_id) DO NOTHING
     RETURNING id, status, marked_at`,
    [
      s.institution_id, sessionId, req.user!.id,
      faceVerified, fingerprintVerified,
      livenessScore, confidenceScore, verificationMethod,
      deviceInfo || null, clientIp,
      lat ? parseFloat(String(lat)) : null, lng ? parseFloat(String(lng)) : null,
      deviceFingerprint || null,
      deviceFingerprint ? JSON.stringify({ ua: req.headers['user-agent'] }) : null,
      verificationMetadata ? JSON.stringify(verificationMetadata) : null,
    ],
  );

  if (result.rows.length === 0) {
    return res.status(409).json({ error: 'Attendance already marked' });
  }

  await query(
    'UPDATE attendance_sessions SET total_present = total_present + 1 WHERE id = $1',
    [sessionId],
  );

  // Real-time + notification
  try {
    const { emitToTeachers } = await import('../../realtime/index.js');
    emitToTeachers(sessionId, 'attendance:marked', {
      studentId: req.user!.id,
      studentName: (req.user as any).fullName,
      sessionId,
      method: verificationMethod,
      markedAt: result.rows[0].marked_at,
    });
  } catch {}

  // Outbound webhook for ERP integrations (best-effort, fire-and-forget).
  import('../../services/webhooks.js').then(({ dispatchWebhook }) => {
    dispatchWebhook(s.institution_id, 'attendance.marked', {
      attendanceId: result.rows[0].id,
      studentId: req.user!.id,
      sessionId,
      status: 'verified',
      method: verificationMethod,
      markedAt: result.rows[0].marked_at,
    });
  }).catch(() => {});

  try {
    const { createNotification } = await import('../notifications/routes.js');
    await createNotification({
      institutionId: s.institution_id,
      userId: req.user!.id,
      title: 'Attendance Confirmed',
      message: `Your attendance has been confirmed for this session via ${verificationMethod}.`,
      type: 'attendance',
    });
  } catch {}

  await query(
    `INSERT INTO audit_logs (institution_id, user_id, action, entity_type, entity_id, ip_address)
     VALUES ($1, $2, 'mark_attendance', 'attendance', $3, $4)`,
    [s.institution_id, req.user!.id, result.rows[0].id, clientIp],
  );

  res.status(201).json({ ...result.rows[0], message: 'Attendance marked successfully' });
});

/**
 * @openapi
 * /attendance/{id}:
 *   patch:
 *     summary: Correct an attendance record
 *     description: Manually override a student's attendance status. A teacher may correct only records from their own sessions; org_admin only within their institution; system_admin any. The correction is stamped into verification_metadata and written to the audit log.
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Attendance record ID
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
 *                 enum: [verified, absent, late, excused, rejected]
 *               notes:
 *                 type: string
 *                 description: Optional note stored with the correction
 *     responses:
 *       200:
 *         description: Updated attendance record
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 status: { type: string }
 *                 marked_at: { type: string, format: date-time }
 *                 verification_method: { type: string }
 *       400:
 *         description: Invalid or missing status
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       403:
 *         description: Not your session / wrong institution
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       404:
 *         description: Attendance record not found
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.patch('/:id', authenticate, requireRoles('teacher', 'org_admin', 'system_admin'), async (req: AuthRequest, res) => {
  const { status, notes } = req.body;
  const allowed = ['verified', 'absent', 'late', 'excused', 'rejected'];
  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }

  const existing = await query(
    `SELECT a.id, a.institution_id, s.teacher_id FROM attendance a
     JOIN attendance_sessions s ON a.session_id = s.id
     WHERE a.id = $1`,
    [req.params.id],
  );
  if (existing.rows.length === 0) return res.status(404).json({ error: 'Attendance record not found' });

  const record = existing.rows[0];
  if (req.user!.role === 'teacher' && record.teacher_id !== req.user!.id) {
    return res.status(403).json({ error: 'You can only correct attendance for your own sessions' });
  }
  if (req.user!.role === 'org_admin' && record.institution_id !== req.user!.institutionId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const result = await query(
    `UPDATE attendance SET status = $1, verification_metadata = jsonb_set(
       COALESCE(verification_metadata, '{}'),
       '{manual_correction}',
       $2
     ) WHERE id = $3 RETURNING id, status, marked_at, verification_method`,
    [status, JSON.stringify({ by: req.user!.id, at: new Date().toISOString(), notes: notes || null }), req.params.id],
  );

  await query(
    `INSERT INTO audit_logs (institution_id, user_id, action, entity_type, entity_id)
     VALUES ($1, $2, 'correct_attendance', 'attendance', $3)`,
    [record.institution_id, req.user!.id, req.params.id],
  );

  res.json(result.rows[0]);
});

export const attendanceRouter = router;
