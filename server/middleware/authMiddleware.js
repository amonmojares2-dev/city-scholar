const jwt = require("jsonwebtoken");
const User = require("../models/User");
const {
    SUPER_ADMIN_ROLES,
    CITY_ADMIN_ROLES,
    BARANGAY_ADMIN_ROLES
} = require("../utils/validation");

// ==========================================
// Role groups
//
// The same mapping the client uses, kept here so the server never has
// to trust anything the browser sends.
// ==========================================
const ROLE_GROUPS = {
    student: ["student"],
    barangay: [...BARANGAY_ADMIN_ROLES],
    city: [...CITY_ADMIN_ROLES],
    superadmin: [...SUPER_ADMIN_ROLES]
};

// ==========================================
// PROTECT
//
// Verifies the bearer token, then reloads the account so the role is
// read from MongoDB on every request. A role changed or an account
// disabled in the database takes effect immediately, even if the user
// is still holding an old token.
// ==========================================
const protect = async(req, res, next) => {
    try {
        const header = req.headers.authorization || "";

        // <img> / <a> tags cannot send an Authorization header, so the file
        // endpoint (GET /api/documents/:id/file) carries the same JWT as
        // ?token=. The header wins when both are present; the query value is
        // only a fallback for those browser-driven requests.
        const queryToken = typeof req.query.token === "string" ? req.query.token.trim() : "";

        const token = header.startsWith("Bearer ") ?
            header.slice(7).trim() :
            queryToken || null;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "You need to sign in to continue."
            });
        }

        let decoded;

        try {
            decoded = jwt.verify(
                token,
                process.env.JWT_SECRET
            );
        } catch {
            return res.status(401).json({
                success: false,
                message: "Your session has expired. Please sign in again."
            });
        }

        const user = await User.findById(decoded.id)
            .select("-password")
            .populate("barangay", "name");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Your session has expired. Please sign in again."
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

        req.user = {
            id: user._id.toString(),
            role: user.role,
            name: user.name,
            email: user.email,
            barangay: user.barangay || null,
            account: user
        };

        return next();
    } catch (error) {
        console.error("Auth middleware error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to verify your session."
        });
    }
};

// ==========================================
// REQUIRE ROLE
//
// Usage:
//   router.use(protect, requireRole("student"));
//   router.use(protect, requireRole(...SUPER_ADMIN_ROLES));
// ==========================================
const requireRole = (...allowed) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: "You need to sign in to continue."
        });
    }

    if (!allowed.includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: "You do not have permission to perform this action."
        });
    }

    return next();
};

// ==========================================
// REQUIRE PORTAL
//
// The same idea expressed in portal terms, so routes read the way the
// client routes do:
//   router.use(protect, requirePortal("city"));
// ==========================================
const requirePortal = (...portals) => (req, res, next) => {
    const allowed = portals.flatMap(
        (portal) => ROLE_GROUPS[portal] || []
    );

    return requireRole(...allowed)(req, res, next);
};

module.exports = {
    protect,
    authorize: requireRole,
    requireRole,
    requirePortal,
    ROLE_GROUPS,
    superAdminOnly: requireRole(...SUPER_ADMIN_ROLES)
};