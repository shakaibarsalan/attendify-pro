import { Router } from 'express';
import { authenticate, requireRoles, AuthRequest } from '../../middleware/auth.js';
import { query } from '../../config/database.js';

const router = Router();

/**
 * @openapi
 * /departments:
 *   get:
 *     summary: List departments
 *     description: Returns departments for an institution. System admins must pass institutionId as a query parameter; org admins/teachers/students see their own institution's departments.
 *     tags: [Departments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: institutionId
 *         in: query
 *         schema: { type: string, format: uuid }
 *         description: Required for system_admin only
 *     responses:
 *       200:
 *         description: List of departments
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
 *                       institution_id: { type: string, format: uuid }
 *                       name: { type: string }
 *                       code: { type: string }
 *                       is_active: { type: boolean }
 *                       head_name: { type: string, nullable: true }
 *                       created_at: { type: string, format: date-time }
 *                       updated_at: { type: string, format: date-time }
 *                 total: { type: integer }
 *       400:
 *         description: institutionId required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  const institutionId = req.user!.role === 'system_admin'
    ? (req.query.institutionId as string)
    : req.user!.institutionId;
  if (!institutionId) return res.status(400).json({ error: 'institutionId required' });

  const result = await query(
    `SELECT d.id, d.institution_id, d.name, d.code, d.is_active, d.created_at, d.updated_at,
            u.full_name AS head_name
     FROM departments d
     LEFT JOIN users u ON d.head_id = u.id
     WHERE d.institution_id = $1
     ORDER BY d.name`,
    [institutionId],
  );
  res.json({ data: result.rows, total: result.rows.length });
});

/**
 * @openapi
 * /departments:
 *   post:
 *     summary: Create a department
 *     description: Creates a new department within an institution. Org admins create within their own institution; system admins must specify institutionId.
 *     tags: [Departments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code]
 *             properties:
 *               name: { type: string, example: "Computer Science" }
 *               code: { type: string, example: "CS" }
 *               headId: { type: string, format: uuid, nullable: true }
 *               institutionId: { type: string, format: uuid, description: "Required for system_admin only" }
 *     responses:
 *       201:
 *         description: Department created
 *       400:
 *         description: name and code required, or institutionId required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: Department code already exists in this institution
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res) => {
  const { name, code, headId } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'name and code required' });

  const institutionId = req.user!.role === 'system_admin' ? req.body.institutionId : req.user!.institutionId;
  if (!institutionId) return res.status(400).json({ error: 'institutionId required' });

  const dup = await query('SELECT id FROM departments WHERE institution_id = $1 AND code = $2', [institutionId, code]);
  if (dup.rows.length > 0) return res.status(409).json({ error: 'Department code already exists in this institution' });

  const result = await query(
    `INSERT INTO departments (institution_id, name, code, head_id) VALUES ($1, $2, $3, $4) RETURNING *`,
    [institutionId, name, code, headId || null],
  );
  res.status(201).json(result.rows[0]);
});

/**
 * @openapi
 * /departments/{id}:
 *   put:
 *     summary: Update a department
 *     description: Updates department fields. Org admins may only update departments within their own institution.
 *     tags: [Departments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               code: { type: string }
 *               headId: { type: string, format: uuid, nullable: true }
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated department
 *       403:
 *         description: Forbidden — department belongs to another institution
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Department not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.put('/:id', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res) => {
  const { name, code, headId, isActive } = req.body;
  const existing = await query('SELECT id, institution_id FROM departments WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'Department not found' });

  if (req.user!.role === 'org_admin' && existing.rows[0].institution_id !== req.user!.institutionId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const result = await query(
    `UPDATE departments
     SET name = COALESCE($1, name),
         code = COALESCE($2, code),
         head_id = COALESCE($3, head_id),
         is_active = COALESCE($4, is_active)
     WHERE id = $5 RETURNING *`,
    [name || null, code || null, headId || null, isActive !== undefined ? isActive : null, req.params.id],
  );
  res.json(result.rows[0]);
});

/**
 * @openapi
 * /departments/{id}:
 *   delete:
 *     summary: Delete a department
 *     description: Permanently deletes a department. Org admins may only delete departments within their own institution.
 *     tags: [Departments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Department deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Department deleted" }
 *       403:
 *         description: Forbidden — department belongs to another institution
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Department not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.delete('/:id', authenticate, requireRoles('system_admin', 'org_admin'), async (req: AuthRequest, res) => {
  const existing = await query('SELECT id, institution_id FROM departments WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'Department not found' });

  if (req.user!.role === 'org_admin' && existing.rows[0].institution_id !== req.user!.institutionId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await query('DELETE FROM departments WHERE id = $1', [req.params.id]);
  res.json({ message: 'Department deleted' });
});

export const departmentRouter = router;
