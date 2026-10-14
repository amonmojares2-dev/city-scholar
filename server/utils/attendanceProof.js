// ==========================================
// Attendance proof — single source of truth
//
// "Only approved existing scholars may submit attendance proof." This rule
// lives here and is the SAME on the server and the client. The server copy is
// plain CommonJS (attached to req.user.account, the populated User doc); the
// client re-implements the identical boolean below (client/src/lib/studentAccess.ts)
// from the SessionUser. Both require scholarType === 'existing_scholar' AND
// scholarVerificationStatus === 'approved' — scholarType alone is NOT enough
// (a pending scholar is refused), matching the renewal gate.
//
// Keep these three copies in sync:
//   1. server/utils/attendanceProof.js  -> isApprovedExistingScholar (this file)
//   2. client/src/lib/studentAccess.ts  -> canSubmitAttendanceProof
// ==========================================

// Server: takes the request (req.user.account is the populated User document).
function isApprovedExistingScholar(req) {
    const account = req && req.user && req.user.account;
    return Boolean(
        account &&
        account.scholarType === "existing_scholar" &&
        account.scholarVerificationStatus === "approved"
    );
}

// Server: takes a plain user/account object (for helpers and tests).
function isApprovedExistingScholarAccount(account) {
    return Boolean(
        account &&
        account.scholarType === "existing_scholar" &&
        account.scholarVerificationStatus === "approved"
    );
}

// The "attendance proof required" roles — City Office and above. Students never
// see other people's proofs; barangay staff are not part of the city proof review.
const ATTENDANCE_REVIEW_ROLES = ["city_admin", "admin_staff", "super_admin", "superadmin"];

function canReviewAttendanceProof(role) {
    return ATTENDANCE_REVIEW_ROLES.includes(role || "");
}

module.exports = {
    isApprovedExistingScholar,
    isApprovedExistingScholarAccount,
    canReviewAttendanceProof,
    ATTENDANCE_REVIEW_ROLES
};
