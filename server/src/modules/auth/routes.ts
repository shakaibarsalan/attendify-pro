import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../../config/database.js';
import { config } from '../../config/index.js';
import { authenticate, requireRoles, AuthRequest } from '../../middleware/auth.js';
import { getRedis } from '../../config/redis.js';
import crypto from 'node:crypto';
import { emailService } from '../../services/email.js';

const router = Router();

const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

// Fallback used when Redis is unavailable (single-instance/dev/test).
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkLoginRateLimitLocal(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_LOGIN_ATTEMPTS) return false;
  entry.count++;
  return true;
}

async function checkLoginRateLimit(ip: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try {
      const key = `login_attempts:${ip}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.pexpire(key, LOGIN_WINDOW_MS);
      }
      return count <= MAX_LOGIN_ATTEMPTS;
    } catch (err: any) {
      console.warn('[Auth] Redis rate limit check failed, falling back to in-memory:', err.message);
    }
  }
  return checkLoginRateLimitLocal(ip);
}

async function resetLoginAttempts(ip: string) {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(`login_attempts:${ip}`);
      return;
    } catch (err: any) {
      console.warn('[Auth] Redis rate limit reset failed, falling back to in-memory:', err.message);
    }
  }
  loginAttempts.delete(ip);
}

const passwordComplexity = z.string().min(8)
  .refine(p => /[A-Z]/.test(p), { message: 'Password must contain at least one uppercase letter' })
  .refine(p => /[0-9]/.test(p), { message: 'Password must contain at least one number' })
  .refine(p => /[^A-Za-z0-9]/.test(p), { message: 'Password must contain at least one special character' });

// Strong, human-readable temporary password that always satisfies
// passwordComplexity (upper + lower + digit + special, 12 chars; ambiguous
// characters omitted). Used when an admin creates a student/teacher without
// supplying a password — the user is forced to change it on first login.
function generateTempPassword(): string {
  const U = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const L = 'abcdefghijkmnpqrstuvwxyz';
  const D = '23456789';
  const S = '!@#$%*?';
  const ALL = U + L + D + S;
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  const chars = [pick(U), pick(L), pick(D), pick(S)];
  while (chars.length < 12) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// Registration number (students): F (Fall) or S (Spring) admission + exactly 10
// alphanumerics = 11 chars total, e.g. F2022123456. Stored uppercased; it also
// becomes the roll number and the login-email local part (lowercased).
const REGNO_RE = /^[FS][A-Z0-9]{10}$/;

const registerSchema = z.object({
  // Students provide a registration number (email is generated from it + the org
  // domain); teachers/others provide an explicit email. One of the two is required.
  email: z.string().email().optional(),
  registrationNumber: z.string().optional(),
  personalEmail: z.string().email().optional(),
  // Optional: when omitted, the server generates a strong temp password and
  // emails the login details to the user's personal email.
  password: passwordComplexity.optional(),
  fullName: z.string().min(2),
  role: z.enum(['system_admin', 'org_admin', 'teacher', 'student']).optional(),
  institutionId: z.string().uuid().optional(),
  rollNumber: z.string().optional(),
  department: z.string().optional(),
  phone: z.string().optional(),
});

// Turn a Zod validation failure into ONE clear, human-readable message for the
// UI (instead of a generic "Validation error" the admin can't act on).
function zodErrorMessage(err: z.ZodError): string {
  const issue = err.errors[0];
  const field = String(issue?.path?.[0] || '');
  switch (field) {
    case 'email': return 'Please enter a valid organization email — letters, numbers and dots only, no spaces.';
    case 'personalEmail': return 'Please enter a valid personal email address.';
    case 'fullName': return 'Full name must be at least 2 characters.';
    case 'password': return issue?.message || 'Password does not meet the requirements.';
    default: return issue?.message || 'Some details are invalid. Please check the form and try again.';
  }
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: passwordComplexity,
});

function generateTokens(payload: { id: string; email: string; role: string; institutionId: string | null }) {
  const accessToken = jwt.sign(
    { ...payload, type: 'access' },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as any },
  );
  const refreshToken = jwt.sign(
    { ...payload, type: 'refresh' },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn as any },
  );
  return { accessToken, refreshToken };
}

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Creates a new user account. Requires authentication and system_admin or org_admin role. System admins can create any role and must specify institutionId. Org admins can only create teachers and students within their own institution.
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - fullName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@university.edu
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: SecurePass123
 *               fullName:
 *                 type: string
 *                 minLength: 2
 *                 example: John Doe
 *               role:
 *                 type: string
 *                 enum: [system_admin, org_admin, teacher, student]
 *                 example: student
 *               institutionId:
 *                 type: string
 *                 format: uuid
 *                 example: 550e8400-e29b-41d4-a716-446655440000
 *               rollNumber:
 *                 type: string
 *                 example: CS-2024-042
 *               department:
 *                 type: string
 *                 example: Computer Science
 *     responses:
 *       '201':
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User created successfully
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     email:
 *                       type: string
 *                       format: email
 *                     full_name:
 *                       type: string
 *                     role:
 *                       type: string
 *                     institution_id:
 *                       type: string
 *                       format: uuid
 *                     is_active:
 *                       type: boolean
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *       '400':
 *         description: Validation error or missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Validation error
 *                 details:
 *                   type: array
 *                   items:
 *                     type: object
 *       '401':
 *         description: Unauthorized - missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '403':
 *         description: Forbidden - insufficient role permissions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: You cannot create users with role 'system_admin'
 *       '409':
 *         description: Conflict - email already exists in institution
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Email already exists in this institution
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/register', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const body = registerSchema.parse(req.body);
    const creatorRole = req.user!.role;
    const institutionId = creatorRole === 'system_admin' ? body.institutionId : req.user!.institutionId;

    if (!institutionId) {
      return res.status(400).json({ error: 'Institution ID is required' });
    }

    if (creatorRole === 'system_admin' && !body.role) {
      return res.status(400).json({ error: 'Role is required when creating users as system admin' });
    }

    const allowedRoles = creatorRole === 'system_admin'
      ? ['system_admin', 'org_admin', 'teacher', 'student']
      : creatorRole === 'org_admin'
        ? ['teacher', 'student']
        : [];
    const role = body.role || 'student';
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: `You cannot create users with role '${role}'` });
    }

    // Students' login email is auto-generated (<regno>@<org-domain>) and is not a
    // real inbox, so a personal email is required to deliver their login details.
    if (role === 'student' && !(body.personalEmail || '').trim()) {
      return res.status(400).json({ error: 'A personal email is required for students so they can receive their login details.' });
    }

    // Resolve the official login email. With a registration number it is
    // generated server-side as <regnum>@<org-domain> (the client cannot inject
    // an arbitrary login email); otherwise fall back to an explicit email.
    let loginEmail: string;
    let registrationNumber: string | null = null;
    const rawReg = (body.registrationNumber || '').trim();
    if (rawReg) {
      const reg = rawReg.toUpperCase();
      if (!REGNO_RE.test(reg)) {
        return res.status(400).json({ error: 'Registration number must be 11 characters: F (Fall) or S (Spring) followed by 10 letters/digits, e.g. F2022123456' });
      }
      const instRow = await query('SELECT domain FROM institutions WHERE id = $1', [institutionId]);
      const domain = String(instRow.rows[0]?.domain || '').trim().toLowerCase();
      if (!domain) {
        return res.status(400).json({ error: "This organization's email domain is not configured. A system admin must set it before registration numbers can be used." });
      }
      registrationNumber = reg;
      loginEmail = `${reg.toLowerCase()}@${domain}`;
      // Registration number must be unique within the organization.
      const dupReg = await query(
        'SELECT 1 FROM users WHERE institution_id = $1 AND upper(registration_number) = $2',
        [institutionId, reg],
      );
      if (dupReg.rows.length > 0) {
        return res.status(409).json({ error: `Registration number ${reg} already exists in this organization` });
      }
    } else if (body.email) {
      loginEmail = body.email.trim().toLowerCase();
    } else {
      return res.status(400).json({ error: 'A registration number or an email address is required' });
    }

    // Login email must be unique across the whole system (domains are org-specific).
    const existing = await query('SELECT 1 FROM users WHERE lower(email) = $1', [loginEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'That login email is already in use' });
    }

    // Plan limit enforcement — the institution's own max_* columns are authoritative
    // (a plan assignment copies its limits there; a system admin can override per-org).
    if (role === 'student' || role === 'teacher') {
      const instRow = await query(
        `SELECT max_students, max_teachers FROM institutions WHERE id = $1`,
        [institutionId],
      );
      if (instRow.rows.length > 0) {
        const inst = instRow.rows[0];
        const maxStudents = inst.max_students;
        const maxTeachers = inst.max_teachers;
        if (role === 'student' && maxStudents) {
          const countRow = await query(
            `SELECT COUNT(*) FROM users WHERE institution_id = $1 AND role = 'student' AND is_active = true`,
            [institutionId],
          );
          if (parseInt(countRow.rows[0].count) >= maxStudents) {
            return res.status(403).json({ error: `Student limit reached (${maxStudents}). Upgrade your plan.` });
          }
        }
        if (role === 'teacher' && maxTeachers) {
          const countRow = await query(
            `SELECT COUNT(*) FROM users WHERE institution_id = $1 AND role = 'teacher' AND is_active = true`,
            [institutionId],
          );
          if (parseInt(countRow.rows[0].count) >= maxTeachers) {
            return res.status(403).json({ error: `Teacher limit reached (${maxTeachers}). Upgrade your plan.` });
          }
        }
      }
    }

    // Auto-generate a strong temp password when the admin doesn't supply one,
    // and force a password change on first login for that case.
    const tempPassword = body.password || generateTempPassword();
    const autoGenerated = !body.password;
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    // Students: the registration number doubles as the roll number.
    const rollNumber = registrationNumber || body.rollNumber || null;
    // Personal (notification) email: provided value, else default to the login email.
    const personalEmail = (body.personalEmail || '').trim().toLowerCase() || loginEmail;
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, role, institution_id, roll_number, department, phone, registration_number, personal_email, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, email, full_name, role, institution_id, registration_number, roll_number, is_active, created_at`,
      [loginEmail, passwordHash, body.fullName, role, institutionId, rollNumber, body.department || null, body.phone || null, registrationNumber, personalEmail, autoGenerated]
    );

    const user = result.rows[0];

    // Email the login details to the delivery address (the student's personal
    // email, or a teacher's login email if they gave no personal one). Email is
    // best-effort: never fail the creation if SMTP is down — the admin still
    // gets the password back to share manually.
    let emailSent = false;
    if (autoGenerated) {
      try {
        emailSent = await emailService.sendWelcome(personalEmail, loginEmail, tempPassword);
      } catch (e) {
        console.error('Welcome email failed:', e);
      }
    }

    res.status(201).json({
      user,
      loginEmail,
      // Returned ONLY for admin-generated passwords so the admin can hand it
      // over / re-share if the email didn't arrive. Not persisted in plaintext.
      tempPassword: autoGenerated ? tempPassword : undefined,
      emailSent,
      deliveryEmail: autoGenerated ? personalEmail : undefined,
      message: 'User created successfully',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: zodErrorMessage(error), details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

const bulkRegisterSchema = z.object({
  role: z.enum(['teacher', 'student']),
  defaultPassword: passwordComplexity,
  institutionId: z.string().uuid().optional(),
  // Per-row fields are intentionally loose strings: row-level format problems
  // (bad email, missing name) must be reported in `failed[]`, not reject the
  // whole batch via a schema error.
  users: z.array(z.object({
    fullName: z.string(),
    email: z.string(),
    rollNumber: z.string().optional(),
    department: z.string().optional(),
    phone: z.string().optional(),
    password: z.string().optional(),
  })).min(1).max(1000),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @openapi
 * /auth/register/bulk:
 *   post:
 *     summary: Bulk-create users from an imported roster
 *     description: >
 *       Creates many teacher or student accounts in one request (org_admin / system_admin only).
 *       Each row is validated independently: invalid, duplicate, or over-limit rows are reported in
 *       `failed` while valid rows are still created. Imported users are flagged must_change_password.
 *       Rows without their own password use the request's defaultPassword.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '201':
 *         description: Import processed (see summary for per-row outcome)
 */
router.post('/register/bulk', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const body = bulkRegisterSchema.parse(req.body);
    const creatorRole = req.user!.role;
    const institutionId = creatorRole === 'system_admin' ? body.institutionId : req.user!.institutionId;
    if (!institutionId) {
      return res.status(400).json({ error: 'Institution ID is required' });
    }

    const role = body.role;

    // Existing emails in this institution (case-insensitive) — avoids one query per row.
    const existingRows = await query('SELECT lower(email) AS email FROM users WHERE institution_id = $1', [institutionId]);
    const existingEmails = new Set<string>(existingRows.rows.map((r: any) => r.email));

    // Remaining plan capacity for this role.
    let remainingSlots = Number.POSITIVE_INFINITY;
    const instRow = await query(
      `SELECT max_students, max_teachers FROM institutions WHERE id = $1`,
      [institutionId],
    );
    if (instRow.rows.length > 0) {
      const inst = instRow.rows[0];
      const max = role === 'student' ? inst.max_students : inst.max_teachers;
      if (max) {
        const countRow = await query(
          `SELECT COUNT(*) FROM users WHERE institution_id = $1 AND role = $2 AND is_active = true`,
          [institutionId, role],
        );
        remainingSlots = Math.max(0, max - parseInt(countRow.rows[0].count));
      }
    }

    // Hash the shared default password once (rows with a custom password are hashed individually).
    const defaultHash = await bcrypt.hash(body.defaultPassword, 12);

    const created: any[] = [];
    const failed: { row: number; email?: string; error: string }[] = [];
    const seenInFile = new Set<string>();

    for (let i = 0; i < body.users.length; i++) {
      const u = body.users[i];
      const rowNum = i + 1;
      const emailLc = (u.email || '').trim().toLowerCase();

      if (!u.fullName || u.fullName.trim().length < 2) {
        failed.push({ row: rowNum, email: u.email, error: 'Full name is required (min 2 characters)' });
        continue;
      }
      if (!EMAIL_RE.test(emailLc)) {
        failed.push({ row: rowNum, email: u.email, error: 'Invalid email address' });
        continue;
      }
      if (role === 'student' && (!u.rollNumber || !u.rollNumber.trim())) {
        failed.push({ row: rowNum, email: u.email, error: 'Roll number is required for students' });
        continue;
      }
      if (seenInFile.has(emailLc)) {
        failed.push({ row: rowNum, email: u.email, error: 'Duplicate email within file' });
        continue;
      }
      if (existingEmails.has(emailLc)) {
        failed.push({ row: rowNum, email: u.email, error: 'Email already exists in this institution' });
        continue;
      }

      let passwordHash = defaultHash;
      if (u.password && u.password.trim()) {
        const pw = passwordComplexity.safeParse(u.password);
        if (!pw.success) {
          failed.push({ row: rowNum, email: u.email, error: 'Password must be 8+ chars with an uppercase letter, a number, and a special character' });
          continue;
        }
        passwordHash = await bcrypt.hash(u.password, 12);
      }

      if (created.length >= remainingSlots) {
        failed.push({ row: rowNum, email: u.email, error: 'Plan limit reached — upgrade to add more' });
        continue;
      }

      try {
        const result = await query(
          `INSERT INTO users (email, password_hash, full_name, role, institution_id, roll_number, department, phone, must_change_password, personal_email)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $1)
           RETURNING id, email, full_name, role`,
          [emailLc, passwordHash, u.fullName.trim(), role, institutionId, u.rollNumber?.trim() || null, u.department?.trim() || null, u.phone?.trim() || null],
        );
        seenInFile.add(emailLc);
        existingEmails.add(emailLc);
        created.push(result.rows[0]);
      } catch {
        failed.push({ row: rowNum, email: u.email, error: 'Could not be created (database error)' });
      }
    }

    return res.status(201).json({
      summary: { total: body.users.length, created: created.length, failed: failed.length },
      created,
      failed,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to import users' });
  }
});

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Login user
 *     description: Authenticates a user with email and password. Returns access and refresh tokens along with user profile data. Creates an audit log entry for the login event.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@university.edu
 *               password:
 *                 type: string
 *                 example: SecurePass123
 *     responses:
 *       '200':
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     email:
 *                       type: string
 *                       format: email
 *                     fullName:
 *                       type: string
 *                     role:
 *                       type: string
 *                     institutionId:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                 accessToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 refreshToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       '400':
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Validation error
 *                 details:
 *                   type: array
 *                   items:
 *                     type: object
 *       '401':
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Invalid credentials
 *       '403':
 *         description: Account is deactivated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Account is deactivated
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Login failed
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const clientIp = (req.ip || req.socket.remoteAddress || 'unknown') as string;
    if (!(await checkLoginRateLimit(clientIp))) {
      return res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
    }

    const body = loginSchema.parse(req.body);

    const result = await query(
      `SELECT id, email, personal_email, full_name, role, institution_id, password_hash, is_active, must_change_password
       FROM users WHERE email = $1
       ORDER BY CASE WHEN institution_id IS NULL THEN 0 ELSE 1 END`,
      [body.email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // When same email exists in multiple institutions, find the one that matches the password
    let user: any = null;
    for (const row of result.rows) {
      if (await bcrypt.compare(body.password, row.password_hash)) {
        user = row;
        break;
      }
    }
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await resetLoginAttempts(clientIp);

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      role: user.role,
      institutionId: user.institution_id,
    });

    await query(
      `INSERT INTO audit_logs (institution_id, user_id, action, entity_type, entity_id, ip_address, user_agent)
       VALUES ($1, $2, 'login', 'user', $3, $4, $5)`,
      [user.institution_id, user.id, user.id, req.ip, req.headers['user-agent'] || null]
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        personalEmail: user.personal_email,
        fullName: user.full_name,
        role: user.role,
        institutionId: user.institution_id,
        mustChangePassword: user.must_change_password,
      },
      ...tokens,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     description: Generates a new access token and refresh token pair using the current valid token. Requires authentication via a valid (non-expired) token.
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Tokens refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 refreshToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       '401':
 *         description: Unauthorized - missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/refresh', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Refresh token required' });
  }
  const token = authHeader.split(' ')[1];
  let decoded: any;
  try {
    decoded = jwt.verify(token, config.jwt.refreshSecret);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
  if (decoded.type !== 'refresh') {
    return res.status(401).json({ error: 'A refresh token is required for this endpoint' });
  }
  const tokens = generateTokens({
    id: decoded.id,
    email: decoded.email,
    role: decoded.role,
    institutionId: decoded.institutionId,
  });
  res.json(tokens);
});

/**
 * @openapi
 * /auth/change-password:
 *   post:
 *     summary: Change password
 *     description: Changes the authenticated user's password. The current password must be verified before setting the new password. The new password must be at least 8 characters long.
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: OldSecurePass123
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 example: NewSecurePass456
 *     responses:
 *       '200':
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password changed successfully
 *       '400':
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Validation error
 *                 details:
 *                   type: array
 *                   items:
 *                     type: object
 *       '401':
 *         description: Current password is incorrect or missing auth token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Current password is incorrect
 *       '404':
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: User not found
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to change password
 */
router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const body = changePasswordSchema.parse(req.body);

    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValid = await bcrypt.compare(body.currentPassword, result.rows[0].password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(body.newPassword, 12);
    await query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [newHash, req.user!.id]);

    res.json({ message: 'Password changed successfully' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      // Surface the specific rule (e.g. "must contain at least one uppercase letter")
      // instead of a generic message, so the client can show it directly.
      return res.status(400).json({ error: error.errors[0]?.message || 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to change password' });
  }
});

/**
 * @openapi
 * /auth/dismiss-password-change:
 *   post:
 *     summary: Keep the current (temporary) password and stop prompting
 *     description: Clears the must_change_password flag without changing the password — used when a user chooses "skip" on the first-login change-password prompt.
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: Acknowledged }
 */
router.post('/dismiss-password-change', authenticate, async (req: AuthRequest, res: Response) => {
  await query('UPDATE users SET must_change_password = false WHERE id = $1', [req.user!.id]);
  res.json({ message: 'You can change your password anytime from your profile.' });
});

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Get current user profile
 *     description: Retrieves the full profile of the currently authenticated user, including personal details, institution info, and account metadata.
 *     tags:
 *       - Auth
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     email:
 *                       type: string
 *                       format: email
 *                     fullName:
 *                       type: string
 *                       example: John Doe
 *                     role:
 *                       type: string
 *                       enum: [system_admin, org_admin, teacher, student]
 *                     institutionId:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                     phone:
 *                       type: string
 *                       nullable: true
 *                     avatarUrl:
 *                       type: string
 *                       nullable: true
 *                     rollNumber:
 *                       type: string
 *                       nullable: true
 *                     department:
 *                       type: string
 *                       nullable: true
 *                     isActive:
 *                       type: boolean
 *                     lastLogin:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       '401':
 *         description: Unauthorized - missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '404':
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: User not found
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const result = await query(
    `SELECT id, email, personal_email, full_name, role, institution_id, phone, avatar_url, roll_number, registration_number, department, is_active, last_login, created_at, must_change_password
     FROM users WHERE id = $1`,
    [req.user!.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  const row = result.rows[0];
  res.json({
    user: {
      id: row.id,
      email: row.email,
      personalEmail: row.personal_email,
      fullName: row.full_name,
      role: row.role,
      institutionId: row.institution_id,
      registrationNumber: row.registration_number,
      phone: row.phone,
      avatarUrl: row.avatar_url,
      rollNumber: row.roll_number,
      department: row.department,
      isActive: row.is_active,
      lastLogin: row.last_login,
      createdAt: row.created_at,
      mustChangePassword: row.must_change_password,
    },
  });
});

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Logout user
 *     description: Logs out the authenticated user by recording a logout audit log entry. The client should discard the tokens on its side.
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 *       '401':
 *         description: Unauthorized - missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
  await query('UPDATE users SET last_logout_at = NOW() WHERE id = $1', [req.user!.id]);
  await query(
    `INSERT INTO audit_logs (institution_id, user_id, action, entity_type, entity_id, ip_address)
     VALUES ($1, $2, 'logout', 'user', $3, $4)`,
    [req.user!.institutionId, req.user!.id, req.user!.id, req.ip]
  );
  res.json({ message: 'Logged out successfully' });
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     description: Initiates a password reset flow by generating a reset token and sending a reset link to the user's email. Always returns the same success message regardless of whether the email exists, to prevent email enumeration. The reset token expires after 1 hour.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@university.edu
 *     responses:
 *       '200':
 *         description: Reset request processed (always returns same message)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: If an account with that email exists, a reset link has been sent.
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to process request
 */
router.post('/forgot-password', async (req: Request, res: Response) => {
  // Same response in every branch — never reveal whether an account exists.
  const genericMsg = { message: 'If an account with that email exists, a reset link has been sent.' };
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const lookup = email.trim().toLowerCase();

    // Recovery works with EITHER the organization (login) email or the personal
    // email, so users who only remember one can still get back in.
    const result = await query(
      `SELECT id, email, personal_email FROM users
        WHERE is_active = true AND (lower(email) = $1 OR lower(personal_email) = $1)`,
      [lookup],
    );
    if (result.rows.length === 0) return res.json(genericMsg);

    const crypto = await import('crypto');
    const { emailService } = await import('../../services/email.js');
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    for (const user of result.rows) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 3600000);

      await query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);
      await query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt],
      );

      // Deliver to the personal (notification) address, falling back to the org email.
      const dest = user.personal_email || user.email;
      try {
        await emailService.sendPasswordReset(dest, token, `${frontendUrl}/reset-password?token=${token}`);
      } catch {}
    }

    res.json(genericMsg);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      // A malformed email is still answered generically (no enumeration signal).
      return res.json(genericMsg);
    }
    res.status(500).json({ error: 'Failed to process request' });
  }
});

const resetPasswordSchema = z.object({
  token: z.string(),
  newPassword: passwordComplexity,
});

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     summary: Reset password with token
 *     description: Resets a user's password using a valid reset token received via email. The token must not be expired or already used. The new password must be at least 8 characters long. After successful reset, the token is marked as used.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *                 example: a1b2c3d4e5f6...
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 example: NewSecurePass789
 *     responses:
 *       '200':
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password reset successfully
 *       '400':
 *         description: Invalid or expired reset token, or validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Invalid or expired reset token
 *                 details:
 *                   type: array
 *                   items:
 *                     type: object
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to reset password
 */
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    const crypto = await import('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const result = await query(
      'SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > NOW() AND used_at IS NULL',
      [tokenHash],
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const userId = result.rows[0].user_id;
    const hash = await bcrypt.hash(newPassword, 12);

    await query('UPDATE users SET password_hash = $1, last_logout_at = NOW() WHERE id = $2', [hash, userId]);
    await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1', [tokenHash]);

    res.json({ message: 'Password reset successfully' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Name must be at least 2 characters').optional(),
  // Personal (notification) email — the user's own address, NOT the login email.
  personalEmail: z.string().trim().email('Enter a valid email address').optional().or(z.literal('')),
  department: z.string().trim().max(120).optional(),
});

/**
 * Self-service profile update. A user may change only their display name,
 * personal (notification) email, and department. The ORGANIZATION email (login
 * identifier) and phone number are deliberately NOT editable here — they are
 * locked and can only be changed by an admin via PUT /users/:id.
 */
/**
 * @openapi
 * /auth/profile:
 *   put:
 *     summary: Update your own profile
 *     description: Update the authenticated user's editable profile fields. Locked identity fields (login email, phone, role, registration/roll number) are NOT editable here. Omitted or empty fields are left unchanged.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName: { type: string }
 *               personalEmail:
 *                 type: string
 *                 format: email
 *                 description: Notification/recovery email — distinct from the locked login email
 *               department: { type: string }
 *     responses:
 *       200:
 *         description: Updated user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 email: { type: string }
 *                 personal_email: { type: string, nullable: true }
 *                 full_name: { type: string }
 *                 role: { type: string }
 *                 institution_id: { type: string, format: uuid, nullable: true }
 *                 phone: { type: string, nullable: true }
 *                 department: { type: string, nullable: true }
 *                 roll_number: { type: string, nullable: true }
 *                 is_active: { type: boolean }
 *       400:
 *         description: Validation error
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       404:
 *         description: User not found
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.put('/profile', authenticate, async (req: AuthRequest, res) => {
  try {
    const body = updateProfileSchema.parse(req.body);
    // Empty string means "leave unchanged" (COALESCE keeps the existing value).
    const personalEmail = body.personalEmail && body.personalEmail.trim()
      ? body.personalEmail.trim().toLowerCase()
      : null;
    const result = await query(
      `UPDATE users SET
         full_name      = COALESCE($1, full_name),
         personal_email = COALESCE($2, personal_email),
         department     = COALESCE($3, department)
       WHERE id = $4
       RETURNING id, email, personal_email, full_name, role, institution_id, phone, department, roll_number, is_active`,
      [body.fullName || null, personalEmail, body.department || null, req.user!.id],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export const authRouter = router;
