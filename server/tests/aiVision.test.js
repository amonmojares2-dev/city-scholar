// ==========================================
// AI extraction (Gemini): provider error handling, retries, cache, payload caps
// ==========================================
//
// The provider is mocked via the `fetchImpl` option — no network, no key.
// These tests pin the behaviour that made "insufficient_quota" and a real
// rate limit look identical to City users.

process.env.GEMINI_API_KEY = "test-gemini-key-not-real";
process.env.GEMINI_VISION_MODEL = "gemini-1.5-flash";

const {
    analyzeGradeDocument,
    AiVisionError,
    getAiConfiguration,
    isAiConfigured,
    isCachedExtractionUsable,
    parseRetryAfterMs,
    AI_QUOTA_MESSAGE,
    AI_RATE_LIMIT_MESSAGE,
    AI_CONFIG_MESSAGE,
    AI_BLOCKED_MESSAGE,
    AI_GENERIC_FAILURE_MESSAGE,
    MAX_RATE_LIMIT_RETRIES
} = require("../utils/aiVision");
const { prepareDocumentForAi, hashBuffer, MAX_PDF_BYTES, MAX_IMAGE_BYTES } = require("../utils/aiMedia");

const MODEL_JSON = JSON.stringify({
    readable: true,
    extractionNote: "",
    gradingScale: "B",
    studentName: "Juan Dela Cruz",
    school: "Dagupan",
    gradeLevel: "College",
    term: "First Semester",
    subjects: [{ name: "Math", grade: 90 }],
    highestGrade: 90,
    lowestGrade: 90,
    computedGwa: 2.0,
    averageGrade: 90,
    passingMark: 80,
    subjectsFailed: [],
    overallStatus: "Passed"
});

// A successful Gemini generateContent response. The document text lives in
// candidates[0].content.parts[0].text — the Gemini generateContent envelope.
function okResponse() {
    return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async() => ({
            candidates: [{
                content: {
                    parts: [{ text: MODEL_JSON }]
                }
            }]
        })
    };
}

// A mocked Gemini 429. Gemini answers both rate limits and an exhausted daily
// quota with HTTP 429 / RESOURCE_EXHAUSTED; the error MESSAGE tells them apart.
function rateLimitedResponse({ code = "rate_limit_exceeded", detail = "Rate limit reached. Slow down.", retryAfter = null, isQuota = false } = {}) {
    return {
        ok: false,
        status: 429,
        headers: { get: (name) => (name === "retry-after" ? retryAfter : null) },
        json: async() => ({
            error: {
                message: isQuota
                    ? "You exceeded your daily quota for this model."
                    : detail,
                status: "RESOURCE_EXHAUSTED",
                code
            }
        })
    };
}

function serverErrorResponse(status) {
    return {
        ok: false,
        status,
        headers: { get: () => null },
        json: async() => ({ error: { message: "Internal server error", status: "INTERNAL", code: "" } })
    };
}


describe("getAiConfiguration / isAiConfigured", () => {
    const origKey = process.env.GEMINI_API_KEY;
    const origModel = process.env.GEMINI_VISION_MODEL;
    afterEach(() => {
        process.env.GEMINI_API_KEY = origKey;
        process.env.GEMINI_VISION_MODEL = origModel;
    });

    it("reads GEMINI_API_KEY and GEMINI_VISION_MODEL from the environment", () => {
        const { apiKey, model } = getAiConfiguration();
        expect(apiKey).toBe("test-gemini-key-not-real");
        expect(model).toBe("gemini-1.5-flash");
    });

    it("reports configured when both vars are present", () => {
        expect(isAiConfigured()).toBe(true);
    });

    it("reports not configured when the key is missing", () => {
        delete process.env.GEMINI_API_KEY;
        expect(isAiConfigured()).toBe(false);
        expect(() => getAiConfiguration()).toThrow(AiVisionError);
    });
});

describe("analyzeGradeDocument — provider 429 handling", () => {
    let consoleError;
    beforeEach(() => { consoleError = jest.spyOn(console, "error").mockImplementation(() => {}); });
    afterEach(() => { consoleError.mockRestore(); });

    it("reports insufficient_quota distinctly and does NOT retry", async() => {
        const fetchImpl = jest.fn().mockResolvedValue(rateLimitedResponse({ isQuota: true }));
        const sleep = jest.fn().mockResolvedValue(undefined);

        await expect(analyzeGradeDocument(
            { base64: "AAAA", mimeType: "image/png", filename: "grades.png" },
            { fetchImpl, sleep }
        )).rejects.toMatchObject({
            name: "AiVisionError",
            message: AI_QUOTA_MESSAGE,
            code: "insufficient_quota"
        });

        expect(fetchImpl).toHaveBeenCalledTimes(1); // quota errors are never retried
        expect(sleep).not.toHaveBeenCalled();
    });

    it("retries a real rate limit with growing delays and succeeds", async() => {
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(rateLimitedResponse({ retryAfter: null }))
            .mockResolvedValueOnce(rateLimitedResponse({ retryAfter: null }))
            .mockResolvedValueOnce(okResponse());
        const sleep = jest.fn().mockResolvedValue(undefined);

        const result = await analyzeGradeDocument(
            { base64: "AAAA", mimeType: "image/png", filename: "grades.png" },
            { fetchImpl, sleep, retryDelays: [10, 20, 40] }
        );

        expect(result.readable).toBe(true);
        expect(fetchImpl).toHaveBeenCalledTimes(3);
        // Growing delays: 10ms, 20ms — no sleep after the final successful attempt.
        expect(sleep).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenNthCalledWith(1, 10);
        expect(sleep).toHaveBeenNthCalledWith(2, 20);
    });

    it("honors the Retry-After header when present", async() => {
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(rateLimitedResponse({ retryAfter: "5" }))
            .mockResolvedValueOnce(okResponse());
        const sleep = jest.fn().mockResolvedValue(undefined);

        await analyzeGradeDocument(
            { base64: "AAAA", mimeType: "image/png", filename: "grades.png" },
            { fetchImpl, sleep }
        );

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledTimes(1);
        expect(sleep).toHaveBeenCalledWith(5000); // "5" seconds -> 5000ms
    });

    it("fails with the rate-limit message once retries are exhausted", async() => {
        const fetchImpl = jest.fn().mockResolvedValue(rateLimitedResponse({ retryAfter: null }));
        const sleep = jest.fn().mockResolvedValue(undefined);

        await expect(analyzeGradeDocument(
            { base64: "AAAA", mimeType: "image/png", filename: "grades.png" },
            { fetchImpl, sleep, retryDelays: [5, 5] }
        )).rejects.toMatchObject({
            name: "AiVisionError",
            message: AI_RATE_LIMIT_MESSAGE,
            code: "rate_limit_exceeded"
        });

        // MAX_RATE_LIMIT_RETRIES attempts total, then give up.
        expect(fetchImpl).toHaveBeenCalledTimes(MAX_RATE_LIMIT_RETRIES);
        expect(sleep).toHaveBeenCalledTimes(MAX_RATE_LIMIT_RETRIES - 1);
    });

    it("sends the API key in the x-goog-api-key header, never the URL", async() => {
        const fetchImpl = jest.fn().mockResolvedValue(okResponse());

        await analyzeGradeDocument(
            { base64: "AAAA", mimeType: "image/png", filename: "grades.png" },
            { fetchImpl }
        );

        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).not.toContain("test-gemini-key-not-real");
        expect(url).toContain("generativelanguage.googleapis.com/v1beta");
        expect(url).toContain("gemini-1.5-flash:generateContent");
        expect(init.headers["x-goog-api-key"]).toBe("test-gemini-key-not-real");
        expect(init.headers["Content-Type"]).toBe("application/json");
        expect(init.signal).toBeDefined();
    });

    it("classifies a 401 as a provider-config problem, not a retry", async() => {
        const fetchImpl = jest.fn().mockResolvedValue(serverErrorResponse(401));
        const sleep = jest.fn().mockResolvedValue(undefined);

        await expect(analyzeGradeDocument(
            { base64: "AAAA", mimeType: "image/png", filename: "grades.png" },
            { fetchImpl, sleep }
        )).rejects.toMatchObject({
            name: "AiVisionError",
            message: AI_CONFIG_MESSAGE,
            code: "provider_config"
        });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
    });

    it("classifies a 5xx as a generic failure", async() => {
        const fetchImpl = jest.fn().mockResolvedValue(serverErrorResponse(500));
        const sleep = jest.fn().mockResolvedValue(undefined);

        await expect(analyzeGradeDocument(
            { base64: "AAAA", mimeType: "image/png", filename: "grades.png" },
            { fetchImpl, sleep }
        )).rejects.toMatchObject({
            name: "AiVisionError",
            message: AI_GENERIC_FAILURE_MESSAGE,
            code: "provider_error"
        });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("reports an empty candidate list as blocked (safety or unreadable)", async() => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async() => ({ candidates: [] })
        });
        const sleep = jest.fn().mockResolvedValue(undefined);

        await expect(analyzeGradeDocument(
            { base64: "AAAA", mimeType: "image/png", filename: "grades.png" },
            { fetchImpl, sleep }
        )).rejects.toMatchObject({
            name: "AiVisionError",
            message: AI_BLOCKED_MESSAGE,
            code: "no_candidates"
        });
    });

    it("normalizes a successful Gemini response into the persisted shape", async() => {
        const fetchImpl = jest.fn().mockResolvedValue(okResponse());

        const result = await analyzeGradeDocument(
            { base64: "AAAA", mimeType: "image/png", filename: "grades.png" },
            { fetchImpl }
        );

        expect(result.readable).toBe(true);
        expect(result.gradingScale).toBe("B");
        expect(result.studentName).toBe("Juan Dela Cruz");
        expect(result.school).toBe("Dagupan");
        expect(result.subjects).toEqual([{ name: "Math", grade: 90 }]);
        expect(result.highestGrade).toBe(90);
        expect(result.lowestGrade).toBe(90);
        expect(result.computedGwa).toBe(2.0);
        expect(result.averageGrade).toBe(90);
        expect(result.passingMark).toBe(80);
        expect(result.subjectsFailed).toEqual([]);
        expect(result.overallStatus).toBe("Passed");
    });
});

describe("isCachedExtractionUsable — extraction cache", () => {
    const hash = hashBuffer(Buffer.from("same-bytes"));

    it("serves an extracted record when the file hash matches", () => {
        expect(isCachedExtractionUsable({ extractionStatus: "extracted", fileHash: hash }, hash)).toBe(true);
    });

    it("serves a needs_manual_review record (a real result, not an error)", () => {
        expect(isCachedExtractionUsable({ extractionStatus: "needs_manual_review", fileHash: hash }, hash)).toBe(true);
    });

    it("never serves a failed record — City must be able to retry", () => {
        expect(isCachedExtractionUsable({ extractionStatus: "failed", fileHash: hash })).toBe(false);
    });

    it("misses when the file changed (new upload -> new hash)", () => {
        const other = hashBuffer(Buffer.from("replaced-bytes"));
        expect(isCachedExtractionUsable({ extractionStatus: "extracted", fileHash: hash }, other)).toBe(false);
    });

    it("misses for legacy records with no stored hash", () => {
        expect(isCachedExtractionUsable({ extractionStatus: "extracted", fileHash: "" }, hash)).toBe(false);
        expect(isCachedExtractionUsable(null, hash)).toBe(false);
        expect(isCachedExtractionUsable({ extractionStatus: "extracted", fileHash: hash }, "")).toBe(false);
    });
});

describe("parseRetryAfterMs", () => {
    it("parses seconds", () => expect(parseRetryAfterMs("5")).toBe(5000));
    it("returns null when absent", () => expect(parseRetryAfterMs(null)).toBeNull());
    it("returns null for garbage", () => expect(parseRetryAfterMs("soon")).toBeNull());
});

describe("prepareDocumentForAi — payload size reduction", () => {
    it("rejects an oversized PDF with a clear message before any AI call", async() => {
        const oversized = Buffer.alloc(MAX_PDF_BYTES + 1, 0x25); // '%' filler
        await expect(prepareDocumentForAi(oversized, "application/pdf")).rejects.toMatchObject({
            name: "AiVisionError",
            code: "file_too_large"
        });
    });

    it("passes a small PDF through unchanged", async() => {
        const pdf = Buffer.from("%PDF-1.4 small");
        const prepared = await prepareDocumentForAi(pdf, "application/pdf");
        expect(prepared.mimeType).toBe("application/pdf");
        expect(Buffer.from(prepared.base64, "base64").equals(pdf)).toBe(true);
    });

    it("handles a small image whether or not sharp is installed", async() => {
        // If sharp IS installed the resize path runs instead — either way the
        // call must succeed and return base64.
        const image = Buffer.alloc(1024, 0x89);
        const prepared = await prepareDocumentForAi(image, "image/png");
        expect(typeof prepared.base64).toBe("string");
        expect(["image/png", "image/jpeg"]).toContain(prepared.mimeType);
    });

    it("rejects an unsupported type before spending money", async() => {
        await expect(prepareDocumentForAi(Buffer.from("x"), "application/zip")).rejects.toMatchObject({
            code: "unsupported_type"
        });
    });

    it("hashes identical bytes identically and different bytes differently", () => {
        expect(hashBuffer(Buffer.from("a"))).toBe(hashBuffer(Buffer.from("a")));
        expect(hashBuffer(Buffer.from("a"))).not.toBe(hashBuffer(Buffer.from("b")));
    });

    it("exports an image cap aligned with the upload limit", () => {
        expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024);
    });
});
