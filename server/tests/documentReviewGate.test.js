const Application = require("../models/Application");
const AuditLog = require("../models/AuditLog");
const Document = require("../models/Document");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { DEFAULT_RENEWAL_DOCUMENTS } = require("../config/cityProgramDefaults");
const {
    isDocumentApproved,
    normalizeReviewStatus,
    documentReviewContext,
    documentReviewSummary
} = require("../utils/documentReview");
const { reviewApplication } = require("../controllers/applicationController");
const { updateDocument } = require("../controllers/documentController");

// The gate only calls find().select().lean() on the Document model.
function documentModel(rows) {
    return {
        find: jest.fn(() => ({ select: () => ({ lean: async() => rows }) }))
    };
}

function response() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
}

const cityUser = { id: "city-1", role: "city_admin", name: "City Reviewer", account: { _id: "city-1", name: "City Reviewer" } };

const applicationStub = (overrides = {}) => ({
    _id: "app-1",
    status: "submitted",
    barangayVerificationStatus: "approved",
    student: "student-1",
    save: jest.fn().mockResolvedValue(undefined),
    populate: jest.fn().mockResolvedValue(undefined),
    ...overrides
});

describe("document review status helpers", () => {
    it("treats the legacy verified label the same as approved", () => {
        expect(isDocumentApproved({ status: "approved" })).toBe(true);
        expect(isDocumentApproved({ status: "verified" })).toBe(true);
        expect(isDocumentApproved({ status: "pending" })).toBe(false);
        expect(isDocumentApproved({ status: "rejected" })).toBe(false);
    });

    it("normalizes what the UI sends into the stored value", () => {
        expect(normalizeReviewStatus("approve")).toBe("approved");
        expect(normalizeReviewStatus("approved")).toBe("approved");
        expect(normalizeReviewStatus("verified")).toBe("approved");
        expect(normalizeReviewStatus("reject")).toBe("rejected");
        expect(normalizeReviewStatus("rejected")).toBe("rejected");
        expect(normalizeReviewStatus("pending")).toBe("pending");
        expect(normalizeReviewStatus("everything")).toBe("");
        expect(normalizeReviewStatus(undefined)).toBe("");
    });

    it("scopes renewals to the renewal context", () => {
        expect(documentReviewContext({ status: "renewal" })).toBe("renewal");
        expect(documentReviewContext({ status: "submitted" })).toBe("application");
    });
});

describe("document review gate summary", () => {
    it("blocks approval while a document is still pending and reports progress", async() => {
        const summary = await documentReviewSummary({ _id: "app-1", status: "submitted" }, {
            DocumentModel: documentModel([
                { type: "Certificate of Matriculation", status: "approved" },
                { type: "Report Card", status: "approved" },
                { type: "School ID (Current)", status: "pending" },
                { type: "Parent Valid ID", status: "verified" }
            ])
        });

        expect(summary.canApprove).toBe(false);
        expect(summary.totalDocuments).toBe(4);
        expect(summary.approvedDocuments).toBe(3);
        expect(summary.pendingDocuments).toBe(1);
        expect(summary.reason).toContain("3 of 4 documents approved");
        expect(summary.reason).toContain("School ID (Current)");
    });

    it("blocks approval while a required slot has no upload at all", async() => {
        const summary = await documentReviewSummary({ _id: "app-1", status: "submitted" }, {
            DocumentModel: documentModel([
                { type: "Certificate of Matriculation", status: "approved" },
                { type: "Report Card", status: "approved" },
                { type: "School ID (Current)", status: "approved" }
            ])
        });

        expect(summary.canApprove).toBe(false);
        expect(summary.missingRequiredDocuments).toEqual(["Parent Valid ID"]);
        expect(summary.reason).toContain("Parent Valid ID");
    });

    it("blocks approval when an extra uploaded document was rejected", async() => {
        const summary = await documentReviewSummary({ _id: "app-1", status: "submitted" }, {
            DocumentModel: documentModel([
                { type: "Certificate of Matriculation", status: "approved" },
                { type: "Report Card", status: "approved" },
                { type: "School ID (Current)", status: "approved" },
                { type: "Parent Valid ID", status: "approved" },
                { type: "Barangay Clearance", status: "rejected" }
            ])
        });

        expect(summary.canApprove).toBe(false);
        expect(summary.rejectedDocuments).toBe(1);
        expect(summary.reason).toContain("rejected");
        expect(summary.reason).toContain("Barangay Clearance");
    });

    it("opens the gate once every uploaded document is approved", async() => {
        const summary = await documentReviewSummary({ _id: "app-1", status: "submitted" }, {
            DocumentModel: documentModel([
                { type: "Certificate of Matriculation", status: "approved" },
                { type: "Report Card (Grade 12)", status: "verified" },
                { type: "School ID (Current)", status: "approved" },
                { type: "Parent Valid ID", status: "approved" }
            ])
        });

        expect(summary.canApprove).toBe(true);
        expect(summary.reason).toBe("");
    });

    it("follows the renewal required list for a renewal record", async() => {
        const summary = await documentReviewSummary({ _id: "app-2", status: "renewal" }, {
            DocumentModel: documentModel(DEFAULT_RENEWAL_DOCUMENTS.map((slot) => ({ type: slot.key, status: "approved" })))
        });

        expect(summary.context).toBe("renewal");
        expect(summary.requiredDocuments).toEqual(DEFAULT_RENEWAL_DOCUMENTS.map((slot) => slot.key));
        expect(summary.canApprove).toBe(true);
    });

    it("blocks a renewal approval while one renewal document is unreviewed", async() => {
        const rows = DEFAULT_RENEWAL_DOCUMENTS.map((slot) => ({ type: slot.key, status: "approved" }));
        rows[rows.length - 1].status = "pending";

        const summary = await documentReviewSummary({ _id: "app-2", status: "renewal" }, {
            DocumentModel: documentModel(rows)
        });

        expect(summary.canApprove).toBe(false);
        expect(summary.reason).toContain(`${rows.length - 1} of ${rows.length} documents approved`);
    });
});

describe("approve endpoint enforcement (backend gate)", () => {
    afterEach(() => jest.restoreAllMocks());

    it("refuses to approve a new application while a document is unreviewed", async() => {
        jest.spyOn(Application, "findById").mockResolvedValue(applicationStub());
        jest.spyOn(Document, "find").mockReturnValue({
            select: () => ({ lean: async() => [{ type: "Report Card", status: "pending" }] })
        });

        const res = response();
        const next = jest.fn();
        await reviewApplication({ body: { decision: "approved" }, params: { id: "app-1" }, user: cityUser }, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        const payload = res.json.mock.calls[0][0];
        expect(payload.success).toBe(false);
        expect(payload.message).toContain("documents approved");
        expect(payload.documentReview.canApprove).toBe(false);
        expect(next).not.toHaveBeenCalled();
    });

    it("refuses to approve a renewal while a renewal document is unreviewed", async() => {
        jest.spyOn(Application, "findById").mockResolvedValue(applicationStub({ status: "renewal" }));
        const find = jest.spyOn(Document, "find").mockReturnValue({
            select: () => ({ lean: async() => [{ type: "Certificate of Matriculation", status: "pending" }] })
        });

        const res = response();
        await reviewApplication({ body: { decision: "approved" }, params: { id: "app-1" }, user: cityUser }, res, jest.fn());

        expect(find).toHaveBeenCalledWith(expect.objectContaining({ context: "renewal" }));
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("still allows a rejection while documents are outstanding", async() => {
        const application = applicationStub();
        jest.spyOn(Application, "findById").mockResolvedValue(application);
        const find = jest.spyOn(Document, "find");
        jest.spyOn(Notification, "create").mockResolvedValue({});
        jest.spyOn(AuditLog, "create").mockResolvedValue({});

        const res = response();
        await reviewApplication({
            body: { decision: "rejected", remarks: "One document was unreadable." },
            params: { id: "app-1" },
            user: cityUser
        }, res, jest.fn());

        expect(find).not.toHaveBeenCalled();
        expect(application.status).toBe("rejected");
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it("approves once every document is approved", async() => {
        const application = applicationStub();
        jest.spyOn(Application, "findById").mockResolvedValue(application);
        jest.spyOn(Document, "find").mockReturnValue({
            select: () => ({
                lean: async() => [
                    { type: "Certificate of Matriculation", status: "approved" },
                    { type: "Report Card", status: "approved" },
                    { type: "School ID (Current)", status: "approved" },
                    { type: "Parent Valid ID", status: "approved" }
                ]
            })
        });
        jest.spyOn(User, "findById").mockResolvedValue({
            role: "student",
            scholarType: "new_applicant",
            save: jest.fn().mockResolvedValue(undefined)
        });
        jest.spyOn(Notification, "create").mockResolvedValue({});
        jest.spyOn(AuditLog, "create").mockResolvedValue({});

        const res = response();
        await reviewApplication({ body: { decision: "approved" }, params: { id: "app-1" }, user: cityUser }, res, jest.fn());

        expect(application.status).toBe("approved");
        expect(application.reviewedBy).toBe("city-1");
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});

describe("per-document review action", () => {
    afterEach(() => jest.restoreAllMocks());

    it("stores the reviewer trail and notifies the student when a document is rejected", async() => {
        const update = jest.spyOn(Document, "findByIdAndUpdate").mockResolvedValue({
            _id: "doc-1",
            type: "Report Card",
            student: "student-1",
            context: "application",
            status: "rejected",
            remarks: "Blurry scan"
        });
        const notify = jest.spyOn(Notification, "create").mockResolvedValue({});

        const res = response();
        await updateDocument({
            params: { id: "doc-1" },
            body: { status: "reject", remarks: "Blurry scan" },
            user: cityUser
        }, res, jest.fn());

        expect(update).toHaveBeenCalledWith(
            "doc-1",
            expect.objectContaining({ status: "rejected", reviewedBy: "city-1", reviewedAt: expect.any(Date) }),
            expect.objectContaining({ new: true })
        );
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls[0][0]).toEqual(expect.objectContaining({
            recipient: "student-1",
            title: "Document rejected",
            type: "document"
        }));
        // The student is told WHICH document to replace.
        expect(notify.mock.calls[0][0].message).toContain("Report Card");
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it("notifies the renewal page when a renewal document is rejected", async() => {
        jest.spyOn(Document, "findByIdAndUpdate").mockResolvedValue({
            _id: "doc-2",
            type: "Certificate of Indigency (Student)",
            student: "student-1",
            context: "renewal",
            status: "rejected",
            remarks: ""
        });
        const notify = jest.spyOn(Notification, "create").mockResolvedValue({});

        await updateDocument({ params: { id: "doc-2" }, body: { status: "rejected" }, user: cityUser }, response(), jest.fn());

        expect(notify.mock.calls[0][0].link).toBe("/student/renewal");
    });

    it("clears the reviewer trail when a document goes back to pending (replacement)", async() => {
        const update = jest.spyOn(Document, "findByIdAndUpdate").mockResolvedValue({
            _id: "doc-3", type: "Report Card", student: "student-1", context: "application", status: "pending", remarks: ""
        });
        const notify = jest.spyOn(Notification, "create").mockResolvedValue({});

        await updateDocument({ params: { id: "doc-3" }, body: { status: "pending" }, user: cityUser }, response(), jest.fn());

        expect(update).toHaveBeenCalledWith(
            "doc-3",
            expect.objectContaining({ status: "pending", reviewedBy: null, reviewedAt: null }),
            expect.any(Object)
        );
        expect(notify).not.toHaveBeenCalled();
    });

    it("refuses an unknown review status", async() => {
        const update = jest.spyOn(Document, "findByIdAndUpdate");

        const res = response();
        await updateDocument({ params: { id: "doc-4" }, body: { status: "maybe" }, user: cityUser }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(400);
        expect(update).not.toHaveBeenCalled();
    });
});
