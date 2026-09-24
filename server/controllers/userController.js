const User = require("../models/User");
const Barangay = require("../models/Barangay");
const Application = require("../models/Application");
const OTPVerification = require("../models/OTPVerification");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const {
    normalizeEmail,
    validateRegistration,
    validatePassword,
    validateNewPassword,
    validateStaffAccountCreation,
    EMAIL_PATTERN
} = require("../utils/validation");
const { sendOtpEmail } = require("../utils/email");
const { logAudit } = require("../utils/audit");

const OTP_TTL_MS = 30 * 1000; // 30 seconds - for registration / password reset
const LOGIN_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes - login OTP does NOT expire after 30s
const RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds - must wait for timer to end before resend
const MAX_ATTEMPTS = 6; // Block OTP entry after 6 wrong attempts (login)
const MAX_RESENDS = 5;
const BLOCK_DURATION_MS = 30 * 1000; // 30s block after 6 failed login attempts

// ==========================================
// CREATE 6-DIGIT OTP
// ==========================================
function createOtp() {
    return crypto.randomInt(100000, 1000000).toString();
}

// ==========================================
// MASK EMAIL
// Example: john@gmail.com -> j***@gmail.com
// ==========================================
function maskEmail(email) {
    const [local, domain] = String(email || "").split("@");

    if (!domain) return "";

    return `${local.slice(0, 1)}${"*".repeat(
        Math.max(2, local.length - 1)
    )}@${domain}`;
}

// ==========================================
// CREATE JWT TOKEN
//
// The role is embedded for convenience only — every protected route
// reloads the account and reads the role from MongoDB again.
// ==========================================
function issueToken(user) {
    return jwt.sign({
            id: user._id,
            role: user.role
        },
        process.env.JWT_SECRET, {
            expiresIn: "1d"
        }
    );
}

// ==========================================
// PUBLIC USER DATA
//
// role is what the client feeds to portalForRole(), so it must always
// be present here.
// ==========================================
function publicUser(user) {
    return {
        id: user._id,
        // Staff accounts provisioned by the Super Admin start with no name;
        // fall back to the email so the portal header is never blank.
        name: String(user.name || "").trim() || user.email,
        email: user.email,
        role: user.role,
        // Student account type + the City Office's verification decision.
        // The client uses these to decide which student pages are unlocked
        // (Event Attendance / Renewal stay locked until approved).
        scholarType: user.scholarType || "new_applicant",
        scholarVerificationStatus: user.scholarVerificationStatus ||
            "not_required",
        barangay: user.barangay || null
    };
}

// ==========================================
// CREATE OTP CHALLENGE
// ==========================================
async function createChallenge({
    email,
    purpose,
    userId = null,
    registrationData = null,
    resetPasswordHash = null,
    sendEmail = true
}) {
    const otp = createOtp();

    // LOGIN OTP does NOT expire after 30 seconds — it stays valid and is
    // only replaced when the user requests a new code. Registration /
    // password-reset challenges keep the short TTL.
    const ttl = purpose === "login" ? LOGIN_OTP_TTL_MS : OTP_TTL_MS;

    const challenge = await OTPVerification.create({
        email,
        purpose,
        userId,
        registrationData,
        resetPasswordHash,
        otpHash: await bcrypt.hash(otp, 12),
        expiresAt: new Date(Date.now() + ttl),
        lastSentAt: new Date()
    });

    // First-login flows stage the challenge first and only send the code
    // once the account actually has a usable password.
    if (sendEmail) {
        try {
            await sendOtpEmail(email, otp);
        } catch (error) {
            await challenge.deleteOne();
            throw error;
        }
    }

    return challenge;
}

// ==========================================
// REGISTER USER
//
// Self-registration covers student, barangay_staff and city_admin only.
// validateRegistration rejects super_admin outright — those accounts are
// provisioned directly in MongoDB.
// ==========================================
const registerUser = async(req, res) => {
    try {
        const data = req.body || {};

        const email = normalizeEmail(data.email);

        const validBarangays = new Set(
            (
                await Barangay.find({
                    status: "active"
                })
                .select("name -_id")
                .lean()
            ).map((item) => item.name)
        );

        const validationError = validateRegistration(
            data,
            validBarangays
        );

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        if (await User.exists({ email })) {
            return res.status(409).json({
                success: false,
                message: "This email is already registered."
            });
        }

        if (
            data.employeeNumber &&
            (await User.exists({
                employeeNumber: String(data.employeeNumber)
                    .trim()
                    .toUpperCase()
            }))
        ) {
            return res.status(409).json({
                success: false,
                message: "This employee number is already registered."
            });
        }

        const role = data.role;

        // Students pick their account type on the Create Account page.
        // New applicants start with the applicant-only portal; existing
        // scholars must wait for the City Office to confirm the Scholar ID
        // they claimed before renewal unlocks.
        const scholarType = role === "student" ?
            String(data.scholarType || "new_applicant").trim() :
            "new_applicant";

        const barangay =
            role === "student" || role === "barangay_staff" ?
            await Barangay.findOne({
                name: String(data.barangay).trim(),
                status: "active"
            }) :
            null;

        const registrationData = {
            name: `${String(data.firstName).trim()} ${String(
                data.lastName
            ).trim()}`,

            email,

            password: await bcrypt.hash(data.password, 12),

            role,

            employeeNumber: data.employeeNumber ?
                String(data.employeeNumber)
                .trim()
                .toUpperCase() : undefined,

            ...(role === "student" ? {
                profile: {
                    schoolName: String(data.school).trim()
                },
                scholarType,
                // Existing scholars are queued for the City Office to
                // confirm on the Scholar Approval page. Until then their
                // Renewal page stays locked.
                //
                // This field doubles as the client-side "scholarStatus":
                //   not_required  = new_applicant (no approval needed)
                //   pending       = existing_scholar awaiting review
                //   approved      = existing_scholar confirmed
                //   rejected      = claim not confirmed (account then flipped
                //                   to new_applicant by the review endpoint)
                scholarVerificationStatus: scholarType === "existing_scholar" ?
                    "pending" : "not_required"
            } : {}),

            ...(barangay ? {
                barangay: barangay._id
            } : {})
        };

        const challenge = await createChallenge({
            email,
            purpose: "registration",
            registrationData
        });

        return res.status(202).json({
            success: true,
            challengeId: challenge._id,
            email: maskEmail(email),
            expiresAt: challenge.expiresAt
        });
    } catch (error) {
        console.error("Registration error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error during registration"
        });
    }
};

// ==========================================
// GET CURRENT USER
// ==========================================
const getCurrentUser = async(req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select("-password")
            .populate("barangay", "name")
            .lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Only students have applications.
        const latestApplication = user.role === "student" ?
            await Application.findOne({
                student: req.user.id
            })
            .sort({
                createdAt: -1
            })
            .lean() :
            null;

        return res.json({
            success: true,
            user,
            latestApplication
        });
    } catch (error) {
        console.error(
            "Profile load error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Unable to load user profile"
        });
    }
};

// ==========================================
// UPDATE CURRENT USER
// ==========================================
const updateCurrentUser = async(req, res) => {
    try {
        const allowed = ["name", "profile"];
        const updates = {};

        for (const field of allowed) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        // Role, status and school name can never be changed from here.
        if (updates.profile) {
            delete updates.profile.schoolName;
        }

        const user = await User.findByIdAndUpdate(
                req.user.id,
                updates, {
                    new: true,
                    runValidators: true
                }
            )
            .select("-password")
            .populate("barangay", "name");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.json({
            success: true,
            user
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Unable to update user profile"
        });
    }
};

// ==========================================
// LOGIN USER
//
// One endpoint for every role, Super Admin included. The account's role
// is never taken from the request — it is read from MongoDB and only
// revealed to the client by /verify-otp once the code checks out.
// ==========================================
const loginUser = async(req, res) => {
    try {
        const email = normalizeEmail(req.body?.email);
        const password = req.body?.password;

        if (!EMAIL_PATTERN.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address."
            });
        }

        if (
            typeof password !== "string" ||
            !password.trim()
        ) {
            return res.status(400).json({
                success: false,
                message: "Password is required."
            });
        }

        const user = await User.findOne({
            email
        }).populate("barangay", "name");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        if (user.status === "suspended" ||
            user.status === "deactivated"
        ) {
            return res.status(403).json({
                success: false,
                message: "This account has been disabled. Please contact the City Scholarship Office."
            });
        }

        // Accounts provisioned directly in MongoDB have no password yet,
        // and accounts flagged by an administrator must replace theirs.
        // Stage the challenge without emailing a code — setInitialPassword
        // sends it once a password has been stored.
        if (!user.password ||
            user.mustChangePassword
        ) {
            const setupChallenge = await createChallenge({
                email,
                purpose: "login",
                userId: user._id,
                sendEmail: false
            });

            return res.status(202).json({
                success: true,
                requiresPasswordSetup: true,
                challengeId: setupChallenge._id,
                email: maskEmail(email)
            });
        }

        if (!(await bcrypt.compare(
                password,
                user.password
            ))) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const challenge = await createChallenge({
            email,
            purpose: "login",
            userId: user._id
        });

        // Not signed in yet — the OTP must be verified first.
        return res.status(202).json({
            success: true,
            challengeId: challenge._id,
            email: maskEmail(email),
            expiresAt: challenge.expiresAt
        });
    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error during login"
        });
    }
};

// ==========================================
// REQUEST PASSWORD RESET
//
// The single reset path for every role. The new password is staged on
// the challenge and only written to the account once verifyOtp confirms
// the code.
//
// An unknown email gets the same 202 as a known one, so this endpoint
// can't be used to find out which addresses are registered.
// ==========================================
const requestPasswordReset = async(req, res) => {
    try {
        const email = normalizeEmail(req.body?.email);
        const password = req.body?.password;
        const confirmPassword = req.body?.confirmPassword;

        if (!EMAIL_PATTERN.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address."
            });
        }

        if (!validatePassword(password)) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least 8 characters, including uppercase, lowercase, number, and special character."
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "Passwords do not match."
            });
        }

        const user = await User.findOne({ email });

        // No account: answer as if a code was sent, but send nothing.
        // The OTP step will simply never succeed.
        if (!user) {
            return res.status(202).json({
                success: true,
                challengeId: null,
                email: maskEmail(email)
            });
        }

        const challenge = await createChallenge({
            email,
            purpose: "password_reset",
            userId: user._id,
            resetPasswordHash: await bcrypt.hash(password, 12)
        });

        return res.status(202).json({
            success: true,
            challengeId: challenge._id,
            email: maskEmail(email),
            expiresAt: challenge.expiresAt
        });
    } catch (error) {
        console.error("Password reset request error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to send the password-reset code."
        });
    }
};

// ==========================================
// SET INITIAL PASSWORD
//
// Completes a first sign-in or a forced password change for any role:
// stores the new password, then emails the login OTP for the challenge
// that loginUser staged.
// ==========================================
const setInitialPassword = async(req, res) => {
    try {
        const {
            challengeId,
            newPassword,
            confirmNewPassword
        } = req.body || {};

        const validationError = validateNewPassword({
            newPassword,
            confirmNewPassword
        });

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        const challenge = challengeId ?
            await OTPVerification.findById(challengeId) :
            null;

        if (!challenge ||
            challenge.verified ||
            challenge.purpose !== "login"
        ) {
            return res.status(400).json({
                success: false,
                message: "This sign-in request is no longer valid. Please sign in again."
            });
        }

        if (challenge.expiresAt <= new Date()) {
            return res.status(410).json({
                success: false,
                message: "This sign-in request has expired. Please sign in again."
            });
        }

        const user = await User.findById(challenge.userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Unable to update this account."
            });
        }

        user.password = await bcrypt.hash(newPassword, 12);
        user.mustChangePassword = false;

        await user.save();

        // The account now has a usable password, so send the login OTP
        // for the staged challenge.
        const otp = createOtp();

        challenge.otpHash = await bcrypt.hash(otp, 12);
        challenge.expiresAt = new Date(Date.now() + OTP_TTL_MS);
        challenge.lastSentAt = new Date();
        challenge.attempts = 0;
        challenge.resendCount = 0;

        await sendOtpEmail(challenge.email, otp);
        await challenge.save();

        return res.json({
            success: true,
            message: "Password saved. Enter the verification code we emailed you.",
            challengeId: challenge._id,
            email: maskEmail(challenge.email),
            expiresAt: challenge.expiresAt
        });
    } catch (error) {
        console.error(
            "Set-password error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Unable to save your new password."
        });
    }
};

// ==========================================
// VERIFY OTP
//
// LOGIN: no 30-second expiry. User gets 6 attempts. On the 6th wrong code
// the entry is BLOCKED for 30 seconds. When the timer ends the user must
// request a NEW code and enter that one.
// Registration / password_reset keep the short TTL behaviour.
// ==========================================
const verifyOtp = async(req, res) => {
    try {
        const {
            challengeId,
            otp
        } = req.body || {};

        if (!/^[0-9]{6}$/.test(String(otp || ""))) {
            return res.status(400).json({
                success: false,
                message: "Please enter the 6-digit verification code."
            });
        }

        const challenge = challengeId ?
            await OTPVerification.findById(challengeId) :
            null;

        if (!challenge || challenge.verified) {
            return res.status(400).json({
                success: false,
                message: "Your verification request has expired. Please request a new code."
            });
        }

        const isLogin = challenge.purpose === "login";
        const now = new Date();

        // ---------------- Login: block handling (NO expiry) ----------------
        if (isLogin) {
            // Still blocked — reject every attempt until the 30s timer ends.
            if (challenge.blockedUntil && challenge.blockedUntil > now) {
                const remainingSeconds = Math.ceil(
                    (challenge.blockedUntil.getTime() - now.getTime()) / 1000
                );

                return res.status(429).json({
                    success: false,
                    blocked: true,
                    remainingSeconds,
                    blockedUntil: challenge.blockedUntil,
                    attemptsRemaining: 0,
                    message: `Too many incorrect attempts. OTP entry is blocked for ${remainingSeconds}s. When the timer ends, request a new code.`
                });
            }

            // Block timer ended after 6 failures — old code is dead.
            // User must request a NEW OTP before trying again.
            if (challenge.attempts >= MAX_ATTEMPTS) {
                return res.status(429).json({
                    success: false,
                    blocked: false,
                    mustResend: true,
                    attemptsRemaining: 0,
                    message: "You reached 6 incorrect attempts. Please request a new code and enter the new OTP."
                });
            }
        } else {
            // ---------------- Registration / password reset ----------------
            if (challenge.expiresAt <= now) {
                return res.status(410).json({
                    success: false,
                    message: "The 30-second timer has ended. Please request a new verification code."
                });
            }

            if (challenge.attempts >= MAX_ATTEMPTS) {
                return res.status(429).json({
                    success: false,
                    message: "Too many incorrect attempts. Your account has been temporarily blocked. Please request a new verification code."
                });
            }
        }

        if (!(await bcrypt.compare(
                String(otp),
                challenge.otpHash
            ))) {
            challenge.attempts += 1;

            // Login: 6th wrong code -> block OTP entry for 30 seconds.
            if (isLogin && challenge.attempts >= MAX_ATTEMPTS) {
                challenge.blockedUntil = new Date(Date.now() + BLOCK_DURATION_MS);
                await challenge.save();

                return res.status(429).json({
                    success: false,
                    blocked: true,
                    remainingSeconds: Math.ceil(BLOCK_DURATION_MS / 1000),
                    blockedUntil: challenge.blockedUntil,
                    attemptsRemaining: 0,
                    message: "Too many incorrect attempts. OTP entry is blocked for 30s. When the timer ends, request a new code."
                });
            }

            await challenge.save();

            return res
                .status(challenge.attempts >= MAX_ATTEMPTS ? 429 : 400)
                .json({
                    success: false,
                    blocked: false,
                    mustResend: isLogin && challenge.attempts >= MAX_ATTEMPTS ? true : undefined,
                    attemptsRemaining: Math.max(0, MAX_ATTEMPTS - challenge.attempts),
                    message: challenge.attempts >= MAX_ATTEMPTS ?
                        "Too many incorrect attempts. Please request a new verification code." : "Invalid verification code. You have " + (MAX_ATTEMPTS - challenge.attempts) + " attempt(s) remaining."
                });
        }

        challenge.verified = true;

        await challenge.save();

        // ---------------- Registration ----------------
        if (challenge.purpose === "registration") {
            await User.create(challenge.registrationData);

            return res.json({
                success: true,
                message: "Email verified successfully.",
                registered: true
            });
        }

        // ---------------- Password reset ----------------
        if (challenge.purpose === "password_reset") {
            const user = await User.findById(challenge.userId);

            if (!user || !challenge.resetPasswordHash) {
                return res.status(400).json({
                    success: false,
                    message: "This password-reset request is no longer valid."
                });
            }

            user.password = challenge.resetPasswordHash;
            user.mustChangePassword = false;

            await user.save();

            await logAudit({
                req,
                actor: user,
                actionType: "Password Reset",
                description: `${user.name} reset their password`,
                targetType: "User",
                targetId: user._id
            });

            return res.json({
                success: true,
                message: "Password reset successfully.",
                passwordReset: true
            });
        }

        // ---------------- Login ----------------
        const user = await User.findById(challenge.userId)
            .populate("barangay", "name");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        if (user.status === "suspended" ||
            user.status === "deactivated"
        ) {
            return res.status(403).json({
                success: false,
                message: "This account has been disabled. Please contact the City Scholarship Office."
            });
        }

        user.lastLoginAt = new Date();

        await user.save();

        await logAudit({
            req,
            actor: user,
            actionType: "Login",
            description: `${user.name} logged in to the system`,
            targetType: "User",
            targetId: user._id
        });

        const token = issueToken(user);

        return res.json({
            success: true,
            message: "Email verified successfully.",
            token,
            user: publicUser(user)
        });
    } catch (error) {
        console.error(
            "OTP verification error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Unable to verify the code."
        });
    }
};

// ==========================================
// RESEND OTP
//
// LOGIN: if the user hit 6 wrong attempts, a new code can ONLY be
// requested AFTER the 30s block timer ends. A successful resend resets
// attempts + block and issues a fresh code.
// ==========================================
const resendOtp = async(req, res) => {
    try {
        const challenge = await OTPVerification.findById(
            req.body?.challengeId
        );

        if (!challenge || challenge.verified) {
            return res.status(404).json({
                success: false,
                message: "Verification request not found."
            });
        }

        const isLogin = challenge.purpose === "login";
        const now = new Date();

        // Login: blocked (6 attempts) — no new code until timer ends.
        if (isLogin && challenge.blockedUntil && challenge.blockedUntil > now) {
            const remainingSeconds = Math.ceil(
                (challenge.blockedUntil.getTime() - now.getTime()) / 1000
            );

            return res.status(429).json({
                success: false,
                blocked: true,
                remainingSeconds,
                blockedUntil: challenge.blockedUntil,
                message: `OTP entry is blocked. Please wait ${remainingSeconds}s for the timer to end before requesting a new code.`
            });
        }

        if (challenge.resendCount >= MAX_RESENDS) {
            return res.status(429).json({
                success: false,
                message: "Too many code requests. Please try again later."
            });
        }

        const remaining =
            RESEND_COOLDOWN_MS -
            (Date.now() - challenge.lastSentAt.getTime());

        if (remaining > 0) {
            return res.status(429).json({
                success: false,
                remainingSeconds: Math.ceil(remaining / 1000),
                message: `Please wait ${Math.ceil(
                    remaining / 1000
                )} seconds for the timer to end before requesting a new code.`
            });
        }

        const otp = createOtp();

        challenge.otpHash = await bcrypt.hash(otp, 12);
        challenge.expiresAt = new Date(
            Date.now() + (isLogin ? LOGIN_OTP_TTL_MS : OTP_TTL_MS)
        );
        challenge.lastSentAt = new Date();
        challenge.resendCount += 1;
        // Fresh code = fresh attempts + block cleared.
        challenge.attempts = 0;
        challenge.blockedUntil = null;

        await sendOtpEmail(challenge.email, otp);
        await challenge.save();

        return res.json({
            success: true,
            challengeId: challenge._id,
            email: maskEmail(challenge.email),
            expiresAt: challenge.expiresAt
        });
    } catch (error) {
        console.error(
            "Resend OTP error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Unable to send a new verification code."
        });
    }
};

// ==========================================
// CREATE STAFF ACCOUNT (Super Admin only)
// ==========================================
// Creates a barangay_admin or city_admin account directly in the database
// without a password. The user sets their password via the standard
// forgot-password flow on first login.
//
// This endpoint is protected by superAdminOnly middleware.
// ==========================================
const createStaffAccount = async(req, res) => {
    try {
        const { email, employeeNumber, role, barangay } = req.body || {};

        // --- Validation ---
        const validationError = validateStaffAccountCreation({ email, employeeNumber, role, barangay });
        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        const normalizedEmail = normalizeEmail(email);
        const normalizedEmployeeNumber = employeeNumber.trim().toUpperCase();

        // --- Check for duplicates ---
        const existingByEmail = await User.findOne({ email: normalizedEmail });
        if (existingByEmail) {
            return res.status(400).json({
                success: false,
                message: "An account with this email address already exists."
            });
        }

        const existingByEmployeeNumber = await User.findOne({ employeeNumber: normalizedEmployeeNumber });
        if (existingByEmployeeNumber) {
            return res.status(400).json({
                success: false,
                message: "This employee number is already registered."
            });
        }

        // --- Determine the canonical role value ---
        // Stored as "barangay_admin" / "city_admin" — the exact values the
        // login flow reads back out of MongoDB to decide which portal the
        // account may open (Barangay portal vs City Office portal).
        const canonicalRole = role === "barangay_admin" ? "barangay_admin" : "city_admin";

        // --- Barangay assignment (Barangay Admin only) ---
        // Same lookup the student registration uses: the selected name
        // against the active Barangay collection. Stored on User.barangay so
        // the account is scoped to one barangay from the moment it exists —
        // without it every Barangay portal page shows "Your account is not
        // assigned to a barangay yet."
        let assignedBarangay = null;
        if (canonicalRole === "barangay_admin") {
            assignedBarangay = await Barangay.findOne({
                name: String(barangay || "").trim(),
                status: "active"
            });
            if (!assignedBarangay) {
                return res.status(400).json({
                    success: false,
                    message: "Please select a valid barangay."
                });
            }
        }

        // --- Create the user account ---
        // No password is set here on purpose: the Super Admin is the trusted
        // source for staff accounts, so the account is written straight to the
        // database with no email verification / OTP step. The holder sets
        // their own password on first login through the standard Forgot
        // Password flow. The name is left blank and is filled in later from
        // the user's own profile.
        const user = new User({
            name: "",
            email: normalizedEmail,
            password: "",
            role: canonicalRole,
            employeeNumber: normalizedEmployeeNumber,
            status: "active",
            mustChangePassword: false,
            ...(assignedBarangay ? { barangay: assignedBarangay._id } : {})
        });

        await user.save();

        // --- Log audit ---
        // "Account Change" is the closest value in the AuditLog enum for
        // provisioning a new account; the description spells out the details.
        await logAudit({
            req,
            actionType: "Account Change",
            description: `Created ${canonicalRole === "barangay_admin" ? "Barangay Admin" : "City Admin"} account ${normalizedEmail} (${normalizedEmployeeNumber})`,
            targetType: "User",
            targetId: user._id
        });

        return res.status(201).json({
            success: true,
            message: "Account created — the user can set their password via Forgot Password.",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                employeeNumber: user.employeeNumber,
                role: user.role,
                type: canonicalRole === "barangay_admin" ? "barangay" : "city",
                barangay: assignedBarangay ? assignedBarangay.name : "",
                status: user.status,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        console.error("Create staff account error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error while creating staff account."
        });
    }
};

// ==========================================
// SUPER ADMIN — thin aliases over the shared handlers.
//
// loginUser/requestPasswordReset/setInitialPassword already work for every
// role (role is read from MongoDB). These wrappers keep the
// /auth/super-admin/* routes functional without duplicate OTP logic.
// verifyOtp + resendOtp are shared as-is.
// ==========================================
const loginSuperAdmin = (req, res) => loginUser(req, res);
const setSuperAdminPassword = (req, res) => setInitialPassword(req, res);
const forgotSuperAdminPassword = (req, res) => requestPasswordReset(req, res);

// ==========================================
// EXPORT CONTROLLERS
// ==========================================
module.exports = {
    registerUser,
    loginUser,
    loginSuperAdmin,
    setSuperAdminPassword,
    forgotSuperAdminPassword,
    requestPasswordReset,
    setInitialPassword,
    verifyOtp,
    resendOtp,
    getCurrentUser,
    updateCurrentUser,
    createStaffAccount
};