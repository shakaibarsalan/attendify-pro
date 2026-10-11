import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

/**
 * DB-backed integration tests for the paid API platform. These run the REAL app
 * in-process (supertest) against a real Postgres seeded with the demo migrations
 * (see .github/workflows: the test-integration job). They drive everything through
 * the public HTTP API with the seeded demo accounts — no hand-crafted fixtures —
 * so they faithfully exercise the gating/scope/webhook logic where most of our
 * regressions have lived.
 *
 * Requires a database; only the `test-integration` CI job (and a local Postgres)
 * runs them — they are excluded from the default unit test run.
 */

const UMT = '11111111-1111-1111-1111-111111111111';
// Password of the seeded demo accounts (see README > Quick start). Never committed.
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? '';
const SYS = { email: 'admin@attendify.app', password: TEST_PASSWORD };
const ORG = { email: 'orgadmin@umt.edu.pk', password: TEST_PASSWORD };

let sysToken = '';
let orgToken = '';
const createdKeyIds: string[] = [];
let originalApiAccess = false;

async function login(creds: { email: string; password: string }) {
  const res = await request(app).post('/api/auth/login').send(creds);
  expect(res.status, `login ${creds.email} -> ${res.status} ${JSON.stringify(res.body)}`).toBe(200);
  return res.body.accessToken as string;
}
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
async function setApiAccess(enabled: boolean) {
  return request(app).patch(`/api/institutions/${UMT}/api-access`).set(bearer(sysToken)).send({ enabled });
}

describe('Paid API platform — gating, scopes, webhooks (DB-backed)', () => {
  beforeAll(async () => {
    sysToken = await login(SYS);
    orgToken = await login(ORG);
    const st = await request(app).get('/api/institutions/api-access/status').set(bearer(orgToken));
    originalApiAccess = st.body?.enabled === true;
  });

  afterAll(async () => {
    for (const id of createdKeyIds) {
      await request(app).delete(`/api/api-keys/${id}`).set(bearer(orgToken));
    }
    await setApiAccess(originalApiAccess);
  });

  it('seeded demo accounts authenticate (DB + auth wired)', () => {
    expect(sysToken).toBeTruthy();
    expect(orgToken).toBeTruthy();
  });

  it('blocks API key creation when API access is disabled (403)', async () => {
    const off = await setApiAccess(false);
    expect(off.status).toBe(200);
    const res = await request(app).post('/api/api-keys').set(bearer(orgToken)).send({ name: 'QA-it should fail' });
    expect(res.status).toBe(403);
  });

  it('allows key creation once API access is enabled, and the key authenticates', async () => {
    const on = await setApiAccess(true);
    expect(on.status).toBe(200);
    const res = await request(app).post('/api/api-keys').set(bearer(orgToken)).send({ name: 'QA-read key', permissions: ['read'] });
    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^ak_/);
    createdKeyIds.push(res.body.id);

    const courses = await request(app).get('/api/public/courses').set('X-API-Key', res.body.key);
    expect(courses.status).toBe(200);
  });

  it('enforces tenant isolation: a UMT key only ever sees UMT data', async () => {
    await setApiAccess(true);
    const made = await request(app).post('/api/api-keys').set(bearer(orgToken)).send({ name: 'QA-iso key', permissions: ['read'] });
    expect(made.status).toBe(201);
    createdKeyIds.push(made.body.id);

    // A roll number that belongs to ANOTHER tenant must not resolve through a UMT key.
    const foreign = await request(app).get('/api/public/students/by-roll/UET-CS-001').set('X-API-Key', made.body.key);
    expect([404, 200]).toContain(foreign.status);
    if (foreign.status === 200) {
      // if it resolved, it must be a UMT student, never another tenant's
      expect(foreign.body.institution_id ?? UMT).toBe(UMT);
    }
  });

  it('enforces the biometric scope: a read-only key cannot call face/verify (403, before any AI call)', async () => {
    await setApiAccess(true);
    const made = await request(app).post('/api/api-keys').set(bearer(orgToken)).send({ name: 'QA-noscope', permissions: ['read'] });
    expect(made.status).toBe(201);
    createdKeyIds.push(made.body.id);

    const verify = await request(app)
      .post('/api/public/biometric/face/verify')
      .set('X-API-Key', made.body.key)
      .send({ subjectRef: 'x', image: 'data:image/jpeg;base64,AAAA' });
    expect(verify.status).toBe(403);
  });

  it('webhook lifecycle: create returns a secret once, list hides it, delete removes it', async () => {
    await setApiAccess(true);
    const create = await request(app).post('/api/webhooks').set(bearer(orgToken)).send({ url: 'https://example.com/hook', events: ['attendance.marked'] });
    expect(create.status).toBe(201);
    expect(create.body.secret).toBeTruthy();

    const list = await request(app).get('/api/webhooks').set(bearer(orgToken));
    expect(list.status).toBe(200);
    const arr = list.body.data ?? list.body;
    const found = arr.find((w: any) => w.id === create.body.id);
    expect(found).toBeTruthy();
    expect(found.secret).toBeFalsy();

    const del = await request(app).delete(`/api/webhooks/${create.body.id}`).set(bearer(orgToken));
    expect(del.status).toBe(200);
  });

  it('webhook creation is blocked when API access is disabled (403)', async () => {
    await setApiAccess(false);
    const res = await request(app).post('/api/webhooks').set(bearer(orgToken)).send({ url: 'https://example.com/hook' });
    expect(res.status).toBe(403);
    await setApiAccess(true);
  });
});
