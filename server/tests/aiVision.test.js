// ==========================================
// AI extraction: provider error handling, retries, cache, payload caps
// ==========================================
//
// The provider is mocked via the `fetchImpl` option — no network, no key.
// These tests pin the behaviour that made "insufficient_quota" and a real
// rate limit look identical to City users.

process.env.OPENAI_API_KEY = "sk-test-key-not-real";

const {
    analyzeGradeDocument,
    AiVisionError,
    isCachedExtractionUsable,
    parseRetryAfterMs,
    AI_QUOTA_MESSAGE,
    AI_RATE_LIMIT_MESSAGE,
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

function okResponse() {
    return {
        ok: true,
        status: 200,
        json: async() => ({ choices: [{ message: { content: MODEL_JSON } }] })
    };
}

// A mocked OpenAI 429. OpenAI puts the distinguishing signal in
// error.code / error.type, not in the status alone.
function rateLimitedResponse({ code = "rate_limit_exceeded", type = "requests", retryAfter = null } = {}) {
    return {
        ok: false,
        status: 429,
        headers: { get: (name) => (name === "retry-after" ? retryAfter : null) },
        json: async() => ({
            error: {
                message: code === "insufficient_quota"
                    ? "You exceeded your current quota, please check your plan and billing details."
                    : "Rate limit reached for gpt-4o",
                type,
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
        json: async() => ({ error: { message: "Internal server error", type: "server_error", code: "" } })
    };
}

describe("analyzeGradeDocument — provider 429 handling", () => {
    let consoleError;
    beforeEach(() => { consoleError = jest.spyOn(console, "error").mockImplementation(() => {}); });
    afterEach(() => { consoleError.mockRestore(); });

    it("reports insufficient_quota distinctly and does NOT retry", async() => {
        const fetchImpl = jest.fn().mockResolvedValue(rateLimitedResponse({ code: "insufficient_quota" }));
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
            .mockResolvedValueOnce(rateLimitedResponse())
            .mockResolvedValueOnce(rateLimitedResponse())
            .mockResolvedValueOnce(okResponse());
        const sleep = jest.fn().mockResolvedValue(undefined);

        const result = await analyzeGradeDocument(
            { base64: "AAAA", mimeType: "image/png", filename: "grades.png" },
            { fetchImpl, sleep, retryDelays: [10, 20, 40] }
        );

        expect(result.studentName).toBe("Juan Dela Cruz");
        expect(fetchImpl).toHaveBeenCalledTimes(3);
        expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([10, 20]); // growing delays
    });

    it("honors the Retry-After header when the provider sends one", async() => {
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(rateLimitedResponse({ retryAfter: "2" }))
            .mockResolvedValueOnce(okResponse());
        const sleep = jest.fn().mockResolvedValue(undefined);

        await analyzeGradeDocument(
            { base64: "AAAA", mimeType: "image/png", filename: "grades.png" },
            { fetchImpl, sleep, retryDelays: [10, 20, 40] }
        );

        expect(sleep).toHaveBeenCalledTimes(1);
        expect(sleep).toHaveBeenCalledWith(2000); // Retry-After: 2 seconds
    });

    it("gives up after MAX_RATE_LIMIT_RETRIES with the busy message", async() => {
        const fetchImpl = jest.fn().mockResolvedValue(rateLimitedResponse());
        const sleep = jest.fn().mockResolvedValue(undefined);

        await expect(analyzeGradeDocument(
            { base64: "AAAA", mimeType: "image/png", filename: "grades.png" },
            { fetchImpl, sleep, retryDelays: [1, 1, 1] }
        )).rejects.toMatchObject({
            message: AI_RATE_LIMIT_MESSAGE,
            code: "rate_limit_exceeded",
            statusCode: 429
        });

        // 1 initial call + MAX_RATE_LIMIT_RETRIES retries.
        expect(fetchImpl).toHaveBeenCalledTimes(1 + MAX_RATE_LIMIT_RETRIES);
    });

    it("returns the generic failure message for other provider errors", async() => {
        const fetchImpl = jest.fn().mockResolvedValue(serverErrorResponse(500));

        await expect(analyzeGradeDocument(
            { base64: "AAAA", mimeType: "image/png", filename: "grades.png" },
            { fetchImpl, sleep: jest.fn() }
        )).rejects.toMatchObject({
            message: AI_GENERIC_FAILURE_MESSAGE,
            code: "provider_error"
        });
    });

    it("logs status, code, and type without the API key or document content", async() => {
        const fetchImpl = jest.fn().mockResolvedValue(rateLimitedResponse({ code: "insufficient_quota" }));

        await expect(analyzeGradeDocument(
            { base64: "ZG9jdW1lbnQtYnl0ZXM=", mimeType: "image/png", filename: "grades.png" },
            { fetchImpl, sleep: jest.fn() }
        )).rejects.toBeInstanceOf(AiVisionError);

        const logged = consoleError.mock.calls.map((args) => args.map(String).join(" ")).join("\n");
        expect(logged).toContain("429");
        expect(logged).toContain("insufficient_quota");
        expect(logged).not.toContain("sk-test-key-not-real"); // never the key
        expect(logged).not.toContain("ZG9jdW1lbnQtYnl0ZXM="); // never the document
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
        expect(isCachedExtractionUsable({ extractionStatus: "failed", fileHash: hash }, hash)).toBe(false);
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
