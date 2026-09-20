export type PortalRole = 'student' | 'barangay' | 'city' | 'superadmin';

// Account Type picked on the Create Account page.
// - new_applicant    first time applying for the scholarship
// - existing_scholar already a recipient, continuing scholar
export type ScholarType = 'new_applicant' | 'existing_scholar';

// City Office decision on an existing scholar's claimed Scholar ID.
// Renewal stays locked until this is 'approved'.
export type ScholarVerificationStatus = 'not_required' | 'pending' | 'approved' | 'rejected';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'barangay_staff' | 'city_admin' | 'admin_staff' | 'super_admin' | 'superadmin';
  scholarType?: ScholarType;
  scholarId?: string;
  scholarVerificationStatus?: ScholarVerificationStatus;
  barangay?: { _id: string; name: string };
}

const KEY = 'city-scholar-session';

// Friendly names for each portal, used in "this account belongs to the X portal" messages.
export const portalLabels: Record<PortalRole, string> = {
  student: 'Student',
  barangay: 'Barangay',
  city: 'City Office',
  superadmin: 'Super Admin',
};

export function portalForRole(role: SessionUser['role']): PortalRole {
  if (role === 'student') return 'student';
  if (role === 'barangay_staff') return 'barangay';
  if (role === 'super_admin' || role === 'superadmin') return 'superadmin';
  return 'city';
}

export function saveSession(token: string, user: SessionUser) {
  localStorage.setItem(KEY, JSON.stringify({ token, user }));
}

export function getSession(): { token: string; user: SessionUser } | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function clearSession() { localStorage.removeItem(KEY); }

export function getSessionUser(): SessionUser | null {
  const session = getSession();
  return session ? session.user : null;
}

export function roleLabel(role: SessionUser['role']): string {
  const labels: Record<SessionUser['role'], string> = {
    student: 'Student',
    barangay_staff: 'Barangay Staff',
    city_admin: 'City Administrator',
    admin_staff: 'Admin Staff',
    super_admin: 'Super Admin',
    superadmin: 'Super Admin',
  };
  return labels[role] ?? role;
}
