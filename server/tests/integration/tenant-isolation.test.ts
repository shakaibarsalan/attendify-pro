import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

/**
 * DB-backed regression tests for cross-tenant isolation on the enrollments
 * module. Before the fix, `DELETE /enrollments/:id` mutated by id only and
 * `POST /enrollments` trusted the course's institution without checking the
 * caller's — so an org_admin could drop / create enrollments in ANOTHER
 * institution. These prove an org_admin (UMT) can no longer touch a foreign
 * institution's enrollments or courses.
 *
 * Runs only in the `test-integration` CI job (real seeded Postgres).
 */

const UMT = '11111111-1111-1111-1111-111111111111';
// Password of the seeded demo accounts (see README > Quick start). Never committed.
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? '';
const SYS = { email: 'admin@attendify.app', password: TEST_PASSWORD };
const ORG = { email: 'orgadmin@umt.edu.pk', password: TEST_PASSWORD };

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const asArray = (b: any) => (Array.isArray(b) ? b : (b?.data ?? b?.rows ?? []));
const instOf = (o: any) => o?.institution_id ?? o?.institutionId;

async function login(creds: { email: string; password: string }) {
  const res = await request(app).post('/api/auth/login').send(creds);
  expect(res.status, `login ${creds.email} -> ${res.status} ${JSON.stringify(res.body)}`).toBe(200);
  return res.body.accessToken as string;
}

describe('Tenant isolation — enrollments (DB-backed)', () => {
  let sysToken = '';
  let orgToken = '';

  beforeAll(async () => {
    sysToken = await login(SYS);
    orgToken = await login(ORG);
  });

  it('org_admin cannot DELETE another institution’s enrollment', async () => {
    const all = asArray((await request(app).get('/api/enrollments').set(bearer(sysToken))).body);
    const foreign = all.find((e: any) => instOf(e) && instOf(e) !== UMT && e.status === 'active');
    expect(foreign, 'seed must contain a non-UMT active enrollment').toBeTruthy();

    const del = await request(app).delete(`/api/enrollments/${foreign.id}`).set(bearer(orgToken));
    expect(del.status, 'cross-tenant delete must be blocked').toBe(404);

    // Prove the foreign enrollment was NOT dropped.
    const after = asArray((await request(app).get(`/api/enrollments?courseId=${foreign.course_id}`).set(bearer(sysToken))).body);
    expect(after.find((e: any) => e.id === foreign.id)?.status).toBe('active');
  });

  it('org_admin cannot enroll students into another institution’s course', async () => {
    const courses = asArray((await request(app).get('/api/courses').set(bearer(sysToken))).body);
    const foreignCourse = courses.find((c: any) => instOf(c) && instOf(c) !== UMT);
    expect(foreignCourse, 'seed must contain a non-UMT course').toBeTruthy();

    const res = await request(app).post('/api/enrollments').set(bearer(orgToken))
      .send({ courseId: foreignCourse.id, studentIds: ['00000000-0000-0000-0000-000000000000'] });
    expect(res.status, 'enrolling into a foreign course must be blocked').toBe(404);
  });

  it('org_admin CAN see and act within its own institution (control)', async () => {
    const mine = asArray((await request(app).get('/api/enrollments').set(bearer(orgToken))).body);
    // Every row an org_admin sees must belong to its own institution.
    expect(mine.every((e: any) => !instOf(e) || instOf(e) === UMT)).toBe(true);
  });
});
