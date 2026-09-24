// ==========================================
// City Scholar - Validation Utilities
// ==========================================

// ------------------------------------------
// Email validation
// ------------------------------------------
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


// ------------------------------------------
// Name validation
// Allows:
// - Letters
// - Spaces
// - Apostrophes
// - Hyphens
// - Periods
//
// Examples:
// Diamond        ✅
// Diamond Ace    ✅
// Mary Jane      ✅
// Dela Cruz      ✅
// Anne-Marie     ✅
// O'Connor       ✅
// José           ✅
// ------------------------------------------
const NAME_PATTERN = /^[\p{L}]+(?:[ .'-][\p{L}]+)*$/u;


// ------------------------------------------
// Allowed schools / universities
// ------------------------------------------
const SCHOOLS = new Set([
    "PHINMA University of Pangasinan",
    "University of Luzon",
    "Lyceum Northwestern University",
    "Universidad de Dagupan",
    "Systems Technology Institute College"
]);


// ------------------------------------------
// Student account types
//
// Picked on the Create Account page under "Account Type":
// - new_applicant    first time applying for the scholarship
// - existing_scholar already a recipient, continuing scholar
// ------------------------------------------
const SCHOLAR_TYPES = ["new_applicant", "existing_scholar"];

// Scholar ID an existing scholar already holds, e.g. SCH-2024-0182 —
// no longer collected at registration; kept out of exports entirely.

// ------------------------------------------
// Employee number patterns
// ------------------------------------------
const EMPLOYEE_PATTERNS = {
    barangay_staff: /^BRG-\d{4}-\d{4}$/,
    // City Office staff share the CSO pattern; "city_admin" is the
    // canonical role name, "admin_staff" the legacy one.
    city_admin: /^CSO-\d{4}-\d{4}$/,
    admin_staff: /^CSO-\d{4}-\d{4}$/
};


// ------------------------------------------
// Roles that are allowed to self-register
// through the public "Create Account" page.
//
// ONLY students can self-register. Barangay Admin and City Admin accounts
// are provisioned by the Super Admin (POST /auth/super-admin/create-user)
// and set their own password through the standard Forgot Password flow.
// 'super_admin' was already excluded — those accounts are provisioned
// directly in MongoDB and can only ever sign in.
// ------------------------------------------
const SELF_REGISTERABLE_ROLES = ["student"];


// ------------------------------------------
// Super Admin role
//
// "super_admin" is the canonical value stored in MongoDB for these
// accounts. "superadmin" is accepted as well so accounts created
// before the rename keep working.
// ------------------------------------------
const SUPER_ADMIN_ROLE = "super_admin";
const SUPER_ADMIN_ROLES = [SUPER_ADMIN_ROLE, "superadmin"];

function isSuperAdminRole(role) {
    return SUPER_ADMIN_ROLES.includes(role);
}


// ------------------------------------------
// Barangay role
//
// "barangay_admin" is the canonical value stored in MongoDB for
// Barangay staff. "barangay_staff" is accepted as well so accounts
// created before the rename keep working.
// ------------------------------------------
const BARANGAY_ADMIN_ROLE = "barangay_admin";
const BARANGAY_ADMIN_ROLES = [BARANGAY_ADMIN_ROLE, "barangay_staff"];


// ------------------------------------------
// City Office role
//
// "city_admin" is the canonical value stored in MongoDB for City
// Office staff. "admin_staff" is accepted as well so accounts
// created before the rename keep working.
// ------------------------------------------
const CITY_ADMIN_ROLE = "city_admin";
const CITY_ADMIN_ROLES = [CITY_ADMIN_ROLE, "admin_staff"];


// ==========================================
// Normalize Email
// ==========================================
function normalizeEmail(value) {
    return typeof value === "string" ?
        value.trim().toLowerCase() :
        "";
}


// ==========================================
// Validate Password
//
// Requirements:
// - 8 to 72 characters
// - At least 1 uppercase
// - At least 1 lowercase
// - At least 1 number
// - At least 1 special character
// ==========================================
function validatePassword(password) {
    return (
        typeof password === "string" &&
        password.length >= 8 &&
        password.length <= 72 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /\d/.test(password) &&
        /[^A-Za-z\d]/.test(password)
    );
}


// ==========================================
// Validate Registration
// ==========================================
function validateRegistration(data, validBarangayNames) {

    // --------------------------------------
    // Get and clean input values
    // --------------------------------------
    const firstName = String(data.firstName || "").trim();
    const lastName = String(data.lastName || "").trim();

    const email = normalizeEmail(data.email);

            const password = data.password;

    const role = data.role;


    // --------------------------------------
    // Validate role
    //
    // 'super_admin' can never come through here — it is not in
    // SELF_REGISTERABLE_ROLES, so any attempt to register with
    // that role is rejected outright.
    // --------------------------------------
    if (!SELF_REGISTERABLE_ROLES.includes(role)) {
        return "Invalid account role.";
    }


    // --------------------------------------
    // Validate first name
    // --------------------------------------
    if (
        firstName.length < 2 ||
        firstName.length > 50 ||
        !NAME_PATTERN.test(firstName)
    ) {
        return "First name must be 2-50 characters and contain a valid name.";
    }


    // --------------------------------------
    // Validate last name
    // --------------------------------------
    if (
        lastName.length < 2 ||
        lastName.length > 50 ||
        !NAME_PATTERN.test(lastName)
    ) {
        return "Last name must be 2-50 characters and contain a valid name.";
    }


    // --------------------------------------
    // Validate email
    // --------------------------------------
    if (!EMAIL_PATTERN.test(email) || !email.endsWith("@gmail.com")) {
        return "Please enter a valid Gmail address ending in @gmail.com.";
    }


    // --------------------------------------
    // Validate password
    // --------------------------------------
            if (!validatePassword(password)) {
        return "Password must contain at least 8 characters, including uppercase, lowercase, number, and special character.";
    }


    // --------------------------------------
    // Validate barangay
    //
    // Students and barangay staff must
    // select a valid barangay.
    // --------------------------------------
    if (
        (role === "student" || role === "barangay_staff") &&
        !validBarangayNames.has(
            String(data.barangay || "").trim()
        )
    ) {
        return "Please select a valid barangay.";
    }


    // --------------------------------------
    // Validate school
    //
    // Only students need a school.
    // --------------------------------------
    if (
        role === "student" &&
        !SCHOOLS.has(
            String(data.school || "").trim()
        )
    ) {
        return "Please select a valid school or university.";
    }


        // --------------------------------------
    // Validate the student's account type
    //
    // Students choose "New Applicant" or "Existing Scholar" on the
    // Create Account page. The Scholar ID field has been removed from
    // the form — the City Office verifies Existing Scholar claims
    // manually on the Scholar Approval page without a claimed ID.
    // --------------------------------------
    if (role === "student") {

        const scholarType = String(
            data.scholarType || "new_applicant"
        ).trim();

        if (!SCHOLAR_TYPES.includes(scholarType)) {
            return "Please choose a valid account type.";
        }
    }


    // --------------------------------------
    // Validate employee number
    //
    // Barangay Staff:
    // BRG-2026-0001
    //
    // Admin Staff:
    // CSO-2026-0001
    // --------------------------------------
    if (role !== "student") {

        const employeeNumber = String(
            data.employeeNumber || ""
        ).trim();

        if (!EMPLOYEE_PATTERNS[role].test(employeeNumber)) {

            return `Employee number must follow the ${
                role === "barangay_staff"
                    ? "BRG"
                    : "CSO"
            }-YYYY-0000 format.`;
        }
    }


    // --------------------------------------
    // Everything is valid
    // --------------------------------------
    return null;
}


// ==========================================
// Validate Super Admin Login
//
// Only checks shape/presence here. The actual authority check —
// does this email exist in MongoDB with role: 'super_admin', and
// does the password (once set) match — happens against the
// database in the auth route, not in this file.
// ==========================================
function validateSuperAdminLogin(data) {
    const email = normalizeEmail(data.email);

    if (!EMAIL_PATTERN.test(email)) {
        return "Please enter a valid email address.";
    }

    if (typeof data.password !== "string" || data.password.length < 1) {
        return "Password is required.";
    }

    return null;
}


// ==========================================
// Validate New Password (Super Admin first-login setup,
// and reusable anywhere else a "set a new password" step is needed)
// ==========================================
function validateNewPassword(data) {
    const { newPassword, confirmNewPassword } = data;

    if (!validatePassword(newPassword)) {
        return "Password must contain at least 8 characters, including uppercase, lowercase, number, and special character.";
    }

    if (newPassword !== confirmNewPassword) {
        return "Passwords do not match.";
    }

    return null;
}


// ==========================================
// Validate Staff Account Creation (Super Admin)
// ==========================================
// Creates a staff account without a password. The user sets their
// password via the standard forgot-password flow on first login.
function validateStaffAccountCreation(data) {
    const email = normalizeEmail(data.email);
    const employeeNumber = String(data.employeeNumber || "").trim().toUpperCase();
    const role = data.role;

    // Validate role
    if (role !== "barangay_admin" && role !== "city_admin") {
        return "Role must be either Barangay Admin or City Admin.";
    }

    // Validate email
    if (!EMAIL_PATTERN.test(email)) {
        return "Please enter a valid email address.";
    }

    // Barangay Admin accounts are scoped to exactly one barangay — without
    // it the account signs in but every Barangay portal page shows
    // "Your account is not assigned to a barangay yet." The controller
    // additionally resolves the name against the active Barangay collection.
    if (role === "barangay_admin" && !String(data.barangay || "").trim()) {
        return "Please select a barangay for this Barangay Admin.";
    }

    // Validate employee number format
    if (role === "barangay_admin") {
        if (!/^BRG-\d{4}-\d{4}$/.test(employeeNumber)) {
            return "Barangay Admin employee number must follow the BRG-YYYY-0000 format.";
        }
    } else if (role === "city_admin") {
        if (!/^CSO-\d{4}-\d{4}$/.test(employeeNumber)) {
            return "City Admin employee number must follow the CSO-YYYY-0000 format.";
        }
    }

    return null;
}

// ==========================================
// Export
// ==========================================
module.exports = {
    normalizeEmail,
    validatePassword,
    validateRegistration,
    validateSuperAdminLogin,
    validateNewPassword,
    validateStaffAccountCreation,
    EMAIL_PATTERN,
    NAME_PATTERN,
    SCHOLAR_TYPES,
    SELF_REGISTERABLE_ROLES,
    SUPER_ADMIN_ROLE,
    SUPER_ADMIN_ROLES,
    isSuperAdminRole,
    CITY_ADMIN_ROLE,
    CITY_ADMIN_ROLES,
    BARANGAY_ADMIN_ROLE,
    BARANGAY_ADMIN_ROLES
};