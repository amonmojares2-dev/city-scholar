const Application = require("../models/Application");
const Document = require("../models/Document");
const User = require("../models/User");
const { removeStoredFile, removeStoredFileByFilename } = require("../config/storage");

// Strip the deprecated raw filesystem path before a Document leaves the
// server — clients must never see the server's directory structure.
function publicDocument(document) {
    if (!document) return document;
    const plain = typeof document.toObject === "function" ? document.toObject() : { ...document };
    delete plain.path;
    return plain;
}

const publicDocuments = (documents) => (documents || []).map(publicDocument);

const PAGE_SIZE = 50;

/** Student: list documents for the application they most recently submitted (or draft). */
const listStudentDocuments = async(req, res, next) => {
    try {
        const rawContext = String(req.query.context || "").trim().toLowerCase();
        const contextFilter = rawContext === "renewal" ? "renewal" : rawContext === "application" ? "application" : null;
        const application = await Application.findOne({ student: req.user.id })
            .sort({ createdAt: -1 })
            .populate("student", "name email");

        if (!application) {
            return res.json({
                success: true,
                application: null,
                documents: [],
                pendingCount: 0,
                uploadedCount: 0
            });
        }

        const docFilter = { application: application._id };
        if (contextFilter) docFilter.context = contextFilter;
        const documents = await Document.find(docFilter)
            .sort({ createdAt: 1 });

        const pendingCount = documents.filter(d => d.status === "pending").length;
        const uploadedCount = documents.filter(d => d.status !== "pending").length;

        res.json({
            success: true,
            applicationId: application._id.toString(),
            application,
            documents: publicDocuments(documents),
            pendingCount,
            uploadedCount
        });
    } catch (error) {
        next(error);
    }
};

const ALLOWED_MIME = new Set(["image/jpeg", "image/png"]);
const MAX_BYTES = 5 * 1024 * 1024;

/** Student: upload one document file and attach it to the application. */
const uploadStudentDocument = async(req, res, next) => {
    const sendError = (status, message) =>
        res.status(status).json({ success: false, message });

    try {
        if (!req.file) {
            return sendError(400, "Please select a file to upload.");
        }

        const mimeType = (req.file.mimetype || "").toLowerCase();
        if (!ALLOWED_MIME.has(mimeType)) {
            removeStoredFileByFilename(req.file.filename);
            return sendError(400, "Only JPG and PNG image files are accepted.");
        }

        if ((req.file.size || 0) > MAX_BYTES) {
            removeStoredFileByFilename(req.file.filename);
            return sendError(400, "File is too large. Maximum size is 5 MB.");
        }

        // One candidate, one application at a time. The upload must attach to
        // the student's EXISTING application — never create or re-validate
        // the parent Application here (Application requires school + program,
        // which an upload cannot invent).
        const application = await Application.findOne({ student: req.user.id })
            .sort({ createdAt: -1 });

        if (!application) {
            removeStoredFileByFilename(req.file.filename);
            return sendError(404, "No application found. Please create your application first, then upload documents.");
        }

        if (req.user.role === "student" && application.student.toString() !== req.user.id) {
            removeStoredFileByFilename(req.file.filename);
            return sendError(403, "You can only upload documents for your own application.");
        }

        // The document slot the student picked in the UI wins; the filename is
        // only a fallback for clients that don't send a docType field.
        // `context` distinguishes the Renewal page ("renewal") from the
        // Application page ("application", the default) so the two flows
        // never share document rows for the same application record.
        const requestedType = String(req.body.docType || req.body.type || "").trim();
        const originalName = String(req.body.originalName || req.file.originalname || "").trim();
        const documentType = requestedType || guessDocumentType(originalName);
        const rawContext = String(req.body.context || "").trim().toLowerCase();
        const context = rawContext === "renewal" ? "renewal" : "application";

        // Match the same (application, context, type) triple the list endpoint
        // returns, so an upload from the Renewal page never overwrites an
        // Application-page row (and vice versa).
        const existing = await Document.findOne({
            application: application._id,
            context,
            type: documentType
        });

        if (existing) {
            // Replace: remove the old file and update the record. Only the
            // hashed filename is stored — never the raw absolute path.
            removeStoredFile(existing);
            existing.filename = req.file.filename;
            existing.originalName = req.file.originalname;
            existing.mimeType = mimeType;
            existing.status = "pending";
            existing.remarks = "";
            existing.context = context;
            await existing.save();
        } else {
            await Document.create({
                application: application._id,
                student: req.user.id,
                context,
                type: documentType,
                originalName: req.file.originalname,
                filename: req.file.filename,
                mimeType
            });
        }

                // The application stays in whatever status it has. A draft with
        // uploaded documents is still a draft until the student submits.
        const freshApplication = await Application.findById(application._id)
            .populate("student", "name email");
        const documents = await Document.find({ application: application._id, context }).sort({ createdAt: 1 });

        res.status(201).json({
            success: true,
            applicationId: application._id.toString(),
            application: freshApplication,
            document: {
                id: (existing || documents[documents.length - 1])._id.toString(),
                type: documentType,
                context,
                originalName: req.file.originalname,
                filename: req.file.filename,
                mimeType,
                status: "pending"
            },
            documents: publicDocuments(documents),
            message: existing
                ? "Document replaced."
                : "Document uploaded."
        });
    } catch (error) {
        // Best-effort cleanup of an orphaned upload on failure.
        removeStoredFileByFilename(req.file && req.file.filename);
        next(error);
    }
};

// Fallback slot guessing when a client uploads without a docType field.
// The Certificates of Residency / Indigency (student and parent/guardian) were
// dropped from the application flow, so they are no longer recognised here —
// such a file falls through to "Other" instead of being filed in a removed slot.
const KNOWN_DOC_TYPES = [
    "Certificate of Matriculation",
    "Report Card (Grade 12)",
    "School ID (Current)",
    "Parent Valid ID",
    "Barangay Clearance",
    "Birth Certificate",
    "Good Moral Character",
    "Other"
];

function guessDocumentType(originalName) {
    const lower = originalName.toLowerCase();
    if (/matriculation/i.test(lower)) return KNOWN_DOC_TYPES[0];
    if (/report card/i.test(lower) || /grade 12/i.test(lower) || /reportcard/i.test(lower)) return KNOWN_DOC_TYPES[1];
    if (/school id/i.test(lower)) return KNOWN_DOC_TYPES[2];
    if (/valid id/i.test(lower) && /parent/i.test(lower)) return KNOWN_DOC_TYPES[3];
    if (/clearance/i.test(lower)) return KNOWN_DOC_TYPES[4];
    if (/birth/i.test(lower)) return KNOWN_DOC_TYPES[5];
    if (/moral/i.test(lower)) return KNOWN_DOC_TYPES[6];
    return KNOWN_DOC_TYPES[7];
}

module.exports = { listStudentDocuments, uploadStudentDocument };
