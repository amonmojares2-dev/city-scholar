const fs = require("fs");
const path = require("path");
const request = require("supertest");
const { app } = require("../server");
const { profilePhotoDirectory } = require("../config/storage");
const { UNIVERSITY_OPTIONS } = require("../config/universities");

const securityHeaders = [
    "/",
    "/does-not-exist"
];

describe("security headers", () => {
    it("does not expose uploaded files through the public static path", async() => {
        const filename = "security-profile-photo-test.txt";
        const filePath = path.join(profilePhotoDirectory, filename);
        fs.writeFileSync(filePath, "temporary test image");

        try {
            const response = await request(app)
                .get(`/uploads/${filename}`)
                .set("Origin", "http://localhost:5173");

            expect(response.status).toBe(404);
        } finally {
            fs.unlinkSync(filePath);
        }
    });

    it("serves public sorted University options without database or rate-limit gating", async() => {
        const response = await request(app)
            .get("/api/universities")
            .set("Origin", "http://localhost:5173");

        expect(response.status).toBe(200);
        expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
        expect(response.headers["ratelimit-limit"]).toBeUndefined();
        expect(response.body).toEqual({
            success: true,
            universities: UNIVERSITY_OPTIONS
        });
        expect(response.body.universities.map(option => option.name)).toEqual(
            [...response.body.universities]
                .sort((left, right) => left.name.localeCompare(right.name))
                .map(option => option.name)
        );
        response.body.universities.forEach(option => {
            expect(Object.keys(option).sort()).toEqual(["id", "name"]);
        });
    });

    it("allows the authenticated Vite upload preflight", async() => {
        const response = await request(app)
            .options("/api/users/me/photo")
            .set("Origin", "http://localhost:5173")
            .set("Access-Control-Request-Method", "POST")
            .set("Access-Control-Request-Headers", "authorization,content-type");

        expect(response.status).toBe(204);
        expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    });

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
