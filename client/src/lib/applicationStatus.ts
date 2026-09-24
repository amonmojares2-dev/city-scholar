// ==========================================
// Student-facing application status
//
// The DB carries two separate signals:
//   status                   – the City Office decision (plus drafts)
//   barangayVerificationStatus – the Barangay Office residency check
// The student must never see those internals raw, because:
//   - a barangay approval is ONLY a residency confirmation, not the
//     scholarship decision, so it reads as "Under Review" (never
//     "Approved" — eligibility is the City's call)
//   - a barangay rejection ends the application: "Rejected"
// Map both into one label/badge key here and use it everywhere the
// student sees their status (Application summary, Dashboard badge).
// ==========================================

export interface StudentApplicationState {
  status: string;
  barangayVerificationStatus?: string | null;
}

export type StudentStatusBadgeKey =
  | 'draft'
  | 'submitted'
  | 'barangay-approved'
  | 'barangay-rejected'
  | 'under-review'
  | 'additional-requirements'
  | 'approved'
  | 'rejected'
  | 'renewal';

export function studentApplicationStatus(application: StudentApplicationState | null | undefined): {
  label: string;
  badgeKey: StudentStatusBadgeKey;
} {
  if (!application) return { label: 'No application submitted', badgeKey: 'draft' };

  const status = application.status || 'draft';
  const barangay = application.barangayVerificationStatus || 'pending';

  // Final City Office decisions always win.
  if (status === 'approved') return { label: 'Approved', badgeKey: 'approved' };
  if (status === 'rejected') return { label: 'Rejected', badgeKey: 'rejected' };
  if (status === 'renewal') return { label: 'Renewal', badgeKey: 'renewal' };
  if (status === 'additional_requirements') return { label: 'Additional Requirements', badgeKey: 'additional-requirements' };
  if (status === 'draft') return { label: 'Draft', badgeKey: 'draft' };

  // Stage 1: Barangay residency verification.
  if (status === 'barangay_rejected' || barangay === 'rejected') return { label: 'Rejected', badgeKey: 'rejected' };
  if (status === 'barangay_approved' || barangay === 'approved') return { label: 'Approved by barangay', badgeKey: 'barangay-approved' };

  // No barangay action yet: still just submitted (a city-side
  // under_review here can only come from legacy records).
  if (status === 'under_review') return { label: 'Under Review', badgeKey: 'under-review' };
  return { label: 'Submitted', badgeKey: 'submitted' };
}
