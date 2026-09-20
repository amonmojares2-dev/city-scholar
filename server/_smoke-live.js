// ==========================================
// Live API smoke test
//
// Boots the real Express app (server.js) against the configured MongoDB and
// exercises every endpoint the client depends on, using signed JWTs for real
// student / barangay staff / city admin / super admin accounts found in the
// database (so no OTP round-trip is needed).
//
// Run:  node _smoke-live.js
// ==========================================
process.chdir(__dirname);
require("dotenv").config();
process.env.PORT = process.env.SMOKE_PORT || "5199";

const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { startServer } = require("./server");
const User = require("./models/User");

const BASE = `http://127.0.0.1:${process.env.PORT}`;
let pass = 0;
let fail = 0;

function record(label, actual, ...expected) {
    const ok = expected.includes(actual);
    if (ok) pass++;
    else fail++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}  -> ${actual}${ok ? "" : ` (expected ${expected.join("/")})`}`);
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
        ["barangay", ["barangay_staff"]],
        ["city", ["city_admin", "admin_staff"]],
        ["superadmin", ["super_admin", "superadmin"]],
    ];
    const tokens = {};
    for (const [key, roles] of groups) {
        const user = await User.findOne({ role: { $in: roles } }).lean();
        tokens[key] = user ? tokenFor(user) : null;
        console.log(`# account ${key}: ${user ? `${user.email} (${user.role})` : "NONE FOUND"}`);
    }

    console.log("\n--- public ---");
    record("GET /", (await call("GET", "/")).status, 200);
    const barangays = await call("GET", "/api/barangays");
    record("GET /api/barangays", barangays.status, 200);
    console.log(`# barangays returned: ${barangays.body?.barangays?.length ?? "n/a"}`);
    record("GET /api/unknown-route", (await call("GET", "/api/unknown-route")).status, 404);

    console.log("\n--- unauthenticated guards ---");
    record("GET /api/auth/me", (await call("GET", "/api/auth/me")).status, 401);
    record("GET /api/city/scholar-approval", (await call("GET", "/api/city/scholar-approval")).status, 401);
    record("GET /api/student/application", (await call("GET", "/api/student/application")).status, 401);
    record("GET /api/super-admin/dashboard", (await call("GET", "/api/super-admin/dashboard")).status, 401);

    if (tokens.student) {
        console.log("\n--- student portal ---");
        record("GET /api/auth/me", (await call("GET", "/api/auth/me", tokens.student)).status, 200);
        record("GET /api/student/application", (await call("GET", "/api/student/application", tokens.student)).status, 200, 404);
        record("GET /api/student/application/documents", (await call("GET", "/api/student/application/documents", tokens.student)).status, 200);
        record("GET /api/notifications", (await call("GET", "/api/notifications", tokens.student)).status, 200);
        record("GET /api/messages/conversations", (await call("GET", "/api/messages/conversations", tokens.student)).status, 200);
        record("GET /api/announcements", (await call("GET", "/api/announcements", tokens.student)).status, 200);
        record("GET /api/events", (await call("GET", "/api/events", tokens.student)).status, 200);
        record("GET /api/city/scholar-approval (student token)", (await call("GET", "/api/city/scholar-approval", tokens.student)).status, 403);
        record("GET /api/super-admin/dashboard (student token)", (await call("GET", "/api/super-admin/dashboard", tokens.student)).status, 403);
    }

    if (tokens.barangay) {
        console.log("\n--- barangay portal ---");
        record("GET /api/auth/me", (await call("GET", "/api/auth/me", tokens.barangay)).status, 200);
        record("GET /api/applications", (await call("GET", "/api/applications", tokens.barangay)).status, 200);
        record("GET /api/documents", (await call("GET", "/api/documents", tokens.barangay)).status, 200);
        record("GET /api/city/scholar-approval (barangay token)", (await call("GET", "/api/city/scholar-approval", tokens.barangay)).status, 403);
    }

    if (tokens.city) {
        console.log("\n--- city portal ---");
        record("GET /api/auth/me", (await call("GET", "/api/auth/me", tokens.city)).status, 200);
        const scholars = await call("GET", "/api/scholars", tokens.city);
        record("GET /api/scholars (city, no filter)", scholars.status, 200);
        console.log(`# approved scholars city-wide: ${scholars.body?.count ?? "n/a"}`);
        if (scholars.body?.count > 0) {
            const first = scholars.body.scholars[0];
            console.log(`# first scholar: ${first.name} | scholarId=${first.scholarId} | barangay=${first.barangay || "(none)"}`);
        }
        const barangays = await call("GET", "/api/barangays");
        const firstBarangayId = barangays.body?.barangays?.[0]?._id;
        if (firstBarangayId) {
            const scoped = await call("GET", "/api/scholars?barangay=" + firstBarangayId, tokens.city);
            record("GET /api/scholars?barangay=<id>", scoped.status, 200);
            const scopedCount = scoped.body?.count ?? 0;
            console.log(`# scoped to one barangay: ${scopedCount} (must be <= city-wide total)`);
            if (scopedCount > (scholars.body?.count ?? 0)) {
                fail++;
                console.log("FAIL  scoped count exceeds city-wide count");
            }
        }
        const approvals = await call("GET", "/api/city/scholar-approval", tokens.city);
        record("GET /api/city/scholar-approval", approvals.status, 200);
        const rows = approvals.body?.accounts || approvals.body?.registrations || [];
        console.log(`# scholar-approval rows: ${rows.length}`);
        if (rows[0]) {
            console.log(`# first row: ${JSON.stringify({ name: rows[0].name, registrationType: rows[0].registrationType, status: rows[0].status })}`);
        }
        const existing = await User.findOne({ role: "student", scholarType: "existing_scholar" }).lean();
        if (existing) {
            record(
                "PATCH /api/city/scholar-approval/:id (no decision)",
                (await call("PATCH", `/api/city/scholar-approval/${existing._id}`, tokens.city)).status,
                400,
            );
        } else {
            console.log("# no existing_scholar row in DB - skipping PATCH validation check");
        }
        const directory = await call("GET", "/api/users", tokens.city);
        record("GET /api/users (city)", directory.status, 200);
        console.log("# users directory rows: " + (directory.body?.users?.length ?? "n/a"));
        record("GET /api/programs (city)", (await call("GET", "/api/programs", tokens.city)).status, 200);
        record("GET /api/users (student token)", (await call("GET", "/api/users", tokens.student)).status, 403);
        record("GET /api/announcements", (await call("GET", "/api/announcements", tokens.city)).status, 200);
        record("GET /api/events", (await call("GET", "/api/events", tokens.city)).status, 200);
    }

    if (tokens.superadmin) {
        console.log("\n--- super admin portal ---");
        record("GET /api/auth/me", (await call("GET", "/api/auth/me", tokens.superadmin)).status, 200);
        record("GET /api/super-admin/dashboard", (await call("GET", "/api/super-admin/dashboard", tokens.superadmin)).status, 200);
        record("GET /api/super-admin/accounts", (await call("GET", "/api/super-admin/accounts", tokens.superadmin)).status, 200);
        record("GET /api/super-admin/users", (await call("GET", "/api/super-admin/users", tokens.superadmin)).status, 200);
        record("GET /api/super-admin/program", (await call("GET", "/api/super-admin/program", tokens.superadmin)).status, 200);
        record("GET /api/super-admin/data", (await call("GET", "/api/super-admin/data", tokens.superadmin)).status, 200);
        record("GET /api/super-admin/archive", (await call("GET", "/api/super-admin/archive", tokens.superadmin)).status, 200);
        record("GET /api/super-admin/audit", (await call("GET", "/api/super-admin/audit", tokens.superadmin)).status, 200);
        record("GET /api/super-admin/reports", (await call("GET", "/api/super-admin/reports", tokens.superadmin)).status, 200);
        record("GET /api/super-admin/dashboard (city token)", (await call("GET", "/api/super-admin/dashboard", tokens.city)).status, 403);
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
