// ==========================================
// Attendance proof access shares its eligibility predicate with the
// Events page. City proof review remains role-gated separately.
// ==========================================
const { isEventAttendanceAccess } = require("../../shared/eventAttendanceAccess");

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
function canSubmitAttendanceProof(req) {
    return isEventAttendanceAccess(req && req.user && req.user.account);
}

// The "attendance proof required" roles — City Office and above. Students never
// see other people's proofs; barangay staff are not part of the city proof review.
const ATTENDANCE_REVIEW_ROLES = ["city_admin", "admin_staff", "super_admin", "superadmin"];

function canReviewAttendanceProof(role) {
    return ATTENDANCE_REVIEW_ROLES.includes(role || "");
}

module.exports = {
    isApprovedExistingScholar,
    canSubmitAttendanceProof,
    canReviewAttendanceProof,
    ATTENDANCE_REVIEW_ROLES
};
