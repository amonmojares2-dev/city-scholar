export const APPLICATION_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  BARANGAY_APPROVED: 'barangay_approved',
  BARANGAY_REJECTED: 'barangay_rejected',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  UNDER_REVIEW: 'under_review',
  ADDITIONAL_REQUIREMENTS: 'additional_requirements',
  RENEWAL: 'renewal',
} as const;

export type ApplicationStatus = typeof APPLICATION_STATUS[keyof typeof APPLICATION_STATUS];
