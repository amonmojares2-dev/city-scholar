// Relative /api base — in production the Vercel rewrite
// (/api/:path* → Render backend) keeps the session cookie same-origin.
// In development Vite proxies /api to http://localhost:5000 (vite.config.ts).
export const API_URL = '/api';
export const SERVER_URL = '';

import { clearSession } from './auth';

let redirectingOn401 = false;

/**
 * Navigate to /login once on 401. The flag prevents redirect loops when
 * multiple requests fail simultaneously (e.g. the notification poller
 * and the user's action at the same time).
 */
function handle401() {
  clearSession();
  if (!redirectingOn401) {
    redirectingOn401 = true;
    if (!window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
    }
  }
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);
const DOCUMENT_TYPES = new Set([...IMAGE_TYPES, 'application/pdf']);

const extension = (name: string) => `.${name.split('.').pop()?.toLowerCase() || ''}`;

export function validateImageFile(file: File): string {
  const validExtension = ['.png', '.jpg', '.jpeg'].includes(extension(file.name));
  if (!IMAGE_TYPES.has(file.type) || !validExtension) return 'Only PNG and JPEG images are allowed.';
  if (file.size > MAX_UPLOAD_BYTES) return 'Image must be 5 MB or smaller.';
  return '';
}

export function validateDocumentFile(file: File): string {
  const validExtension = ['.png', '.jpg', '.jpeg', '.pdf'].includes(extension(file.name));
  if (!DOCUMENT_TYPES.has(file.type) || !validExtension) return 'Only PNG, JPEG, and PDF files are allowed.';
  if (file.size > MAX_UPLOAD_BYTES) return 'File must be 5 MB or smaller.';
  return '';
}

export function profilePhotoUrl(savedUrl?: string | null, updatedAt?: string | number | null): string | null {
  if (!savedUrl) return null;
  const value = (savedUrl || '').includes('http')
    ? new URL(savedUrl).pathname.replace(/^\/api/, '')
    : savedUrl.replace(/^\/api/, '');
  if (!updatedAt) return value;
  const separator = value.includes('?') ? '&' : '?';
  return `${value}${separator}t=${encodeURIComponent(String(updatedAt))}`;
}

export async function uploadWithProgress<T>(
  path: string,
  body: FormData,
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${API_URL}${path}`);
    request.withCredentials = true;

    request.upload.addEventListener('progress', event => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    });
    request.addEventListener('load', () => {
      const responseBody = (() => {
        try { return JSON.parse(request.responseText) as Record<string, unknown>; }
        catch { return {}; }
      })();

      if (request.status === 401) {
        clearSession();
        if (!window.location.pathname.startsWith('/login')) window.location.assign('/login');
        reject(new Error(typeof responseBody.message === 'string' ? responseBody.message : 'Your session has expired. Please sign in again.'));
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(typeof responseBody.message === 'string' ? responseBody.message : `Request failed with status ${request.status}`));
        return;
      }
      onProgress(100);
      resolve(responseBody as T);
    });
    request.addEventListener('error', () => reject(new Error('Cannot reach the server, please try again.')));
    request.addEventListener('abort', () => reject(new Error('Upload cancelled.')));
    signal?.addEventListener('abort', () => request.abort(), { once: true });
    request.send(body);
  });
}

export class ApiError extends Error {
  readonly status: number;
  readonly errors: Record<string, string> | undefined;

  constructor(message: string, status: number, errors?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

export async function fetchPrivateFile(path: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { credentials: 'include' });
  } catch {
    throw new ApiError('Cannot reach the server, please try again.', 0);
  }
  if (response.status === 401) {
    clearSession();
    handle401();
    throw new ApiError('Your session has expired. Please sign in again.', 401);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.message || `Request failed with status ${response.status}`, response.status, body.errors);
  }
  return response.blob();
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const headers = new Headers(options.headers);
  if (!isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });
  } catch {
    throw new Error('Cannot reach the server, please try again.');
  }
  const body = await response.json().catch(() => ({}));

  if (response.status === 401) {
    clearSession();
    handle401();
    throw new Error(body.message || 'Your session has expired. Please sign in again.');
  }

  if (!response.ok) {
    const message = (body && body.message) || `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, body?.errors);
  }
  return body as T;
}