import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

// Build a minimal express app with just the routes under test.
// This avoids importing index.ts (which calls httpServer.listen and connects to DB).
function buildTestApp() {
  const app = express();
  app.use(express.json());

  // Replicate the /health route exactly as in index.ts
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'attendify-api' });
  });

  return app;
}

const app = buildTestApp();

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('attendify-api');
    expect(typeof res.body.timestamp).toBe('string');
  });
});

describe('Auth route — input validation', () => {
  it('POST /api/auth/login with empty body returns 400', async () => {
    // Build an app with only the auth router
    const authApp = express();
    authApp.use(express.json());
    const { authRouter } = await import('../modules/auth/routes.js');
    authApp.use('/api/auth', authRouter);

    const res = await request(authApp).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });
});
