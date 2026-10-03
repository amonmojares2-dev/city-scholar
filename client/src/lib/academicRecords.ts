// Shared types and display helpers for AI-extracted academic records
// (GET /api/academic-records). Kept separate from the page so the table, the
// detail panel, and the filters all agree on one shape.

export interface SubjectGrade {
  name: string;
  grade: number;
}

// A grade document that City has (or has not) run the AI on, from
// GET /api/academic-records/pending.
export interface PendingDocument {
  documentId: string;
  applicationId: string;
  context: 'application' | 'renewal';
  documentType: string;
  documentName: string;
  documentStatus: string;
  mimeType: string;
  createdAt: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  barangay: string;
  hasRecord: boolean;
  verifiedByCity: boolean;
  extractionStatus: ExtractionStatus | null;
}

// One extracted academic record.
export type ExtractionStatus = 'extracted' | 'needs_manual_review' | 'failed';

export interface AcademicRecord {
  id: string;
  studentId: string;
  applicationId: string;
  documentId: string;
  context: 'application' | 'renewal';

  studentName: string;
  studentNameOnAccount: string;
  school: string;
  gradeLevel: string;
  term: string;
  subjects: SubjectGrade[];
  highestGrade: number | null;
  lowestGrade: number | null;
  averageGrade: number | null;
  /** 1.00-5.00 Philippine scale. */
  computedGwa: number | null;
  passingMark: number;
  subjectsFailed: string[];
  overallStatus: string;

  extractionStatus: ExtractionStatus;
  extractionNote: string;

  // Provenance — the whole point of the page.
  aiExtracted: boolean;
  verifiedByCity: boolean;
  editedByCity: boolean;
  editorRemarks: string;
  extractedAt: string | null;
  verifiedAt: string | null;

  documentType: string;
  documentName: string;
  documentStatus: string;
  barangay: string;
}

// --- Display helpers -------------------------------------------------------

export function formatGwa(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '—';
}

export function formatGrade(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value)) : '—';
}

// The best available name: the AI-read one, else the account name, else "—".
export function displayName(record: AcademicRecord): string {
  return record.studentName || record.studentNameOnAccount || 'Unnamed student';
}

export function passedStatus(record: AcademicRecord): 'Passed' | 'Failed' | 'Unknown' {
  const failed = (record.subjectsFailed || []).length > 0;
  if (failed) return 'Failed';
  const status = (record.overallStatus || '').toLowerCase();
  if (status.includes('fail')) return 'Failed';
  if (status.includes('pass')) return 'Passed';
  return 'Unknown';
}

/** Badge + colour for the review state of a record. */
export function verificationBadge(record: AcademicRecord): { label: string; className: string } {
  if (record.verifiedByCity) {
    return {
      label: record.editedByCity ? 'Verified (corrected)' : 'Verified by City',
      className: 'bg-green-50 text-green-700',
    };
  }
  if (record.extractionStatus === 'needs_manual_review') {
    return { label: 'Needs manual review', className: 'bg-amber-50 text-amber-700' };
  }
  if (record.extractionStatus === 'failed') {
    return { label: 'Extraction failed', className: 'bg-red-50 text-red-700' };
  }
  return { label: 'AI-extracted, pending review', className: 'bg-blue-50 text-blue-700' };
}

/** True when the row still needs a human to look at it. */
export function needsReview(record: AcademicRecord): boolean {
  return !record.verifiedByCity;
}