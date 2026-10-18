import { MAX_REQUEST_ATTEMPTS, retryDelay, wait } from './requestRetry';

export type PortalRole = 'student' | 'barangay' | 'city' | 'superadmin';

export type ScholarType = 'new_applicant' | 'existing_scholar';

export type ScholarVerificationStatus = 'not_required' | 'pending' | 'approved' | 'rejected';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'barangay_admin' | 'barangay_staff' | 'city_admin' | 'admin_staff' | 'super_admin' | 'superadmin';
  scholarType?: ScholarType;
  scholarVerificationStatus?: ScholarVerificationStatus;
  university?: string;
  barangay?: { _id: string; name: string };
  hasProfilePhoto?: boolean;
  profilePhotoUrl?: string | null;
  profilePhotoUpdatedAt?: string | null;
  profile?: Record<string, string>;
}

export interface SessionDetails {
  user: SessionUser;
  latestApplication?: {
    status?: string;
    applicant?: Record<string, string>;
    program?: string;
    school?: string;
  } | null;
}

export const SESSION_UPDATED_EVENT = 'city-scholar-session-updated';
export const SESSION_COOKIE_NAME = 'city-scholar-session';
export const BROADCAST_CHANNEL = 'city-scholar-session';

export const portalLabels: Record<PortalRole, string> = {
  student: 'Student',
  barangay: 'Barangay',
  city: 'City Office',
  superadmin: 'Super Admin',
};

let sessionUser: SessionUser | null = null;
let sessionDetails: SessionDetails | null = null;
let sessionRequest: Promise<SessionDetails | null> | null = null;
let sessionListeners: (() => void)[] = [];
let sessionCheckFailed = false;

function areEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length
    && leftKeys.every(key => Object.hasOwn(rightRecord, key) && areEqual(leftRecord[key], rightRecord[key]));
}

function notifySessionChange() {
  sessionListeners.forEach(listener => listener());
  window.dispatchEvent(new Event(SESSION_UPDATED_EVENT));
}

async function requestSessionDetails(): Promise<SessionDetails | null> {
  for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch('/api/auth/me', { credentials: 'include' });
    } catch {
      if (attempt === MAX_REQUEST_ATTEMPTS - 1) {
        sessionCheckFailed = true;
        return null;
      }
      await wait(retryDelay(attempt));
      continue;
    }

    if (response.status === 401) {
      clearSession();
      return null;
    }
    if (response.status === 403) return null;
    if (response.status === 429 || response.status >= 500) {
      if (attempt === MAX_REQUEST_ATTEMPTS - 1) {
        sessionCheckFailed = true;
        return null;
      }
      await wait(retryDelay(attempt));
      continue;
    }
    if (!response.ok) {
      sessionCheckFailed = true;
      return null;
    }

    let body: { user?: SessionUser; latestApplication?: SessionDetails['latestApplication'] };
    try {
      body = await response.json();
    } catch (error) {
      sessionCheckFailed = true;
      console.error('Unable to parse the session response.', error);
      return null;
    }
    if (!body.user) {
      sessionCheckFailed = true;
      return null;
    }

    sessionDetails = { user: body.user, latestApplication: body.latestApplication };
    setSessionUser(body.user, body.latestApplication);
    return sessionDetails;
  }

  return null;
}

export function fetchSessionDetails(): Promise<SessionDetails | null> {
  if (!sessionRequest) sessionRequest = requestSessionDetails();
  return sessionRequest;
}

export async function fetchSession(): Promise<SessionUser | null> {
  return (await fetchSessionDetails())?.user ?? null;
}

export function getSessionDetails(): SessionDetails | null {
  return sessionDetails;
}

export function didSessionCheckFail(): boolean {
  return sessionCheckFailed;
}

export function setSessionUser(
  user: SessionUser | null,
  latestApplication?: SessionDetails['latestApplication'],
) {
  const changed = !areEqual(sessionUser, user);
  if (changed) sessionUser = user;
  sessionDetails = sessionUser ? { user: sessionUser, latestApplication } : null;
  sessionRequest = Promise.resolve(sessionDetails);
  sessionCheckFailed = false;
  if (changed) notifySessionChange();
}

export function getSessionUser(): SessionUser | null {
  return sessionUser;
}

export function clearSession() {
  if (!sessionUser && !sessionDetails) return;
  sessionUser = null;
  sessionDetails = null;
  sessionRequest = Promise.resolve(null);
  sessionCheckFailed = false;
  notifySessionChange();
}

export function updateSessionUser(updates: Partial<SessionUser>) {
  if (!sessionUser) return;
  const nextUser = { ...sessionUser, ...updates };
  if (areEqual(sessionUser, nextUser)) return;
  sessionUser = nextUser;
  if (sessionDetails) sessionDetails = { ...sessionDetails, user: nextUser };
  notifySessionChange();
}

export function onSessionChange(listener: () => void) {
  sessionListeners.push(listener);
  return () => {
    sessionListeners = sessionListeners.filter(existing => existing !== listener);
  };
}

export function portalForRole(role: SessionUser['role']): PortalRole {
  if (role === 'student') return 'student';
  if (role === 'barangay_admin' || role === 'barangay_staff') return 'barangay';
  if (role === 'super_admin' || role === 'superadmin') return 'superadmin';
  return 'city';
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
