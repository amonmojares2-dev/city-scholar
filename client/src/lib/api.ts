const browserApiUrl = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.hostname}:5000/api`
  : 'http://localhost:5000/api';
// VITE_API_URL is the canonical name; VITE_API_BASE_URL is still honoured so the
// value in client/.env works as written.
const configuredApiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;
export const API_URL = (configuredApiUrl || browserApiUrl).replace(/\/$/, '');

import { getSession, clearSession } from './auth';

export function getAuthToken(): string | null {
  return getSession()?.token || null;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = getSession();
  const isFormData = options.body instanceof FormData;
  const headers = new Headers(options.headers);
  if (!isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (session?.token) headers.set('Authorization', `Bearer ${session.token}`);

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));

  if (response.status === 401) {
    clearSession();
    if (!window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
    }
    throw new Error(body.message || 'Your session has expired. Please sign in again.');
  }

  if (!response.ok) {
    const message = (body && body.message) || `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}