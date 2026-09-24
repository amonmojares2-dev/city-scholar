const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    // The student registration form always supplies a full name, so this is
    // normally filled in. Staff accounts are provisioned by the Super Admin
    // with only an email, employee number and role — the holder fills the
    // name in later from their own profile, so a blank name is allowed here.
    name: {
        type: String,
        required: false,
        default: "",
        trim: true
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },

    // Students (and staff who self-registered before this flow existed) set a
    // password at registration, so this is normally a bcrypt hash. Accounts
    // provisioned by the Super Admin are created with NO password at all
    // (empty string) — loginUser detects that and the holder sets their own
    // password through the standard Forgot Password flow on the login page.
    password: {
        type: String,
        required: false,
        default: ""
    },

    // Forces the account to choose a new password before the login OTP
    // is issued (used by the Super Admin first-login / admin reset flow).
    mustChangePassword: {
        type: Boolean,
        default: false
    },

    // Account lifecycle used by the Super Admin "Staff Accounts" and
    // "All Users" pages. Staff accounts start as "pending" until an
    // administrator approves them.
    status: {
        type: String,
        enum: ["active", "pending", "suspended", "deactivated"],
        default: "active"
    },

    // Notes captured by the administrator during account review.
    reviewNotes: { type: String, trim: true, default: "" },

    lastLoginAt: { type: Date, default: null },

    archived: { type: Boolean, default: false },

    employeeNumber: {
        type: String,
        trim: true,
        uppercase: true,
        unique: true,
        sparse: true
    },

    role: {
        type: String,
        enum: [
            "student",
            "barangay_staff",
            "barangay_admin",
            // City Office. "city_admin" is the canonical value; "admin_staff"
            // is still accepted for older documents.
            "city_admin",
            "admin_staff",
            // System Administrator. "super_admin" is the canonical value;
            // "superadmin" is still accepted for older documents.
            "super_admin",
            "superadmin"
        ],
        required: true,
        default: "student"
    },

    // How a student entered the system. Chosen on the Create Account page
    // (the "Account Type" selector):
    //   new_applicant    – first time applying for the scholarship
    //   existing_scholar – already a recipient, continuing scholar
    // Only meaningful for role: "student".
    //
    // === Client-side name: "registrationType" ===
    // The React front-end calls this field "registrationType" (see
    // client/src/lib/studentAccess.ts). The server keeps the older name
    // "scholarType" in MongoDB so no migration is needed. Both refer to the
    // same two-value enum.
    scholarType: {
        type: String,
        enum: ["new_applicant", "existing_scholar"],
        default: "new_applicant"
    },

                // Scholar ID previously claimed by an existing scholar (e.g. SCH-2024-0182).
    // Retained in the schema for backward compatibility with older records;
    // new students no longer supply a Scholar ID at registration.
    scholarId: {
        type: String,
        trim: true,
        uppercase: true,
        default: ""
    },

    // City Office decision on an existing scholar's claim.
    //   not_required – new applicants (nothing to verify)
    //   pending      – waiting for the City Office to confirm
    //   approved     – confirmed existing scholar (renewal unlocked)
    //   rejected     – the claim could not be verified
    //
    // === Client-side name: "scholarStatus" ===
    // The React front-end refers to this as "scholarStatus" (see
    // client/src/lib/studentAccess.ts). The mapping is:
    //   new_applicant              -> scholarStatus = "not_required" (N/A)
    //   existing_scholar + pending -> scholarStatus = "pending_review"
    //   existing_scholar + approved-> scholarStatus = "approved"
    //   existing_scholar + rejected-> never reaches client: on reject the
    //                                server flips scholarType to new_applicant,
    //                                so the account becomes a new applicant.
    scholarVerificationStatus: {
        type: String,
        enum: ["not_required", "pending", "approved", "rejected"],
        default: "not_required"
    },

    // Notes written by the City Office during the verification review.
    scholarVerificationNotes: {
        type: String,
        trim: true,
        default: ""
    },

    scholarVerifiedAt: { type: Date, default: null },

    barangay: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Barangay",
        default: null
    },

    profile: {
        dateOfBirth: String,
        sex: String,
        civilStatus: String,
        nationality: { type: String, default: "Filipino" },
        mobileNumber: String,
        address: String,
        city: String,
        zipCode: String,
        studentId: String,
        course: String,
        yearLevel: String,
        academicTerm: String,
        gwa: String,
        unitsEnrolled: String,
        schoolName: String,
        schoolAddress: String,
        schoolType: String,
        schoolYear: String
    }
}, {
    timestamps: true
});

module.exports = mongoose.model("User", userSchema);