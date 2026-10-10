const Document = require("../models/Document");
const {
    applicationDocumentTypes,
    renewalDocumentTypes,
    matchesRequiredDocument
} = require("./cityProgramSettings");

// ==========================================================
// Per-document review status
//
// "approved" is the canonical value written by the City Office document
// review action. "verified" is the older label for the same state: rows saved
// before this gate existed carry it, and the Barangay document review writes
// it, so BOTH count as approved. Nothing is migrated — historical rows keep
// working and every new decision is written as "approved".
// ==========================================================
const APPROVED_DOCUMENT_STATUSES = Object.freeze(["approved", "verified"]);
const DOCUMENT_REVIEW_STATUSES = Object.freeze(["pending", "approved", "rejected"]);

// Accepts a document row or a raw status string.
function isDocumentApproved(document) {
    const status = document && typeof document === "object" ? document.status : document;
    return APPROVED_DOCUMENT_STATUSES.includes(String(status || "").trim().toLowerCase());
}

// Accepts what the UI actually sends (approve / approved / verify / verified)
// and returns the value that is stored, or "" when it is not a valid status.
function normalizeReviewStatus(value) {
    const raw = value === undefined || value === null ? "" : String(value).trim().toLowerCase();
    if (["approved", "approve", "verified", "verify"].includes(raw)) return "approved";
    if (["rejected", "reject"].includes(raw)) return "rejected";
    if (raw === "pending") return "pending";
    return "";
}

// First-time applicants upload under the "application" context, renewals under
// "renewal" — the same split the upload and review pages use.
function documentReviewContext(application) {
    return application && application.status === "renewal" ? "renewal" : "application";
}

// Required slots come from the City Office Program Config (City Office >
// Program Settings > Required Documents), so adding or removing a required
// document there changes this gate immediately.
async function requiredDocumentKeys(context) {
    const types = context === "renewal" ?
        await renewalDocumentTypes() :
        await applicationDocumentTypes();
    return types.required;
}

function statusOf(document) {
    return String(document && document.status ? document.status : "").trim().toLowerCase();
}

function listOf(items, limit = 3) {
    const shown = items.slice(0, limit);
    const extra = items.length - shown.length;
    return `${shown.join(", ")}${extra > 0 ? ` and ${extra} more` : ""}`;
}

function plural(count, singular, pluralForm) {
    return `${count} ${count === 1 ? singular : pluralForm}`;
}

// Sentence shown to the reviewer AND returned by the approve endpoint when the
// gate is not satisfied. Deliberately explicit so a caller that talks to the
// API directly gets the same explanation the disabled button shows.
function reviewGateMessage(summary) {
    if (summary.canApprove) return "";

    const problems = [];
    if (summary.missingRequiredDocuments.length) {
        problems.push(`${plural(summary.missingRequiredDocuments.length, "required document has", "required documents have")} not been uploaded yet (${listOf(summary.missingRequiredDocuments)}).`);
    }
    // Note: pendingDocuments / rejectedDocuments are COUNTS on the summary; the
    // document names travel in pendingDocumentTypes / rejectedDocumentTypes.
    if (summary.pendingDocuments > 0) {
        problems.push(`${plural(summary.pendingDocuments, "document still needs", "documents still need")} a review decision (${listOf(summary.pendingDocumentTypes)}).`);
    }
    if (summary.rejectedDocuments > 0) {
        problems.push(`${plural(summary.rejectedDocuments, "document was", "documents were")} rejected (${listOf(summary.rejectedDocumentTypes)}) — the student has to replace ${summary.rejectedDocuments === 1 ? "it" : "them"} and the replacement has to be approved too.`);
    }

    const progress = `${summary.approvedDocuments} of ${summary.totalDocuments} documents approved.`;
    const closing = summary.rejectedDocuments > 0 && summary.pendingDocuments === 0 && !summary.missingRequiredDocuments.length ?
        "This record can only be rejected, or held until the replacement documents are approved." :
        "Every uploaded document must be approved before this can be approved.";

    return `${progress} ${problems.join(" ")} ${closing}`.replace(/\s+/g, " ").trim();
}

// ==========================================================
// THE GATE
//
// Returns everything the City Office review page (and the approve endpoint)
// needs to know about a record's documents:
//   - totalDocuments / approvedDocuments / pendingDocuments / rejectedDocuments
//   - missingRequiredDocuments      required slots with no upload at all
//   - unapprovedRequiredDocuments   required slots without an APPROVED upload
//   - canApprove                    true only when nothing is outstanding
//   - reason                        the sentence explaining why not
//
// The Document model is injectable so this stays unit-testable without a live
// database connection.
// ==========================================================
async function documentReviewSummary(application, options = {}) {
    const context = options.context || documentReviewContext(application);
    const DocumentModel = options.DocumentModel || Document;

    const documents = await DocumentModel.find({ application: application._id, context })
        .select("type status")
        .lean();

    const required = await requiredDocumentKeys(context);
    const approved = documents.filter(isDocumentApproved);
    const rejected = documents.filter((document) => statusOf(document) === "rejected");
    const pending = documents.filter((document) => !isDocumentApproved(document) && statusOf(document) !== "rejected");

    const missingRequired = required.filter((key) =>
        !documents.some((document) => matchesRequiredDocument(document.type, key))
    );
    const unapprovedRequired = required.filter((key) =>
        !approved.some((document) => matchesRequiredDocument(document.type, key))
    );

    const summary = {
        context,
        requiredDocuments: required,
        totalDocuments: documents.length,
        approvedDocuments: approved.length,
        pendingDocuments: pending.length,
        rejectedDocuments: rejected.length,
        pendingDocumentTypes: pending.map((document) => document.type),
        rejectedDocumentTypes: rejected.map((document) => document.type),
        missingRequiredDocuments: missingRequired,
        unapprovedRequiredDocuments: unapprovedRequired,
        canApprove: pending.length === 0 && rejected.length === 0 && unapprovedRequired.length === 0,
        reason: ""
    };

    summary.reason = reviewGateMessage(summary);
    return summary;
}

// Grade-document slot hints, shared by the Analyze list
// (gradeRecordController) and the resubmission flows (documentController), so
// both always agree on which slots hold grades.
const GRADE_DOCUMENT_HINTS = /report card|transcript|grades|\btor\b/i;

function isGradeDocumentType(type) {
    return GRADE_DOCUMENT_HINTS.test(String(type || ""));
}

module.exports = {
    APPROVED_DOCUMENT_STATUSES,
    DOCUMENT_REVIEW_STATUSES,
    isDocumentApproved,
    normalizeReviewStatus,
    isGradeDocumentType,
    documentReviewContext,
    requiredDocumentKeys,
    documentReviewSummary,
    reviewGateMessage
};
