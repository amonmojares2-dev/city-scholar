const User = require("../models/User");
const ProgramConfig = require("../models/ProgramConfig");

// GET /api/users - read-only account directory.
// The City Office pages (User Management, Barangay Accounts) need every
// account with the barangay name resolved. Writes are NOT done here:
// staff accounts are provisioned by the Super Admin, students self-register.
const listDirectoryUsers = async (req, res, next) => {
    try {
        const users = await User.find()
            .select("name email role status barangay scholarType scholarVerificationStatus createdAt lastLoginAt")
            .populate("barangay", "name")
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            success: true,
            users: users.map((user) => ({
                id: String(user._id),
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                scholarType: user.scholarType,
                scholarVerificationStatus: user.scholarVerificationStatus,
                barangayId: user.barangay && user.barangay._id ? String(user.barangay._id) : null,
                barangay: (user.barangay && user.barangay.name) || "",
                createdAt: user.createdAt,
                lastLoginAt: user.lastLoginAt,
            })),
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/programs - read-only scholarship program configuration.
// Mirrors the Super Admin Program Config data (ProgramConfig collection) so
// City Office pages (Scholarship Programs, System Settings) show real
// values. Program writes stay with the Super Admin endpoints.
const listPrograms = async (req, res, next) => {
    try {
        const programs = await ProgramConfig.find()
            .sort({ academicYear: -1, semester: 1, programName: 1 })
            .lean();

        const academicYears = [...new Set(programs.map((program) => program.academicYear))];
        const semesters = [...new Set(programs.map((program) => program.semester))];

        res.json({
            success: true,
            programs: programs.map((program) => ({
                id: String(program._id),
                programName: program.programName,
                description: program.description,
                academicYear: program.academicYear,
                semester: program.semester,
                minGwa: program.minGwa,
                requiredUnits: program.requiredUnits,
                grantAmount: program.grantAmount,
                slotsAvailable: program.slotsAvailable,
                applicationOpenAt: program.applicationOpenAt,
                applicationCloseAt: program.applicationCloseAt,
                requiredDocuments: program.requiredDocuments,
                eligibleSchools: program.eligibleSchools,
                active: program.active,
            })),
            academicYears,
            semesters,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { listDirectoryUsers, listPrograms };
