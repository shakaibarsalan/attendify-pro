import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticate, requireRoles, AuthRequest } from '../../middleware/auth.js';
import { query, withTransaction } from '../../config/database.js';
import { config } from '../../config/index.js';
import { generateStrongPassword } from '../../utils/password.js';
import { emailService } from '../../services/email.js';

const router = Router();

// Normalize an email domain: strip protocol / leading @ / trailing slash, lowercase.
function normalizeDomain(d?: string | null): string {
  return (d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^@/, '').replace(/\/+$/, '');
}

/**
 * Build the org-admin's official LOGIN email from the institution's email domain:
 *   domain "uot.edu.pk" -> admin@uot.edu.pk
 * This is a login identity (not a real inbox — credentials are sent to the
 * admin's personal email). Guarantees uniqueness by appending a counter:
 * admin@domain, admin1@domain, admin2@domain, ...
 */
async function generateAdminLoginEmail(domain: string): Promise<string> {
  const d = normalizeDomain(domain);
  if (!d) {
    return `admin@org${Date.now()}.com`;
  }
  for (let n = 0; n <= 200; n++) {
    const candidate = `admin${n === 0 ? '' : n}@${d}`;
    const dup = await query('SELECT 1 FROM users WHERE lower(email) = $1', [candidate]);
    if (dup.rows.length === 0) return candidate;
  }
  return `admin@${d}.${Date.now()}`;
}

/**
 * Is this institution code / email domain already taken? Checks both the live
 * institutions table and other PENDING requests (so two people can't register
 * the same org while one is awaiting approval). Returns which field(s) clashed.
 */
async function checkDuplicates(code?: string, domain?: string): Promise<{ codeTaken: boolean; domainTaken: boolean }> {
  const c = (code || '').trim();
  const d = normalizeDomain(domain);
  let codeTaken = false;
  let domainTaken = false;
  if (c) {
    const r = await query(
      `SELECT 1 FROM institutions WHERE lower(code) = lower($1)
        UNION ALL
       SELECT 1 FROM organization_requests WHERE lower(organization_code) = lower($1) AND status = 'pending'`,
      [c],
    );
    codeTaken = r.rows.length > 0;
  }
  if (d) {
    const r = await query(
      `SELECT 1 FROM institutions WHERE lower(domain) = $1
        UNION ALL
       SELECT 1 FROM organization_requests WHERE lower(institution_domain) = $1 AND status = 'pending'`,
      [d],
    );
    domainTaken = r.rows.length > 0;
  }
  return { codeTaken, domainTaken };
}

const DUPLICATE_MESSAGE = 'This Institution Code and Email Domain are already registered. Please contact support if this is your institution.';

const createRequestSchema = z.object({
  organizationName: z.string().min(2),
  organizationCode: z.string().optional(),
  contactName: z.string().min(2),
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  domain: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  // HTML number inputs submit strings ("500") or "" when blank — coerce to a
  // number and treat empty/blank as omitted so the demo form never 400s.
  expectedStudents: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().int().positive().optional()),
  expectedTeachers: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().int().positive().optional()),
  message: z.string().optional(),
  // 'demo' = wants a walkthrough first; 'signup' = wants an account directly.
  requestType: z.enum(['demo', 'signup']).optional().default('demo'),
  // Two preferred 30-minute demo slots the requester proposes (ISO datetimes).
  preferredSlot1: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.date().optional()),
  preferredSlot2: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.date().optional()),
});

const approveSchema = z.object({
  institutionName: z.string().optional(),
  institutionCode: z.string().optional(),
  domain: z.string().optional(),
  adminName: z.string().optional(),
  // The org-admin LOGIN email is auto-generated from the institution name
  // (admin@<name>.com). `adminEmail` remains an optional explicit override.
  adminEmail: z.string().email().optional(),
  // Real inbox the generated credentials are emailed to. Defaults to the
  // contact email captured on the request.
  personalEmail: z.string().email().optional(),
});

const rejectSchema = z.object({
  adminNotes: z.string().optional(),
});

/**
 * @openapi
 * /org-requests:
 *   post:
 *     summary: Submit organization join request
 *     description: Public endpoint. Anyone can submit a request to join Attendify. No authentication required.
 *     tags:
 *       - Org Requests
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - organizationName
 *               - contactName
 *               - contactEmail
 *             properties:
 *               organizationName:
 *                 type: string
 *                 example: University of Technology
 *               organizationCode:
 *                 type: string
 *                 example: UOT-2026
 *               contactName:
 *                 type: string
 *                 example: Dr. Ahmed Khan
 *               contactEmail:
 *                 type: string
 *                 format: email
 *                 example: ahmed@university.edu
 *               contactPhone:
 *                 type: string
 *                 example: "+92-300-1234567"
 *               domain:
 *                 type: string
 *                 example: university.edu
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               expectedStudents:
 *                 type: integer
 *                 example: 1500
 *               expectedTeachers:
 *                 type: integer
 *                 example: 60
 *               message:
 *                 type: string
 *     responses:
 *       '201':
 *         description: Request submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     organization_name:
 *                       type: string
 *                     contact_email:
 *                       type: string
 *                     status:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *       '400':
 *         description: Validation error
 *       '500':
 *         description: Failed to submit request
 */
/**
 * @openapi
 * /org-requests/check-availability:
 *   get:
 *     summary: Check whether an institution code / email domain is already registered
 *     description: Public. Used by the landing "Get Started" form to block duplicate registrations before submit.
 *     tags: [Org Requests]
 *     parameters:
 *       - in: query
 *         name: code
 *         schema: { type: string }
 *       - in: query
 *         name: domain
 *         schema: { type: string }
 *     responses:
 *       '200': { description: Availability result }
 */
router.get('/check-availability', async (req, res: Response) => {
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const domain = typeof req.query.domain === 'string' ? req.query.domain : '';
    const { codeTaken, domainTaken } = await checkDuplicates(code, domain);
    const available = !codeTaken && !domainTaken;
    res.json({
      available,
      codeTaken,
      domainTaken,
      message: available ? null : DUPLICATE_MESSAGE,
    });
  } catch {
    // Fail open on the read-only check so a transient DB blip never blocks the
    // form; the POST handler re-validates authoritatively before inserting.
    res.json({ available: true, codeTaken: false, domainTaken: false, message: null });
  }
});

router.post('/', async (req, res: Response) => {
  try {
    const body = createRequestSchema.parse(req.body);

    // Block duplicate institutions up-front (also checked live on the landing
    // form). Enforced here so the client check can't be bypassed.
    const { codeTaken, domainTaken } = await checkDuplicates(body.organizationCode, body.domain);
    if (codeTaken || domainTaken) {
      return res.status(409).json({ error: DUPLICATE_MESSAGE, codeTaken, domainTaken });
    }

    const result = await query(
      `INSERT INTO organization_requests (organization_name, organization_code, contact_name, contact_email, contact_phone, institution_domain, address, city, expected_students, expected_teachers, message, request_type, preferred_slot_1, preferred_slot_2)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, organization_name, contact_email, status, request_type, created_at`,
      [body.organizationName, body.organizationCode, body.contactName, body.contactEmail, body.contactPhone, body.domain, body.address, body.city, body.expectedStudents, body.expectedTeachers, body.message, body.requestType, body.preferredSlot1 ?? null, body.preferredSlot2 ?? null]
    );

    const created = result.rows[0];

    // Email the owner / sales inboxes so a new lead is seen immediately.
    // Fire-and-forget: a mail failure must never fail the visitor's submission.
    emailService
      .sendLeadNotification({
        requestType: body.requestType,
        organizationName: body.organizationName,
        organizationCode: body.organizationCode,
        domain: body.domain,
        contactName: body.contactName,
        contactEmail: body.contactEmail,
        contactPhone: body.contactPhone,
        expectedStudents: body.expectedStudents,
        message: body.message,
        createdAt: created.created_at,
      })
      .catch((e) => console.error('[org-requests] lead notification email failed:', e?.message || e));

    res.status(201).json({ data: created });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      // Turn the raw Zod issue into a specific, actionable message the visitor
      // can fix (instead of an opaque "Validation error").
      const first = error.errors[0];
      const field = first?.path?.join('.') || 'input';
      const friendly: Record<string, string> = {
        organizationName: 'Please enter your organization name (at least 2 characters).',
        contactName: 'Please enter your name (at least 2 characters).',
        contactEmail: 'Please enter a valid email address.',
      };
      const message =
        friendly[field] ||
        (first?.message ? `${field}: ${first.message}` : 'Please check the form and try again.');
      return res.status(400).json({ error: message, details: error.errors });
    }
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

/**
 * @openapi
 * /org-requests:
 *   get:
 *     summary: List organization requests
 *     description: Retrieve all organization join requests. System admin only. Supports filtering by status.
 *     tags:
 *       - Org Requests
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         description: Filter by request status
 *     responses:
 *       '200':
 *         description: List of organization requests
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
 *                       organization_name:
 *                         type: string
 *                       organization_code:
 *                         type: string
 *                       contact_name:
 *                         type: string
 *                       contact_email:
 *                         type: string
 *                       contact_phone:
 *                         type: string
 *                       expected_students:
 *                         type: integer
 *                       expected_teachers:
 *                         type: integer
 *                       message:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [pending, approved, rejected]
 *                       admin_notes:
 *                         type: string
 *                         nullable: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden - system admin only
 *       '500':
 *         description: Failed to fetch requests
 */
router.get('/', authenticate, requireRoles('system_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    let sql = 'SELECT * FROM organization_requests';
    const params: unknown[] = [];

    if (status) {
      sql += ' WHERE status = $1';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';

    const result = await query(sql, params);
    res.json({ data: result.rows, total: result.rows.length });
  } catch {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

/**
 * @openapi
 * /org-requests/{id}/approve:
 *   patch:
 *     summary: Approve organization request
 *     description: Approve a pending organization request. Creates an institution and org_admin account with a generated temporary password. Sends welcome email. System admin only.
 *     tags:
 *       - Org Requests
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               institutionName:
 *                 type: string
 *                 description: Override institution name (defaults to organization_name)
 *               institutionCode:
 *                 type: string
 *                 description: Override institution code
 *               adminName:
 *                 type: string
 *                 description: Override admin name (defaults to contact_name)
 *               adminEmail:
 *                 type: string
 *                 format: email
 *                 description: Override admin email (defaults to contact_email)
 *     responses:
 *       '200':
 *         description: Request approved, institution and admin created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 institution:
 *                   type: object
 *                 message:
 *                   type: string
 *                   example: Approved
 *       '400':
 *         description: Request is not pending
 *       '404':
 *         description: Request not found
 *       '409':
 *         description: Institution code already exists
 *       '500':
 *         description: Failed to approve request
 */
router.patch('/:id/approve', authenticate, requireRoles('system_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const body = approveSchema.parse(req.body);

    const reqResult = await query('SELECT * FROM organization_requests WHERE id = $1', [req.params.id]);
    if (reqResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const orgReq = reqResult.rows[0];
    if (orgReq.status !== 'pending') {
      return res.status(400).json({ error: 'Request is not pending' });
    }

    const instName = body.institutionName || orgReq.organization_name;
    const instCode = body.institutionCode || orgReq.organization_code || orgReq.organization_name.substring(0, 20).toUpperCase().replace(/\s+/g, '-');
    const adminName = body.adminName || orgReq.contact_name;

    // Real inbox the credentials are sent to (NOT a login identity). Defaults to
    // the contact email captured on the request.
    const personalEmail = (body.personalEmail || orgReq.contact_email || '').trim().toLowerCase();

    // Org email domain (drives teacher/student login emails). Prefer the value the
    // admin sets at approval; fall back to whatever the request carried. Normalized.
    const domain = (body.domain || orgReq.institution_domain || '')
      .trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^@/, '').replace(/\/+$/, '') || null;

    // The org-admin's OFFICIAL login email is auto-generated from the institution's
    // email domain: admin@<domain> (uniqueness guaranteed). An explicit adminEmail
    // override is honored if provided.
    const loginEmail = body.adminEmail
      ? body.adminEmail.trim().toLowerCase()
      : await generateAdminLoginEmail(domain);

    // Pre-flight uniqueness checks with SPECIFIC messages — run before any write so
    // a clash can't leave an orphaned institution (the whole create is also atomic).
    if (!personalEmail) {
      return res.status(400).json({ error: 'A personal email is required to send the admin their credentials.' });
    }
    const emailDup = await query('SELECT 1 FROM users WHERE lower(email) = $1', [loginEmail]);
    if (emailDup.rows.length > 0) {
      return res.status(409).json({ error: `An account with login email "${loginEmail}" already exists. Adjust the institution name or pass an explicit admin email.` });
    }
    const codeDup = await query('SELECT 1 FROM institutions WHERE lower(code) = lower($1)', [instCode]);
    if (codeDup.rows.length > 0) {
      return res.status(409).json({ error: `Institution code "${instCode}" already exists. Choose a different code.` });
    }
    if (domain) {
      const domDup = await query('SELECT 1 FROM institutions WHERE lower(domain) = $1', [domain]);
      if (domDup.rows.length > 0) {
        return res.status(409).json({ error: `The email domain "${domain}" is already used by another organization.` });
      }
    }

    // Strong random temporary password — emailed to the admin and returned to the
    // system admin so it can be conveyed if email delivery isn't configured.
    const tempPassword = generateStrongPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    // Atomic: institution + admin user + request status all commit together or not
    // at all (no more orphaned institutions on a partial failure).
    const institution = await withTransaction(async (client) => {
      const instResult = await client.query(
        `INSERT INTO institutions (name, code, domain, address, city, contact_email, contact_phone, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
         RETURNING *`,
        [instName, instCode, domain, orgReq.address, orgReq.city, orgReq.contact_email, orgReq.contact_phone, req.user!.id],
      );
      const inst = instResult.rows[0];
      // Login email = generated official identity; personal_email = the admin's
      // real inbox (where the credentials below are delivered).
      await client.query(
        `INSERT INTO users (email, password_hash, full_name, role, institution_id, must_change_password, personal_email)
         VALUES ($1, $2, $3, 'org_admin', $4, true, $5)`,
        [loginEmail, passwordHash, adminName, inst.id, personalEmail],
      );
      await client.query(
        `UPDATE organization_requests SET status = 'approved', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2`,
        [req.user!.id, req.params.id],
      );
      return inst;
    });

    // Deliver the generated login email + temp password to the admin's PERSONAL inbox.
    try {
      const { emailService } = await import('../../services/email.js');
      await emailService.sendWelcome(personalEmail, loginEmail, tempPassword);
    } catch (e) { console.error('Failed to send welcome email:', e); }

    res.json({ institution, adminEmail: loginEmail, personalEmail, tempPassword, message: 'Approved' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A unique value (institution code, admin email, or email domain) is already taken. Adjust the details and try again.' });
    }
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

/**
 * @openapi
 * /org-requests/{id}/reject:
 *   patch:
 *     summary: Reject organization request
 *     description: Reject a pending organization request with optional admin notes. System admin only.
 *     tags:
 *       - Org Requests
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               adminNotes:
 *                 type: string
 *                 description: Optional reason for rejection
 *     responses:
 *       '200':
 *         description: Request rejected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Rejected
 *       '400':
 *         description: Request is not pending
 *       '404':
 *         description: Request not found
 *       '500':
 *         description: Failed to reject request
 */
router.patch('/:id/reject', authenticate, requireRoles('system_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const body = rejectSchema.parse(req.body);

    const reqResult = await query('SELECT * FROM organization_requests WHERE id = $1', [req.params.id]);
    if (reqResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const orgReq = reqResult.rows[0];
    if (orgReq.status !== 'pending') {
      return res.status(400).json({ error: 'Request is not pending' });
    }

    await query(
      `UPDATE organization_requests SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), admin_notes = $2 WHERE id = $3`,
      [req.user!.id, body.adminNotes || null, req.params.id]
    );

    res.json({ message: 'Rejected' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

/**
 * @openapi
 * /org-requests/{id}/schedule-demo:
 *   post:
 *     summary: Email a demo scheduling link to the requester
 *     description: >
 *       Sends the contact a "book a demo" email (via SMTP) containing the configured
 *       scheduling link, and records contacted_at. System admin only. Use for
 *       request_type 'demo'.
 *     tags: [Org Requests]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200': { description: Demo invitation sent }
 *       '404': { description: Request not found }
 */
router.post('/:id/schedule-demo', authenticate, requireRoles('system_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const reqResult = await query('SELECT * FROM organization_requests WHERE id = $1', [req.params.id]);
    if (reqResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    const orgReq = reqResult.rows[0];

    // Record the outreach and respond immediately, then send the Calendly
    // booking invite in the background (so the requester picks a real available
    // slot and Calendly creates the meeting + link). Blocking on SMTP would time
    // out at the proxy if the relay is slow.
    await query('UPDATE organization_requests SET contacted_at = NOW() WHERE id = $1', [req.params.id]);

    import('../../services/email.js')
      .then(({ emailService }) => emailService.sendDemoInvite(
        orgReq.contact_email, orgReq.contact_name, orgReq.organization_name, config.demo.schedulingUrl,
      ))
      .catch((e: any) => console.error('[org-requests] demo invite email failed:', e?.message));

    res.json({ success: true, message: 'Booking invite sent', contactEmail: orgReq.contact_email });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to send booking invite' });
  }
});

export const orgRequestRouter = router;
