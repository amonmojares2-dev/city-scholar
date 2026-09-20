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
