import { Router } from 'express';
import { authenticate, AuthRequest } from '../../middleware/auth.js';
import { query } from '../../config/database.js';

const router = Router();

/**
 * @openapi
 * /notifications:
 *   get:
 *     summary: List notifications
 *     description: Retrieve the authenticated user's notifications ordered by creation date. Supports filtering by type and read status. Returns the most recent 50 notifications.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by notification type
 *         example: "session"
 *       - in: query
 *         name: isRead
 *         schema:
 *           type: boolean
 *         description: Filter by read status
 *         example: false
 *     responses:
 *       200:
 *         description: List of notifications
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
 *                         example: "notif-001-uuid"
 *                       institution_id:
 *                         type: string
 *                         format: uuid
 *                         example: "inst-001-uuid"
 *                       user_id:
 *                         type: string
 *                         format: uuid
 *                         example: "student-001-uuid"
 *                       title:
 *                         type: string
 *                         example: "Class Session Started"
 *                       message:
 *                         type: string
 *                         example: "Your class is now in session. You can mark attendance."
 *                       type:
 *                         type: string
 *                         example: "session"
 *                       is_read:
 *                         type: boolean
 *                         example: false
 *                       action_url:
 *                         type: string
 *                         example: "/student/dashboard"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-05-22T09:00:00Z"
 *                 total:
 *                   type: integer
 *                   example: 5
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
  let sql = 'SELECT * FROM notifications WHERE user_id = $1';
  const params: unknown[] = [req.user!.id];
  let idx = 2;

  const { type, isRead } = req.query;
  if (type) {
    sql += ` AND type = $${idx++}`;
    params.push(type);
  }
  if (isRead !== undefined) {
    sql += ` AND is_read = $${idx++}`;
    params.push(isRead === 'true');
  }

  sql += ' ORDER BY created_at DESC LIMIT 50';

  const result = await query(sql, params);
  res.json({ data: result.rows, total: result.rows.length });
});

/**
 * @openapi
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark notification as read
 *     description: Mark a specific notification as read for the authenticated user.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Notification ID
 *         example: "notif-001-uuid"
 *     responses:
 *       200:
 *         description: Notification marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: "notif-001-uuid"
 *                 title:
 *                   type: string
 *                   example: "Class Session Started"
 *                 is_read:
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
 *       404:
 *         description: Notification not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Notification not found"
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
router.patch('/:id/read', authenticate, async (req: AuthRequest, res) => {
  const result = await query(
    `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *`,
    [req.params.id, req.user!.id],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Notification not found' });
  }
  res.json(result.rows[0]);
});

/**
 * @openapi
 * /notifications/read-all:
 *   post:
 *     summary: Mark all notifications as read
 *     description: Mark all unread notifications as read for the authenticated user.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
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
router.post('/read-all', authenticate, async (req: AuthRequest, res) => {
  await query(
    `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
    [req.user!.id],
  );
  res.json({ success: true });
});

export const notificationRouter = router;

export async function createNotification(params: {
  institutionId: string | null;
  userId: string;
  title: string;
  message: string;
  type: string;
  actionUrl?: string;
}) {
  const result = await query(
    `INSERT INTO notifications (institution_id, user_id, title, message, type, action_url)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [params.institutionId, params.userId, params.title, params.message, params.type, params.actionUrl || null],
  );

  try {
    const { emitToStudent } = await import('../../realtime/index.js');
    emitToStudent(params.userId, 'notification:new', result.rows[0]);
  } catch {
    // realtime not initialized
  }

  return result.rows[0];
}
