const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");

const mockStore = { value: null };

jest.mock("../models/TermsPrivacy", () => {
    class MockTermsPrivacy {
        constructor(value) {
            Object.assign(this, JSON.parse(JSON.stringify(value)));
        }

        lean() {
            return Promise.resolve(JSON.parse(JSON.stringify(this)));
        }

        static findOne() {
            return mockStore.value ? new MockTermsPrivacy(mockStore.value) : null;
        }

        async save() {
            mockStore.value = JSON.parse(JSON.stringify(this));
        }
    }
    return MockTermsPrivacy;
});

jest.mock("../utils/audit", () => ({
    logAudit: jest.fn().mockResolvedValue(undefined)
}));

jest.mock("../middleware/authMiddleware", () => {
    const actual = jest.requireActual("../middleware/authMiddleware");
    return {
        ...actual,
        protect(req, _res, next) {
            req.user = {
                id: "507f1f77bcf86cd799439011",
                name: "City Test Admin",
                role: req.header("x-role") || ""
            };
            next();
        }
    };
});

const citySettingsRoutes = require("../routes/citySettingsRoutes");
const publicContentRoutes = require("../routes/publicContentRoutes");
const { logAudit } = require("../utils/audit");
const { DEFAULT_TERMS_PRIVACY } = require("../config/termsPrivacyDefaults");

const app = express();
app.use(express.json());
app.use("/api/city/settings", citySettingsRoutes);
app.use("/api/public", publicContentRoutes);

describe("Terms & Privacy editor API", () => {
    let originalReadyState;

    beforeEach(() => {
        originalReadyState = mongoose.connection.readyState;
        mockStore.value = null;
        mongoose.connection.readyState = 1;
        jest.clearAllMocks();
    });

    afterEach(() => {
        mongoose.connection.readyState = originalReadyState;
    });

    it("returns the shipped documents from the public endpoint when the database has no record", async() => {
        mongoose.connection.readyState = 0;
        const response = await request(app).get("/api/public/content").expect(200);

        expect(response.body.termsPrivacy.terms.content).toBe(DEFAULT_TERMS_PRIVACY.terms.content);
        expect(response.body.termsPrivacy.privacy.content).toBe(DEFAULT_TERMS_PRIVACY.privacy.content);
        expect(response.body.termsPrivacy.terms.updatedAt).toBeNull();
    });

    it("allows a city_admin to save, sanitizes HTML, increments versions, and restores history", async() => {
        const first = await request(app)
            .put("/api/city/settings/terms-privacy/terms")
            .set("x-role", "city_admin")
            .send({ content: "First version" })
            .expect(200);
        expect(first.body.document.version).toBe(1);

        const second = await request(app)
            .put("/api/city/settings/terms-privacy/terms")
            .set("x-role", "city_admin")
            .send({ content: "<p>Second version</p><script>alert(1)</script>" })
            .expect(200);

        expect(second.body.document.content).toBe("Second version");
        expect(second.body.document.version).toBe(2);
        expect(second.body.document.history[0]).toMatchObject({ version: 1, content: "First version" });

        const restored = await request(app)
            .post("/api/city/settings/terms-privacy/terms/history/1/restore")
            .set("x-role", "city_admin")
            .send({})
            .expect(200);
        expect(restored.body.document.content).toBe("First version");
        expect(restored.body.document.version).toBe(3);
        expect(logAudit).toHaveBeenCalledTimes(3);
    });

    it("rejects edits from other roles", async() => {
        const response = await request(app)
            .put("/api/city/settings/terms-privacy/terms")
            .set("x-role", "student")
            .send({ content: "No access" })
            .expect(403);

        expect(response.body.success).toBe(false);
        expect(mockStore.value).toBeNull();
    });

    it("restores the shipped default as a new version", async() => {
        await request(app)
            .put("/api/city/settings/terms-privacy/privacy")
            .set("x-role", "city_admin")
            .send({ content: "Edited policy" })
            .expect(200);

        const response = await request(app)
            .post("/api/city/settings/terms-privacy/privacy/restore-default")
            .set("x-role", "city_admin")
            .send({})
            .expect(200);

        expect(response.body.document.content).toBe(DEFAULT_TERMS_PRIVACY.privacy.content);
        expect(response.body.document.version).toBe(2);
        expect(response.body.document.history[0].content).toBe("Edited policy");
    });

    it("retains the latest 20 previous versions", async() => {
        for (let version = 1; version <= 22; version += 1) {
            await request(app)
                .put("/api/city/settings/terms-privacy/terms")
                .set("x-role", "city_admin")
                .send({ content: `Version ${version}` })
                .expect(200);
        }

        const response = await request(app)
            .get("/api/city/settings/terms-privacy")
            .set("x-role", "city_admin")
            .expect(200);
        expect(response.body.documents.terms.version).toBe(22);
        expect(response.body.documents.terms.history).toHaveLength(20);
        expect(response.body.documents.terms.history[0].version).toBe(21);
        expect(response.body.documents.terms.history[19].version).toBe(2);
    });

    it("rejects empty and oversized content", async() => {
        await request(app)
            .put("/api/city/settings/terms-privacy/terms")
            .set("x-role", "city_admin")
            .send({ content: "   " })
            .expect(400);

        await request(app)
            .put("/api/city/settings/terms-privacy/terms")
            .set("x-role", "city_admin")
            .send({ content: "x".repeat(50001) })
            .expect(400);
    });
});
