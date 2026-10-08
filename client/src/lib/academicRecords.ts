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

  /**
   * Which grading scale the source document used. Marks on this record (and
   * therefore highestGrade / lowestGrade / averageGrade / subjects[].grade)
   * are on THAT scale, not on the GWA scale:
   *   'A' — 1.00-5.00 inverse (1.00 best, 3.00 passes, 5.00 failed)
   *   'B' — 0-100 percentage (80 passes, higher is better)
   * Records extracted before this field existed are null and treated as 'B'.
   */
  gradingScale: GradingScale;

  studentName: string;
  studentNameOnAccount: string;
  school: string;
  gradeLevel: string;
  term: string;
  subjects: SubjectGrade[];
  /** The student's BEST mark: lowest number on Scale A, highest on Scale B. */
  highestGrade: number | null;
  /** The student's WORST mark: highest number on Scale A, lowest on Scale B. */
  lowestGrade: number | null;
  /** Mean of the subject marks, on the record's own scale. */
  averageGrade: number | null;
  /** 1.00-5.00 Philippine scale, always — never a 0-100 percentage. */
  computedGwa: number | null;
  /** Passing mark on the record's own scale (3.00 on A, 70 on B). */
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

import { GRADING } from './gradingConfig';

// --- Display helpers -------------------------------------------------------

/**
 * Which grading scale a record uses. Dagupan colleges grade on one of two
 * scales and a single document is not allowed to mix them:
 *
 *   A — 1.00-5.00 INVERSE. 1.00 is the best possible grade (Excellent),
 *       3.00 is the lowest passing grade, 5.00 means Failed. A LOWER number
 *       is a BETTER grade, so "highest grade" = the LOWEST number.
 *   B — 0-100 percentage. 70 is the passing mark (the equivalent of 3.00 on
 *       Scale A). A HIGHER number is a BETTER grade, so "highest grade" = the
 *       HIGHEST number.
 *
 * Records saved before the scale was tracked have no value; they predate the
 * fix and are treated as percentage ('B'), which is the legacy behaviour.
 */
export type GradingScale = 'A' | 'B';

/** The scale of a record, defaulting to 'B' for legacy rows. */
export function scaleOf(record: Pick<AcademicRecord, 'gradingScale'>): GradingScale {
  return record.gradingScale === 'A' ? 'A' : 'B';
}

/** Human label for the scale, shown next to the marks so City is never guessing. */
export function scaleLabel(scale: GradingScale): string {
  return scale === 'A' ? '1.00–5.00 (inverse)' : '0–100 (percentage)';
}

/** The passing mark for a scale, used when a record never stored one. */
export function defaultPassingMark(scale: GradingScale): number {
  return scale === 'A' ? GRADING.decimal.passingMark : GRADING.percentage.passingMark;
}

/** The passing mark that applies to a record, falling back to the scale default. */
export function passingMarkOf(record: Pick<AcademicRecord, 'passingMark' | 'gradingScale'>): number {
  return typeof record.passingMark === 'number' && Number.isFinite(record.passingMark)
    ? record.passingMark
    : defaultPassingMark(scaleOf(record));
}

/**
 * Did this subject fail? The direction INVERTS between scales — on Scale A a
 * mark above the passing mark fails, on Scale B one below it does. Using the
 * wrong comparison is the exact bug this guards against.
 */
export function isSubjectFailed(
  grade: number,
  record: Pick<AcademicRecord, 'passingMark' | 'gradingScale'>,
): boolean {
  const scale = scaleOf(record);
  const mark = passingMarkOf(record);
  return scale === 'A' ? grade > mark : grade < mark;
}

/** Did this subject pass? Inverse of isSubjectFailed. */
export function isSubjectPassed(
  grade: number,
  record: Pick<AcademicRecord, 'passingMark' | 'gradingScale'>,
): boolean {
  return !isSubjectFailed(grade, record);
}

/**
 * Compare two marks by QUALITY, best first, regardless of scale. Scale A is
 * inverse (a lower number is better) so its comparison is flipped. Use this for
 * sorting "highest grade" columns — sorting raw numbers would put the best
 * student last on every Scale A record.
 */
export function compareByBest(
  a: number | null | undefined,
  b: number | null | undefined,
  scale: GradingScale,
): number {
  // Records with no value sink to the bottom instead of sorting as zero.
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  return scale === 'A' ? a - b : b - a;
}

/** True when this mark is the student's best mark on the record. */
export function isBestGrade(grade: number, record: Pick<AcademicRecord, 'highestGrade' | 'gradingScale'>): boolean {
  return record.highestGrade !== null && grade === record.highestGrade;
}

/** True when this mark is the student's worst mark on the record. */
export function isWorstGrade(grade: number, record: Pick<AcademicRecord, 'lowestGrade' | 'gradingScale'>): boolean {
  if (record.lowestGrade === null) return false;
  return grade === record.lowestGrade;
}

/**
 * The remark printed on a Dagupan college grade sheet for a Scale A mark, so a
 * 1.25 reads as "1.25 (Excellent)" rather than being formatted like a
 * percentage. Returns '' on Scale B, where the number speaks for itself.
 */
export function scaleADescriptor(grade: number): string {
  if (grade <= 1.5) return 'Excellent';
  if (grade <= 1.75) return 'Very Good';
  if (grade <= 2) return 'Good';
  if (grade <= 2.5) return 'Fair';
  if (grade <= 3) return 'Passing';
  if (grade <= 3.5) return 'Failed';
  return 'Failed';
}

export function formatGwa(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '—';
}

/**
 * Format a mark for display. Scale A keeps its decimals (1.25 stays "1.25");
 * Scale B shows a whole number, the way a percentage is read.
 */
export function formatGrade(
  value: number | null | undefined,
  scale: GradingScale = 'B',
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return scale === 'A' ? String(Math.round(value * 100) / 100) : String(Math.round(value));
}

/**
 * The full label for one mark: "1.25 (Excellent)" on Scale A, plain "95" on
 * Scale B. This is what the subject table renders so an inverse-scale mark is
 * never mistaken for a percentage.
 */
export function formatGradeLabel(
  value: number | null | undefined,
  record: Pick<AcademicRecord, 'gradingScale'>,
): string {
  const grade = formatGrade(value, scaleOf(record));
  if (grade === '—' || scaleOf(record) !== 'A') return grade;
  return `${grade} (${scaleADescriptor(value as number)})`;
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
  // Nothing readable to go on: decide from the marks themselves, in this
  // record's own direction (Scale A fails above the passing mark, Scale B below).
  if ((record.subjects || []).length === 0) return 'Unknown';
  const anyFailed = record.subjects.some((subject) => isSubjectFailed(subject.grade, record));
  return anyFailed ? 'Failed' : 'Passed';
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