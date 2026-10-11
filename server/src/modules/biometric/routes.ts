import { Router } from 'express';
import { authenticate, AuthRequest } from '../../middleware/auth.js';
import { config } from '../../config/index.js';

const router = Router();

/**
 * @openapi
 * /biometric/face/register:
 *   post:
 *     summary: Register face for biometric verification
 *     description: Upload a face image to register the authenticated user's face embedding with the AI service. The image is forwarded to the external AI face registration endpoint.
 *     tags: [Biometric]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [faceImage]
 *             properties:
 *               faceImage:
 *                 type: string
 *                 description: Base64-encoded face image
 *                 example: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD..."
 *     responses:
 *       200:
 *         description: Face registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Face registered successfully"
 *                 embedding_id:
 *                   type: string
 *                   example: "emb-001-uuid"
 *       400:
 *         description: Face image required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Face image required"
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
 *         description: AI service error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "AI service error"
 *       502:
 *         description: AI service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "AI service unavailable"
 *                 detail:
 *                   type: string
 *                   example: "fetch failed"
 */
router.post('/face/register', authenticate, async (req: AuthRequest, res) => {
  try {
    const { faceImage } = req.body;
    if (!faceImage) return res.status(400).json({ error: 'Face image required' });

    const response = await fetch(`${config.ai.serviceUrl}/api/v1/face/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.ai.apiKey,
      },
      body: JSON.stringify({
        userId: req.user!.id,
        institutionId: req.user!.institutionId,
        faceImage,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(result);
    }
    res.json(result);
  } catch (error: any) {
    res.status(502).json({ error: 'AI service unavailable', detail: error.message });
  }
});

/**
 * @openapi
 * /biometric/face/status:
 *   get:
 *     summary: Get face registration status
 *     description: Check the current face embedding registration status for the authenticated user by querying the AI service.
 *     tags: [Biometric]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Face registration status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user_id:
 *                   type: string
 *                   example: "student-001-uuid"
 *                 embeddings_count:
 *                   type: integer
 *                   example: 3
 *                 has_primary:
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
 */
router.get('/face/status', authenticate, async (req: AuthRequest, res) => {
  try {
    const response = await fetch(
      `${config.ai.serviceUrl}/api/v1/embeddings/${req.user!.id}`,
      { headers: { 'X-API-Key': config.ai.apiKey } }
    );
    const result = await response.json();
    res.json(result);
  } catch (error: any) {
    res.json({ user_id: req.user!.id, embeddings_count: 0, has_primary: false });
  }
});

/**
 * @openapi
 * /biometric/liveness/challenge:
 *   post:
 *     summary: Request liveness detection challenge
 *     description: Request a liveness detection challenge from the AI service. Returns a set of actions (e.g., blink, smile) the user must perform to prove they are physically present. Falls back to a default challenge if the AI service is unavailable.
 *     tags: [Biometric]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liveness challenge generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 session_id:
 *                   type: string
 *                   example: "liveness-session-001"
 *                 challenges:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["blink_twice", "smile"]
 *                 timeout_seconds:
 *                   type: integer
 *                   example: 6
 *                 token:
 *                   type: string
 *                   example: "challenge_token_abc123"
 *                 instruction:
 *                   type: string
 *                   example: "Complete these actions: 1. Blink your eyes twice → 2. Give a natural smile"
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
 */
router.post('/liveness/challenge', authenticate, async (req: AuthRequest, res) => {
  try {
    const response = await fetch(`${config.ai.serviceUrl}/api/v1/face/liveness/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': config.ai.apiKey },
      body: JSON.stringify({ userId: req.user!.id }),
    });
    const result = await response.json();
    res.json(result);
  } catch (error: any) {
    res.status(502).json({ error: 'AI service unavailable — cannot start liveness challenge', detail: error.message });
  }
});

/**
 * @openapi
 * /biometric/liveness/verify:
 *   post:
 *     summary: Verify a liveness challenge
 *     description: Submits captured frames for an active liveness challenge session and validates them against the expected challenge sequence (e.g. blink, turn head, smile). Proxies to the AI service.
 *     tags: [Biometric]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId, token, frames, expectedChallenges]
 *             properties:
 *               sessionId: { type: string, description: "Liveness session ID returned by /biometric/liveness/challenge" }
 *               token: { type: string, description: "HMAC challenge token returned by /biometric/liveness/challenge" }
 *               frames:
 *                 type: array
 *                 minItems: 3
 *                 items: { type: string, description: "Base64-encoded JPEG frame" }
 *               expectedChallenges:
 *                 type: array
 *                 items: { type: string, example: "blink" }
 *     responses:
 *       200:
 *         description: Liveness verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 passed: { type: boolean }
 *                 score: { type: number, format: float }
 *                 challengeDetails: { type: object }
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       502:
 *         description: AI service unavailable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/liveness/verify', authenticate, async (req: AuthRequest, res) => {
  try {
    const { sessionId, token, frames, expectedChallenges } = req.body;
    if (!sessionId || !token || !frames || frames.length < 3 || !expectedChallenges) {
      return res.status(400).json({ error: 'Missing required fields: sessionId, token, frames (3+), expectedChallenges' });
    }
    const response = await fetch(`${config.ai.serviceUrl}/api/v1/face/liveness/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': config.ai.apiKey },
      body: JSON.stringify({
        sessionId,
        token,
        frames,
        expectedChallenges,
      }),
    });
    const result = await response.json();
    res.json(result);
  } catch (error: any) {
    res.status(502).json({ error: 'AI service unavailable', detail: error.message });
  }
});

/**
 * @openapi
 * /biometric/liveness/check:
 *   post:
 *     summary: Non-destructive liveness gesture probe (early-advance)
 *     description: Reports whether the requested gesture(s) are already present in the supplied frames so the client can advance a challenge early. Does NOT consume the liveness session; authoritative verification remains in /liveness/verify.
 *     tags: [Biometric]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/liveness/check', authenticate, async (req: AuthRequest, res) => {
  try {
    const { challenges, frames } = req.body;
    if (!Array.isArray(challenges) || !challenges.length || !Array.isArray(frames) || frames.length < 2) {
      return res.status(400).json({ error: 'Missing required fields: challenges, frames (2+)' });
    }
    const response = await fetch(`${config.ai.serviceUrl}/api/v1/face/liveness/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': config.ai.apiKey },
      body: JSON.stringify({ challenges, frames }),
    });
    const result = await response.json();
    res.json(result);
  } catch (error: any) {
    res.status(502).json({ error: 'AI service unavailable', detail: error.message });
  }
});

/**
 * @openapi
 * /biometric/face:
 *   delete:
 *     summary: Delete registered face data
 *     description: Permanently deletes all stored face embeddings for the authenticated user. After this, the user must re-register their face before using face-based attendance.
 *     tags: [Biometric]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Face data deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Face data deleted" }
 *       502:
 *         description: AI service unavailable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.delete('/face', authenticate, async (req: AuthRequest, res) => {
  try {
    const response = await fetch(`${config.ai.serviceUrl}/api/v1/embeddings/${req.user!.id}`, {
      method: 'DELETE',
      headers: { 'X-API-Key': config.ai.apiKey },
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      return res.status(response.status).json(result);
    }
    res.json({ message: 'Face data deleted' });
  } catch (error: any) {
    res.status(502).json({ error: 'AI service unavailable', detail: error.message });
  }
});

/**
 * @openapi
 * /biometric/face/detect:
 *   post:
 *     summary: Detect and validate a face in an image
 *     description: Runs lightweight face detection on a single frame to give the client real-time feedback (face present, centered, good quality) before capturing the final attendance frames. Proxies to the AI service; returns a degraded "no face" response if the AI service is unavailable.
 *     tags: [Biometric]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [faceImage]
 *             properties:
 *               faceImage: { type: string, description: "Base64-encoded JPEG/PNG frame" }
 *     responses:
 *       200:
 *         description: Detection result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 detected: { type: boolean }
 *                 centered: { type: boolean }
 *                 qualityOk: { type: boolean }
 *                 hints:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       text: { type: string }
 *                       type: { type: string, enum: [info, warning, error] }
 *       400:
 *         description: Face image required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/face/detect', authenticate, async (req: AuthRequest, res) => {
  try {
    const { faceImage } = req.body;
    if (!faceImage) return res.status(400).json({ error: 'Face image required' });

    const response = await fetch(`${config.ai.serviceUrl}/api/v1/face/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': config.ai.apiKey },
      body: JSON.stringify({ faceImage }),
    });
    const result = await response.json();
    res.json(result);
  } catch (error: any) {
    console.error('[Biometric] AI face detect error:', error.message);
    res.json({ detected: false, centered: false, qualityOk: false, hints: [{ id: 'no-face', text: 'AI service unavailable', type: 'warning' }] });
  }
});

// ─── Contactless fingerprint (camera-based, verified by the AI service) ───

/**
 * @openapi
 * /biometric/fingerprint/register:
 *   post:
 *     summary: Register a fingerprint sample from a fingertip photo
 *     description: >
 *       Accepts a close-range photo of the fingertip (phone rear camera + flash),
 *       quality-gates it, enhances it into a ridge map, and stores it as a template
 *       for 1:1 verification. Enroll ~3 samples for robust matching.
 *     tags: [Biometric]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sample stored
 *       400:
 *         description: Image quality too low (hints returned)
 */
router.post('/fingerprint/register', authenticate, async (req: AuthRequest, res) => {
  try {
    // New: `fingers` = [{ position, image }] (4-finger capture). Legacy: single `fingerImage`.
    const { fingers, fingerImage } = req.body;
    const hasFingers = Array.isArray(fingers) && fingers.length > 0;
    if (!hasFingers && !fingerImage) return res.status(400).json({ error: 'Fingerprint image required' });

    const response = await fetch(`${config.ai.serviceUrl}/api/v1/fingerprint/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': config.ai.apiKey },
      body: JSON.stringify({
        userId: req.user!.id,
        institutionId: req.user!.institutionId,
        ...(hasFingers ? { fingers } : { fingerImage }),
      }),
    });
    const result: any = await response.json();
    if (!response.ok) {
      // FastAPI wraps structured errors in `detail`
      const detail = result.detail;
      if (detail?.error === 'quality_failed') {
        return res.status(400).json({
          error: detail.hints?.[0]?.message || 'Fingerprint photo quality is too low',
          reason: 'quality_failed',
          hints: detail.hints,
          failed: detail.failed,
        });
      }
      return res.status(response.status).json({ error: detail || 'Fingerprint registration failed' });
    }
    res.json(result);
  } catch (error: any) {
    res.status(502).json({ error: 'AI service unavailable', detail: error.message });
  }
});

/**
 * @openapi
 * /biometric/fingerprint/status:
 *   get:
 *     summary: Get fingerprint enrollment status for the current user
 *     tags: [Biometric]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Enrollment status with stored template count
 */
router.get('/fingerprint/status', authenticate, async (req: AuthRequest, res) => {
  try {
    const response = await fetch(`${config.ai.serviceUrl}/api/v1/fingerprint/${req.user!.id}/status`, {
      headers: { 'X-API-Key': config.ai.apiKey },
    });
    const result = await response.json();
    res.status(response.status).json(result);
  } catch (error: any) {
    res.status(502).json({ error: 'AI service unavailable', detail: error.message });
  }
});

/**
 * @openapi
 * /biometric/fingerprint:
 *   delete:
 *     summary: Delete all fingerprint templates for the current user
 *     tags: [Biometric]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Templates deleted
 */
router.delete('/fingerprint', authenticate, async (req: AuthRequest, res) => {
  try {
    const response = await fetch(`${config.ai.serviceUrl}/api/v1/fingerprint/${req.user!.id}`, {
      method: 'DELETE',
      headers: { 'X-API-Key': config.ai.apiKey },
    });
    const result = await response.json();
    res.status(response.status).json(result);
  } catch (error: any) {
    res.status(502).json({ error: 'AI service unavailable', detail: error.message });
  }
});

export const biometricRouter = router;
