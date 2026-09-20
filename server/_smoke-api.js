// ==========================================
// Live API smoke test
//
// Boots the real Express app from server.js against the configured MongoDB
// and calls every endpoint the client portals depend on, using signed JWTs
// for a real student / barangay_staff / city admin / super admin account
// found in the database (no OTP round-trip needed).
//
// Assertions:
//   * every call must answer with a status below 500 (no crashed handler)
//   * unauthenticated calls must be 401 (except genuinely public routes)
//   * cross-portal calls must be 403
//
// Run:  node _smoke-api.js
// ==========================================
process.chdir(__dirname);
require("dotenv").config();

const PORT = Number(process.env.SMOKE_PORT || 5199);
process.env.PORT = String(PORT); // server.js reads process.env.PORT at require time

const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { startServer } = require("./server");
const User = require("./models/User");

const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0;
let fail = 0;

function record(label, actual, ...expected) {
    const ok = expected.includes(actual);
    if (ok) pass++;
    else fail++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}  -> ${actual}${ok ? "" : ` (expected ${expected.join("/")})`}`);
}

// A handler that blows up returns 5xx - that is the failure we hunt for.
function recordLive(label, status) {
    if (status >= 500) {
        fail++;
        console.log(`FAIL  ${label}  -> ${status} (server error)`);
    } else {
        pass++;
        console.log(`PASS  ${label}  -> ${status}`);
    }
}

function tokenFor(user) {
    return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

async function call(method, path, token) {
    const res = await fetch(BASE + path, {
        method,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    let body = null;
    try {
        body = await res.json();
    } catch {
        body = null;
    }
    return { status: res.status, body };
}

(async () => {
    const server = await startServer();
    if (!server) {
        console.error("Server did not start (database unreachable).");
        process.exit(1);
    }

    const groups = [
        ["student", ["student"]],
        ["barangay_staff", ["barangay_staff"]],
        ["city", ["city_admin", "admin_staff"]],
        ["superadmin", ["super_admin", "superadmin"]],
    ];
    const tokens = {};
    for (const [key, roles] of groups) {
        const user = await User.findOne({ role: { $in: roles } }).lean();
        tokens[key] = user ? tokenFor(user) : null;
        console.log(`# account ${key}: ${user ? `${user.email} (${user.role})` : "NONE FOUND"}`);
    }

    console.log("\n--- public routes ---");
    record("GET /", (await call("GET", "/")).status, 200);
    const barangays = await call("GET", "/api/barangays");
    recordLive("GET /api/barangays", barangays.status);
    console.log(`# barangays returned: ${barangays.body?.barangays?.length ?? "n/a"}`);
    record("GET /api/unknown-route", (await call("GET", "/api/unknown-route")).status, 404);

    console.log("\n--- unauthenticated guards ---");
    record("GET /api/auth/me", (await call("GET", "/api/auth/me")).status, 401);
    record("GET /api/city/scholar-approval", (await call("GET", "/api/city/scholar-approval")).status, 401);
    record("GET /api/student/application", (await call("GET", "/api/student/application")).status, 401);
    record("GET /api/super-admin/dashboard", (await call("GET", "/api/super-admin/dashboard")).status, 401);
    record("GET /api/applications", (await call("GET", "/api/applications")).status, 401);
    record("GET /api/documents", (await call("GET", "/api/documents")).status, 401);

    const studentGets = [
        "/api/auth/me",
        "/api/student/application",
        "/api/student/application/documents",
        "/api/notifications",
        "/api/messages",
        "/api/messages/conversations",
        "/api/announcements",
        "/api/events",
        "/api/ai/conversations",
    ];
    const cityGets = [
        "/api/auth/me",
        "/api/city/scholar-approval",
        "/api/applications",
        "/api/documents",
        "/api/announcements",
        "/api/events",
    ];
    const barangayGets = [
        "/api/auth/me",
        "/api/applications",
        "/api/documents",
        "/api/announcements",
    ];
    const superAdminGets = ["/api/auth/me", "/api/super-admin/dashboard", "/api/super-admin/users", "/api/super-admin/audit", "/api/super-admin/data"];

    const suites = [
        ["student portal", "student", studentGets],
        ["barangay portal", "barangay_staff", barangayGets],
        ["city portal", "city", cityGets],
        ["super admin portal", "superadmin", superAdminGets],
    ];

    for (const [label, key, paths] of suites) {
        console.log(`\n--- ${label} ---`);
        if (!tokens[key]) {
            console.log(`# skipped - no account found for role group ${key}`);
            continue;
        }
        for (const path of paths) {
            const res = await call("GET", path, tokens[key]);
            recordLive(`GET ${path} (${key})`, res.status);
        }
    }

    console.log("\n--- cross-portal guards ---");
    if (tokens.student) {
        record("GET /api/city/scholar-approval (student)", (await call("GET", "/api/city/scholar-approval", tokens.student)).status, 403);
        record("GET /api/super-admin/dashboard (student)", (await call("GET", "/api/super-admin/dashboard", tokens.student)).status, 403);
    }
    if (tokens.barangay_staff) {
        record("GET /api/city/scholar-approval (barangay)", (await call("GET", "/api/city/scholar-approval", tokens.barangay_staff)).status, 403);
        record("GET /api/super-admin/users (barangay)", (await call("GET", "/api/super-admin/users", tokens.barangay_staff)).status, 403);
    }
    if (tokens.city) {
        record("GET /api/super-admin/users (city)", (await call("GET", "/api/super-admin/users", tokens.city)).status, 403);
    }

    console.log("\n--- scholar approval data ---");
    if (tokens.city) {
        const approvals = await call("GET", "/api/city/scholar-approval", tokens.city);
        record("GET /api/city/scholar-approval", approvals.status, 200);
        const rows = approvals.body?.accounts || [];
        console.log(`# scholar-approval rows: ${rows.length}`);
        for (const row of rows.slice(0, 5)) {
            console.log(`#   ${row.name} | ${row.email} | registrationType=${row.registrationType} | status=${row.status}`);
        }
        const existing = await User.findOne({ role: "student", scholarType: "existing_scholar" }).lean();
        if (existing) {
            record(
                "PATCH /api/city/scholar-approval/:id (no decision)",
                (await call("PATCH", `/api/city/scholar-approval/${existing._id}`, tokens.city)).status,
                400,
            );
        } else {
            console.log("# no existing_scholar row in DB - skipped PATCH validation check");
        }
    } else {
        console.log("# skipped - no city admin account in DB");
    }

    console.log(`\n== ${pass} passed, ${fail} failed ==`);
    server.close();
    await mongoose.disconnect();
    process.exit(fail ? 1 : 0);
})().catch(async (error) => {
    console.error("SMOKE CRASHED:", error.stack || error.message);
    try {
        await mongoose.disconnect();
    } catch {
        /* ignore */
    }
    process.exit(1);
});
