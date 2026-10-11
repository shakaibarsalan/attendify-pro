import { Router, Response, NextFunction } from 'express';
import { apiKeyAuth, AuthRequest } from '../../middleware/auth.js';
import { apiKeyRateLimit } from '../../middleware/apiRateLimit.js';
import { query, biometricPool } from '../../config/database.js';
import { config } from '../../config/index.js';

const router = Router();

// Clamp pagination params for the public API (default 50, max 200 rows/page).
function paginate(req: AuthRequest) {
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || '50', 10) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * @openapi
 * /public/attendance/session/{sessionId}:
 *   get:
 *     summary: Get attendance for a session
 *     description: Public API endpoint to retrieve attendance records for a specific session. Requires API key authentication.
 *     tags: [Public API]
 *     security:
 *       - apiKeyAuth: []
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
 *         description: Attendance records for the session
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
 *                     example: "att-001-uuid"
 *                   student_id:
 *                     type: string
 *                     format: uuid
 *                     example: "student-001-uuid"
 *                   full_name:
 *                     type: string
 *                     example: "Ahmed Khan"
 *                   roll_number:
 *                     type: string
 *                     example: "2021-CS-001"
 *                   status:
 *                     type: string
 *                     example: "present"
 *                   marked_at:
 *                     type: string
 *                     format: date-time
 *                     example: "2026-05-22T09:05:00Z"
 *                   verification_method:
 *                     type: string
 *                     example: "qr"
 *                   confidence_score:
 *                     type: number
 *                     example: 0.95
 *       401:
 *         description: Unauthorized — missing or invalid API key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Unauthorized"
 *       429:
 *         description: Rate limit exceeded for this API key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Rate limit exceeded for this API key"
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
router.get('/attendance/session/:sessionId', apiKeyAuth, apiKeyRateLimit, async (req: AuthRequest, res) => {
  const result = await query(
    `SELECT a.id, a.student_id, u.full_name, u.roll_number, a.status, a.marked_at, a.verification_method, a.confidence_score
       FROM attendance a JOIN users u ON a.student_id = u.id
      WHERE a.session_id = $1 AND a.institution_id = $2`,
    [req.params.sessionId, req.user!.institutionId]
  );
  res.json(result.rows);
});

/**
 * @openapi
 * /public/students/course/{courseId}:
 *   get:
 *     summary: Get students enrolled in a course
 *     description: Public API endpoint to retrieve active students enrolled in a specific course. Requires API key authentication.
 *     tags: [Public API]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Course ID
 *         example: "course-001-uuid"
 *     responses:
 *       200:
 *         description: List of enrolled students
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
 *                     example: "student-001-uuid"
 *                   full_name:
 *                     type: string
 *                     example: "Ahmed Khan"
 *                   roll_number:
 *                     type: string
 *                     example: "2021-CS-001"
 *                   email:
 *                     type: string
 *                     example: "ahmed@nuc.edu.pk"
 *       401:
 *         description: Unauthorized — missing or invalid API key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Unauthorized"
 *       429:
 *         description: Rate limit exceeded for this API key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Rate limit exceeded for this API key"
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
router.get('/students/course/:courseId', apiKeyAuth, apiKeyRateLimit, async (req: AuthRequest, res) => {
  const result = await query(
    `SELECT u.id, u.full_name, u.roll_number, u.email
       FROM users u JOIN enrollments e ON u.id = e.student_id
      WHERE e.course_id = $1 AND e.status = 'active' AND e.institution_id = $2`,
    [req.params.courseId, req.user!.institutionId]
  );
  res.json(result.rows);
});

/**
 * @openapi
 * /public/sessions/course/{courseId}:
 *   get:
 *     summary: Get sessions for a course
 *     description: Public API endpoint to retrieve the 50 most recent attendance sessions for a specific course. Requires API key authentication.
 *     tags: [Public API]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Course ID
 *         example: "course-001-uuid"
 *     responses:
 *       200:
 *         description: List of sessions for the course
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
 *                     example: "session-001-uuid"
 *                   lecture_number:
 *                     type: integer
 *                     example: 12
 *                   lecture_date:
 *                     type: string
 *                     format: date
 *                     example: "2026-05-22"
 *                   start_time:
 *                     type: string
 *                     format: date-time
 *                     example: "2026-05-22T09:00:00Z"
 *                   end_time:
 *                     type: string
 *                     format: date-time
 *                     example: "2026-05-22T10:30:00Z"
 *                   status:
 *                     type: string
 *                     example: "completed"
 *                   total_enrolled:
 *                     type: integer
 *                     example: 45
 *                   total_present:
 *                     type: integer
 *                     example: 38
 *       401:
 *         description: Unauthorized — missing or invalid API key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Unauthorized"
 *       429:
 *         description: Rate limit exceeded for this API key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Rate limit exceeded for this API key"
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
router.get('/sessions/course/:courseId', apiKeyAuth, apiKeyRateLimit, async (req: AuthRequest, res) => {
  const { limit, offset } = paginate(req);
  const params: any[] = [req.params.courseId, req.user!.institutionId];
  let where = 'WHERE course_id = $1 AND institution_id = $2';
  if (req.query.updatedSince) { params.push(req.query.updatedSince); where += ` AND updated_at >= $${params.length}`; }
  params.push(limit, offset);
  const result = await query(
    `SELECT id, lecture_number, lecture_date, start_time, end_time, status, total_enrolled, total_present
       FROM attendance_sessions ${where}
      ORDER BY lecture_date DESC, start_time DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json(result.rows);
});

/**
 * @openapi
 * /public/courses:
 *   get:
 *     summary: List the institution's courses (integration discovery)
 *     description: >
 *       Returns the courses for the API key's institution so an external ERP can map
 *       its own course codes to Attendify course IDs. This is the bootstrap endpoint:
 *       use the returned `id` with the students/sessions endpoints. Filter by `code`.
 *     tags: [Public API]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: code
 *         schema: { type: string }
 *         description: Filter by course code (partial, case-insensitive)
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200:
 *         description: List of courses
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string, format: uuid }
 *                   code: { type: string, example: "CS-101" }
 *                   name: { type: string }
 *                   section: { type: string, nullable: true }
 *                   semester: { type: string, nullable: true }
 *                   academic_year: { type: string, nullable: true }
 *                   department: { type: string, nullable: true }
 *                   teacher_name: { type: string, nullable: true }
 *       401: { description: Unauthorized — missing or invalid API key }
 */
router.get('/courses', apiKeyAuth, apiKeyRateLimit, async (req: AuthRequest, res) => {
  const { limit, offset } = paginate(req);
  const params: any[] = [req.user!.institutionId];
  let where = 'WHERE c.institution_id = $1 AND c.is_active = true';
  if (req.query.code) { params.push(`%${req.query.code}%`); where += ` AND c.code ILIKE $${params.length}`; }
  params.push(limit, offset);
  const result = await query(
    `SELECT c.id, c.code, c.name, c.section, c.semester, c.academic_year,
            d.name AS department, u.full_name AS teacher_name
       FROM courses c
       LEFT JOIN departments d ON d.id = c.department_id
       LEFT JOIN users u ON u.id = c.teacher_id
       ${where}
      ORDER BY c.code
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json(result.rows);
});

/**
 * @openapi
 * /public/students/by-roll/{rollNumber}:
 *   get:
 *     summary: Look up a student by roll/registration number
 *     description: Resolves one of the institution's students by the ERP's own roll number, returning the Attendify student id for subsequent calls.
 *     tags: [Public API]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: rollNumber
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Student
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 full_name: { type: string }
 *                 roll_number: { type: string }
 *                 email: { type: string }
 *                 department: { type: string, nullable: true }
 *       404: { description: Student not found in this institution }
 */
router.get('/students/by-roll/:rollNumber', apiKeyAuth, apiKeyRateLimit, async (req: AuthRequest, res) => {
  const result = await query(
    `SELECT id, full_name, roll_number, email, department
       FROM users
      WHERE institution_id = $1 AND role = 'student' AND roll_number = $2
      LIMIT 1`,
    [req.user!.institutionId, req.params.rollNumber]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Student not found' });
  res.json(result.rows[0]);
});

/**
 * @openapi
 * /public/students/by-roll/{rollNumber}/attendance:
 *   get:
 *     summary: A student's attendance across sessions (for ERP sync)
 *     description: Returns the student's attendance records (newest first), optionally filtered by date range, with pagination.
 *     tags: [Public API]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: rollNumber
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *         description: Inclusive lower bound on lecture_date (YYYY-MM-DD)
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *         description: Inclusive upper bound on lecture_date (YYYY-MM-DD)
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200:
 *         description: Attendance records
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string, format: uuid }
 *                   course_code: { type: string }
 *                   course_name: { type: string }
 *                   lecture_number: { type: integer, nullable: true }
 *                   lecture_date: { type: string, format: date }
 *                   status: { type: string }
 *                   verification_method: { type: string }
 *                   marked_at: { type: string, format: date-time }
 *       401: { description: Unauthorized — missing or invalid API key }
 */
router.get('/students/by-roll/:rollNumber/attendance', apiKeyAuth, apiKeyRateLimit, async (req: AuthRequest, res) => {
  const { limit, offset } = paginate(req);
  const params: any[] = [req.user!.institutionId, req.params.rollNumber];
  let where = 'WHERE a.institution_id = $1 AND u.roll_number = $2';
  if (req.query.from) { params.push(req.query.from); where += ` AND s.lecture_date >= $${params.length}`; }
  if (req.query.to)   { params.push(req.query.to);   where += ` AND s.lecture_date <= $${params.length}`; }
  params.push(limit, offset);
  const result = await query(
    `SELECT a.id, c.code AS course_code, c.name AS course_name, s.lecture_number, s.lecture_date,
            a.status, a.verification_method, a.marked_at
       FROM attendance a
       JOIN attendance_sessions s ON a.session_id = s.id
       JOIN courses c ON s.course_id = c.id
       JOIN users u ON a.student_id = u.id
       ${where}
      ORDER BY s.lecture_date DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json(result.rows);
});

// ─── Public Biometric API — face recognition as a service ───
// Requires the key to carry the "biometric" scope (api-key institution-level API
// access is already enforced by apiKeyAuth). Proxies to the AI microservice.

function requireBiometricScope(req: AuthRequest, res: Response, next: NextFunction) {
  const perms = (req as any).apiKey?.permissions;
  const scopes = Array.isArray(perms) ? perms : [];
  if (!scopes.includes('biometric')) {
    return res.status(403).json({ error: 'This API key does not have the "biometric" scope. Create a key with biometric verification enabled.' });
  }
  next();
}

// Monthly billable-verification usage for an institution: quota from its current
// plan (main DB), used = this month's face/fingerprint verify+identify calls
// (verification_logs, biometric DB). Enroll/status/delete are not counted.
export async function verificationUsage(institutionId: string): Promise<{ used: number; quota: number }> {
  const q = await query(
    `SELECT COALESCE(i.max_verifications, sp.max_verifications, 0) AS quota
       FROM institutions i LEFT JOIN subscription_plans sp ON sp.id = i.plan_id
      WHERE i.id = $1`,
    [institutionId],
  );
  const quota = Number(q.rows[0]?.quota ?? 0);
  const u = await biometricPool.query(
    `SELECT COUNT(*)::int AS used FROM verification_logs
      WHERE institution_id = $1 AND verification_type IN ('face','fingerprint')
        AND created_at >= date_trunc('month', NOW())`,
    [institutionId],
  );
  const used = Number(u.rows[0]?.used ?? 0);
  return { used, quota };
}

// Enforce the monthly quota on billable verifications. Fails OPEN on a metering
// error so a transient DB hiccup never blocks a paying customer's verification.
async function enforceVerificationQuota(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { used, quota } = await verificationUsage(req.user!.institutionId!);
    if (used >= quota) {
      return res.status(429).json({
        error: `Monthly verification quota reached (${used}/${quota}). Upgrade your plan for more verifications.`,
        used, quota,
      });
    }
  } catch { /* fail open */ }
  next();
}

async function aiFace(method: string, suffix: string, body?: any) {
  return fetch(`${config.ai.serviceUrl}/api/v1/biometric/face${suffix}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': config.ai.apiKey },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * @openapi
 * /public/biometric/face/enroll:
 *   post:
 *     summary: Enroll a face for an external subject (Biometric API)
 *     description: Stores a face embedding for one of YOUR users, referenced by your own `subjectRef`. Runs quality + anti-spoof checks. Requires a key with the "biometric" scope.
 *     tags: [Public API]
 *     security: [{ apiKeyAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subjectRef, image]
 *             properties:
 *               subjectRef: { type: string, description: Your own identifier for this person }
 *               image: { type: string, description: Base64-encoded face image }
 *     responses:
 *       200: { description: Enrolled }
 *       400: { description: No face / poor quality / spoof detected }
 *       403: { description: Key lacks the biometric scope }
 */
router.post('/biometric/face/enroll', apiKeyAuth, apiKeyRateLimit, requireBiometricScope, async (req: AuthRequest, res) => {
  const { subjectRef, image } = req.body;
  if (!subjectRef || !image) return res.status(400).json({ error: 'subjectRef and image are required' });
  try {
    const r = await aiFace('POST', '/enroll', { institutionId: req.user!.institutionId, subjectRef, image, antiSpoof: req.body.antiSpoof });
    return res.status(r.status).json(await r.json());
  } catch (e: any) { return res.status(502).json({ error: 'AI service unavailable', detail: e.message }); }
});

/**
 * @openapi
 * /public/biometric/face/verify:
 *   post:
 *     summary: Verify a face against a known subject — 1:1 (Biometric API)
 *     description: 1:1 match — is this image the enrolled subjectRef? Returns match plus cosine confidence vs the match threshold. Anti-spoof enforced.
 *     tags: [Public API]
 *     security: [{ apiKeyAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subjectRef, image]
 *             properties:
 *               subjectRef: { type: string }
 *               image: { type: string }
 *     responses:
 *       200:
 *         description: Verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 match: { type: boolean }
 *                 confidence: { type: number }
 *                 threshold: { type: number }
 *       404: { description: Subject not enrolled }
 */
router.post('/biometric/face/verify', apiKeyAuth, apiKeyRateLimit, requireBiometricScope, enforceVerificationQuota, async (req: AuthRequest, res) => {
  const { subjectRef, image } = req.body;
  if (!subjectRef || !image) return res.status(400).json({ error: 'subjectRef and image are required' });
  try {
    const r = await aiFace('POST', '/verify', { institutionId: req.user!.institutionId, subjectRef, image, antiSpoof: req.body.antiSpoof });
    return res.status(r.status).json(await r.json());
  } catch (e: any) { return res.status(502).json({ error: 'AI service unavailable', detail: e.message }); }
});

/**
 * @openapi
 * /public/biometric/face/identify:
 *   post:
 *     summary: Identify a face among your subjects — 1:N (Biometric API)
 *     description: 1:N search — who is this? Searches all of your enrolled subjects (HNSW cosine) and returns the best matching subjectRef plus ranked candidates. Anti-spoof enforced.
 *     tags: [Public API]
 *     security: [{ apiKeyAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image: { type: string }
 *     responses:
 *       200:
 *         description: Identification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 match: { type: boolean }
 *                 subjectRef: { type: string, nullable: true }
 *                 confidence: { type: number }
 *                 candidates: { type: array, items: { type: object } }
 */
router.post('/biometric/face/identify', apiKeyAuth, apiKeyRateLimit, requireBiometricScope, enforceVerificationQuota, async (req: AuthRequest, res) => {
  const { image } = req.body;
  if (!image) return res.status(400).json({ error: 'image is required' });
  try {
    const r = await aiFace('POST', '/identify', { institutionId: req.user!.institutionId, image, antiSpoof: req.body.antiSpoof });
    return res.status(r.status).json(await r.json());
  } catch (e: any) { return res.status(502).json({ error: 'AI service unavailable', detail: e.message }); }
});

/**
 * @openapi
 * /public/biometric/face/{subjectRef}/status:
 *   get:
 *     summary: Check whether a subject is enrolled (Biometric API)
 *     tags: [Public API]
 *     security: [{ apiKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: subjectRef
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "Enrollment status { enrolled, samples }" }
 */
router.get('/biometric/face/:subjectRef/status', apiKeyAuth, apiKeyRateLimit, requireBiometricScope, async (req: AuthRequest, res) => {
  const qs = `?institutionId=${encodeURIComponent(req.user!.institutionId || '')}&subjectRef=${encodeURIComponent(req.params.subjectRef)}`;
  try {
    const r = await aiFace('GET', `/status${qs}`);
    return res.status(r.status).json(await r.json());
  } catch (e: any) { return res.status(502).json({ error: 'AI service unavailable', detail: e.message }); }
});

/**
 * @openapi
 * /public/biometric/face/{subjectRef}:
 *   delete:
 *     summary: Delete a subject's enrolled face data (Biometric API)
 *     tags: [Public API]
 *     security: [{ apiKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: subjectRef
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "Deleted { removed }" }
 */
router.delete('/biometric/face/:subjectRef', apiKeyAuth, apiKeyRateLimit, requireBiometricScope, async (req: AuthRequest, res) => {
  const qs = `?institutionId=${encodeURIComponent(req.user!.institutionId || '')}&subjectRef=${encodeURIComponent(req.params.subjectRef)}`;
  try {
    const r = await aiFace('DELETE', qs);
    return res.status(r.status).json(await r.json());
  } catch (e: any) { return res.status(502).json({ error: 'AI service unavailable', detail: e.message }); }
});

// ─── Public Biometric API — contactless fingerprint (1:1 only) ───
async function aiFinger(method: string, suffix: string, body?: any) {
  return fetch(`${config.ai.serviceUrl}/api/v1/biometric/fingerprint${suffix}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': config.ai.apiKey },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * @openapi
 * /public/biometric/fingerprint/enroll:
 *   post:
 *     summary: Enroll a contactless fingerprint for an external subject (Biometric API)
 *     description: Stores an enhanced ridge-map template for your `subjectRef` from a fingertip photo. Requires a key with the "biometric" scope.
 *     tags: [Public API]
 *     security: [{ apiKeyAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subjectRef, image]
 *             properties:
 *               subjectRef: { type: string }
 *               image: { type: string, description: Base64 fingertip photo }
 *     responses:
 *       200: { description: Enrolled }
 *       400: { description: Quality too low / invalid image }
 *       403: { description: Key lacks the biometric scope }
 */
router.post('/biometric/fingerprint/enroll', apiKeyAuth, apiKeyRateLimit, requireBiometricScope, async (req: AuthRequest, res) => {
  const { subjectRef, image } = req.body;
  if (!subjectRef || !image) return res.status(400).json({ error: 'subjectRef and image are required' });
  try { const r = await aiFinger('POST', '/enroll', { institutionId: req.user!.institutionId, subjectRef, image }); return res.status(r.status).json(await r.json()); }
  catch (e: any) { return res.status(502).json({ error: 'AI service unavailable', detail: e.message }); }
});

/**
 * @openapi
 * /public/biometric/fingerprint/verify:
 *   post:
 *     summary: Verify a contactless fingerprint against a subject — 1:1 (Biometric API)
 *     description: 1:1 match — does this fingertip photo match the subject's enrolled finger? Returns match plus RANSAC inlier count.
 *     tags: [Public API]
 *     security: [{ apiKeyAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subjectRef, image]
 *             properties:
 *               subjectRef: { type: string }
 *               image: { type: string }
 *     responses:
 *       200:
 *         description: Verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 match: { type: boolean }
 *                 inliers: { type: integer }
 *                 inlierRatio: { type: number }
 *       404: { description: Subject not enrolled }
 */
router.post('/biometric/fingerprint/verify', apiKeyAuth, apiKeyRateLimit, requireBiometricScope, enforceVerificationQuota, async (req: AuthRequest, res) => {
  const { subjectRef, image } = req.body;
  if (!subjectRef || !image) return res.status(400).json({ error: 'subjectRef and image are required' });
  try { const r = await aiFinger('POST', '/verify', { institutionId: req.user!.institutionId, subjectRef, image }); return res.status(r.status).json(await r.json()); }
  catch (e: any) { return res.status(502).json({ error: 'AI service unavailable', detail: e.message }); }
});

/**
 * @openapi
 * /public/biometric/fingerprint/{subjectRef}/status:
 *   get:
 *     summary: Check whether a subject has an enrolled fingerprint (Biometric API)
 *     tags: [Public API]
 *     security: [{ apiKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: subjectRef
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ enrolled, samples }" }
 */
router.get('/biometric/fingerprint/:subjectRef/status', apiKeyAuth, apiKeyRateLimit, requireBiometricScope, async (req: AuthRequest, res) => {
  const qs = `?institutionId=${encodeURIComponent(req.user!.institutionId || '')}&subjectRef=${encodeURIComponent(req.params.subjectRef)}`;
  try { const r = await aiFinger('GET', `/status${qs}`); return res.status(r.status).json(await r.json()); }
  catch (e: any) { return res.status(502).json({ error: 'AI service unavailable', detail: e.message }); }
});

/**
 * @openapi
 * /public/biometric/fingerprint/{subjectRef}:
 *   delete:
 *     summary: Delete a subject's enrolled fingerprint (Biometric API)
 *     tags: [Public API]
 *     security: [{ apiKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: subjectRef
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ removed }" }
 */
router.delete('/biometric/fingerprint/:subjectRef', apiKeyAuth, apiKeyRateLimit, requireBiometricScope, async (req: AuthRequest, res) => {
  const qs = `?institutionId=${encodeURIComponent(req.user!.institutionId || '')}&subjectRef=${encodeURIComponent(req.params.subjectRef)}`;
  try { const r = await aiFinger('DELETE', qs); return res.status(r.status).json(await r.json()); }
  catch (e: any) { return res.status(502).json({ error: 'AI service unavailable', detail: e.message }); }
});

// ─── Public Biometric API — liveness (challenge / response) ───
async function aiLiveness(suffix: string, body: any) {
  return fetch(`${config.ai.serviceUrl}/api/v1/face/liveness${suffix}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': config.ai.apiKey },
    body: JSON.stringify(body),
  });
}

/**
 * @openapi
 * /public/biometric/face/liveness/challenge:
 *   post:
 *     summary: Start a liveness challenge (Biometric API)
 *     description: Returns a set of gestures the user must perform, plus a signed token and session id. No request body required.
 *     tags: [Public API]
 *     security: [{ apiKeyAuth: [] }]
 *     responses:
 *       200: { description: "Challenge { sessionId, challenges, token, timeoutSeconds }" }
 *       403: { description: Key lacks the biometric scope }
 */
router.post('/biometric/face/liveness/challenge', apiKeyAuth, apiKeyRateLimit, requireBiometricScope, async (_req: AuthRequest, res) => {
  try {
    const r = await aiLiveness('/challenge', {});
    return res.status(r.status).json(await r.json());
  } catch (e: any) { return res.status(502).json({ error: 'AI service unavailable', detail: e.message }); }
});

/**
 * @openapi
 * /public/biometric/face/liveness/verify:
 *   post:
 *     summary: Verify a liveness challenge (Biometric API)
 *     description: Submit the captured frames for an active challenge. Returns whether the subject is a live human performing the requested gestures. Counts toward the monthly quota.
 *     tags: [Public API]
 *     security: [{ apiKeyAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId, token, expectedChallenges, frames]
 *             properties:
 *               sessionId: { type: string }
 *               token: { type: string }
 *               expectedChallenges: { type: array, items: { type: string } }
 *               frames: { type: array, minItems: 3, items: { type: string, description: Base64 JPEG frame } }
 *     responses:
 *       200: { description: "{ passed, score }" }
 *       400: { description: Missing required fields }
 */
router.post('/biometric/face/liveness/verify', apiKeyAuth, apiKeyRateLimit, requireBiometricScope, enforceVerificationQuota, async (req: AuthRequest, res) => {
  const { sessionId, token, expectedChallenges, frames } = req.body;
  if (!sessionId || !token || !expectedChallenges || !Array.isArray(frames) || frames.length < 3) {
    return res.status(400).json({ error: 'sessionId, token, expectedChallenges and frames (3+) are required' });
  }
  try {
    const r = await aiLiveness('/verify', { sessionId, token, expectedChallenges, frames });
    return res.status(r.status).json(await r.json());
  } catch (e: any) { return res.status(502).json({ error: 'AI service unavailable', detail: e.message }); }
});

export const publicApiRouter = router;
