const User = require("../models/User");
const Barangay = require("../models/Barangay");
const School = require("../models/School");
const Application = require("../models/Application");
const Document = require("../models/Document");
const Event = require("../models/Event");
const Announcement = require("../models/Announcement");
const AuditLog = require("../models/AuditLog");
const ProgramConfig = require("../models/ProgramConfig");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const {
    SUPER_ADMIN_ROLES,
    CITY_ADMIN_ROLES,
    BARANGAY_ADMIN_ROLES
} = require("../utils/validation");
const { logAudit } = require("../utils/audit");

// Roles reviewed through the Super Admin "Staff Accounts" page.
// Both the canonical names — "barangay_admin" / "city_admin", written by the
// Super Admin "Add User" flow — and the legacy self-registration names are
// included, so accounts created either way show up in the same lists.
const STAFF_ROLES = [...BARANGAY_ADMIN_ROLES, ...CITY_ADMIN_ROLES];

// ==========================================
// SHARED HELPERS
// ==========================================

// Database role -> portal role used by the client pages.
function toUiRole(dbRole) {
    if (BARANGAY_ADMIN_ROLES.includes(dbRole)) return "barangay";
    if (CITY_ADMIN_ROLES.includes(dbRole)) return "city";
    if (SUPER_ADMIN_ROLES.includes(dbRole)) return "superadmin";
    return "student";
}

// Portal role -> database role, or a group of database roles when a portal
// is served by both the canonical and the legacy role name.
function toDbRole(uiRole) {
    if (uiRole === "barangay") return { $in: [...BARANGAY_ADMIN_ROLES] };
    if (uiRole === "city") return { $in: [...CITY_ADMIN_ROLES] };
    if (uiRole === "superadmin") return { $in: [...SUPER_ADMIN_ROLES] };
    if (uiRole === "student") return "student";
    return null;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatDay(value) {
    const date = new Date(value || 0);

    if (!value || Number.isNaN(date.getTime())) return "";

    return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatLongDay(value) {
    const date = new Date(value || 0);

    if (!value || Number.isNaN(date.getTime())) return "";

    return `${MONTHS_LONG[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatTime(value) {
    const date = new Date(value || 0);

    if (!value || Number.isNaN(date.getTime())) return "";

    return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    });
}

// Review status shown on the "Staff Accounts" page.
function accountWorkflowStatus(status) {
    if (status === "pending") return "pending";
    if (status === "active") return "approved";
    return "rejected";
}

const toId = (value) => (value ? String(value) : "");

// A staff account provisioned by the Super Admin is created with only an
// email, employee number and role — no name. The holder fills the name in
// later from their own profile, so fall back to the email address here and
// lists never render a blank row.
function displayName(user) {
    return String(user?.name || "").trim() || user?.email || "";
}

// ==========================================
// DASHBOARD
// ==========================================
const getDashboard = async(req, res) => {
    try {
        const [
            totalUsers,
            totalStudents,
            totalBarangayStaff,
            totalCityStaff,
            totalSuperAdmins,
            pendingAccounts,
            totalApplications,
            approvedApplications,
            pendingApplications,
            rejectedApplications,
            totalBarangays,
            totalSchools,
            totalAnnouncements,
            totalEvents,
            totalDocuments,
            pendingCityStaff,
            pendingBarangayStaff
        ] = await Promise.all([
            User.countDocuments({ archived: { $ne: true } }),
            User.countDocuments({ role: "student", archived: { $ne: true } }),
            User.countDocuments({ role: { $in: BARANGAY_ADMIN_ROLES }, archived: { $ne: true } }),
            User.countDocuments({ role: { $in: CITY_ADMIN_ROLES }, archived: { $ne: true } }),
            User.countDocuments({ role: { $in: SUPER_ADMIN_ROLES }, archived: { $ne: true } }),
            User.countDocuments({ status: "pending" }),
            Application.countDocuments(),
            Application.countDocuments({ status: "approved" }),
            Application.countDocuments({ status: { $in: ["submitted", "under_review"] } }),
            Application.countDocuments({ status: "rejected" }),
            Barangay.countDocuments(),
            School.countDocuments(),
            Announcement.countDocuments({ published: true }),
            Event.countDocuments(),
            Document.countDocuments(),
            User.countDocuments({ role: { $in: CITY_ADMIN_ROLES }, status: "pending" }),
            User.countDocuments({ role: { $in: BARANGAY_ADMIN_ROLES }, status: "pending" })
        ]);

        // Applications vs approvals over the last 6 months.
        const trendStart = new Date();
        trendStart.setMonth(trendStart.getMonth() - 5);
        trendStart.setDate(1);
        trendStart.setHours(0, 0, 0, 0);

        const trendApplications = await Application.find({
            createdAt: { $gte: trendStart }
        }).select("createdAt status").lean();

        const buckets = [];

        for (let index = 0; index < 6; index += 1) {
            const date = new Date(trendStart);
            date.setMonth(trendStart.getMonth() + index);

            buckets.push({
                key: `${date.getFullYear()}-${date.getMonth()}`,
                month: MONTHS_SHORT[date.getMonth()],
                applications: 0,
                approvals: 0
            });
        }

        const bucketIndex = new Map(buckets.map((bucket, index) => [bucket.key, index]));

        trendApplications.forEach((application) => {
            const created = new Date(application.createdAt);
            const index = bucketIndex.get(`${created.getFullYear()}-${created.getMonth()}`);

            if (index === undefined) return;

            buckets[index].applications += 1;

            if (application.status === "approved") buckets[index].approvals += 1;
        });

        // Scholars per school (approved applications).
        const schoolData = await Application.aggregate([
            { $match: { status: "approved" } },
            { $group: { _id: "$school", scholars: { $sum: 1 } } },
            { $sort: { scholars: -1 } },
            { $limit: 5 },
            { $project: { _id: 0, school: { $ifNull: ["$_id", "Unspecified"] }, scholars: 1 } }
        ]);

        const recentActivity = await AuditLog.find()
            .sort({ createdAt: -1 })
            .limit(6)
            .lean();

        return res.json({
            success: true,
            stats: {
                totalUsers,
                totalStudents,
                totalBarangayStaff,
                totalCityStaff,
                totalSuperAdmins,
                pendingAccounts,
                totalApplications,
                approvedApplications,
                pendingApplications,
                rejectedApplications,
                totalBarangays,
                totalSchools,
                totalAnnouncements,
                totalEvents,
                totalDocuments,
                pendingCityStaff,
                pendingBarangayStaff
            },
            schoolData,
            trendData: buckets.map(({ month, applications, approvals }) => ({
                month,
                applications,
                approvals
            })),
            activityFeed: recentActivity.map((entry) => ({
                id: toId(entry._id),
                time: `${formatDay(entry.createdAt)}, ${formatTime(entry.createdAt)}`,
                createdAt: entry.createdAt,
                user: entry.actorEmail || entry.actorName,
                action: entry.description,
                type: entry.actionType
            }))
        });
    } catch (error) {
        console.error("Super Admin dashboard error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to load the dashboard."
        });
    }
};

// ==========================================
// STAFF ACCOUNTS (review workflow)
// ==========================================

function serializeAccount(user) {
    const uiRole = toUiRole(user.role);

    return {
        id: toId(user._id),
        name: displayName(user),
        email: user.email,
        employeeNumber: user.employeeNumber || "",
        type: uiRole === "barangay" ? "barangay" : "city",
        role: uiRole,
        dbRole: user.role,
        barangay: user.barangay?.name || "",
        barangayId: user.barangay?._id ? toId(user.barangay._id) : "",
        registeredDate: formatLongDay(user.createdAt),
        registeredAt: user.createdAt,
        status: accountWorkflowStatus(user.status),
        dbStatus: user.status,
        reviewNotes: user.reviewNotes || ""
    };
}

const listAccounts = async(req, res) => {
    try {
        const type = String(req.query.type || "city").toLowerCase();
        const status = String(req.query.status || "all").toLowerCase();

        // Staff Accounts is split into two tabs. Each tab matches every role
        // name that belongs to the portal, so an account created by the Super
        // Admin "Add User" flow (role "barangay_admin" / "city_admin") and an
        // older self-registered account (role "barangay_staff" / "admin_staff")
        // both appear.
        const roleFilter = type === "barangay" ?
            { $in: [...BARANGAY_ADMIN_ROLES] } :
            { $in: [...CITY_ADMIN_ROLES] };

        const filter = { role: roleFilter, archived: { $ne: true } };

        if (status === "pending") filter.status = "pending";
        else if (status === "approved") filter.status = "active";
        else if (status === "rejected") filter.status = { $in: ["suspended", "deactivated"] };

        const users = await User.find(filter)
            .populate("barangay", "name")
            .sort({ createdAt: -1 })
            .lean();

        const accounts = users.map(serializeAccount);

        return res.json({
            success: true,
            accounts,
            counts: {
                all: accounts.length,
                pending: accounts.filter((account) => account.status === "pending").length,
                approved: accounts.filter((account) => account.status === "approved").length,
                rejected: accounts.filter((account) => account.status === "rejected").length
            }
        });
    } catch (error) {
        console.error("Super Admin list accounts error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to load staff accounts."
        });
    }
};

const reviewAccount = async(req, res) => {
    try {
        const decision = String(req.body.status || "").toLowerCase();
        const reviewNotes = String(req.body.reviewNotes || "").trim();

        const user = await User.findById(req.params.id).populate("barangay", "name");

        if (!user || !STAFF_ROLES.includes(user.role)) {
            return res.status(404).json({
                success: false,
                message: "Staff account not found."
            });
        }

        // --- Barangay reassignment (Super Admin "Edit") ---
        // Body { barangay: "<name>" } with NO status decision: assigns or
        // moves an existing Barangay Official to a different barangay. Used
        // to fix accounts created before the Add User dropdown existed and
        // to reassign an official who transferred — works for every account
        // status, independently of the approve / reject workflow.
        if (req.body && typeof req.body.barangay === "string" && !("status" in req.body)) {
            if (!BARANGAY_ADMIN_ROLES.includes(user.role)) {
                return res.status(400).json({
                    success: false,
                    message: "Only Barangay Official accounts can be assigned a barangay."
                });
            }

            const barangayName = req.body.barangay.trim();
            const barangay = await Barangay.findOne({ name: barangayName, status: "active" });
            if (!barangay) {
                return res.status(400).json({
                    success: false,
                    message: "Please select a valid barangay."
                });
            }

            const hadBarangay = Boolean(user.barangay);
            user.barangay = barangay._id;
            await user.save();
            await user.populate("barangay", "name");

            await logAudit({
                req,
                actionType: "Data Change",
                description: `${hadBarangay ? "Reassigned" : "Assigned"} ${user.name || user.email} to Barangay ${barangayName}`,
                targetType: "User",
                targetId: user._id
            });

            return res.json({
                success: true,
                message: "Barangay assignment updated.",
                account: serializeAccount(user)
            });
        }

        if (!["approved", "rejected", "pending"].includes(decision)) {
            return res.status(400).json({
                success: false,
                message: "Status must be approved, rejected or pending."
            });
        }

        user.status = decision === "approved" ? "active" :
            decision === "rejected" ? "deactivated" :
            "pending";
        user.reviewNotes = reviewNotes;

        if (decision === "rejected") {
            user.mustChangePassword = true;
        }

        await user.save();

        await logAudit({
            req,
            actionType: decision === "approved" ? "Account Approval" : "Account Rejection",
            description: decision === "approved" ?
                `Approved account for ${user.name} (${user.email})` :
                `Rejected account — ${user.name} (${user.email})`,
            targetType: "User",
            targetId: user._id
        });

        return res.json({
            success: true,
            message: decision === "approved" ?
                "Account approved." : "Account rejected.",
            account: serializeAccount(user)
        });
    } catch (error) {
        console.error("Super Admin review account error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to update this account."
        });
    }
};

// ==========================================
// ALL USERS
// ==========================================

function serializeUser(user) {
    return {
        id: toId(user._id),
        name: displayName(user),
        email: user.email,
        employeeNumber: user.employeeNumber || "",
        role: toUiRole(user.role),
        dbRole: user.role,
        barangay: user.barangay?.name || "",
        barangayId: user.barangay?._id ? toId(user.barangay._id) : "",
        school: user.role === "student" ? (user.profile?.schoolName || "") : "",
        status: user.status || "active",
        lastLogin: user.lastLoginAt ? formatDay(user.lastLoginAt) : "Never",
        lastLoginAt: user.lastLoginAt || null,
        registeredDate: formatDay(user.createdAt),
        createdAt: user.createdAt,
        archived: Boolean(user.archived)
    };
}

const listUsers = async(req, res) => {
    try {
        const role = String(req.query.role || "all").toLowerCase();
        const status = String(req.query.status || "all").toLowerCase();
        const search = String(req.query.search || "").trim();

        const filter = {};

        if (role !== "all") {
            const dbRole = toDbRole(role);

            if (!dbRole) {
                return res.status(400).json({
                    success: false,
                    message: "Unknown role filter."
                });
            }

            // toDbRole already returns the exact match or the $in group that
            // covers both the canonical and the legacy role name.
            filter.role = dbRole;
        }

        if (status !== "all") filter.status = status;

        if (search) {
            const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

            filter.$or = [
                { name: pattern },
                { email: pattern },
                { employeeNumber: pattern },
                { "profile.schoolName": pattern }
            ];
        }

        const users = await User.find(filter)
            .populate("barangay", "name")
            .sort({ createdAt: -1 })
            .limit(500)
            .lean();

        const serialized = users.map(serializeUser);

        return res.json({
            success: true,
            users: serialized,
            counts: {
                all: serialized.length,
                student: serialized.filter((user) => user.role === "student").length,
                barangay: serialized.filter((user) => user.role === "barangay").length,
                city: serialized.filter((user) => user.role === "city").length,
                superadmin: serialized.filter((user) => user.role === "superadmin").length
            },
            barangays: await Barangay.find({ status: "active" }).select("name").sort({ name: 1 }).lean(),
            schools: await School.find({ status: "active" }).select("name").sort({ name: 1 }).lean()
        });
    } catch (error) {
        console.error("Super Admin list users error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to load users."
        });
    }
};

const updateUser = async(req, res) => {
    try {
        const user = await User.findById(req.params.id).populate("barangay", "name");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const { status, barangayId, schoolName } = req.body || {};
        const changes = [];

        if (status) {
            if (!["active", "suspended", "deactivated", "pending"].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Unknown account status."
                });
            }

            user.status = status;
            changes.push(`status to ${status}`);
        }

        if (barangayId) {
            // Belt-and-suspenders: accept a barangay ObjectId (what the UI
            // now sends) OR a barangay display name, so a client that passes
            // the name can never produce a Mongoose CastError — the update
            // either resolves the right record or fails with a clear 400.
            let barangay = null;
            if (mongoose.isValidObjectId(String(barangayId))) {
                barangay = await Barangay.findById(barangayId);
            }
            if (!barangay) {
                barangay = await Barangay.findOne({
                    name: String(barangayId).trim(),
                    status: "active"
                });
            }

            if (!barangay) {
                return res.status(400).json({
                    success: false,
                    message: "Barangay not found."
                });
            }

            user.barangay = barangay._id;
            changes.push(`barangay to ${barangay.name}`);
        }

        if (schoolName !== undefined) {
            const profile = user.profile?.toObject ? user.profile.toObject() : { ...(user.profile || {}) };

            profile.schoolName = String(schoolName || "").trim();
            user.profile = profile;

            changes.push(`school to ${schoolName || "(none)"}`);
        }

        await user.save();
        await user.populate("barangay", "name");

        await logAudit({
            req,
            actionType: status === "suspended" ? "User Suspension" :
                status === "active" ? "User Reactivation" :
                "Account Change",
            description: `Updated ${user.name} (${user.email})${changes.length ? ` — ${changes.join(", ")}` : ""}`,
            targetType: "User",
            targetId: user._id
        });

        return res.json({
            success: true,
            message: "User updated.",
            user: serializeUser(user)
        });
    } catch (error) {
        console.error("Super Admin update user error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to update this user."
        });
    }
};

const resetUserPassword = async(req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        // Forces the account through the "set a new password" step on
        // its next sign-in.
        const temporaryPassword = `CS-${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 6)}`;

        user.password = await bcrypt.hash(temporaryPassword, 10);
        user.mustChangePassword = true;

        await user.save();

        await logAudit({
            req,
            actionType: "Password Reset",
            description: `Issued a temporary password for ${user.name} (${user.email})`,
            targetType: "User",
            targetId: user._id
        });

        return res.json({
            success: true,
            message: "Temporary password issued. The user must change it on the next sign-in.",
            temporaryPassword
        });
    } catch (error) {
        console.error("Super Admin reset password error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to reset the password."
        });
    }
};

// ==========================================
// PROGRAM CONFIGURATION
// ==========================================

function serializeProgram(program) {
    return {
        id: toId(program._id),
        programName: program.programName,
        description: program.description || "",
        academicYear: program.academicYear,
        semester: program.semester,
        minGwa: program.minGwa,
        requiredUnits: program.requiredUnits,
        grantAmount: program.grantAmount,
        slotsAvailable: program.slotsAvailable,
        applicationOpenAt: program.applicationOpenAt,
        applicationCloseAt: program.applicationCloseAt,
        requiredDocuments: program.requiredDocuments || [],
        eligibleSchools: program.eligibleSchools || [],
        active: program.active,
        updatedAt: program.updatedAt
    };
}

const getProgramConfig = async(req, res) => {
    try {
        const academicYear = String(req.query.academicYear || "").trim();
        const semester = String(req.query.semester || "").trim();

        const filter = {};

        if (academicYear) filter.academicYear = academicYear;
        if (semester) filter.semester = semester;

        const programs = await ProgramConfig.find(filter).sort({ academicYear: -1, semester: 1 }).lean();

        return res.json({
            success: true,
            programs: programs.map(serializeProgram),
            academicYears: [...new Set(programs.map((program) => program.academicYear))],
            semesters: [...new Set(programs.map((program) => program.semester))],
            schools: await School.find().select("name").sort({ name: 1 }).lean(),
            requiredDocumentOptions: [
                "Certificate of Enrollment",
                "Report of Grades",
                "Certificate of Good Moral Character",
                "Barangay Clearance",
                "Certificate of Indigency",
                "Parent's Income Tax Return",
                "School ID",
                "Valid Government ID"
            ]
        });
    } catch (error) {
        console.error("Super Admin program config error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to load the program configuration."
        });
    }
};

const saveProgramConfig = async(req, res) => {
    try {
        const {
            id,
            programName,
            description,
            academicYear,
            semester,
            minGwa,
            requiredUnits,
            grantAmount,
            slotsAvailable,
            applicationOpenAt,
            applicationCloseAt,
            requiredDocuments,
            eligibleSchools,
            active
        } = req.body || {};

        if (!programName || !academicYear || !semester) {
            return res.status(400).json({
                success: false,
                message: "Program name, academic year and semester are required."
            });
        }

        const payload = {
            programName: String(programName).trim(),
            description: String(description || "").trim(),
            academicYear: String(academicYear).trim(),
            semester: String(semester).trim(),
            minGwa: Number(minGwa) || 0,
            requiredUnits: Number(requiredUnits) || 0,
            grantAmount: Number(grantAmount) || 0,
            slotsAvailable: Number(slotsAvailable) || 0,
            applicationOpenAt: applicationOpenAt ? new Date(applicationOpenAt) : null,
            applicationCloseAt: applicationCloseAt ? new Date(applicationCloseAt) : null,
            requiredDocuments: Array.isArray(requiredDocuments) ? requiredDocuments : [],
            eligibleSchools: Array.isArray(eligibleSchools) ? eligibleSchools : [],
            active: active === undefined ? true : Boolean(active),
            updatedBy: req.user.id
        };

        let program = null;

        if (id) {
            program = await ProgramConfig.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
        } else {
            program = await ProgramConfig.findOneAndUpdate(
                {
                    programName: payload.programName,
                    academicYear: payload.academicYear,
                    semester: payload.semester
                },
                payload,
                { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
            );
        }

        await logAudit({
            req,
            actionType: "Config Change",
            description: `Saved program configuration "${payload.programName}" (${payload.academicYear} · ${payload.semester})`,
            targetType: "ProgramConfig",
            targetId: program._id
        });

        return res.json({
            success: true,
            message: "Program configuration saved.",
            program: serializeProgram(program)
        });
    } catch (error) {
        console.error("Super Admin save program config error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to save the program configuration."
        });
    }
};

// ==========================================
// SCHOOLS & BARANGAYS
// ==========================================

const listData = async(req, res) => {
    try {
        const [schools, barangays] = await Promise.all([
            School.find().sort({ name: 1 }).lean(),
            Barangay.find().sort({ name: 1 }).lean()
        ]);

        const schoolCounts = await Application.aggregate([
            { $group: { _id: "$school", applications: { $sum: 1 } } }
        ]);

        const barangayCounts = await User.aggregate([
            { $match: { role: "student" } },
            { $group: { _id: "$barangay", students: { $sum: 1 } } }
        ]);

        // Assigned official = the barangay officer (barangay_staff user) linked to the barangay.
        const officials = await User.find({ role: "barangay_staff" }).select("name email barangay").lean();
        const officialMap = new Map();
        officials.forEach((official) => {
            const key = toId(official.barangay);
            if (key && !officialMap.has(key)) officialMap.set(key, { name: official.name, email: official.email });
        });

        const schoolMap = new Map(schoolCounts.map((entry) => [entry._id, entry.applications]));
        const barangayMap = new Map(barangayCounts.map((entry) => [toId(entry._id), entry.students]));

        return res.json({
            success: true,
            schools: schools.map((school) => ({
                id: toId(school._id),
                name: school.name,
                address: school.address || "",
                type: school.type || "",
                contactPerson: school.contactPerson || "",
                contactEmail: school.contactEmail || "",
                status: school.status,
                applications: schoolMap.get(school.name) || 0
            })),
            barangays: barangays.map((barangay) => ({
                id: toId(barangay._id),
                name: barangay.name,
                city: barangay.city,
                province: barangay.province,
                status: barangay.status,
                students: barangayMap.get(toId(barangay._id)) || 0,
                assignedOfficial: officialMap.get(toId(barangay._id))?.name || null,
                assignedOfficialEmail: officialMap.get(toId(barangay._id))?.email || null
            }))
        });
    } catch (error) {
        console.error("Super Admin list data error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to load schools and barangays."
        });
    }
};

const saveSchool = async(req, res) => {
    try {
        const { id, name, address, type, contactPerson, contactEmail, status } = req.body || {};

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "School name is required."
            });
        }

        const payload = {
            name: String(name).trim(),
            address: String(address || "").trim(),
            type: String(type || "Public").trim(),
            contactPerson: String(contactPerson || "").trim(),
            contactEmail: String(contactEmail || "").trim().toLowerCase(),
            status: status === "inactive" ? "inactive" : "active"
        };

        const school = id ?
            await School.findByIdAndUpdate(id, payload, { new: true, runValidators: true }) :
            await School.findOneAndUpdate({ name: payload.name }, payload, {
                new: true,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true
            });

        await logAudit({
            req,
            actionType: "Data Change",
            description: `Saved school "${payload.name}" (${payload.status})`,
            targetType: "School",
            targetId: school._id
        });

        return res.json({
            success: true,
            message: "School saved.",
            school: {
                id: toId(school._id),
                name: school.name,
                address: school.address || "",
                type: school.type || "",
                contactPerson: school.contactPerson || "",
                contactEmail: school.contactEmail || "",
                status: school.status,
                applications: 0
            }
        });
    } catch (error) {
        console.error("Super Admin save school error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to save this school."
        });
    }
};

const saveBarangay = async(req, res) => {
    try {
        const { id, name, city, province, status, assignedOfficialEmail } = req.body || {};

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Barangay name is required."
            });
        }

        const payload = {
            name: String(name).trim(),
            city: String(city || "Dagupan City").trim(),
            province: String(province || "Pangasinan").trim(),
            status: status === "inactive" ? "inactive" : "active"
        };

        const barangay = id ?
            await Barangay.findByIdAndUpdate(id, payload, { new: true, runValidators: true }) :
            await Barangay.findOneAndUpdate({ name: payload.name }, payload, {
                new: true,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true
            });

        // Assign / unassign the barangay official. The official must be an
        // existing barangay staff account; assignment links that account to
        // the barangay, an empty value removes the link.
        const email = String(assignedOfficialEmail || "").trim().toLowerCase();

        if (email) {
            const official = await User.findOne({ email, role: "barangay_staff" });

            if (!official) {
                return res.status(400).json({
                    success: false,
                    message: "No barangay staff account was found with that email address."
                });
            }

            official.barangay = barangay._id;
            await official.save();
        } else if (id) {
            await User.updateMany(
                { role: "barangay_staff", barangay: barangay._id },
                { $set: { barangay: null } }
            );
        }

        const official = await User.findOne({ role: "barangay_staff", barangay: barangay._id }).select("name email").lean();
        const students = await User.countDocuments({ role: "student", barangay: barangay._id });

        await logAudit({
            req,
            actionType: "Data Change",
            description: `Saved barangay "${payload.name}" (${payload.status})${official ? ` · official: ${official.name}` : " · official: unassigned"}`,
            targetType: "Barangay",
            targetId: barangay._id
        });

        return res.json({
            success: true,
            message: "Barangay saved.",
            barangay: {
                id: toId(barangay._id),
                name: barangay.name,
                city: barangay.city,
                province: barangay.province,
                status: barangay.status,
                students,
                assignedOfficial: official?.name || null,
                assignedOfficialEmail: official?.email || null
            }
        });
    } catch (error) {
        console.error("Super Admin save barangay error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to save this barangay."
        });
    }
};

// ==========================================
// ARCHIVE
// ==========================================

const listArchive = async(req, res) => {
    try {
        const type = String(req.query.type || "all").toLowerCase();
        const search = String(req.query.search || "").trim();

        const records = [];

        if (type === "all" || type === "application") {
            const applications = await Application.find({ status: "rejected" })
                .populate("student", "name email")
                .populate("barangay", "name")
                .sort({ updatedAt: -1 })
                .limit(200)
                .lean();

            applications.forEach((application) => {
                records.push({
                    id: toId(application._id),
                    type: "application",
                    title: application.student?.name || "Unknown applicant",
                    subtitle: `${application.program} · ${application.school}`,
                    detail: application.barangay?.name || "Unassigned barangay",
                    status: application.status,
                    archivedAt: application.updatedAt,
                    archivedDate: formatDay(application.updatedAt)
                });
            });
        }

        if (type === "all" || type === "user") {
            const users = await User.find({
                $or: [
                    { archived: true },
                    { status: { $in: ["suspended", "deactivated"] } }
                ]
            }).sort({ updatedAt: -1 }).limit(200).lean();

            users.forEach((user) => {
                records.push({
                    id: toId(user._id),
                    type: "user",
                    title: user.name,
                    subtitle: user.email,
                    detail: `Account · ${toUiRole(user.role)}`,
                    status: user.archived ? "archived" : user.status,
                    archivedAt: user.updatedAt,
                    archivedDate: formatDay(user.updatedAt)
                });
            });
        }

        if (type === "all" || type === "document") {
            const documents = await Document.find({ status: "rejected" })
                .populate("student", "name email")
                .sort({ updatedAt: -1 })
                .limit(200)
                .lean();

            documents.forEach((document) => {
                records.push({
                    id: toId(document._id),
                    type: "document",
                    title: document.originalName,
                    subtitle: `${document.type || "document"} · ${document.student?.name || "Unknown student"}`,
                    detail: document.remarks || "No remarks",
                    status: document.status,
                    archivedAt: document.updatedAt,
                    archivedDate: formatDay(document.updatedAt)
                });
            });
        }

        const filtered = search ?
            records.filter((record) =>
                `${record.title} ${record.subtitle} ${record.detail}`
                .toLowerCase()
                .includes(search.toLowerCase())) :
            records;

        filtered.sort((left, right) => new Date(right.archivedAt) - new Date(left.archivedAt));

        return res.json({
            success: true,
            records: filtered,
            counts: {
                all: records.length,
                application: records.filter((record) => record.type === "application").length,
                user: records.filter((record) => record.type === "user").length,
                document: records.filter((record) => record.type === "document").length
            }
        });
    } catch (error) {
        console.error("Super Admin archive error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to load archived records."
        });
    }
};

// ==========================================
// AUDIT LOG
// ==========================================

const listAuditLogs = async(req, res) => {
    try {
        const actionType = String(req.query.actionType || "all").trim();
        const role = String(req.query.role || "all").trim();
        const search = String(req.query.search || "").trim();
        const limit = Math.min(Number(req.query.limit) || 200, 500);

        const filter = {};

        if (actionType !== "all") filter.actionType = actionType;

        if (role !== "all") {
            filter.actorRole = role === "superadmin" ?
                { $in: SUPER_ADMIN_ROLES } :
                role;
        }

        if (search) {
            const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

            filter.$or = [
                { description: pattern },
                { actorName: pattern },
                { actorEmail: pattern }
            ];
        }

        const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();

        return res.json({
            success: true,
            logs: logs.map((entry) => ({
                id: toId(entry._id),
                timestamp: entry.createdAt,
                date: formatDay(entry.createdAt),
                time: formatTime(entry.createdAt),
                user: entry.actorName || "System",
                email: entry.actorEmail || "",
                role: toUiRole(entry.actorRole),
                dbRole: entry.actorRole || "",
                actionType: entry.actionType,
                description: entry.description,
                targetType: entry.targetType || "",
                ip: entry.ip || ""
            })),
            actionTypes: (await AuditLog.distinct("actionType")).filter(Boolean).sort()
        });
    } catch (error) {
        console.error("Super Admin audit log error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to load the audit log."
        });
    }
};

// ==========================================
// REPORTS
// ==========================================

const REPORT_DEFINITIONS = [
    { id: "scholar-master", title: "Scholar Master List" },
    { id: "applicant-summary", title: "Applicant Summary" },
    { id: "renewal-report", title: "Renewal Report" },
    { id: "disbursement-report", title: "Disbursement Report" },
    { id: "document-compliance", title: "Document Compliance" },
    { id: "barangay-breakdown", title: "Barangay Breakdown" },
    { id: "school-enrollment", title: "School Enrollment" },
    { id: "audit-trail", title: "Audit Trail Export" }
];

const getReports = async(req, res) => {
    try {
        const [
            totalApplications,
            pendingApplications,
            approvedApplications,
            rejectedApplications,
            totalDocuments,
            verifiedDocuments,
            pendingDocuments,
            totalBarangays,
            totalSchools
        ] = await Promise.all([
            Application.countDocuments(),
            Application.countDocuments({ status: { $in: ["submitted", "under_review"] } }),
            Application.countDocuments({ status: "approved" }),
            Application.countDocuments({ status: "rejected" }),
            Document.countDocuments(),
            Document.countDocuments({ status: "verified" }),
            Document.countDocuments({ status: "pending" }),
            Barangay.countDocuments({ status: "active" }),
            School.countDocuments({ status: "active" })
        ]);

        const recentExports = await AuditLog.find({ actionType: "Report Export" })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        const activeProgram = await ProgramConfig.findOne({ active: true })
            .sort({ updatedAt: -1 })
            .lean();

        return res.json({
            success: true,
            summary: {
                totalApplications,
                pendingApplications,
                approvedApplications,
                rejectedApplications,
                totalDocuments,
                verifiedDocuments,
                pendingDocuments,
                totalBarangays,
                totalSchools,
                grantAmount: activeProgram?.grantAmount || 0,
                academicYear: activeProgram?.academicYear || "",
                semester: activeProgram?.semester || "",
                disbursedTotal: (activeProgram?.grantAmount || 0) * approvedApplications
            },
            recentExports: recentExports.map((entry) => ({
                id: toId(entry._id),
                reportName: entry.description.replace(/^Exported\s+/, "").replace(/\s+\(.*\)$/, ""),
                generatedBy: entry.actorName || "System",
                date: formatLongDay(entry.createdAt),
                format: /CSV/i.test(entry.description) ? "CSV" : "PDF"
            }))
        });
    } catch (error) {
        console.error("Super Admin reports error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to load report data."
        });
    }
};

// Builds the actual report rows from the database.
async function buildReportRows(reportId) {
    const approved = await Application.find({ status: "approved" })
        .populate("student", "name email")
        .populate("barangay", "name")
        .sort({ updatedAt: -1 })
        .limit(2000)
        .lean();

    if (reportId === "scholar-master") {
        return {
            columns: ["Scholar", "Email", "School", "Program", "Barangay", "Status"],
            rows: approved.map((application) => [
                application.student?.name || "",
                application.student?.email || "",
                application.school,
                application.program,
                application.barangay?.name || "",
                application.status
            ])
        };
    }

    if (reportId === "applicant-summary") {
        const applications = await Application.find().select("status").lean();

        const counts = applications.reduce((accumulator, application) => {
            accumulator[application.status] = (accumulator[application.status] || 0) + 1;

            return accumulator;
        }, {});

        return {
            columns: ["Status", "Applications"],
            rows: Object.entries(counts).map(([status, count]) => [status, count])
        };
    }

    if (reportId === "renewal-report") {
        const renewals = await Application.find({ status: { $in: ["renewal", "approved"] } })
            .populate("student", "name email")
            .populate("barangay", "name")
            .limit(2000)
            .lean();

        return {
            columns: ["Scholar", "Email", "Barangay", "Status", "Submitted"],
            rows: renewals.map((application) => [
                application.student?.name || "",
                application.student?.email || "",
                application.barangay?.name || "",
                application.status,
                formatDay(application.submittedAt || application.createdAt)
            ])
        };
    }

    if (reportId === "disbursement-report") {
        const program = await ProgramConfig.findOne({ active: true }).sort({ updatedAt: -1 }).lean();

        return {
            columns: ["Scholar", "School", "Program", "Grant Amount", "Semester"],
            rows: approved.map((application) => [
                application.student?.name || "",
                application.school,
                application.program,
                program?.grantAmount || 0,
                `${program?.semester || ""} ${program?.academicYear || ""}`.trim()
            ])
        };
    }

    if (reportId === "document-compliance") {
        const documents = await Document.find()
            .populate("student", "name email")
            .limit(2000)
            .lean();

        return {
            columns: ["Scholar", "Document", "Type", "Status", "Submitted"],
            rows: documents.map((document) => [
                document.student?.name || "",
                document.originalName,
                document.type || "",
                document.status,
                formatDay(document.createdAt)
            ])
        };
    }

    if (reportId === "barangay-breakdown") {
        const rows = await Application.aggregate([
            { $match: { status: "approved" } },
            { $group: { _id: "$barangay", scholars: { $sum: 1 } } },
            { $sort: { scholars: -1 } },
            {
                $lookup: {
                    from: "barangays",
                    localField: "_id",
                    foreignField: "_id",
                    as: "barangay"
                }
            },
            {
                $project: {
                    _id: 0,
                    barangay: { $ifNull: [{ $arrayElemAt: ["$barangay.name", 0] }, "Unassigned"] },
                    scholars: 1
                }
            }
        ]);

        return {
            columns: ["Barangay", "Scholars"],
            rows: rows.map((row) => [row.barangay, row.scholars])
        };
    }

    if (reportId === "school-enrollment") {
        const rows = await Application.aggregate([
            { $match: { status: "approved" } },
            { $group: { _id: "$school", scholars: { $sum: 1 } } },
            { $sort: { scholars: -1 } },
            { $project: { _id: 0, school: { $ifNull: ["$_id", "Unspecified"] }, scholars: 1 } }
        ]);

        return {
            columns: ["School", "Scholars"],
            rows: rows.map((row) => [row.school, row.scholars])
        };
    }

    // audit-trail
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(2000).lean();

    return {
        columns: ["Timestamp", "User", "Role", "Action", "Description"],
        rows: logs.map((entry) => [
            `${formatDay(entry.createdAt)} ${formatTime(entry.createdAt)}`,
            entry.actorName || "System",
            entry.actorRole || "",
            entry.actionType,
            entry.description
        ])
    };
}

const exportReport = async(req, res) => {
    try {
        const { reportId } = req.params;
        const format = String(req.body?.format || "CSV").toUpperCase();

        const definition = REPORT_DEFINITIONS.find((report) => report.id === reportId);

        if (!definition) {
            return res.status(404).json({
                success: false,
                message: "Unknown report."
            });
        }

        const { columns, rows } = await buildReportRows(reportId);

        await logAudit({
            req,
            actionType: "Report Export",
            description: `Exported ${definition.title} (${format})`,
            targetType: "Report",
            targetId: reportId
        });

        return res.json({
            success: true,
            report: {
                id: definition.id,
                title: definition.title,
                format,
                generatedAt: new Date(),
                columns,
                rows,
                rowCount: rows.length
            }
        });
    } catch (error) {
        console.error("Super Admin export report error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to generate this report."
        });
    }
};

module.exports = {
    getDashboard,
    listAccounts,
    reviewAccount,
    listUsers,
    updateUser,
    resetUserPassword,
    getProgramConfig,
    saveProgramConfig,
    listData,
    saveSchool,
    saveBarangay,
    listArchive,
    listAuditLogs,
    getReports,
    exportReport
};