// Uploads are NEVER served by static middleware: every file goes through the
// authenticated GET /api/documents/:id/file endpoint, which resolves the
// hashed filename internally so the server's directory structure is hidden.
//
// <img> / <a> tags cannot send the Authorization header, so the endpoint URL
// carries the token as a query param (?token=...). The server accepts the
// same JWT from either the header or the query string (see authMiddleware:
// header first, ?token= fallback).
import { API_URL, getAuthToken } from './api';

export function docFileUrl(documentId?: string | null): string | null {
  if (!documentId) return null;
  const id = String(documentId).trim();
  // A MongoDB ObjectId is 24 hex chars — refuse anything else so a filename
  // or path can never be smuggled into this URL.
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  const token = getAuthToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${API_URL}/documents/${encodeURIComponent(id)}/file${query}`;
}

export function isImageMime(mime?: string | null): boolean {
  return mime === 'image/jpeg' || mime === 'image/png';
}

/**
 * Translate raw server error messages into human-friendly text.
 * Must never show a Mongoose ValidationError string like
 * "Application validation failed: school: Path `school` is required."
 */
export function friendlyErrorMessage(message: string): string {
  const lower = (message || '').toLowerCase();
  if (lower.includes('school')) {
    return 'Please fill in your School Name before uploading.';
  }
  if (lower.includes('application') && (lower.includes('not found') || lower.includes('404'))) {
    return 'Your application could not be found. Please refresh the page.';
  }
  if (lower.includes('validation failed')) {
    return 'Some required fields are missing. Please complete the form and try again.';
  }
  if (lower.includes('duplicate key')) {
    return 'You already have a draft application. Please refresh the page.';
  }
  return message;
}
