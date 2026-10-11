import axios from 'axios';
import type { AuthTokens, User } from '@/types';

const API_BASE = '/api';

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function keysToCamel(obj: any): any {
  if (Array.isArray(obj)) return obj.map(keysToCamel);
  if (obj && typeof obj === 'object' && !(obj instanceof Date)) {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[toCamelCase(key)] = keysToCamel(obj[key]);
    }
    return result;
  }
  return obj;
}

declare module 'axios' {
  interface AxiosInstance {
    get<T = any>(url: string, config?: any): Promise<T>;
    post<T = any>(url: string, data?: any, config?: any): Promise<T>;
    put<T = any>(url: string, data?: any, config?: any): Promise<T>;
    patch<T = any>(url: string, data?: any, config?: any): Promise<T>;
    delete<T = any>(url: string, config?: any): Promise<T>;
  }
}

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => keysToCamel(response.data),
  async (error) => {
    if (error.response?.status === 401 && !error.config.url?.includes('/auth/login') && !error.config.url?.includes('/auth/refresh')) {
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken }, {
          headers: { Authorization: `Bearer ${refreshToken}` },
        });
        localStorage.setItem('accessToken', data.accessToken);
        if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
        error.config.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(error.config);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ user: User } & AuthTokens>('/auth/login', { email, password }),
  register: (data: any) =>
    api.post('/auth/register', data),
  bulkRegister: (data: {
    role: 'teacher' | 'student';
    defaultPassword: string;
    institutionId?: string;
    users: Array<{ fullName: string; email: string; rollNumber?: string; department?: string; phone?: string; password?: string }>;
  }) => api.post('/auth/register/bulk', data),
  me: () =>
    api.get<User>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
  logout: () =>
    api.post('/auth/logout'),
  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, newPassword }),
  // Self-service profile edit. Org email + phone are locked (admin-only), so they
  // are intentionally not part of this payload.
  updateProfile: (data: { fullName?: string; personalEmail?: string; department?: string }) =>
    api.put('/auth/profile', data),
  // Keep the current (temporary) password and stop the first-login prompt.
  dismissPasswordChange: () => api.post('/auth/dismiss-password-change'),
};

export const departmentsApi = {
  list: (params?: any) => api.get('/departments', { params }),
};

export const usersApi = {
  list: (params?: any) => api.get('/users', { params }),
  get: (id: string) => api.get(`/users/${id}`),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
};

export const institutionsApi = {
  list: () => api.get('/institutions'),
  get: (id: string) => api.get(`/institutions/${id}`),
  create: (data: any) => api.post('/institutions', data),
  update: (id: string, data: any) => api.put(`/institutions/${id}`, data),
  assignPlan: (id: string, data: { planId: string; planStatus?: string }) => api.patch(`/institutions/${id}/plan`, data),
  delete: (id: string) => api.delete(`/institutions/${id}`),
  stats: (id: string) => api.get(`/institutions/${id}/stats`),
  overview: (id: string) => api.get(`/institutions/${id}/overview`),
  // API access (integration with an org's own ERP/portal)
  apiAccessStatus: () => api.get('/institutions/api-access/status'),       // org admin (own org)
  requestApiAccess: () => api.post('/institutions/api-access/request'),    // org admin (own org)
  setApiAccess: (id: string, enabled: boolean) => api.patch(`/institutions/${id}/api-access`, { enabled }), // system admin
};

export const coursesApi = {
  list: (params?: any) => api.get('/courses', { params }),
  get: (id: string) => api.get(`/courses/${id}`),
  create: (data: any) => api.post('/courses', data),
  update: (id: string, data: any) => api.put(`/courses/${id}`, data),
  enrollments: (id: string) => api.get(`/courses/${id}/enrollments`),
};

export const sessionsApi = {
  list: (params?: any) => api.get('/sessions', { params }),
  create: (data: any) => api.post('/sessions', data),
  updateStatus: (id: string, status: string) => api.patch(`/sessions/${id}/status`, { status }),
  getQr: (id: string) => api.get(`/sessions/${id}/qr`),
  getQrCurrent: (id: string) => api.get(`/sessions/${id}/qr/current`),
  verifyPresence: (id: string, data: { qrToken: string }) => api.post(`/sessions/${id}/verify-presence`, data),
  roster: (id: string) => api.get(`/sessions/${id}/roster`),
};

export const attendanceApi = {
  list: (params?: any) => api.get('/attendance', { params }),
  mark: (data: any) => api.post('/attendance/mark', data),
  correct: (id: string, data: { status: string; notes?: string }) => api.patch(`/attendance/${id}`, data),
  studentSummary: (studentId: string) => api.get(`/reports/student/${studentId}`),
  studentSessions: (studentId: string, params?: any) => api.get(`/reports/student/${studentId}/sessions`, { params }),
  sessionDetails: (sessionId: string) => api.get(`/reports/session/${sessionId}`),
  myStats: () => api.get('/reports/my-stats'),
};

export const fraudApi = {
  list: (params?: any) => api.get('/fraud', { params }),
  resolve: (id: string, data: any) => api.patch(`/fraud/${id}`, data),
};

export const enrollmentsApi = {
  list: (params?: any) => api.get('/enrollments', { params }),
  create: (data: { courseId: string; studentIds: string[] }) => api.post('/enrollments', data),
  remove: (id: string) => api.delete(`/enrollments/${id}`),
};

export const queriesApi = {
  list: (params?: { status?: 'open' | 'resolved' }) => api.get('/queries', { params }),
  create: (data: { subject: string; category: string; message: string; aboutUserId?: string | null }) =>
    api.post('/queries', data),
  update: (id: string, data: { adminResponse?: string; status?: 'open' | 'resolved' }) =>
    api.patch(`/queries/${id}`, data),
  directory: () => api.get('/queries/directory'),
};

export const reportsApi = {
  stats: () => api.get('/reports/stats'),
  myStats: () => api.get('/reports/my-stats'),
};

export const auditApi = {
  list: (params?: any) => api.get('/audit', { params }),
};

export const biometricApi = {
  registerFace: (faceImage: string) =>
    api.post('/biometric/face/register', { faceImage }),
  faceStatus: () =>
    api.get('/biometric/face/status'),
  delete: () =>
    api.delete('/biometric/face'),
};

export interface FingerCapture { position: string; image: string }
export const fingerprintApi = {
  // 4-finger contactless capture: one photo yields 4 fingertip crops.
  register: (fingers: FingerCapture[]) => api.post('/biometric/fingerprint/register', { fingers }),
  status: () => api.get('/biometric/fingerprint/status'),
  remove: () => api.delete('/biometric/fingerprint'),
};

// Teacher -> org-admin "add this student to my section" requests.
export const enrollmentRequestsApi = {
  searchStudents: (q: string) => api.get('/enrollment-requests/students', { params: { q } }),
  list: (params?: { status?: string }) => api.get('/enrollment-requests', { params }),
  create: (data: { courseId: string; studentId: string; note?: string }) => api.post('/enrollment-requests', data),
  review: (id: string, status: 'approved' | 'rejected', adminNote?: string) =>
    api.patch(`/enrollment-requests/${id}`, { status, adminNote }),
};

export const notificationsApi = {
  list: () => api.get('/notifications'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
};

export const orgRequestsApi = {
  list: () => api.get('/org-requests'),
  approve: (id: string, data?: any) => api.patch(`/org-requests/${id}/approve`, data),
  reject: (id: string, data?: any) => api.patch(`/org-requests/${id}/reject`, data),
  scheduleDemo: (id: string) => api.post(`/org-requests/${id}/schedule-demo`),
};

export const plansApi = {
  list: () => api.get('/plans'),
  current: () => api.get('/plans/current'),
  select: (planId: string, billingCycle: string) => api.post('/plans/select', { planId, billingCycle }),
  update: (id: string, data: any) => api.put(`/plans/${id}`, data),
};

export default api;
