import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { authenticate, requireRoles, AuthRequest } from '../../middleware/auth.js';
import { query } from '../../config/database.js';
import { sendTestEvent } from '../../services/webhooks.js';

const router = Router();

const KNOWN_EVENTS = ['attendance.marked', 'fraud.alert'];

// An org may only manage webhooks once a system admin has enabled API access.
async function requireApiAccess(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user!.role === 'system_admin') return next();
  const r = await query('SELECT api_access_enabled FROM institutions WHERE id = $1', [req.user!.institutionId]);
  if (r.rows[0]?.api_access_enabled !== true) {
    return res.status(403).json({ error: 'API access is not enabled for your organization. Request it from the API & Integrations page.' });
  }
  next();
}

/**
 * @openapi
 * /webhooks:
 *   get:
 *     summary: List webhooks
 *     description: Returns the institution's registered webhook endpoints (secrets are not included).
 *     tags: [Webhooks]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of webhooks }
 */
router.get('/', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res) => {
  const instId = req.user!.role === 'system_admin' ? (req.query.institutionId as string) : req.user!.institutionId;
  if (!instId) return res.status(400).json({ error: 'institutionId required' });
  const r = await query(
    `SELECT id, url, events, is_active, last_status, last_delivered_at, created_at
       FROM webhooks WHERE institution_id = $1 ORDER BY created_at DESC`,
    [instId],
  );
  res.json({ data: r.rows, knownEvents: KNOWN_EVENTS });
});

/**
 * @openapi
 * /webhooks:
 *   post:
 *     summary: Register a webhook
 *     description: Registers an HTTPS endpoint to receive signed event callbacks. The signing secret is returned once. Requires API access enabled.
 *     tags: [Webhooks]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url: { type: string, example: "https://erp.example.edu/hooks/attendify" }
 *               events: { type: array, items: { type: string }, example: ["attendance.marked"] }
 *     responses:
 *       201: { description: Webhook created (secret shown once) }
 *       400: { description: Invalid url or events }
 *       403: { description: API access not enabled }
 */
router.post('/', authenticate, requireRoles('system_admin', 'org_admin'), requireApiAccess, async (req: AuthRequest, res) => {
  const { url, events } = req.body;
  if (!url || !/^https?:\/\/.+/.test(String(url))) return res.status(400).json({ error: 'A valid http(s) url is required' });
  const evts = Array.isArray(events) && events.length
    ? events.filter((e: string) => KNOWN_EVENTS.includes(e))
    : ['attendance.marked'];
  if (evts.length === 0) return res.status(400).json({ error: `events must be among: ${KNOWN_EVENTS.join(', ')}` });

  const instId = req.user!.role === 'system_admin' ? req.body.institutionId : req.user!.institutionId;
  if (!instId) return res.status(400).json({ error: 'institutionId required' });

  const secret = `whsec_${crypto.randomBytes(24).toString('base64url')}`;
  const r = await query(
    `INSERT INTO webhooks (institution_id, url, secret, events, created_by)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     RETURNING id, url, events, is_active, created_at`,
    [instId, url, secret, JSON.stringify(evts), req.user!.id],
  );
  res.status(201).json({ ...r.rows[0], secret, warning: 'Store this signing secret securely — it will not be shown again.' });
});

/**
 * @openapi
 * /webhooks/{id}/test:
 *   post:
 *     summary: Send a test event to a webhook
 *     tags: [Webhooks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: "Delivery result { delivered, status }" }
 */
router.post('/:id/test', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res) => {
  const r = await query('SELECT institution_id FROM webhooks WHERE id = $1', [req.params.id]);
  if (r.rows.length === 0) return res.status(404).json({ error: 'Webhook not found' });
  if (req.user!.role === 'org_admin' && r.rows[0].institution_id !== req.user!.institutionId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const result = await sendTestEvent(req.params.id);
  res.json({ ...result, message: result.delivered ? 'Test event delivered.' : `Endpoint returned ${result.status || 'no response'}.` });
});

/**
 * @openapi
 * /webhooks/{id}:
 *   delete:
 *     summary: Delete a webhook
 *     tags: [Webhooks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Deleted }
 *       404: { description: Not found }
 */
router.delete('/:id', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res) => {
  const existing = await query('SELECT institution_id FROM webhooks WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'Webhook not found' });
  if (req.user!.role === 'org_admin' && existing.rows[0].institution_id !== req.user!.institutionId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  await query('DELETE FROM webhooks WHERE id = $1', [req.params.id]);
  res.json({ message: 'Webhook deleted' });
});

export const webhookRouter = router;
