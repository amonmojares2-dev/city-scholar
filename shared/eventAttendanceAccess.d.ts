export interface EventAttendanceAccount {
  scholarType?: 'new_applicant' | 'existing_scholar';
  scholarVerificationStatus?: 'not_required' | 'pending' | 'approved' | 'rejected';
  applicationApproved?: boolean;
}

export function isEventAttendanceAccess(account?: EventAttendanceAccount | null): boolean;
