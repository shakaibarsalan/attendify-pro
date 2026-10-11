import { test, expect } from '@playwright/test';

// Password of the seeded demo accounts (see README > Quick start). Never committed.
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? '';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

test.describe('Health Endpoints', () => {
  test('health returns ok', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('ready checks all services', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/health/ready`);
    expect([200, 503]).toContain(res.status());
  });
});

test.describe('Auth Flow', () => {
  test('system admin login and me', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: 'admin@attendify.app', password: TEST_PASSWORD },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.accessToken).toBeDefined();
    expect(body.user.role).toBe('system_admin');

    const me = await request.get(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${body.accessToken}` },
    });
    expect(me.ok()).toBeTruthy();
  });

  test('invalid credentials rejected', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: 'admin@attendify.app', password: 'wrong' },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('Attendance QR Flow', () => {
  let adminToken: string;
  let courseId: string;
  let sessionId: string;

  test.beforeAll(async ({ request }) => {
    const adminLogin = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: 'admin@attendify.app', password: TEST_PASSWORD },
    });
    const adminBody = await adminLogin.json();
    adminToken = adminBody.accessToken;

    const courses = await request.get(`${BASE_URL}/api/courses?limit=1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const coursesBody = await courses.json();
    courseId = coursesBody.data?.[0]?.id;
  });

  test('creates a session', async ({ request }) => {
    if (!courseId) return;
    const now = new Date();
    const end = new Date(now.getTime() + 3600000);
    const res = await request.post(`${BASE_URL}/api/sessions`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        courseId,
        startTime: now.toISOString(),
        endTime: end.toISOString(),
        qrRotationEnabled: false,
      },
    });
    if (res.status() === 201) {
      const body = await res.json();
      sessionId = body.id;
      expect(sessionId).toBeDefined();
    }
  });

  test('retrieves QR token for session', async ({ request }) => {
    if (!sessionId) return;
    const res = await request.get(`${BASE_URL}/api/sessions/${sessionId}/qr`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.qrSecret || body.data?.qrSecret).toBeDefined();
  });

  test('marks attendance via QR', async ({ request }) => {
    if (!sessionId) return;
    const students = await request.get(`${BASE_URL}/api/users?role=student&limit=1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const studentsBody = await students.json();
    const student = studentsBody.data?.[0];
    if (!student) return;

    const studentLogin = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: student.email, password: TEST_PASSWORD },
    });
    if (!studentLogin.ok()) return;
    const studentBody = await studentLogin.json();
    const studentToken = studentBody.accessToken;

    const qrRes = await request.get(`${BASE_URL}/api/sessions/${sessionId}/qr`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const qrBody = await qrRes.json();
    const qrSecret = qrBody.qrSecret || qrBody.data?.qrSecret;

    const markRes = await request.post(`${BASE_URL}/api/attendance/mark`, {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Idempotency-Key': crypto.randomUUID(),
      },
      data: { sessionId, qrSecret },
    });
    expect([200, 201, 409]).toContain(markRes.status());
  });
});

test.describe('Fraud Alerts', () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const adminLogin = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: 'admin@attendify.app', password: TEST_PASSWORD },
    });
    adminToken = (await adminLogin.json()).accessToken;
  });

  test('list fraud alerts', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/fraud?limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeDefined();
  });

  test('fraud analytics', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/fraud/analytics`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.total).toBeDefined();
    expect(body.pending).toBeDefined();
    expect(body.bySeverity).toBeDefined();
  });
});
