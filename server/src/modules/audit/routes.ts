import { Router } from 'express';
import { authenticate, requireRoles, AuthRequest } from '../../middleware/auth.js';
import { query } from '../../config/database.js';

const router = Router();

/**
 * @openapi
 * /audit:
 *   get:
 *     summary: List audit logs
 *     description: Retrieve audit log entries scoped to the user's institution (org_admin) or all entries (system_admin). Supports filtering by userId and action. Returns up to 200 most recent entries.
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by user ID
 *         example: "admin-001-uuid"
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action type
 *         example: "user.login"
 *     responses:
 *       200:
 *         description: List of audit log entries
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
 *                         example: "audit-001-uuid"
 *                       institution_id:
 *                         type: string
 *                         format: uuid
 *                         example: "inst-001-uuid"
 *                       user_id:
 *                         type: string
 *                         format: uuid
 *                         example: "admin-001-uuid"
 *                       action:
 *                         type: string
 *                         example: "user.login"
 *                       resource_type:
 *                         type: string
 *                         example: "session"
 *                       resource_id:
 *                         type: string
 *                         example: "session-001-uuid"
 *                       details:
 *                         type: object
 *                       ip_address:
 *                         type: string
 *                         example: "192.168.1.100"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-05-22T10:30:00Z"
 *                 total:
 *                   type: integer
 *                   example: 150
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 200
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
router.get('/', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res) => {
  // Build the WHERE once and reuse it for both the count and the page query.
  // Columns are qualified with `al.` because `institution_id` also exists on users.
  let where = ' WHERE 1=1';
  const params: any[] = [];
  let idx = 1;

  if (req.user!.institutionId) {
    where += ` AND al.institution_id = $${idx++}`;
    params.push(req.user!.institutionId);
  }
  if (req.query.userId) { where += ` AND al.user_id = $${idx++}`; params.push(req.query.userId); }
  if (req.query.action) { where += ` AND al.action = $${idx++}`; params.push(req.query.action); }

  const page = Math.max(1, parseInt(req.query.page as string || '1'));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string || '50')));
  const offset = (page - 1) * limit;

  // Count the table directly — NOT through the users join. The join is only needed
  // for the display columns on the returned page; counting through it re-scanned the
  // whole filtered set on an ever-growing table and made this endpoint time out.
  // The idx_audit_inst_created index (migration 020) serves the filter + sort + limit.
  const countResult = await query(`SELECT COUNT(*) AS count FROM audit_logs al${where}`, params);
  const total = parseInt(countResult.rows[0].count);

  const result = await query(
    `SELECT al.*, u.full_name as user_name, u.email as user_email, u.role as user_role
       FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id${where}
       ORDER BY al.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset],
  );
  res.json({ data: result.rows, total, page, limit, hasMore: page * limit < total });
});

export const auditRouter = router;
