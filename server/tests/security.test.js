const request = require("supertest");
const { app } = require("../server");

const securityHeaders = [
    "/",
    "/does-not-exist"
];

describe("security headers", () => {
    it.each(securityHeaders)("sets the security headers for %s", async(route) => {
        const response = await request(app).get(route);

        if (route === "/does-not-exist") {
            expect(response.status).toBe(404);
        } else {
            expect(response.status).toBe(200);
        }

        expect(response.headers["x-powered-by"]).toBeUndefined();
        expect(response.headers["x-content-type-options"]).toBe("nosniff");
        expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
        expect(response.headers["permissions-policy"]).toBeDefined();
        expect(response.headers["referrer-policy"]).toBe("no-referrer");
    });
});
