exports.isEventAttendanceAccess = function isEventAttendanceAccess(account) {
  if (!account) return false;

  if (account.scholarType === 'existing_scholar') {
    return account.scholarVerificationStatus === 'pending'
      || account.scholarVerificationStatus === 'approved';
  }

  return account.scholarType === 'new_applicant'
    && account.applicationApproved === true;
};
