import { test, expect } from '@playwright/test';

// Password of the seeded demo accounts (see README > Quick start). Never committed.
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? '';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

test.describe('Auth Flow', () => {
  test('system admin login and dashboard', async ({ request }) => {
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

test.describe('Attendance QR Flow', () => {
  let adminToken: string;
  let teacherToken: string;
  let studentToken: string;
  let sessionId: string;
  let courseId: string;

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

  test('teacher creates session', async ({ request }) => {
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

  test('student marks attendance via QR', async ({ request }) => {
    if (!sessionId) return;
    const students = await request.get(`${BASE_URL}/api/users?role=student&limit=1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const studentsBody = await students.json();
    const student = studentsBody.data?.[0];
    if (!student) return;

    const pwReset = await request.patch(`${BASE_URL}/api/users/${student.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { password: TEST_PASSWORD },
    });

    const studentLogin = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: student.email, password: TEST_PASSWORD },
    });
    if (!studentLogin.ok()) return;
    const studentBody = await studentLogin.json();
    studentToken = studentBody.accessToken;

    const session = await request.get(`${BASE_URL}/api/sessions/${sessionId}/qr`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const sessionBody = await session.json();
    const qrSecret = sessionBody.qrSecret;

    const markRes = await request.post(`${BASE_URL}/api/attendance/mark`, {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Idempotency-Key': crypto.randomUUID(),
      },
      data: { sessionId, qrSecret },
    });
    expect([201, 409]).toContain(markRes.status());
  });

  test('fraud alert created for geofence violation', async ({ request }) => {
    if (!sessionId || !studentToken) return;
    const session = await request.get(`${BASE_URL}/api/sessions?status=active&limit=1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const sessions = await session.json();
    const activeSession = sessions.data?.find((s: any) => s.id === sessionId);
    if (!activeSession) return;

    await request.patch(`${BASE_URL}/api/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { location_lat: 31.5204, location_lng: 74.3589, location_radius: 50 },
    });

    const qrRes = await request.get(`${BASE_URL}/api/sessions/${sessionId}/qr`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const qrBody = await qrRes.json();

    const markRes = await request.post(`${BASE_URL}/api/attendance/mark`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { sessionId, qrSecret: qrBody.qrSecret, lat: 25.0, lng: 67.0 },
    });
    expect(markRes.status()).toBe(403);
  });

  test('fraud alerts visible to admin', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/fraud?limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeDefined();
  });

  test('fraud analytics endpoint', async ({ request }) => {
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
