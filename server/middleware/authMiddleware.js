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
// SESSION COOKIE
//
// The JWT now lives in an httpOnly cookie (name below) instead of
// localStorage, so the cookie is sent automatically with every same-origin
// request and is never readable by client-side JavaScript.
// ==========================================
const SESSION_COOKIE_NAME = "city-scholar-session";

// Idle limit: the session expires after this many minutes with no real
// user activity. 0.5 gives a 30-second demo. Override with
// IDLE_TIMEOUT_MINUTES (server) / VITE_IDLE_TIMEOUT_MINUTES (client).
const IDLE_TIMEOUT_MINUTES = Number(process.env.IDLE_TIMEOUT_MINUTES) || 15;
const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;

// Server-side (authoritative) idle tracker: userId -> last activity epoch.
// Only real user activity (POST /auth/activity) refreshes it; polling
// endpoints such as notifications, messages and /auth/me never do.
const userLastActivity = new Map();

// Set the session cookie. Secure only over HTTPS (production).
function setSessionCookie(res, token) {
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true,      // never readable by client-side JS
        secure: isProduction, // HTTPS only in production
        sameSite: "lax",     // same-site navigations only
        path: "/",
        maxAge: IDLE_TIMEOUT_MS // sliding expiry refreshed on real activity
    });
}

function clearSessionCookie(res) {
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
}

function recordActivity(userId) {
    userLastActivity.set(userId, Date.now());
}

function clearActivity(userId) {
    userLastActivity.delete(userId);
}

// cookieParser is applied by the application (server.js) before the routes
// that need req.cookies; it is required here only so this module can be
// required without the app having loaded it first.

// Verifies the session cookie, enforces the server-side idle limit, and
// sets req.user from the JWT (no database reload — use `protect` when the
// full account record is needed).
const requireSession = (req, res, next) => {
    try {
        const token = req.cookies[SESSION_COOKIE_NAME];
        if (!token) {
            return res.status(401).json({
                success: false,
                code: "SESSION_REQUIRED",
                message: "You need to sign in to continue."
            });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch {
            return res.status(401).json({
                success: false,
                code: "SESSION_EXPIRED",
                message: "Your session has expired. Please sign in again."
            });
        }

        const userId = String(decoded.id);
        const now = Date.now();
        const last = userLastActivity.get(userId);

        if (last === undefined) {
            // No activity record (e.g. server restarted): treat this
            // request as activity instead of signing the user out.
            userLastActivity.set(userId, now);
        } else if (now - last > IDLE_TIMEOUT_MS) {
            userLastActivity.delete(userId);
            return res.status(401).json({
                success: false,
                code: "SESSION_EXPIRED",
                message: "Your session has expired due to inactivity. Please sign in again."
            });
        }

        req.user = { id: userId, role: decoded.role };
        return next();
    } catch (error) {
        console.error("Session middleware error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to verify your session."
        });
    }
};

// ==========================================
// PROTECT
//
// Verifies the session cookie, enforces the idle limit, then reloads the
// account so the role is read from MongoDB on every request. A role changed
// or an account disabled in the database takes effect immediately, even if
// the user is still holding an old cookie.
// ==========================================
const protect = async(req, res, next) => {
    requireSession(req, res, async() => {
        try {
            await loadAndAttachUser(req, res, next);
        } catch (error) {
            console.error("Auth middleware error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Unable to verify your session."
            });
        }
    });
};

async function loadAndAttachUser(req, res, next) {
    const user = await User.findById(req.user.id)
        .select("-password")
        .populate("barangay", "name");

    if (!user) {
        return res.status(401).json({
            success: false,
            code: "SESSION_EXPIRED",
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
}

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
    SESSION_COOKIE_NAME,
    setSessionCookie,
    clearSessionCookie,
    recordActivity,
    clearActivity,
    requireSession,
    protect,
    authorize: requireRole,
    requireRole,
    requirePortal,
    ROLE_GROUPS,
    superAdminOnly: requireRole(...SUPER_ADMIN_ROLES)
};