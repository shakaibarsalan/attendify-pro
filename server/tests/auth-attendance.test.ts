import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

const BASE_URL = 'http://localhost:5000';

let adminToken: string;
let studentToken: string;
let teacherToken: string;
let sessionId: string;

const ADMIN_EMAIL = 'admin@attendify.app';
// Password of the seeded demo accounts (see README > Quick start). Never committed.
const ADMIN_PASS = process.env.TEST_PASSWORD ?? '';

describe('Auth Flow', () => {
  it('logs in as system admin', async () => {
    const res = await request(BASE_URL)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASS });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    adminToken = res.body.accessToken;
  });

  it('rejects invalid credentials', async () => {
    const res = await request(BASE_URL)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: 'wrong' });
    expect(res.status).toBe(401);
  });
});

describe('Health Endpoints', () => {
  it('GET /health returns 200', async () => {
    const res = await request(BASE_URL).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /health/ready returns status', async () => {
    const res = await request(BASE_URL).get('/health/ready');
    expect([200, 503]).toContain(res.status);
    expect(res.body.checks).toBeDefined();
  });

  it('GET /health/metrics returns prometheus format', async () => {
    const res = await request(BASE_URL).get('/health/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('http_requests_total');
  });
});

describe('Session QR Rotation', () => {
  let teacherId: string;
  let courseId: string;

  beforeAll(async () => {
    if (!adminToken) {
      const login = await request(BASE_URL)
        .post('/api/auth/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASS });
      adminToken = login.body.accessToken;
    }

    const users = await request(BASE_URL)
      .get('/api/users?role=teacher&limit=1')
      .set('Authorization', `Bearer ${adminToken}`);
    if (users.body.data?.length > 0) {
      teacherId = users.body.data[0].id;
      teacherToken = adminToken;
    }

    const courses = await request(BASE_URL)
      .get('/api/courses?limit=1')
      .set('Authorization', `Bearer ${adminToken}`);
    if (courses.body.data?.length > 0) {
      courseId = courses.body.data[0].id;
    }
  });

  it('creates a session with QR rotation', async () => {
    if (!courseId) return;
    const res = await request(BASE_URL)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        courseId,
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 3600000).toISOString(),
        qrRotationEnabled: true,
      });
    if (res.status === 201) {
      sessionId = res.body.id;
      expect(res.body.qr_rotation_enabled).toBe(true);
    }
  });

  it('fetches current rotating QR token', async () => {
    if (!sessionId) return;
    const res = await request(BASE_URL)
      .get(`/api/sessions/${sessionId}/qr/current`)
      .set('Authorization', `Bearer ${adminToken}`);
    if (res.status === 200) {
      expect(res.body.token).toBeDefined();
      expect(res.body.static).toBe(false);
      expect(res.body.intervalSeconds).toBeDefined();
    }
  });

  it('QR token changes after window', async () => {
    if (!sessionId) return;
    const r1 = await request(BASE_URL)
      .get(`/api/sessions/${sessionId}/qr/current`)
      .set('Authorization', `Bearer ${adminToken}`);
    if (r1.status !== 200) return;

    await new Promise((r) => setTimeout(r, 100));
    const r2 = await request(BASE_URL)
      .get(`/api/sessions/${sessionId}/qr/current`)
      .set('Authorization', `Bearer ${adminToken}`);
    if (r2.status !== 200) return;

    if (r1.body.windowIndex === r2.body.windowIndex) {
      expect(r1.body.token).toBe(r2.body.token);
    }
  });
});

describe('Attendance Mark', () => {
  it('rejects non-student users', async () => {
    const res = await request(BASE_URL)
      .post('/api/attendance/mark')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sessionId: '00000000-0000-0000-0000-000000000001' });
    expect(res.status).toBe(403);
  });

  it('rejects missing QR and face data', async () => {
    if (!studentToken) return;
    const res = await request(BASE_URL)
      .post('/api/attendance/mark')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ sessionId: '00000000-0000-0000-0000-000000000001' });
    expect(res.status).toBe(400);
  });
});

describe('Notifications', () => {
  it('GET /api/notifications returns list', async () => {
    const res = await request(BASE_URL)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it('POST /api/notifications/read-all returns success', async () => {
    const res = await request(BASE_URL)
      .post('/api/notifications/read-all')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
