import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../../config/database.js';
import { authenticate, requireRoles, AuthRequest } from '../../middleware/auth.js';

const router = Router();

const createSchema = z.object({
  subject: z.string().trim().min(2).max(200),
  category: z.enum(['attendance', 'technical', 'account', 'other']).default('other'),
  message: z.string().trim().min(2).max(4000),
  aboutUserId: z.string().uuid().nullish(),
});

const respondSchema = z.object({
  adminResponse: z.string().max(4000).optional(),
  status: z.enum(['open', 'resolved']).optional(),
});

function mapRow(r: any) {
  return {
    id: r.id,
    subject: r.subject,
    category: r.category,
    message: r.message,
    status: r.status,
    aboutUserId: r.about_user_id,
    aboutUserName: r.about_user_name || null,
    aboutUserRole: r.about_user_role || null,
    createdById: r.created_by,
    createdByName: r.created_by_name || null,
    createdByRole: r.created_by_role || null,
    adminResponse: r.admin_response,
    respondedByName: r.responded_by_name || null,
    respondedAt: r.responded_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * GET /queries/directory
 * Institute directory for the optional "About (reference)" picker. Any
 * authenticated user can see names + roles within their OWN institution only.
 */
router.get('/directory', authenticate, async (req: AuthRequest, res: Response) => {
  const instId = req.user!.institutionId;
  if (!instId) return res.json([]);
  const r = await query(
    `SELECT id, full_name, role FROM users
     WHERE institution_id = $1 AND is_active = true AND id <> $2
     ORDER BY role, full_name`,
    [instId, req.user!.id],
  );
  res.json(r.rows.map((u: any) => ({ id: u.id, fullName: u.full_name, role: u.role })));
});

/**
 * POST /queries  (student | teacher)
 * Submit a query to the org admin, optionally referencing another institute user.
 */
router.post('/', authenticate, requireRoles('student', 'teacher'), async (req: AuthRequest, res: Response) => {
  try {
    const body = createSchema.parse(req.body);
    const instId = req.user!.institutionId;
    if (!instId) return res.status(400).json({ error: 'Your account has no institution.' });

    // The referenced user, if any, must belong to the same institution.
    let aboutId: string | null = body.aboutUserId || null;
    if (aboutId) {
      const ok = await query('SELECT 1 FROM users WHERE id = $1 AND institution_id = $2', [aboutId, instId]);
      if (ok.rows.length === 0) aboutId = null;
    }

    const r = await query(
      `INSERT INTO support_queries (institution_id, created_by, subject, category, message, about_user_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [instId, req.user!.id, body.subject, body.category, body.message, aboutId],
    );
    res.status(201).json({ id: r.rows[0].id, message: 'Query submitted' });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation error', details: e.errors });
    console.error('create query error:', e);
    res.status(500).json({ error: 'Failed to submit query' });
  }
});

/**
 * GET /queries
 * org_admin / system_admin -> all queries in their institution.
 * student / teacher        -> only the queries they created.
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const role = req.user!.role;
  const instId = req.user!.institutionId;
  if (!instId) return res.json([]);

  const params: any[] = [instId];
  let where = 'q.institution_id = $1';
  if (role !== 'org_admin' && role !== 'system_admin') {
    params.push(req.user!.id);
    where += ` AND q.created_by = $${params.length}`;
  }
  const status = typeof req.query.status === 'string' ? req.query.status : null;
  if (status === 'open' || status === 'resolved') {
    params.push(status);
    where += ` AND q.status = $${params.length}`;
  }

  const r = await query(
    `SELECT q.*,
            c.full_name AS created_by_name, c.role AS created_by_role,
            a.full_name AS about_user_name,  a.role AS about_user_role,
            rb.full_name AS responded_by_name
     FROM support_queries q
     JOIN users c ON c.id = q.created_by
     LEFT JOIN users a  ON a.id  = q.about_user_id
     LEFT JOIN users rb ON rb.id = q.responded_by
     WHERE ${where}
     ORDER BY (q.status = 'open') DESC, q.created_at DESC
     LIMIT 200`,
    params,
  );
  res.json(r.rows.map(mapRow));
});

/**
 * PATCH /queries/:id  (org_admin | system_admin)
 * Add/replace the admin reply and/or change status (open <-> resolved).
 */
router.patch('/:id', authenticate, requireRoles('org_admin', 'system_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const body = respondSchema.parse(req.body);
    const existing = await query('SELECT institution_id FROM support_queries WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Query not found' });
    if (req.user!.role !== 'system_admin' && existing.rows[0].institution_id !== req.user!.institutionId) {
      return res.status(403).json({ error: 'Not your institution' });
    }

    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    if (typeof body.adminResponse === 'string') {
      params.push(body.adminResponse.trim());
      sets.push(`admin_response = $${params.length}`);
      params.push(req.user!.id);
      sets.push(`responded_by = $${params.length}`);
      sets.push('responded_at = NOW()');
    }
    if (body.status) {
      params.push(body.status);
      sets.push(`status = $${params.length}`);
    }
    if (params.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.id);
    await query(`UPDATE support_queries SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    res.json({ message: 'Updated' });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation error', details: e.errors });
    console.error('update query error:', e);
    res.status(500).json({ error: 'Failed to update query' });
  }
});

export const queryRouter = router;
