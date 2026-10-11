import { Router } from 'express';
import { authenticate, requireRoles, AuthRequest } from '../../middleware/auth.js';
import { query } from '../../config/database.js';

const router = Router();

/**
 * @openapi
 * /api-keys:
 *   get:
 *     summary: List API keys
 *     description: Returns API keys for an institution (key values are not included). System admins must pass institutionId as a query parameter; org admins see their own institution's keys.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: institutionId
 *         in: query
 *         schema: { type: string, format: uuid }
 *         description: Required for system_admin only
 *     responses:
 *       200:
 *         description: List of API keys
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
 *                       id: { type: string, format: uuid }
 *                       name: { type: string }
 *                       key_prefix: { type: string, example: "ak_aBc123Xy" }
 *                       permissions: { type: array, items: { type: string } }
 *                       rate_limit: { type: integer }
 *                       status: { type: string, enum: [active, revoked] }
 *                       last_used_at: { type: string, format: date-time, nullable: true }
 *                       expires_at: { type: string, format: date-time, nullable: true }
 *                       created_at: { type: string, format: date-time }
 *                 total: { type: integer }
 *       400:
 *         description: institutionId required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res) => {
  const institutionId = req.user!.role === 'system_admin'
    ? (req.query.institutionId as string)
    : req.user!.institutionId;
  if (!institutionId) return res.status(400).json({ error: 'institutionId required' });

  const result = await query(
    `SELECT id, name, key_prefix, permissions, rate_limit, status, last_used_at, expires_at, created_at
     FROM api_keys WHERE institution_id = $1 ORDER BY created_at DESC`,
    [institutionId],
  );
  res.json({ data: result.rows, total: result.rows.length });
});

/**
 * @openapi
 * /api-keys:
 *   post:
 *     summary: Create an API key
 *     description: Generates a new API key for third-party integration. The raw key is returned only once in this response and cannot be retrieved again.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "Reporting integration" }
 *               permissions: { type: array, items: { type: string }, example: ["read"] }
 *               rateLimit: { type: integer, example: 100, description: "Requests per minute" }
 *               expiresAt: { type: string, format: date-time, nullable: true }
 *               institutionId: { type: string, format: uuid, description: "Required for system_admin only" }
 *     responses:
 *       201:
 *         description: API key created — store the key value securely, it is shown only once
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 name: { type: string }
 *                 key_prefix: { type: string }
 *                 key: { type: string, example: "ak_aBc123XyZ..." }
 *                 permissions: { type: array, items: { type: string } }
 *                 rate_limit: { type: integer }
 *                 status: { type: string, example: "active" }
 *                 expires_at: { type: string, format: date-time, nullable: true }
 *                 created_at: { type: string, format: date-time }
 *                 warning: { type: string, example: "Store this key securely — it will not be shown again." }
 *       400:
 *         description: name required, or institutionId required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res) => {
  const { name, permissions, rateLimit, expiresAt } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const institutionId = req.user!.role === 'system_admin' ? req.body.institutionId : req.user!.institutionId;
  if (!institutionId) return res.status(400).json({ error: 'institutionId required' });

  // An org_admin may only mint keys once a system admin has enabled API access
  // for their organization (system_admin may always manage keys).
  if (req.user!.role === 'org_admin') {
    const inst = await query('SELECT api_access_enabled FROM institutions WHERE id = $1', [institutionId]);
    if (inst.rows[0]?.api_access_enabled !== true) {
      return res.status(403).json({ error: 'API access is not enabled for your organization. Request it from the API & Integrations page.' });
    }
  }

  const crypto = await import('crypto');
  const rawKey = `ak_${crypto.randomBytes(24).toString('base64url')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.substring(0, 10);

  const result = await query(
    `INSERT INTO api_keys (institution_id, name, key_hash, key_prefix, permissions, rate_limit, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, name, key_prefix, permissions, rate_limit, status, expires_at, created_at`,
    [
      institutionId, name, keyHash, keyPrefix,
      JSON.stringify(permissions || ['read']),
      rateLimit || 100,
      expiresAt || null,
      req.user!.id,
    ],
  );

  res.status(201).json({ ...result.rows[0], key: rawKey, warning: 'Store this key securely — it will not be shown again.' });
});

/**
 * @openapi
 * /api-keys/{id}:
 *   delete:
 *     summary: Revoke an API key
 *     description: Marks an API key as revoked. Revoked keys can no longer authenticate against the public API. Org admins may only revoke keys within their own institution.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: API key revoked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "API key revoked" }
 *       403:
 *         description: Forbidden — key belongs to another institution
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: API key not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.delete('/:id', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res) => {
  const existing = await query('SELECT id, institution_id FROM api_keys WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'API key not found' });

  if (req.user!.role === 'org_admin' && existing.rows[0].institution_id !== req.user!.institutionId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await query(`UPDATE api_keys SET status = 'revoked', updated_at = NOW() WHERE id = $1`, [req.params.id]);
  res.json({ message: 'API key revoked' });
});

export const apiKeyRouter = router;
