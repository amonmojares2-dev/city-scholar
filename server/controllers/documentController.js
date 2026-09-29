const Document = require("../models/Document");
const Application = require("../models/Application");
const Notification = require("../models/Notification");
const User = require("../models/User");
const fs = require("fs");
const { resolveStoredFile, removeStoredFileByFilename } = require("../config/storage");
const { CITY_ADMIN_ROLES, SUPER_ADMIN_ROLES, BARANGAY_ADMIN_ROLES } = require("../utils/validation");
const { normalizeReviewStatus } = require("../utils/documentReview");

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

module.exports = { listDocuments, uploadDocument, updateDocument, serveDocumentFile };