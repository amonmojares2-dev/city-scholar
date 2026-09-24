export type PortalRole = 'student' | 'barangay' | 'city' | 'superadmin';

// Account Type picked on the Create Account page.
// - new_applicant    first time applying for the scholarship
// - existing_scholar already a recipient, continuing scholar
export type ScholarType = 'new_applicant' | 'existing_scholar';

// City Office decision on an existing-scholar claim (verified manually —
// no Scholar ID is collected at registration any more).
// Renewal stays locked until this is 'approved'.
export type ScholarVerificationStatus = 'not_required' | 'pending' | 'approved' | 'rejected';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  // Role values written by the server. "barangay_admin" / "city_admin" are the
  // canonical names (used by the Super Admin "Add User" flow); "barangay_staff"
  // / "admin_staff" are the legacy self-registration names, still accepted.
  role: 'student' | 'barangay_admin' | 'barangay_staff' | 'city_admin' | 'admin_staff' | 'super_admin' | 'superadmin';
  scholarType?: ScholarType;
  scholarVerificationStatus?: ScholarVerificationStatus;
  university?: string;
  barangay?: { _id: string; name: string };
  hasProfilePhoto?: boolean;
  profilePhotoUrl?: string | null;
  profilePhotoUpdatedAt?: string | null;
}

export const SESSION_UPDATED_EVENT = 'city-scholar-session-updated';
const KEY = 'city-scholar-session';

// Friendly names for each portal, used in "this account belongs to the X portal" messages.
export const portalLabels: Record<PortalRole, string> = {
  student: 'Student',
  barangay: 'Barangay',
  city: 'City Office',
  superadmin: 'Super Admin',
};

// Role -> portal. This is what restricts a signed-in account to one portal:
// RequireAuth (routes.tsx) redirects any account whose portal does not match
// the route it tried to open.
export function portalForRole(role: SessionUser['role']): PortalRole {
  if (role === 'student') return 'student';
  // Barangay Admin — canonical name and the legacy one. Without the canonical
  // value here a Barangay Admin would fall through to the City Office portal.
  if (role === 'barangay_admin' || role === 'barangay_staff') return 'barangay';
  if (role === 'super_admin' || role === 'superadmin') return 'superadmin';
  // City Admin.
  return 'city';
}

export function saveSession(token: string, user: SessionUser) {
  localStorage.setItem(KEY, JSON.stringify({ token, user }));
  window.dispatchEvent(new Event(SESSION_UPDATED_EVENT));
}

export function getSession(): { token: string; user: SessionUser } | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function clearSession() { localStorage.removeItem(KEY); }

export function updateSessionUser(updates: Partial<SessionUser>) {
  const session = getSession();
  if (!session) return;
  saveSession(session.token, { ...session.user, ...updates });
}

export function getSessionUser(): SessionUser | null {
  const session = getSession();
  return session ? session.user : null;
}

export function roleLabel(role: SessionUser['role']): string {
  const labels: Record<SessionUser['role'], string> = {
    student: 'Student',
    barangay_admin: 'Barangay Administrator',
    barangay_staff: 'Barangay Staff',
    city_admin: 'City Administrator',
    admin_staff: 'Admin Staff',
    super_admin: 'Super Admin',
    superadmin: 'Super Admin',
  };
  return labels[role] ?? role;
}
