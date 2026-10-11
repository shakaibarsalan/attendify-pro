import { Router } from 'express';
import { authenticate, requireRoles, AuthRequest } from '../../middleware/auth.js';
import { query } from '../../config/database.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGNO_RE = /^[FS][A-Z0-9]{10}$/;

/**
 * @openapi
 * /users:
 *   get:
 *     summary: List users
 *     description: Retrieve a paginated, filterable list of users. System admins see all users; org admins see users in their institution; teachers see users in their institution. Students are not allowed.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [system_admin, org_admin, teacher, student]
 *         description: Filter by user role
 *         example: teacher
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, email, or roll number
 *         example: ahmed
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Results per page
 *         example: 20
 *     responses:
 *       200:
 *         description: Paginated list of users
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
 *                         example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                       email:
 *                         type: string
 *                         example: "ahmed@university.edu"
 *                       full_name:
 *                         type: string
 *                         example: "Ahmed Khan"
 *                       role:
 *                         type: string
 *                         example: "teacher"
 *                       institution_id:
 *                         type: string
 *                         format: uuid
 *                         example: "inst-001-uuid"
 *                       phone:
 *                         type: string
 *                         example: "+92-300-1234567"
 *                       roll_number:
 *                         type: string
 *                         example: "2021-CS-001"
 *                       department:
 *                         type: string
 *                         example: "Computer Science"
 *                       is_active:
 *                         type: boolean
 *                         example: true
 *                       last_login:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-05-22T10:30:00Z"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-09-01T08:00:00Z"
 *                 total:
 *                   type: integer
 *                   example: 150
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 20
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
  const { role, search, page = '1', limit = '20' } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  let sql = 'SELECT id, email, personal_email, full_name, role, institution_id, phone, roll_number, registration_number, department, is_active, last_login, created_at FROM users WHERE 1=1';
  const params: any[] = [];
  let paramIndex = 1;

  if (req.user!.role === 'org_admin' && req.user!.institutionId) {
    sql += ` AND institution_id = $${paramIndex++}`;
    params.push(req.user!.institutionId);
  }

  if (role) {
    sql += ` AND role = $${paramIndex++}`;
    params.push(role);
  }

  if (search) {
    sql += ` AND (full_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR roll_number ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(parseInt(limit as string), offset);

  const result = await query(sql, params);
  const countResult = await query(sql.replace(/SELECT .* FROM/, 'SELECT COUNT(*) FROM').replace(/ORDER BY.*LIMIT.*OFFSET.*/, ''), params.slice(0, -2));

  res.json({
    data: result.rows,
    total: parseInt(countResult.rows[0].count),
    page: parseInt(page as string),
    limit: parseInt(limit as string),
  });
});

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     summary: Get user by ID
 *     description: Retrieve a single user's full profile by their unique ID.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID
 *         example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                 email:
 *                   type: string
 *                   example: "ahmed@university.edu"
 *                 full_name:
 *                   type: string
 *                   example: "Ahmed Khan"
 *                 role:
 *                   type: string
 *                   example: "teacher"
 *                 institution_id:
 *                   type: string
 *                   format: uuid
 *                   example: "inst-001-uuid"
 *                 phone:
 *                   type: string
 *                   example: "+92-300-1234567"
 *                 avatar_url:
 *                   type: string
 *                   example: "https://cdn.example.com/avatars/ahmed.jpg"
 *                 roll_number:
 *                   type: string
 *                   example: "2021-CS-001"
 *                 department:
 *                   type: string
 *                   example: "Computer Science"
 *                 is_active:
 *                   type: boolean
 *                   example: true
 *                 last_login:
 *                   type: string
 *                   format: date-time
 *                   example: "2026-05-22T10:30:00Z"
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-09-01T08:00:00Z"
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
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "User not found"
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
router.get('/:id', authenticate, requireRoles('system_admin', 'org_admin', 'teacher'), async (req: AuthRequest, res) => {
  const result = await query(
    `SELECT id, email, personal_email, full_name, role, institution_id, phone, avatar_url, roll_number, registration_number, department, is_active, last_login, created_at
     FROM users WHERE id = $1`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (req.user!.role !== 'system_admin' && result.rows[0].institution_id !== req.user!.institutionId) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  res.json(result.rows[0]);
});

/**
 * @openapi
 * /users/{id}:
 *   put:
 *     summary: Update user
 *     description: Partially update a user's profile. Only system_admin and org_admin roles may call this.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID to update
 *         example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: "Ahmed Khan Updated"
 *               phone:
 *                 type: string
 *                 example: "+92-300-9876543"
 *               department:
 *                 type: string
 *                 example: "Software Engineering"
 *               role:
 *                 type: string
 *                 enum: [system_admin, org_admin, teacher, student]
 *                 example: "teacher"
 *               isActive:
 *                 type: boolean
 *                 example: true
 *               rollNumber:
 *                 type: string
 *                 example: "2021-SE-005"
 *     responses:
 *       200:
 *         description: Updated user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                 email:
 *                   type: string
 *                   example: "ahmed@university.edu"
 *                 full_name:
 *                   type: string
 *                   example: "Ahmed Khan Updated"
 *                 role:
 *                   type: string
 *                   example: "teacher"
 *                 institution_id:
 *                   type: string
 *                   format: uuid
 *                   example: "inst-001-uuid"
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
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "User not found"
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
router.put('/:id', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res) => {
  const { fullName, phone, department, role, isActive, rollNumber, email, personalEmail, registrationNumber } = req.body;

  // Load the target first: we need its institution + role to authorize the edit
  // and to scope the org-email / registration-number uniqueness checks.
  const target = await query('SELECT id, institution_id, role FROM users WHERE id = $1', [req.params.id]);
  if (target.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  const t = target.rows[0];

  // No one may deactivate their own account (prevents self-lockout).
  if (isActive === false && req.params.id === req.user!.id) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }

  // Org admins may only manage teachers/students inside their own organization —
  // they cannot touch admin accounts or assign elevated roles. (system_admin is
  // unrestricted.) The org email + phone are "locked" fields precisely because
  // only a higher-level admin reaches this endpoint.
  if (req.user!.role === 'org_admin') {
    if (t.institution_id !== req.user!.institutionId) {
      return res.status(403).json({ error: 'You can only manage users in your own organization' });
    }
    if (!['teacher', 'student'].includes(t.role)) {
      return res.status(403).json({ error: 'Insufficient permissions to edit this user' });
    }
    if (role && !['teacher', 'student'].includes(role)) {
      return res.status(403).json({ error: 'You cannot assign that role' });
    }
  }

  // Validate + normalize the org (login) email if it is being changed.
  let newEmail: string | null = null;
  if (email !== undefined && email !== null && String(email).trim() !== '') {
    const candidate = String(email).trim().toLowerCase();
    if (!EMAIL_RE.test(candidate)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    // The org email is the login identifier — it must stay unique within the institution.
    const dupe = await query(
      'SELECT 1 FROM users WHERE lower(email) = $1 AND institution_id IS NOT DISTINCT FROM $2 AND id <> $3',
      [candidate, t.institution_id, req.params.id],
    );
    if (dupe.rows.length > 0) {
      return res.status(409).json({ error: 'Another user in this organization already uses that email' });
    }
    newEmail = candidate;
  }

  // Validate the personal email if provided.
  let newPersonalEmail: string | null = null;
  if (personalEmail !== undefined && personalEmail !== null && String(personalEmail).trim() !== '') {
    const candidate = String(personalEmail).trim().toLowerCase();
    if (!EMAIL_RE.test(candidate)) {
      return res.status(400).json({ error: 'Invalid personal email address' });
    }
    newPersonalEmail = candidate;
  }

  // Validate + normalize the registration number if it is being changed
  // (unique within the institution, like at registration).
  let newRegNo: string | null = null;
  if (registrationNumber !== undefined && registrationNumber !== null && String(registrationNumber).trim() !== '') {
    const candidate = String(registrationNumber).trim().toUpperCase();
    if (!REGNO_RE.test(candidate)) {
      return res.status(400).json({ error: 'Registration number must be 11 characters: F or S followed by 10 letters/digits, e.g. F2022123456' });
    }
    const dupe = await query(
      'SELECT 1 FROM users WHERE institution_id IS NOT DISTINCT FROM $1 AND upper(registration_number) = $2 AND id <> $3',
      [t.institution_id, candidate, req.params.id],
    );
    if (dupe.rows.length > 0) {
      return res.status(409).json({ error: 'Another user in this organization already uses that registration number' });
    }
    newRegNo = candidate;
  }

  const result = await query(
    `UPDATE users SET
       full_name           = COALESCE($1, full_name),
       phone               = COALESCE($2, phone),
       department          = COALESCE($3, department),
       role                = COALESCE($4, role),
       is_active           = COALESCE($5, is_active),
       roll_number         = COALESCE($6, roll_number),
       email               = COALESCE($7, email),
       personal_email      = COALESCE($8, personal_email),
       registration_number = COALESCE($9, registration_number)
     WHERE id = $10
     RETURNING id, email, personal_email, full_name, role, institution_id, phone, department, roll_number, registration_number, is_active`,
    [fullName || null, phone || null, department || null, role || null,
     isActive !== undefined ? isActive : null, (newRegNo || rollNumber || null), newEmail, newPersonalEmail, newRegNo, req.params.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(result.rows[0]);
});

/**
 * @openapi
 * /users/{id}:
 *   delete:
 *     summary: Delete user
 *     description: Permanently delete a user by ID. Only system admins may delete users. A user cannot delete their own account.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID to delete
 *         example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User deleted"
 *       400:
 *         description: Cannot delete your own account
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Cannot delete your own account"
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
 *         description: Forbidden — only system_admin can delete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Forbidden"
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "User not found"
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
router.delete('/:id', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const target = await query('SELECT institution_id, role FROM users WHERE id = $1', [req.params.id]);
  if (target.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  const t = target.rows[0];

  // Hierarchy: org admins may only delete teachers/students in their own org;
  // system admins may delete anyone (except themselves, handled above).
  if (req.user!.role === 'org_admin') {
    if (t.institution_id !== req.user!.institutionId || !['teacher', 'student'].includes(t.role)) {
      return res.status(403).json({ error: 'You can only delete teachers and students in your own organization' });
    }
  }

  await query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ message: 'User deleted' });
});

/**
 * @openapi
 * /users/bulk-import:
 *   post:
 *     summary: Bulk-import users from CSV
 *     description: Create multiple users from raw CSV text. The header row must include at least `email`, `fullname`, `role`. An org_admin imports into their own institution; a system_admin must supply institutionId. Returns per-row counts and errors.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [csvData]
 *             properties:
 *               csvData:
 *                 type: string
 *                 description: Raw CSV text — a header row plus one row per user
 *                 example: "email,fullname,role\njane@uni.edu.pk,Jane Doe,student"
 *               institutionId:
 *                 type: string
 *                 format: uuid
 *                 description: Required for system_admin; ignored for org_admin (uses their own institution)
 *     responses:
 *       200:
 *         description: Import summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 created: { type: integer, example: 42 }
 *                 skipped: { type: integer, example: 3 }
 *                 errors:
 *                   type: array
 *                   items: { type: string }
 *                   example: ["Row 5: missing required fields"]
 *       400:
 *         description: Missing csvData / institutionId / required CSV columns
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.post('/bulk-import', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res) => {
  const { csvData, institutionId: bodyInstitutionId } = req.body;
  if (!csvData || typeof csvData !== 'string') {
    return res.status(400).json({ error: 'csvData string required' });
  }

  const institutionId = req.user!.role === 'system_admin' ? bodyInstitutionId : req.user!.institutionId;
  if (!institutionId) return res.status(400).json({ error: 'institutionId required' });

  const lines = csvData.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return res.status(400).json({ error: 'CSV must have a header row and at least one data row' });

  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const required = ['email', 'fullname', 'role'];
  const missing = required.filter(f => !header.includes(f));
  if (missing.length) return res.status(400).json({ error: `CSV missing columns: ${missing.join(', ')}` });

  const bcrypt = await import('bcryptjs');
  const results = { created: 0, skipped: 0, errors: [] as string[] };

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row: Record<string, string> = {};
    header.forEach((h, idx) => { row[h] = values[idx] || ''; });

    if (!row.email || !row.fullname || !row.role) {
      results.errors.push(`Row ${i + 1}: missing required fields`);
      continue;
    }
    const allowedRoles = ['teacher', 'student'];
    if (!allowedRoles.includes(row.role)) {
      results.errors.push(`Row ${i + 1}: invalid role '${row.role}'`);
      continue;
    }

    try {
      const existing = await query('SELECT id FROM users WHERE email = $1 AND institution_id = $2', [row.email, institutionId]);
      if (existing.rows.length > 0) { results.skipped++; continue; }

      const defaultPassword = `Welcome@${new Date().getFullYear()}`;
      const hash = await bcrypt.default.hash(defaultPassword, 12);
      await query(
        `INSERT INTO users (email, password_hash, full_name, role, institution_id, roll_number, department, must_change_password, personal_email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, $1)`,
        [row.email, hash, row.fullname, row.role, institutionId, row.rollnumber || null, row.department || null],
      );
      results.created++;
    } catch {
      results.errors.push(`Row ${i + 1}: failed to insert ${row.email}`);
    }
  }

  res.json({ ...results, message: `Import complete: ${results.created} created, ${results.skipped} skipped` });
});

export const userRouter = router;
