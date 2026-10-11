import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles, AuthRequest } from '../../middleware/auth.js';
import { query } from '../../config/database.js';

const router = Router();

const selectPlanSchema = z.object({
  planId: z.string().min(1),
  billingCycle: z.enum(['monthly', 'yearly']),
});

/**
 * @openapi
 * /plans:
 *   get:
 *     summary: List subscription plans
 *     description: Public endpoint. Returns all active subscription plans ordered by tier.
 *     tags:
 *       - Plans
 *     responses:
 *       '200':
 *         description: List of subscription plans
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
 *                         example: professional
 *                       name:
 *                         type: string
 *                         example: Professional
 *                       description:
 *                         type: string
 *                       max_students:
 *                         type: integer
 *                         example: 2000
 *                       max_teachers:
 *                         type: integer
 *                         example: 100
 *                       max_departments:
 *                         type: integer
 *                         example: 20
 *                       price_monthly:
 *                         type: string
 *                         example: "79.00"
 *                       price_yearly:
 *                         type: string
 *                         example: "790.00"
 *                       features:
 *                         type: array
 *                         items:
 *                           type: string
 *                       is_active:
 *                         type: boolean
 *                       sort_order:
 *                         type: integer
 *       '500':
 *         description: Internal server error
 */
router.get('/', async (_req, res) => {
  try {
    const result = await query(
      'SELECT * FROM subscription_plans WHERE is_active = true ORDER BY sort_order ASC'
    );
    res.json({ data: result.rows });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /plans/current:
 *   get:
 *     summary: Get current institution plan
 *     description: Returns the authenticated user's institution current plan, status, and trial expiry. Requires authentication.
 *     tags:
 *       - Plans
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Current plan info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 plan:
 *                   type: object
 *                   nullable: true
 *                   description: Full plan object if selected, null if on trial
 *                 planStatus:
 *                   type: string
 *                   enum: [trial, active, expired]
 *                   example: trial
 *                 trialEndsAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *       '400':
 *         description: No institution assigned
 *       '401':
 *         description: Unauthorized
 *       '500':
 *         description: Internal server error
 */
router.get('/current', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.institutionId) {
      return res.status(400).json({ error: 'No institution assigned' });
    }

    const instResult = await query(
      'SELECT plan_id, plan_status, trial_ends_at FROM institutions WHERE id = $1',
      [req.user.institutionId]
    );

    if (instResult.rows.length === 0) {
      return res.status(404).json({ error: 'Institution not found' });
    }

    const institution = instResult.rows[0];

    let plan = null;
    if (institution.plan_id) {
      const planResult = await query(
        'SELECT * FROM subscription_plans WHERE id = $1',
        [institution.plan_id]
      );
      plan = planResult.rows[0] || null;
    }

    res.json({
      plan,
      planStatus: institution.plan_status,
      trialEndsAt: institution.trial_ends_at,
    });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /plans/select:
 *   post:
 *     summary: Select a subscription plan
 *     description: Select a pricing plan for the authenticated institution. Org admin only. Activates the plan immediately.
 *     tags:
 *       - Plans
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planId
 *               - billingCycle
 *             properties:
 *               planId:
 *                 type: string
 *                 example: professional
 *                 description: "Plan ID: starter, professional, enterprise, unlimited"
 *               billingCycle:
 *                 type: string
 *                 enum: [monthly, yearly]
 *                 example: monthly
 *     responses:
 *       '200':
 *         description: Plan selected successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 plan:
 *                   type: object
 *                 message:
 *                   type: string
 *                   example: Plan selected
 *       '400':
 *         description: No institution assigned or validation error
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden - org admin only
 *       '404':
 *         description: Plan not found or inactive
 *       '500':
 *         description: Internal server error
 */
router.post('/select', authenticate, requireRoles('org_admin'), async (req: AuthRequest, res) => {
  try {
    if (!req.user?.institutionId) {
      return res.status(400).json({ error: 'No institution assigned' });
    }

    const body = selectPlanSchema.parse(req.body);

    const planResult = await query(
      'SELECT * FROM subscription_plans WHERE id = $1 AND is_active = true',
      [body.planId]
    );

    if (planResult.rows.length === 0) {
      return res.status(404).json({ error: 'Plan not found or inactive' });
    }

    const plan = planResult.rows[0];

    await query(
      `UPDATE institutions SET plan_id = $1, plan_status = 'active', plan_selected_at = NOW() WHERE id = $2`,
      [body.planId, req.user.institutionId]
    );

    res.json({ plan, message: 'Plan selected' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

const updatePlanSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  maxStudents: z.number().int().min(0).optional(),
  maxTeachers: z.number().int().min(0).optional(),
  maxDepartments: z.number().int().min(0).optional(),
  maxVerifications: z.number().int().min(0).optional(),
  priceMonthly: z.number().min(0).optional(),
  priceYearly: z.number().min(0).optional(),
  features: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

/**
 * @openapi
 * /plans/{id}:
 *   put:
 *     summary: Update a subscription plan template (system admin)
 *     description: Edit a plan's price, limits, features. System admin only. Does not retroactively change institutions already on this plan (re-assign to apply new limits).
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/:id', authenticate, requireRoles('system_admin'), async (req: AuthRequest, res) => {
  try {
    const body = updatePlanSchema.parse(req.body);
    const result = await query(
      `UPDATE subscription_plans SET
         name            = COALESCE($1, name),
         description     = COALESCE($2, description),
         max_students    = COALESCE($3, max_students),
         max_teachers    = COALESCE($4, max_teachers),
         max_departments = COALESCE($5, max_departments),
         price_monthly   = COALESCE($6, price_monthly),
         price_yearly    = COALESCE($7, price_yearly),
         features        = COALESCE($8::jsonb, features),
         is_active       = COALESCE($9, is_active),
         max_verifications = COALESCE($10, max_verifications)
       WHERE id = $11
       RETURNING *`,
      [body.name ?? null, body.description ?? null, body.maxStudents ?? null, body.maxTeachers ?? null,
       body.maxDepartments ?? null, body.priceMonthly ?? null, body.priceYearly ?? null,
       body.features ? JSON.stringify(body.features) : null,
       body.isActive ?? null, body.maxVerifications ?? null, req.params.id],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Plan not found' });
    res.json({ plan: result.rows[0], message: 'Plan updated' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

export const planRouter = router;
