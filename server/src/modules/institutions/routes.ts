import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticate, requireRoles, AuthRequest } from '../../middleware/auth.js';
import { query, withTransaction, biometricPool } from '../../config/database.js';
import { generateStrongPassword } from '../../utils/password.js';

const router = Router();

// Strip protocol / leading @ / trailing slash and lowercase, so "HTTPS://UMT.edu.pk/"
// and "@umt.edu.pk" both normalize to "umt.edu.pk".
function normalizeDomain(d?: string | null): string | null {
  if (!d) return null;
  const s = String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^@/, '').replace(/\/+$/, '');
  return s || null;
}

// Integration endpoints shared with an organization once API access is enabled.
// These are the read-only public endpoints used to link Attendify to an existing
// ERP / student portal; returned to the org dashboard so it can show the contract.
const INTEGRATION_ENDPOINTS = [
  { method: 'GET', path: '/api/public/courses', description: 'List your courses (with codes) — map your ERP course codes to Attendify IDs.' },
  { method: 'GET', path: '/api/public/students/by-roll/{rollNumber}', description: 'Look up a student by roll/registration number.' },
  { method: 'GET', path: '/api/public/students/course/{courseId}', description: 'List active students enrolled in a course.' },
  { method: 'GET', path: '/api/public/sessions/course/{courseId}', description: 'List attendance sessions for a course (paginated, ?updatedSince).' },
  { method: 'GET', path: '/api/public/attendance/session/{sessionId}', description: 'List attendance records for a session.' },
  { method: 'GET', path: '/api/public/students/by-roll/{rollNumber}/attendance', description: 'A student\'s attendance across sessions (?from, ?to, paginated).' },
];

// API access is a paid-plan feature — the Free plan (and "no plan") cannot use it.
function planAllowsApi(planId: string | null | undefined): boolean {
  return !!planId && planId !== 'free';
}

const createInstitutionSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(20),
  domain: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  maxStudents: z.number().optional(),
  maxTeachers: z.number().optional(),
  adminEmail: z.string().email(),
  adminName: z.string().min(2),
});

/**
 * @openapi
 * /institutions:
 *   get:
 *     summary: List institutions
 *     description: Retrieve all institutions ordered by creation date. Available to system_admin and org_admin.
 *     tags: [Institutions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of institutions
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
 *                         example: "inst-001-uuid"
 *                       name:
 *                         type: string
 *                         example: "National University of Computing"
 *                       code:
 *                         type: string
 *                         example: "NUC-2025"
 *                       domain:
 *                         type: string
 *                         example: "nuc.edu.pk"
 *                       city:
 *                         type: string
 *                         example: "Islamabad"
 *                       status:
 *                         type: string
 *                         example: "active"
 *                       max_students:
 *                         type: integer
 *                         example: 5000
 *                       max_teachers:
 *                         type: integer
 *                         example: 200
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-08-15T09:00:00Z"
 *                 total:
 *                   type: integer
 *                   example: 3
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
router.get('/', authenticate, requireRoles('system_admin', 'org_admin'), async (_req: AuthRequest, res) => {
  const result = await query(
    `SELECT i.id, i.name, i.code, i.domain, i.city, i.status, i.max_students, i.max_teachers, i.max_departments, i.created_at,
     i.plan_id, i.plan_status, i.plan_selected_at, i.trial_ends_at, sp.name as plan_name,
     i.api_access_enabled, i.api_access_status, i.api_access_requested_at
     FROM institutions i LEFT JOIN subscription_plans sp ON sp.id = i.plan_id
     ORDER BY i.created_at DESC`
  );
  res.json({ data: result.rows, total: result.rows.length, page: 1, limit: 100 });
});

/**
 * @openapi
 * /institutions:
 *   post:
 *     summary: Create institution
 *     description: Create a new institution along with an org_admin account. Only system admins may create institutions. The admin receives a generated temporary password and must change it on first login.
 *     tags: [Institutions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code, adminEmail, adminName]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 example: "National University of Computing"
 *               code:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 20
 *                 example: "NUC-2025"
 *               domain:
 *                 type: string
 *                 example: "nuc.edu.pk"
 *               address:
 *                 type: string
 *                 example: "H-11/4, Islamabad"
 *               city:
 *                 type: string
 *                 example: "Islamabad"
 *               contactEmail:
 *                 type: string
 *                 format: email
 *                 example: "admin@nuc.edu.pk"
 *               contactPhone:
 *                 type: string
 *                 example: "+92-51-1234567"
 *               maxStudents:
 *                 type: integer
 *                 example: 5000
 *               maxTeachers:
 *                 type: integer
 *                 example: 200
 *               adminEmail:
 *                 type: string
 *                 format: email
 *                 example: "admin@nuc.edu.pk"
 *               adminName:
 *                 type: string
 *                 minLength: 2
 *                 example: "Dr. Sarah Ali"
 *     responses:
 *       201:
 *         description: Institution created with admin account
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 institution:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "inst-001-uuid"
 *                     name:
 *                       type: string
 *                       example: "National University of Computing"
 *                     code:
 *                       type: string
 *                       example: "NUC-2025"
 *                     status:
 *                       type: string
 *                       example: "active"
 *                 message:
 *                   type: string
 *                   example: "Institution created with admin account"
 *       400:
 *         description: Validation error in request body
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Validation error"
 *                 details:
 *                   type: array
 *                   items:
 *                     type: object
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
 *         description: Forbidden — only system_admin
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Forbidden"
 *       409:
 *         description: Institution code already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Institution code already exists"
 *       500:
 *         description: Failed to create institution
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to create institution"
 */
router.post('/', authenticate, requireRoles('system_admin'), async (req: AuthRequest, res) => {
  try {
    const body = createInstitutionSchema.parse(req.body);

    const domain = normalizeDomain(body.domain);
    const adminEmail = body.adminEmail.trim().toLowerCase();

    // Pre-flight uniqueness checks with specific messages (no orphaned rows).
    const emailDup = await query('SELECT 1 FROM users WHERE lower(email) = $1', [adminEmail]);
    if (emailDup.rows.length > 0) {
      return res.status(409).json({ error: `An account with email "${adminEmail}" already exists. Enter a different admin email.` });
    }
    const codeDup = await query('SELECT 1 FROM institutions WHERE lower(code) = lower($1)', [body.code]);
    if (codeDup.rows.length > 0) {
      return res.status(409).json({ error: `Institution code "${body.code}" already exists. Choose a different code.` });
    }
    if (domain) {
      const domDup = await query('SELECT 1 FROM institutions WHERE lower(domain) = $1', [domain]);
      if (domDup.rows.length > 0) {
        return res.status(409).json({ error: `The email domain "${domain}" is already used by another organization.` });
      }
    }

    const tempPassword = generateStrongPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    // Atomic institution + admin creation.
    const institution = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO institutions (name, code, domain, address, city, contact_email, contact_phone, max_students, max_teachers, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10)
         RETURNING *`,
        [body.name, body.code, domain, body.address, body.city, body.contactEmail, body.contactPhone, body.maxStudents, body.maxTeachers, req.user!.id],
      );
      const inst = result.rows[0];
      await client.query(
        `INSERT INTO users (email, password_hash, full_name, role, institution_id, must_change_password, personal_email)
         VALUES ($1, $2, $3, 'org_admin', $4, true, $1)`,
        [adminEmail, passwordHash, body.adminName, inst.id],
      );
      return inst;
    });

    try {
      const { emailService } = await import('../../services/email.js');
      await emailService.sendWelcome(adminEmail, adminEmail, tempPassword);
    } catch (e) { console.error('Failed to send welcome email:', e); }

    res.status(201).json({ institution, adminEmail, tempPassword, message: 'Institution created with admin account' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A unique value (institution code, admin email, or email domain) is already taken.' });
    }
    res.status(500).json({ error: 'Failed to create institution' });
  }
});

/**
 * @openapi
 * /institutions/{id}:
 *   get:
 *     summary: Get institution by ID
 *     description: Retrieve full details of a single institution.
 *     tags: [Institutions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Institution ID
 *         example: "inst-001-uuid"
 *     responses:
 *       200:
 *         description: Institution details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: "inst-001-uuid"
 *                 name:
 *                   type: string
 *                   example: "National University of Computing"
 *                 code:
 *                   type: string
 *                   example: "NUC-2025"
 *                 domain:
 *                   type: string
 *                   example: "nuc.edu.pk"
 *                 address:
 *                   type: string
 *                   example: "H-11/4, Islamabad"
 *                 city:
 *                   type: string
 *                   example: "Islamabad"
 *                 contact_email:
 *                   type: string
 *                   example: "admin@nuc.edu.pk"
 *                 contact_phone:
 *                   type: string
 *                   example: "+92-51-1234567"
 *                 max_students:
 *                   type: integer
 *                   example: 5000
 *                 max_teachers:
 *                   type: integer
 *                   example: 200
 *                 status:
 *                   type: string
 *                   example: "active"
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-08-15T09:00:00Z"
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
 *         description: Institution not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Institution not found"
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
router.get('/:id', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res) => {
  const result = await query(
    `SELECT i.*, i.plan_id, i.plan_status, i.trial_ends_at, sp.name as plan_name
     FROM institutions i LEFT JOIN subscription_plans sp ON sp.id = i.plan_id
     WHERE i.id = $1`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Institution not found' });
  }
  if (req.user!.role === 'org_admin' && result.rows[0].id !== req.user!.institutionId) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  res.json(result.rows[0]);
});

/**
 * @openapi
 * /institutions/{id}:
 *   put:
 *     summary: Update institution
 *     description: Partially update institution details. Only system admins may update institutions.
 *     tags: [Institutions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Institution ID
 *         example: "inst-001-uuid"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "National University of Computing Updated"
 *               address:
 *                 type: string
 *                 example: "G-10/2, Islamabad"
 *               city:
 *                 type: string
 *                 example: "Islamabad"
 *               contactEmail:
 *                 type: string
 *                 example: "info@nuc.edu.pk"
 *               contactPhone:
 *                 type: string
 *                 example: "+92-51-9876543"
 *               maxStudents:
 *                 type: integer
 *                 example: 8000
 *               maxTeachers:
 *                 type: integer
 *                 example: 300
 *               status:
 *                 type: string
 *                 enum: [active, suspended, archived]
 *                 example: "active"
 *     responses:
 *       200:
 *         description: Updated institution
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: "inst-001-uuid"
 *                 name:
 *                   type: string
 *                   example: "National University of Computing Updated"
 *                 code:
 *                   type: string
 *                   example: "NUC-2025"
 *                 status:
 *                   type: string
 *                   example: "active"
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
 *         description: Forbidden — only system_admin
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Forbidden"
 *       404:
 *         description: Institution not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Institution not found"
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
router.put('/:id', authenticate, requireRoles('system_admin'), async (req: AuthRequest, res) => {
  const { name, address, city, contactEmail, contactPhone, maxStudents, maxTeachers, maxDepartments, maxVerifications, status, domain } = req.body;

  // Domain is the org's email identity — keep it globally unique when changed.
  let newDomain: string | null = null;
  if (domain !== undefined && domain !== null && String(domain).trim() !== '') {
    newDomain = normalizeDomain(domain);
    if (newDomain) {
      const dup = await query('SELECT 1 FROM institutions WHERE lower(domain) = $1 AND id <> $2', [newDomain, req.params.id]);
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: 'That email domain is already used by another organization' });
      }
    }
  }

  const result = await query(
    `UPDATE institutions SET name = COALESCE($1, name), address = COALESCE($2, address), city = COALESCE($3, city),
     contact_email = COALESCE($4, contact_email), contact_phone = COALESCE($5, contact_phone),
     max_students = COALESCE($6, max_students), max_teachers = COALESCE($7, max_teachers),
     max_departments = COALESCE($8, max_departments),
     max_verifications = COALESCE($9, max_verifications),
     status = COALESCE($10, status), domain = COALESCE($11, domain) WHERE id = $12 RETURNING *`,
    [name, address, city, contactEmail, contactPhone, maxStudents, maxTeachers, maxDepartments, maxVerifications ?? null, status, newDomain, req.params.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Institution not found' });
  }
  res.json(result.rows[0]);
});

/**
 * @openapi
 * /institutions/{id}/stats:
 *   get:
 *     summary: Get institution statistics
 *     description: Retrieve aggregated statistics for an institution from the v_institution_stats view.
 *     tags: [Institutions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *         description: Institution not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Institution not found"
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
router.get('/:id/stats', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res) => {
  if (req.user!.role === 'org_admin' && req.params.id !== req.user!.institutionId) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const result = await query('SELECT * FROM v_institution_stats WHERE institution_id = $1', [req.params.id]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Institution not found' });
  }
  res.json(result.rows[0]);
});

const assignPlanSchema = z.object({
  planId: z.string().min(1),
  planStatus: z.enum(['trial', 'active', 'expired', 'cancelled']).optional(),
});

/**
 * @openapi
 * /institutions/{id}/plan:
 *   patch:
 *     summary: Assign a subscription plan to an institution (system admin)
 *     description: Sets the institution's plan + status and COPIES the plan's limits into the institution's own max_* columns (which the admin can then override per-org).
 *     tags: [Institutions]
 *     security: [{ bearerAuth: [] }]
 */
router.patch('/:id/plan', authenticate, requireRoles('system_admin'), async (req: AuthRequest, res) => {
  try {
    const body = assignPlanSchema.parse(req.body);
    const planRow = await query('SELECT * FROM subscription_plans WHERE id = $1', [body.planId]);
    if (planRow.rows.length === 0) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    const p = planRow.rows[0];
    const status = body.planStatus || 'active';
    const result = await query(
      `UPDATE institutions SET plan_id = $1, plan_status = $2, plan_selected_at = NOW(),
         max_students = $3, max_teachers = $4, max_departments = $5, max_verifications = $6
       WHERE id = $7 RETURNING *`,
      [body.planId, status, p.max_students, p.max_teachers, p.max_departments, p.max_verifications, req.params.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Institution not found' });
    }
    res.json({ institution: result.rows[0], message: `Plan "${p.name}" assigned` });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to assign plan' });
  }
});

/**
 * @openapi
 * /institutions/api-access/status:
 *   get:
 *     summary: Get the caller organization's API-access status (org admin)
 *     description: Returns the API-access status, whether the current plan allows API access, and the integration endpoints that become available once enabled.
 *     tags: [Institutions]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/api-access/status', authenticate, requireRoles('org_admin'), async (req: AuthRequest, res) => {
  if (!req.user!.institutionId) return res.status(400).json({ error: 'No institution assigned' });
  const r = await query(
    `SELECT i.id, i.api_access_enabled, i.api_access_status, i.api_access_requested_at,
            i.plan_id, sp.name AS plan_name, COALESCE(i.max_verifications, sp.max_verifications, 0) AS quota
       FROM institutions i LEFT JOIN subscription_plans sp ON sp.id = i.plan_id
      WHERE i.id = $1`,
    [req.user!.institutionId],
  );
  if (r.rows.length === 0) return res.status(404).json({ error: 'Institution not found' });
  const i = r.rows[0];
  // Current-month billable verification usage (best-effort — biometric DB).
  let used = 0;
  try {
    const u = await biometricPool.query(
      `SELECT COUNT(*)::int AS used FROM verification_logs
        WHERE institution_id = $1 AND verification_type IN ('face','fingerprint')
          AND created_at >= date_trunc('month', NOW())`,
      [req.user!.institutionId],
    );
    used = Number(u.rows[0]?.used ?? 0);
  } catch { /* metering optional */ }
  const quota = Number(i.quota ?? 0);
  res.json({
    status: i.api_access_status || 'none',
    enabled: i.api_access_enabled === true,
    requestedAt: i.api_access_requested_at,
    planId: i.plan_id,
    planName: i.plan_name,
    planAllowsApi: planAllowsApi(i.plan_id),
    endpoints: INTEGRATION_ENDPOINTS,
    usage: { used, quota, remaining: Math.max(0, quota - used) },
  });
});

/**
 * @openapi
 * /institutions/api-access/request:
 *   post:
 *     summary: Request API access for the caller's organization (org admin)
 *     description: Marks the organization's API access as "requested" for a system admin to review. Rejected on the Free plan (paid-plan feature).
 *     tags: [Institutions]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/api-access/request', authenticate, requireRoles('org_admin'), async (req: AuthRequest, res) => {
  const instId = req.user!.institutionId;
  if (!instId) return res.status(400).json({ error: 'No institution assigned' });
  const r = await query('SELECT id, name, plan_id, api_access_enabled FROM institutions WHERE id = $1', [instId]);
  if (r.rows.length === 0) return res.status(404).json({ error: 'Institution not found' });
  const inst = r.rows[0];
  if (inst.api_access_enabled) return res.status(400).json({ error: 'API access is already enabled for your organization.' });
  if (!planAllowsApi(inst.plan_id)) {
    return res.status(403).json({ error: 'API access is not available on the Free plan. Please upgrade your plan first.' });
  }
  await query(
    `UPDATE institutions SET api_access_status = 'requested', api_access_requested_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [instId],
  );
  // Notify system admins (best-effort; never blocks the request).
  try {
    await query(
      `INSERT INTO notifications (user_id, title, message, type)
       SELECT id, 'API access requested', $1, 'info' FROM users WHERE role = 'system_admin' AND is_active = true`,
      [`${inst.name} has requested API access.`],
    );
  } catch (e) { console.error('[api-access] notify admins failed:', e); }
  res.json({ status: 'requested', message: 'API access requested. An administrator will review your request.' });
});

const apiAccessSchema = z.object({ enabled: z.boolean() });

/**
 * @openapi
 * /institutions/{id}/api-access:
 *   patch:
 *     summary: Enable or disable API access for an organization (system admin)
 *     description: Enabling lets the organization create API keys and call the public integration endpoints; disabling immediately blocks its keys.
 *     tags: [Institutions]
 *     security: [{ bearerAuth: [] }]
 */
router.patch('/:id/api-access', authenticate, requireRoles('system_admin'), async (req: AuthRequest, res) => {
  try {
    const { enabled } = apiAccessSchema.parse(req.body);
    const result = await query(
      `UPDATE institutions
         SET api_access_enabled = $1,
             api_access_status  = $2,
             api_access_decided_at = NOW(),
             api_access_decided_by = $3,
             updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, api_access_enabled, api_access_status`,
      [enabled, enabled ? 'enabled' : 'disabled', req.user!.id, req.params.id],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Institution not found' });
    // Notify the organization's admins (best-effort).
    try {
      await query(
        `INSERT INTO notifications (institution_id, user_id, title, message, type)
         SELECT $1, id, $2, $3, $4 FROM users WHERE institution_id = $1 AND role = 'org_admin' AND is_active = true`,
        [
          req.params.id,
          enabled ? 'API access enabled' : 'API access disabled',
          enabled
            ? 'API access has been enabled for your organization. You can now create API keys on the API & Integrations page.'
            : 'API access has been disabled for your organization. Existing API keys will no longer work.',
          enabled ? 'success' : 'warning',
        ],
      );
    } catch (e) { console.error('[api-access] notify org failed:', e); }
    res.json({ institution: result.rows[0], message: `API access ${enabled ? 'enabled' : 'disabled'}` });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Validation error', details: error.errors });
    res.status(500).json({ error: 'Failed to update API access' });
  }
});

/**
 * @openapi
 * /institutions/{id}:
 *   delete:
 *     summary: Delete an (empty) institution
 *     description: System-admin only. Refuses to delete if the institution still has any users — used to clean up orphaned institutions left by failed approvals.
 *     tags: [Institutions]
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id', authenticate, requireRoles('system_admin'), async (req: AuthRequest, res) => {
  const id = req.params.id;
  try {
    const inst = await query('SELECT id FROM institutions WHERE id = $1', [id]);
    if (inst.rows.length === 0) return res.status(404).json({ error: 'Institution not found' });

    // Refuse if the org still has real members or courses. The auto-created
    // org_admin(s) do NOT count — a brand-new org always has one, and blocking
    // on it would make every empty org undeletable.
    const c = (await query(
      `SELECT
         (SELECT COUNT(*)::int FROM users   WHERE institution_id = $1 AND role = 'teacher') AS teachers,
         (SELECT COUNT(*)::int FROM users   WHERE institution_id = $1 AND role = 'student') AS students,
         (SELECT COUNT(*)::int FROM courses WHERE institution_id = $1)                       AS courses`,
      [id],
    )).rows[0];

    if (c.teachers > 0 || c.students > 0 || c.courses > 0) {
      const parts: string[] = [];
      if (c.teachers > 0) parts.push(`${c.teachers} teacher(s)`);
      if (c.students > 0) parts.push(`${c.students} student(s)`);
      if (c.courses > 0) parts.push(`${c.courses} course(s)`);
      return res.status(409).json({ error: `Cannot delete: this organization still has ${parts.join(', ')}. Remove them first.` });
    }

    // Only org admins (or nothing) remain — clear them, then drop the org.
    // FK cascades handle the org's departments / notifications / etc.
    await withTransaction(async (client) => {
      await client.query('DELETE FROM users WHERE institution_id = $1', [id]);
      await client.query('DELETE FROM institutions WHERE id = $1', [id]);
    });
    res.json({ message: 'Institution deleted' });
  } catch (error: any) {
    // A NO ACTION foreign key (e.g. the admin created API keys or reviewed items)
    // blocks the cascade — surface a clear message instead of a raw 500.
    if (error?.code === '23503') {
      return res.status(409).json({ error: 'Cannot delete: this organization has linked records (such as API keys). Remove those first.' });
    }
    console.error('[institutions] delete failed:', error);
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});

/**
 * GET /institutions/:id/overview
 * System-admin only. A single-call snapshot of an organization so the platform
 * admin can monitor it: live counts plus the teacher / student / course lists.
 */
router.get('/:id/overview', authenticate, requireRoles('system_admin'), async (req: AuthRequest, res) => {
  const id = req.params.id;
  try {
    const inst = await query('SELECT id, name, code, domain, city, status FROM institutions WHERE id = $1', [id]);
    if (inst.rows.length === 0) return res.status(404).json({ error: 'Institution not found' });

    const [countsR, teachersR, studentsR, coursesR, adminsR] = await Promise.all([
      query(
        `SELECT
           (SELECT COUNT(*)::int FROM users   WHERE institution_id = $1 AND role = 'student')   AS students,
           (SELECT COUNT(*)::int FROM users   WHERE institution_id = $1 AND role = 'teacher')   AS teachers,
           (SELECT COUNT(*)::int FROM users   WHERE institution_id = $1 AND role = 'org_admin') AS admins,
           (SELECT COUNT(*)::int FROM courses WHERE institution_id = $1)                         AS courses,
           (SELECT COUNT(*)::int FROM users   WHERE institution_id = $1)                         AS total_users`,
        [id],
      ),
      query(`SELECT id, full_name, email, department, is_active FROM users WHERE institution_id = $1 AND role = 'teacher' ORDER BY full_name LIMIT 300`, [id]),
      query(`SELECT id, full_name, email, roll_number, registration_number, is_active FROM users WHERE institution_id = $1 AND role = 'student' ORDER BY full_name LIMIT 300`, [id]),
      query(
        `SELECT c.id, c.name, c.code, c.semester, c.is_active, u.full_name AS teacher_name
           FROM courses c LEFT JOIN users u ON u.id = c.teacher_id
          WHERE c.institution_id = $1 ORDER BY c.name LIMIT 300`,
        [id],
      ),
      query(`SELECT id, full_name, email, is_active FROM users WHERE institution_id = $1 AND role = 'org_admin' ORDER BY full_name LIMIT 100`, [id]),
    ]);

    res.json({
      institution: inst.rows[0],
      counts: countsR.rows[0],
      teachers: teachersR.rows.map((t) => ({ id: t.id, fullName: t.full_name, email: t.email, department: t.department, isActive: t.is_active })),
      students: studentsR.rows.map((s) => ({ id: s.id, fullName: s.full_name, email: s.email, rollNumber: s.roll_number || s.registration_number, isActive: s.is_active })),
      courses: coursesR.rows.map((c) => ({ id: c.id, name: c.name, code: c.code, semester: c.semester, isActive: c.is_active, teacherName: c.teacher_name })),
      admins: adminsR.rows.map((a) => ({ id: a.id, fullName: a.full_name, email: a.email, isActive: a.is_active })),
    });
  } catch (error) {
    console.error('[institutions] overview failed:', error);
    res.status(500).json({ error: 'Failed to load organization overview' });
  }
});

export const institutionRouter = router;
