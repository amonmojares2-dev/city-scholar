const Document = require("../models/Document");
const Application = require("../models/Application");
const Notification = require("../models/Notification");
const User = require("../models/User");
const fs = require("fs");
const { resolveStoredFile, removeStoredFileByFilename } = require("../config/storage");
const { CITY_ADMIN_ROLES, SUPER_ADMIN_ROLES, BARANGAY_ADMIN_ROLES } = require("../utils/validation");
const { normalizeReviewStatus, isGradeDocumentType } = require("../utils/documentReview");

// Strip the deprecated raw filesystem path before a Document leaves the
// server — clients must never see the server's directory structure.
function publicDocument(document) {
    if (!document) return document;
    const plain = typeof document.toObject === "function" ? document.toObject() : { ...document };
    delete plain.path;
    return plain;
}

const publicDocuments = (documents) => (documents || []).map(publicDocument);

const listDocuments = async(req, res, next) => {
    try {
        const filter = req.user.role === "student" ? { student: req.user.id } : {};
        // City/admin reviewers scope document lists per application and per
        // portal flow: ?application=<id>&context=renewal shows only that
        // renewal submission's documents; ?context=application the originals.
        if (req.query.application) filter.application = req.query.application;
        const rawContext = String(req.query.context || "").trim().toLowerCase();
        if (rawContext === "renewal" || rawContext === "application") filter.context = rawContext;
        const documents = await Document.find(filter).populate("application", "program status").populate("student", "name email").sort({ createdAt: -1 });
        res.json({ success: true, documents: publicDocuments(documents) });
    } catch (error) { next(error); }
};

const uploadDocument = async(req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "A PDF, JPEG, or PNG file is required" });
        const application = await Application.findById(req.body.application);
        if (!application) {
            removeStoredFileByFilename(req.file.filename);
            return res.status(404).json({ success: false, message: "Application not found" });
        }
        if (req.user.role === "student" && application.student.toString() !== req.user.id) {
            removeStoredFileByFilename(req.file.filename);
            return res.status(403).json({ success: false, message: "Access denied" });
        }
        // Store only the hashed filename — never the raw absolute path.
        // `originalName` keeps the human-readable label for the UI.
        const document = await Document.create({ application: application._id, student: application.student, type: req.body.type || "other", originalName: req.file.originalname, filename: req.file.filename, mimeType: req.file.mimetype });
        res.status(201).json({ success: true, document: publicDocument(document) });
    } catch (error) {
        removeStoredFileByFilename(req.file && req.file.filename);
        next(error);
    }
};

// ==========================================================
// PATCH /api/documents/:id — the per-document review action
//
// The City Office (and the Barangay Office, which keeps its own residency
// workflow) approves or rejects ONE uploaded file at a time:
//   { status: "approved" | "rejected" | "pending", remarks?: string }
//
// Stores the decision with reviewedBy / reviewedAt so the review page can show
// who decided what. A rejected document immediately notifies the student, with
// the document name, so they know exactly which file to replace.
//
// The application-level "Approve" button is separately gated on all of these
// decisions (see utils/documentReview.js) — this endpoint never approves an
// application.
// ==========================================================
const updateDocument = async(req, res, next) => {
    try {
        const status = normalizeReviewStatus(req.body && req.body.status);
        if (!status) {
            return res.status(400).json({
                success: false,
                message: "Document review status must be approved, rejected, or pending."
            });
        }
        const remarks = typeof req.body?.remarks === "string" ? req.body.remarks.trim() : "";

        // A replacement resets the row to pending: the reviewer trail is cleared
        // so a stale "approved" decision can never linger on a new file.
        const update = status === "pending" ?
            { status, remarks, reviewedBy: null, reviewedAt: null } :
            { status, remarks, reviewedBy: req.user.id, reviewedAt: new Date() };

        const document = await Document.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
        if (!document) return res.status(404).json({ success: false, message: "Document not found" });

        // Notify the owner when their file was rejected (requirement: the student
        // must be told which document to replace). Best effort — a notification
        // failure must never undo a decision the reviewer already made.
        if (status === "rejected") {
            try {
                await Notification.create({
                    recipient: document.student,
                    title: "Document rejected",
                    message: `${document.type} was rejected by the City Scholarship Office and needs to be replaced.${remarks ? ` ${remarks}` : ""}`,
                    type: "document",
                    link: document.context === "renewal" ? "/student/renewal" : "/student/documents"
                });
            } catch (notificationError) {
                console.error("Document review notification error:", notificationError.message);
            }
        }

        res.json({ success: true, document: publicDocument(document) });
    } catch (error) { next(error); }
};

// ==========================================================
// Failed-grade appeal: City asks the student to resubmit
// POST /api/documents/:id/request-resubmission (City / Super Admin)
// ==========================================================
// Academic Monitoring's Failed Students section sends this when a grade copy
// did not survive the scale check. The request lives in the requestedReissue /
// request* fields instead of overwriting the review status, so the student
// sees WHY a new copy is needed and BY WHEN on their Documents and Renewal
// pages while the original decision history stays intact.
const requestResubmission = async(req, res, next) => {
    try {
        const document = await Document.findById(req.params.id);
        if (!document) return res.status(404).json({ success: false, message: "Document not found" });

        const explanation = String(req.body.explanation || "").trim();
        if (explanation.length < 10) {
            return res.status(400).json({ success: false, message: "Explain what the student must fix (at least 10 characters)." });
        }

        const deadline = new Date(req.body.deadline || "");
        if (Number.isNaN(deadline.getTime())) {
            return res.status(400).json({ success: false, message: "A valid replacement deadline is required." });
        }
        // The UI sends a date-only string (UTC midnight). Require at least
        // tomorrow's calendar date so the student is never asked for a
        // same-day miracle.
        const startOfToday = new Date();
        startOfToday.setUTCHours(0, 0, 0, 0);
        if (deadline.getTime() <= startOfToday.getTime()) {
            return res.status(400).json({ success: false, message: "The replacement deadline must be a future date." });
        }

        document.requestedReissue = true;
        document.requestedBy = req.user.id;
        document.requestedAt = new Date();
        document.requestExplanation = explanation;
        document.requestDeadline = deadline;
        // A fresh request reopens the cycle: the student has NOT answered yet.
        document.appealStatus = null;
        await document.save();

        // Best effort — failing to notify must never undo a request City made.
        try {
            await Notification.create({
                recipient: document.student,
                title: "Resubmission requested",
                message: `${document.type} must be replaced. ${explanation} Submit a new copy before ${deadline.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`,
                type: "document",
                link: document.context === "renewal" ? "/student/renewal" : "/student/documents"
            });
        } catch (notificationError) {
            console.error("Resubmission request notification error:", notificationError.message);
        }

        res.json({ success: true, document: publicDocument(document) });
    } catch (error) { next(error); }
};


// ==========================================================
// Student answers a replacement request (or a rejection)
// POST /api/documents/:id/replace — owner student, file in "file"
// ==========================================================
// Swaps the stored file on the EXISTING Document row instead of creating a
// second one: the unique application+context+type index allows one file per
// slot, and Academic Monitoring keeps pointing at this same row so the appeal
// lifecycle (request -> resubmission -> re-analysis) stays on one record.
const replaceDocument = async(req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "A PDF, JPEG, or PNG file is required" });

        const document = await Document.findById(req.params.id);
        if (!document) {
            removeStoredFileByFilename(req.file.filename);
            return res.status(404).json({ success: false, message: "Document not found" });
        }

        // Only the owning student may replace their own file.
        if (!document.student || document.student.toString() !== req.user.id) {
            removeStoredFileByFilename(req.file.filename);
            return res.status(403).json({ success: false, message: "You can only replace your own documents." });
        }

        const openRequest = Boolean(document.requestedReissue) && document.appealStatus !== "resubmitted";
        const isRejected = document.status === "rejected";
        if (!openRequest && !isRejected) {
            removeStoredFileByFilename(req.file.filename);
            return res.status(409).json({ success: false, message: "This document does not need to be replaced right now." });
        }

        // The deadline only gates City-requested resubmissions; an ordinary
        // rejection can be fixed whenever the student gets to it.
        if (openRequest && document.requestDeadline && new Date(document.requestDeadline).getTime() < Date.now()) {
            removeStoredFileByFilename(req.file.filename);
            return res.status(410).json({
                success: false,
                message: `The replacement deadline (${new Date(document.requestDeadline).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}) has passed. Contact the City Scholarship Office.`
            });
        }

        const previousFilename = document.filename;
        document.originalName = req.file.originalname;
        document.filename = req.file.filename;
        document.mimeType = req.file.mimetype;
        // The new file is unreviewed: reset the old decision and trail.
        document.status = "pending";
        document.remarks = "";
        document.reviewedBy = null;
        document.reviewedAt = null;
        document.replacementDate = new Date();
        // Record that the answer arrived — for a grade copy this is the appeal
        // resubmission Academic Monitoring waits for.
        if (document.requestedReissue || isGradeDocumentType(document.type)) {
            document.appealStatus = "resubmitted";
        }
        await document.save();

        // Delete the superseded file only after the swap has committed.
        if (previousFilename && previousFilename !== document.filename) {
            removeStoredFileByFilename(previousFilename);
        }

        res.json({ success: true, document: publicDocument(document) });
    } catch (error) {
        removeStoredFileByFilename(req.file && req.file.filename);
        next(error);
    }
};


// ==========================================================
// Dedicated file endpoint — GET /api/documents/:id/file
//
// Streams the stored file for one Document row. The client addresses the
// file by its MongoDB id (never by filename), and the server resolves the
// hashed filename to disk internally, so the real directory structure is
// never exposed. Access rules mirror the list endpoint:
//   - the owning student,
//   - City Office / Barangay / Super Admin reviewers.
// ==========================================================
const serveDocumentFile = async(req, res, next) => {
    try {
        const document = await Document.findById(req.params.id);
        if (!document) return res.status(404).json({ success: false, message: "Document not found" });

        const isOwner = document.student && document.student.toString() === req.user.id;
        const application = await Application.findById(document.application).select("barangay student");
        const owner = application?.student ? await User.findById(application.student).select("barangay").lean() : null;
        const isBarangayReviewer = [...BARANGAY_ADMIN_ROLES].includes(req.user.role) &&
            [application?.barangay, owner?.barangay].some(value => value && String(value) === String(req.user.barangay?._id || req.user.barangay));
        const isStaff = [...CITY_ADMIN_ROLES, ...SUPER_ADMIN_ROLES].includes(req.user.role);
        if (!isOwner && !isBarangayReviewer && !isStaff) {
            return res.status(403).json({ success: false, message: "Access denied" });
        }

        const fullPath = resolveStoredFile(document);
        if (!fullPath || !fs.existsSync(fullPath)) {
            return res.status(404).json({ success: false, message: "File not found on the server." });
        }

        // Fetch and display through an authenticated Blob URL; a raw URL
        // would require putting the JWT in the query string.
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("Content-Type", document.mimeType || "application/octet-stream");
        // Display the human-readable name, not the hashed stored name.
        res.setHeader("Content-Disposition", `inline; filename="${String(document.originalName || "file").replace(/"/g, "")}"`);
        return res.sendFile(fullPath);
    } catch (error) { next(error); }
};

module.exports = { listDocuments, uploadDocument, updateDocument, serveDocumentFile, requestResubmission, replaceDocument };