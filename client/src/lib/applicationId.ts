// ==========================================================
// Display-only application number
//
// MongoDB stores no human-readable application number, so one is derived
// from the record itself. It is stable for a given application (same year +
// same id = same number) and is shared by the Applications list and the
// application review page so both show the SAME number:
//
//   { _id: "...c3f80182", submittedAt: "2025-05-12T..." }  ->  "2025-0182"
//
// It is a label, never an identifier — keep using `_id` for API calls.
// ==========================================================
export function applicationDisplayId(application: {
  _id: string;
  submittedAt?: string | null;
  createdAt?: string | null;
}): string {
  const stamp = application.submittedAt || application.createdAt || '';
  const parsed = stamp ? new Date(stamp) : new Date();
  const year = Number.isNaN(parsed.getTime()) ? new Date().getFullYear() : parsed.getFullYear();

  const hex = String(application._id || '').slice(-6);
  const numeric = Number.parseInt(hex, 16);
  const suffix = Number.isNaN(numeric) ? '0000' : String(numeric % 10000).padStart(4, '0');

  return `${year}-${suffix}`;
}
