const Document = require("../models/Document");
const Notification = require("../models/Notification");
const { removeStoredFileByFilename } = require("../config/storage");
const { requestResubmission, replaceDocument } = require("../controllers/documentController");
const { isGradeDocumentType } = require("../utils/documentReview");

// The controller captured removeStoredFileByFilename at require time, so the
// real function is replaced via jest.mock (hoisted before the require above).
jest.mock("../config/storage", () => ({
    ...jest.requireActual("../config/storage"),
    removeStoredFileByFilename: jest.fn()
}));

function response() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
}

const cityUser = { id: "city-1", role: "city_admin" };
const ownerStudent = { id: "student-1", role: "student" };

function dayOffset(offset) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
}

function documentRow(overrides = {}) {
    return {
        _id: "doc-1",
        type: "Report Card",
        student: "student-1",
        context: "renewal",
        status: "pending",
        filename: "old-hash.png",
        originalName: "report-card.png",
        mimeType: "image/png",
        remarks: "",
        requestedReissue: false,
        requestExplanation: "",
        requestDeadline: null,
        appealStatus: null,
        replacementDate: null,
        save: jest.fn().mockResolvedValue(undefined),
        ...overrides
    };
}

const uploadedFile = { filename: "new-hash.png", originalname: "new-report.png", mimetype: "image/png" };

describe("grade-copy predicate shared with Academic Monitoring", () => {
    it("recognizes grade slots and nothing else", () => {
        expect(isGradeDocumentType("Report Card")).toBe(true);
        expect(isGradeDocumentType("Transcript of Records")).toBe(true);
        expect(isGradeDocumentType("Final Grades")).toBe(true);
        expect(isGradeDocumentType("TOR (Current)")).toBe(true);
        expect(isGradeDocumentType("Certificate of Residency")).toBe(false);
        expect(isGradeDocumentType(undefined)).toBe(false);
    });
});

describe("POST /api/documents/:id/request-resubmission", () => {
    afterEach(() => jest.restoreAllMocks());

    it("404s when the document does not exist", async() => {
        jest.spyOn(Document, "findById").mockResolvedValue(null);

        const res = response();
        await requestResubmission({ params: { id: "missing" }, body: {}, user: cityUser }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it("rejects an empty explanation", async() => {
        const row = documentRow({ save: jest.fn() });
        jest.spyOn(Document, "findById").mockResolvedValue(row);

        const res = response();
        await requestResubmission({ params: { id: "doc-1" }, body: { explanation: "no", deadline: dayOffset(7) }, user: cityUser }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(400);
        expect(row.save).not.toHaveBeenCalled();
    });

    it("rejects a deadline that is not in the future", async() => {
        const row = documentRow({ save: jest.fn() });
        jest.spyOn(Document, "findById").mockResolvedValue(row);

        const res = response();
        await requestResubmission({
            params: { id: "doc-1" },
            body: { explanation: "The failing mark is missing from this scan.", deadline: dayOffset(-1) },
            user: cityUser
        }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(400);
        expect(row.save).not.toHaveBeenCalled();
    });

    it("stores the request and notifies the student with the renewal link", async() => {
        const row = documentRow({ save: jest.fn() });
        jest.spyOn(Document, "findById").mockResolvedValue(row);
        const notify = jest.spyOn(Notification, "create").mockResolvedValue({});

        const res = response();
        const deadline = dayOffset(7);
        await requestResubmission({
            params: { id: "doc-1" },
            body: { explanation: "The failing mark for Math is missing from this scan.", deadline },
            user: cityUser
        }, res, jest.fn());

        expect(row.requestedReissue).toBe(true);
        expect(row.requestedBy).toBe("city-1");
        expect(row.requestExplanation).toBe("The failing mark for Math is missing from this scan.");
        expect(row.requestDeadline).toBeInstanceOf(Date);
        // A fresh request reopens the cycle.
        expect(row.appealStatus).toBeNull();
        expect(row.save).toHaveBeenCalledTimes(1);

        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls[0][0]).toEqual(expect.objectContaining({
            recipient: "student-1",
            title: "Resubmission requested",
            type: "document",
            link: "/student/renewal"
        }));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});
describe("POST /api/documents/:id/replace", () => {
    afterEach(() => jest.restoreAllMocks());

    it("400s when no file was uploaded", async() => {
        const res = response();
        await replaceDocument({ params: { id: "doc-1" }, body: {}, user: ownerStudent }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("404s for an unknown document and discards the upload", async() => {
        jest.spyOn(Document, "findById").mockResolvedValue(null);

        const res = response();
        await replaceDocument({ params: { id: "missing" }, file: uploadedFile, body: {}, user: ownerStudent }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(404);
        expect(removeStoredFileByFilename).toHaveBeenCalledWith("new-hash.png");
    });

    it("403s when the student does not own the document", async() => {
        jest.spyOn(Document, "findById").mockResolvedValue(documentRow());

        const res = response();
        await replaceDocument({ params: { id: "doc-1" }, file: uploadedFile, body: {}, user: { id: "student-2", role: "student" } }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(403);
        expect(removeStoredFileByFilename).toHaveBeenCalledWith("new-hash.png");
    });

    it("409s when neither a request nor a rejection is open", async() => {
        jest.spyOn(Document, "findById").mockResolvedValue(documentRow({ status: "pending", requestedReissue: false }));

        const res = response();
        await replaceDocument({ params: { id: "doc-1" }, file: uploadedFile, body: {}, user: ownerStudent }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(409);
        expect(removeStoredFileByFilename).toHaveBeenCalledWith("new-hash.png");
    });

    it("409s when the request was already answered", async() => {
        jest.spyOn(Document, "findById").mockResolvedValue(documentRow({
            status: "pending",
            requestedReissue: true,
            requestDeadline: new Date(Date.now() + 86400000),
            appealStatus: "resubmitted"
        }));

        const res = response();
        await replaceDocument({ params: { id: "doc-1" }, file: uploadedFile, body: {}, user: ownerStudent }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it("410s when the replacement deadline has passed", async() => {
        jest.spyOn(Document, "findById").mockResolvedValue(documentRow({
            status: "pending",
            requestedReissue: true,
            requestDeadline: new Date(Date.now() - 86400000)
        }));

        const res = response();
        await replaceDocument({ params: { id: "doc-1" }, file: uploadedFile, body: {}, user: ownerStudent }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(410);
        expect(removeStoredFileByFilename).toHaveBeenCalledWith("new-hash.png");
    });

    it("swaps the file, resets review state, and marks the appeal resubmitted", async() => {
        const row = documentRow({
            status: "approved",
            requestedReissue: true,
            requestDeadline: new Date(Date.now() + 86400000),
            appealStatus: null
        });
        jest.spyOn(Document, "findById").mockResolvedValue(row);

        const res = response();
        await replaceDocument({ params: { id: "doc-1" }, file: uploadedFile, body: {}, user: ownerStudent }, res, jest.fn());

        expect(row.filename).toBe("new-hash.png");
        expect(row.originalName).toBe("new-report.png");
        expect(row.status).toBe("pending");
        expect(row.remarks).toBe("");
        expect(row.reviewedBy).toBeNull();
        expect(row.reviewedAt).toBeNull();
        expect(row.appealStatus).toBe("resubmitted");
        expect(row.replacementDate).toBeInstanceOf(Date);
        expect(row.save).toHaveBeenCalledTimes(1);
        // The superseded file is removed only after the swap.
        expect(removeStoredFileByFilename).toHaveBeenCalledWith("old-hash.png");
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it("allows replacing a rejected document without a request", async() => {
        const row = documentRow({ type: "Birth Certificate", status: "rejected" });
        jest.spyOn(Document, "findById").mockResolvedValue(row);

        const res = response();
        await replaceDocument({ params: { id: "doc-1" }, file: uploadedFile, body: {}, user: ownerStudent }, res, jest.fn());

        expect(row.status).toBe("pending");
        expect(row.save).toHaveBeenCalledTimes(1);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});

