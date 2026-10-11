import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';

/**
 * Contract / security / auth-gating tests that run the REAL app in-process via
 * supertest. They need no database and no AI service — they assert the things
 * that have actually regressed on us before:
 *   - the app boots and wires every router (extracting app.ts didn't break it)
 *   - the public OpenAPI contract exposes ONLY integration endpoints (no internal leak)
 *   - the full internal /api-docs is hidden outside development
 *   - protected endpoints reject missing credentials before doing any work
 *
 * NODE_ENV is 'test' here (see vitest.config.ts), so config.server.isDev is false.
 */

describe('App boot + health', () => {
  it('GET /health returns 200 ok (app constructed + listening in-process)', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('attendify-api');
  });

  it('unknown route returns a JSON 404', async () => {
    const res = await request(app).get('/api/this-route-does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('Security: full internal API docs are hidden outside dev', () => {
  it('GET /api-docs is 404 in production/test (entire backend surface not public)', async () => {
    const res = await request(app).get('/api-docs');
    expect(res.status).toBe(404);
  });

  it('GET /api-docs.json is 404 in production/test', async () => {
    const res = await request(app).get('/api-docs.json');
    expect(res.status).toBe(404);
  });
});

describe('Contract: curated integration docs expose only shared endpoints', () => {
  it('GET /api/integration-docs.json is public and well-formed', async () => {
    const res = await request(app).get('/api/integration-docs.json');
    expect(res.status).toBe(200);
    expect(res.body.info?.title).toBe('Attendify Integration API');
    expect(res.body.paths).toBeTruthy();
  });

  it('every published path is a /public/* or /webhooks* endpoint — zero internal leaks', async () => {
    const res = await request(app).get('/api/integration-docs.json');
    const paths = Object.keys(res.body.paths || {});
    expect(paths.length).toBeGreaterThan(0);
    const leaks = paths.filter((p) => !/^\/(public|webhooks)/.test(p));
    expect(leaks).toEqual([]);
  });

  it('internal endpoints (auth/users/institutions) are absent from the public contract', async () => {
    const res = await request(app).get('/api/integration-docs.json');
    const paths = Object.keys(res.body.paths || {});
    for (const internal of ['/auth/login', '/users', '/institutions', '/fraud', '/reports']) {
      expect(paths).not.toContain(internal);
    }
  });

  it('the billable biometric endpoints are present WITH request + response bodies', async () => {
    const res = await request(app).get('/api/integration-docs.json');
    for (const p of ['/public/biometric/face/verify', '/public/biometric/face/identify', '/public/biometric/fingerprint/verify']) {
      const op = res.body.paths?.[p]?.post;
      expect(op, `${p} should be documented`).toBeTruthy();
      expect(op.requestBody, `${p} should have a request body`).toBeTruthy();
      expect(op.responses?.['200'], `${p} should document a 200 response`).toBeTruthy();
    }
  });
});

describe('Auth gating: protected endpoints reject missing credentials', () => {
  it('GET /api/users without a token returns 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('GET /api/institutions without a token returns 401', async () => {
    const res = await request(app).get('/api/institutions');
    expect(res.status).toBe(401);
  });

  it('GET /api/public/courses without an API key returns 401', async () => {
    const res = await request(app).get('/api/public/courses');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/api key/i);
  });

  it('POST /api/public/biometric/face/verify without an API key returns 401 (before any AI call)', async () => {
    const res = await request(app)
      .post('/api/public/biometric/face/verify')
      .send({ subjectRef: 'x', image: 'data:image/jpeg;base64,AAAA' });
    expect(res.status).toBe(401);
  });
});
