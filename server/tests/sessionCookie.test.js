const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const request = require("supertest");

// Must be set BEFORE ../middleware/authMiddleware is first required in this
// file: the idle window is computed once at module load. 0.5 min = 30s keeps
// the simulated clock hops tiny.
process.env.IDLE_TIMEOUT_MINUTES = process.env.IDLE_TIMEOUT_MINUTES || "0.5";

const User = require("../models/User");
const Application = require("../models/Application");
const {
    SESSION_COOKIE_NAME,
    setSessionCookie,
    recordActivity,
    clearActivity
} = require("../middleware/authMiddleware");
const createAuthRoutes = require("../routes/authRoutes");
const { csrfMiddleware } = require("../middleware/csrfMiddleware");
const { errorHandler } = require("../middleware/errorMiddleware");

const IDLE_TIMEOUT_MS = Number(process.env.IDLE_TIMEOUT_MINUTES) * 60 * 1000;

jest.setTimeout(20000);

const STUDENT_ID = "507f1f77bcf86cd799439011";

function resolvedUser(user) {
    const query = {
        sort: jest.fn(() => query),
        select: jest.fn(() => query),
        populate: jest.fn(() => query),
        lean: jest.fn(() => query),
        then: (resolve, reject) => Promise.resolve(user).then(resolve, reject)
    };
    return query;
}

function studentUser() {
    return {
        _id: STUDENT_ID,
        role: "student",
        status: "active",
        name: "Test Student",
        email: "student@example.com",
        barangay: null
    };
}

function sessionCookieFor(userId = STUDENT_ID) {
    return `${SESSION_COOKIE_NAME}=${jwt.sign({ id: userId }, process.env.JWT_SECRET)}`;
}

// Mirrors server.js wiring for the auth routes: cookie parsing, the same
// Origin check, then the routes themselves. No rate limiter / database gate
// so the assertions observe the session behavior, not infrastructure.
function createApp() {
    const app = express();
    app.use(cookieParser());
    app.use("/api", csrfMiddleware);
    app.use("/api/auth", createAuthRoutes());
    app.use(errorHandler);
    return app;
}

const app = createApp();

// Controllable clock. Every test starts from a known epoch so the idle
// window is deterministic; jest.restoreAllMocks() in afterEach resets it.
const CLOCK_START = Date.parse("2026-10-18T08:00:00.000Z");
let clockNow = CLOCK_START;

beforeEach(() => {
    clockNow = CLOCK_START;
    jest.spyOn(Date, "now").mockImplementation(() => clockNow);
    // /auth/me loads the latest application for students; keep it off the DB.
    jest.spyOn(Application, "findOne").mockReturnValue(resolvedUser(null));
});

afterEach(() => {
    jest.restoreAllMocks();
    clearActivity(STUDENT_ID);
});

function advanceMs(ms) {
    clockNow += ms;
}


describe("auth routes are mounted (regression: createAuthRoutes factory)", () => {
    it("POST /api/auth/login is not 404", async() => {
        const response = await request(app).post("/api/auth/login").send({});
        expect(response.status).not.toBe(404);
    });

    it("POST /api/auth/logout is not 404 and clears the cookie", async() => {
        const response = await request(app)
            .post("/api/auth/logout")
            .set("Cookie", sessionCookieFor());

        expect(response.status).not.toBe(404);
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        const cleared = (response.headers["set-cookie"] || []).find(
            (cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`)
        );
        expect(cleared).toBeDefined();
        expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/i);
        expect(cleared).toMatch(/Path=\//i);
    });

    it("GET /api/auth/me without a cookie is 401 (route exists)", async() => {
        const response = await request(app).get("/api/auth/me");
        expect(response.status).toBe(401);
        expect(response.body.code).toBe("SESSION_REQUIRED");
    });

    it("POST /api/auth/activity without a cookie is 401 (route exists)", async() => {
        const response = await request(app).post("/api/auth/activity");
        expect(response.status).toBe(401);
        expect(response.body.code).toBe("SESSION_REQUIRED");
    });
});

describe("session cookie flags", () => {
    it("issues the cookie httpOnly, SameSite=Lax, Path=/ with a Max-Age", () => {
        const flagApp = express();
        flagApp.get("/issue", (req, res) => {
            setSessionCookie(res, "signed-token");
            res.status(200).end("ok");
        });

        return request(flagApp)
            .get("/issue")
            .then((response) => {
                const cookie = response.headers["set-cookie"].find(
                    (value) => value.startsWith(`${SESSION_COOKIE_NAME}=`)
                );
                expect(cookie).toBeDefined();
                expect(cookie).toMatch(/HttpOnly/i);
                expect(cookie).toMatch(/SameSite=Lax/i);
                expect(cookie).toMatch(/Path=\//i);
                expect(cookie).toMatch(new RegExp(`Max-Age=${Math.round(IDLE_TIMEOUT_MS / 1000)}`));
                // NODE_ENV=test -> not production, so no Secure flag locally
                expect(cookie).not.toMatch(/Secure/i);
            });
    });

    it("marks the cookie Secure when NODE_ENV=production", () => {
        const previous = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";

        const flagApp = express();
        flagApp.get("/issue", (req, res) => {
            setSessionCookie(res, "signed-token");
            res.status(200).end("ok");
        });

        return request(flagApp)
            .get("/issue")
            .then((response) => {
                const cookie = response.headers["set-cookie"].find(
                    (value) => value.startsWith(`${SESSION_COOKIE_NAME}=`)
                );
                expect(cookie).toMatch(/Secure/i);
                process.env.NODE_ENV = previous;
            });
    });

    it("activity ping re-issues the session cookie", async() => {
        jest.spyOn(User, "findById").mockReturnValue(resolvedUser(studentUser()));

        const response = await request(app)
            .post("/api/auth/activity")
            .set("Cookie", sessionCookieFor());

        expect(response.status).toBe(200);
        const cookie = (response.headers["set-cookie"] || []).find(
            (value) => value.startsWith(`${SESSION_COOKIE_NAME}=`)
        );
        expect(cookie).toBeDefined();
        expect(cookie).toMatch(/HttpOnly/i);
    });
});

describe("Origin check on non-GET requests", () => {
    it("rejects a cross-origin POST with 403 CSRF_REJECTED", async() => {
        const response = await request(app)
            .post("/api/auth/logout")
            .set("Origin", "https://evil.example.com")
            .set("Cookie", sessionCookieFor());

        expect(response.status).toBe(403);
        expect(response.body.code).toBe("CSRF_REJECTED");
    });

    it("rejects a non-GET with the wrong scheme on the right host", async() => {
        // CLIENT_ORIGIN is http://localhost:5173 in setup-env.js
        const response = await request(app)
            .post("/api/auth/logout")
            .set("Origin", "https://localhost:5173");

        expect(response.status).toBe(403);
        expect(response.body.code).toBe("CSRF_REJECTED");
    });

    it("allows a POST from the configured CLIENT_ORIGIN", async() => {
        const response = await request(app)
            .post("/api/auth/logout")
            .set("Origin", "http://localhost:5173")
            .set("Cookie", sessionCookieFor());

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });

    it("allows a same-origin request that carries no Origin header", async() => {
        const response = await request(app)
            .post("/api/auth/logout")
            .set("Cookie", sessionCookieFor());

        expect(response.status).toBe(200);
    });

    it("does not apply the Origin check to GET requests", async() => {
        jest.spyOn(User, "findById").mockReturnValue(resolvedUser(studentUser()));

        const response = await request(app)
            .get("/api/auth/me")
            .set("Origin", "https://evil.example.com")
            .set("Cookie", sessionCookieFor());

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });
});

describe("server-side idle timeout", () => {
    it("serves a request made within the idle window", async() => {
        jest.spyOn(User, "findById").mockReturnValue(resolvedUser(studentUser()));
        recordActivity(STUDENT_ID);

        advanceMs(IDLE_TIMEOUT_MS - 1000);

        const response = await request(app)
            .get("/api/auth/me")
            .set("Cookie", sessionCookieFor());

        expect(response.status).toBe(200);
    });

    it("expires the session once the idle window has passed", async() => {
        jest.spyOn(User, "findById").mockReturnValue(resolvedUser(studentUser()));
        recordActivity(STUDENT_ID);

        advanceMs(IDLE_TIMEOUT_MS + 1000);

        const response = await request(app)
            .get("/api/auth/me")
            .set("Cookie", sessionCookieFor());

        expect(response.status).toBe(401);
        expect(response.body.code).toBe("SESSION_EXPIRED");
    });

    it("serves a fresh session that has no activity record yet", async() => {
        jest.spyOn(User, "findById").mockReturnValue(resolvedUser(studentUser()));

        // No recordActivity() call: the cookie is valid and the server has
        // no evidence of idling yet.
        const response = await request(app)
            .get("/api/auth/me")
            .set("Cookie", sessionCookieFor());

        expect(response.status).toBe(200);
    });

    it("also enforces the idle window on the activity ping", async() => {
        jest.spyOn(User, "findById").mockReturnValue(resolvedUser(studentUser()));
        recordActivity(STUDENT_ID);

        advanceMs(IDLE_TIMEOUT_MS + 1000);

        const response = await request(app)
            .post("/api/auth/activity")
            .set("Cookie", sessionCookieFor());

        expect(response.status).toBe(401);
        expect(response.body.code).toBe("SESSION_EXPIRED");
    });
});

describe("activity ping extends the session; polling does not", () => {
    it("a ping inside the window refreshes the idle deadline", async() => {
        jest.spyOn(User, "findById").mockReturnValue(resolvedUser(studentUser()));
        recordActivity(STUDENT_ID);

        // 20s in — ping to push the deadline out by another 30s.
        advanceMs(20_000);
        const ping = await request(app)
            .post("/api/auth/activity")
            .set("Cookie", sessionCookieFor());
        expect(ping.status).toBe(200);

        // Past the original deadline, but only 30s since the refresh.
        advanceMs(30_000);
        const afterRefresh = await request(app)
            .get("/api/auth/me")
            .set("Cookie", sessionCookieFor());
        expect(afterRefresh.status).toBe(200);
    });

    it("GET /auth/me (polling) does NOT extend the idle deadline", async() => {
        jest.spyOn(User, "findById").mockReturnValue(resolvedUser(studentUser()));
        recordActivity(STUDENT_ID);

        // Poll twice inside the window — both succeed, neither refreshes.
        advanceMs(10_000);
        const firstPoll = await request(app)
            .get("/api/auth/me")
            .set("Cookie", sessionCookieFor());
        expect(firstPoll.status).toBe(200);

        advanceMs(10_000);
        const secondPoll = await request(app)
            .get("/api/auth/me")
            .set("Cookie", sessionCookieFor());
        expect(secondPoll.status).toBe(200);

        // Past the ORIGINAL deadline even though polling continued the
        // whole time: polling must not keep the session alive.
        advanceMs(IDLE_TIMEOUT_MS - 5_000);
        const afterDeadline = await request(app)
            .get("/api/auth/me")
            .set("Cookie", sessionCookieFor());
        expect(afterDeadline.status).toBe(401);
        expect(afterDeadline.body.code).toBe("SESSION_EXPIRED");
    });
});

describe("session cookie authentication end to end", () => {
    it("rejects a token signed with the wrong secret", async() => {
        const forged = `${SESSION_COOKIE_NAME}=${jwt.sign({ id: STUDENT_ID }, "wrong-secret")}`;

        const response = await request(app)
            .get("/api/auth/me")
            .set("Cookie", forged);

        expect(response.status).toBe(401);
        expect(response.body.code).toBe("SESSION_EXPIRED");
    });

    it("rejects a garbage cookie value", async() => {
        const response = await request(app)
            .get("/api/auth/me")
            .set("Cookie", `${SESSION_COOKIE_NAME}=not-a-jwt`);

        expect(response.status).toBe(401);
        expect(response.body.code).toBe("SESSION_EXPIRED");
    });

    it("reload reads the role from the database, not the cookie", async() => {
        const demoted = { ...studentUser(), role: "super_admin" };
        jest.spyOn(User, "findById").mockReturnValue(resolvedUser(demoted));
        recordActivity(STUDENT_ID);

        // The cookie was issued for a student; /me answers with the current
        // database role.
        const response = await request(app)
            .get("/api/auth/me")
            .set("Cookie", sessionCookieFor());

        expect(response.status).toBe(200);
        expect(response.body.user.role).toBe("super_admin");
    });

    it("blocks suspended accounts even with a valid cookie", async() => {
        const suspended = { ...studentUser(), status: "suspended" };
        jest.spyOn(User, "findById").mockReturnValue(resolvedUser(suspended));
        recordActivity(STUDENT_ID);

        const response = await request(app)
            .get("/api/auth/me")
            .set("Cookie", sessionCookieFor());

        expect(response.status).toBe(403);
    });
});

