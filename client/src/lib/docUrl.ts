// Builds a browser-loadable URL for a locally stored upload.
// Server stores files on disk (server/uploads/) and serves them at GET /uploads/:filename.
// API_URL ends with "/api" (e.g. http://host:5000/api), so strip that suffix to get the origin.
// NOTE: local disk is dev-only. Before launch, migrate to Cloudinary/S3 — see
// server/STORAGE_LAUNCH_BLOCKER.md (redeploys on Render/Railway/Vercel wipe local files).
import { API_URL } from './api';

const SERVER_BASE = API_URL.replace(/\/api\/?$/, '');

export function docFileUrl(filename?: string | null): string | null {
  if (!filename) return null;
  // Filenames are generated server-side as "<timestamp>-<slug>.<ext>" — no slashes.
  const safe = String(filename).split('/').pop()?.split('\\').pop() || '';
  if (!safe) return null;
  return `${SERVER_BASE}/uploads/${encodeURIComponent(safe)}`;
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
  if (lower.includes('school') && lower.includes('program')) {
    return 'Please fill in your Scholarship Program and School Name before uploading documents.';
  }
  if (lower.includes('program')) {
    return 'Please fill in your Scholarship Program before uploading.';
  }
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
