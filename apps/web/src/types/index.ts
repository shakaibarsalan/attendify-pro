export type UserRole = 'system_admin' | 'org_admin' | 'teacher' | 'student';

export interface User {
  id: string;
  email: string;            // organization email — login identifier (locked)
  personalEmail?: string;   // personal email — where the user receives mail (editable)
  fullName: string;
  role: UserRole;
  institutionId: string | null;
  phone?: string;
  avatarUrl?: string;
  rollNumber?: string;
  registrationNumber?: string;  // F2022123456 — drives the login email (locked)
  department?: string;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
  mustChangePassword?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface Institution {
  id: string;
  name: string;
  code: string;
  domain?: string;            // email domain, e.g. umt.edu.pk (unique per org)
  contactEmail?: string;
  city?: string;
  status: 'active' | 'inactive' | 'suspended';
  totalStudents?: number;
  totalTeachers?: number;
  totalCourses?: number;
}

export interface Course {
  id: string;
  name: string;
  code: string;
  teacherId?: string;
  departmentId?: string;
  semester?: string;
  academicYear?: string;
  section?: string;
  maxStudents: number;
  isActive: boolean;
}

export interface AttendanceSession {
  id: string;
  courseId: string;
  teacherId: string;
  lectureNumber: number;
  lectureDate: string;
  startTime: string;
  endTime: string;
  status: 'active' | 'completed' | 'cancelled';
  requireBiometric: boolean;
  requireLiveness: boolean;
  totalEnrolled: number;
  totalPresent: number;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string;
  studentName?: string;
  rollNumber?: string;
  status: 'verified' | 'rejected' | 'pending';
  verificationMethod: string;
  confidenceScore: number;
  livenessScore: number;
  markedAt: string;
}

export interface FraudAlert {
  id: string;
  studentId: string;
  sessionId: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'reviewed' | 'resolved' | 'false_positive';
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}
