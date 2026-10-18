// Relative /api base — in production the Vercel rewrite
// (/api/:path* → Render backend) keeps the session cookie same-origin.
// In development Vite proxies /api to http://localhost:5000 (vite.config.ts).
export const API_URL = '/api';
export const SERVER_URL = '';

import { clearSession, getSessionUser, SESSION_UPDATED_EVENT } from './auth';
import { MAX_REQUEST_ATTEMPTS, retryDelay, shouldRetry, wait } from './requestRetry';

let redirectingOn401 = false;
const inFlightGetRequests = new Map<string, Promise<unknown>>();

/**
 * Navigate to /login once on 401. The flag prevents redirect loops when
 * multiple requests fail simultaneously (e.g. the notification poller
 * and the user's action at the same time).
 */
function handle401() {
  if (!redirectingOn401) {
    redirectingOn401 = true;
    clearSession();
    if (!window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
    }
  }
}

window.addEventListener(SESSION_UPDATED_EVENT, () => {
  if (getSessionUser()) redirectingOn401 = false;
});

function getRequestKey(path: string, headers: Headers): string {
  const normalizedHeaders = [...headers.entries()].sort(([left], [right]) => left.localeCompare(right));
  return `${path}:${JSON.stringify(normalizedHeaders)}`;
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
        handle401();
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
  for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${API_URL}${path}`, { credentials: 'include' });
    } catch {
      if (attempt < MAX_REQUEST_ATTEMPTS - 1) {
        await wait(retryDelay(attempt));
        continue;
      }
      throw new ApiError('Cannot reach the server, please try again.', 0);
    }
    if (response.status === 401) {
      handle401();
      throw new ApiError('Your session has expired. Please sign in again.', 401);
    }
    if (shouldRetry(response.status) && attempt < MAX_REQUEST_ATTEMPTS - 1) {
      await wait(retryDelay(attempt));
      continue;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new ApiError(body.message || `Request failed with status ${response.status}`, response.status, body.errors);
    }
    return response.blob();
  }

  throw new ApiError('Cannot reach the server, please try again.', 0);
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const headers = new Headers(options.headers);
  if (!isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const method = (options.method || 'GET').toUpperCase();
  const deduplicate = method === 'GET' && !options.signal;
  const requestKey = deduplicate ? getRequestKey(path, headers) : null;
  const existingRequest = requestKey ? inFlightGetRequests.get(requestKey) : undefined;
  if (existingRequest) return existingRequest as Promise<T>;

  const request = (async () => {
    for (let attempt = 0; attempt < (method === 'GET' ? MAX_REQUEST_ATTEMPTS : 1); attempt += 1) {
      let response: Response;
      try {
        response = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });
      } catch {
        if (method === 'GET' && attempt < MAX_REQUEST_ATTEMPTS - 1) {
          await wait(retryDelay(attempt));
          continue;
        }
        throw new Error('Cannot reach the server, please try again.');
      }

      if (response.status === 401) {
        handle401();
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'Your session has expired. Please sign in again.');
      }
      if (method === 'GET' && shouldRetry(response.status) && attempt < MAX_REQUEST_ATTEMPTS - 1) {
        await wait(retryDelay(attempt));
        continue;
      }

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = (body && body.message) || `Request failed with status ${response.status}`;
        throw new ApiError(message, response.status, body?.errors);
      }
      return body as T;
    }

    throw new Error('Request attempts exhausted.');
  })();

  if (!requestKey) return request;

  inFlightGetRequests.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (inFlightGetRequests.get(requestKey) === request) inFlightGetRequests.delete(requestKey);
  }
}