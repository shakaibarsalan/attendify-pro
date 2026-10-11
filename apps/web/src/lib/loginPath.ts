// Maps a user role to its themed login portal, so logging out (or a session
// expiring) returns the user to the portal they came from instead of the
// default org portal. Falls back to the last role persisted at login.
const LAST_ROLE_KEY = 'attendify_last_role';

export function rememberRole(role?: string | null) {
  if (role) localStorage.setItem(LAST_ROLE_KEY, role);
}

export function roleLoginPath(role?: string | null): string {
  const r = role ?? localStorage.getItem(LAST_ROLE_KEY) ?? undefined;
  switch (r) {
    case 'system_admin': return '/login/system-admin';
    case 'org_admin': return '/login/org-admin';
    case 'teacher': return '/login/teacher';
    case 'student': return '/login/student';
    default: return '/login';
  }
}
