const Application = require("../models/Application");
const Document = require("../models/Document");
const User = require("../models/User");
const { removeStoredFile, removeStoredFileByFilename } = require("../config/storage");
const { APPLICATION_DOCUMENT_TYPES, matchesRequiredDocument } = require("../config/applicationDocuments");

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

/** Student: upload one document file and attach it to the application. */
const uploadStudentDocument = async(req, res, next) => {
    const sendError = (status, message) =>
        res.status(status).json({ success: false, message });

    // Set only after MongoDB has committed the new record. If a later query
    // fails, the new file must remain because the database already references it.
    let uploadCommitted = false;

    try {
        if (!req.file) {
            return sendError(400, "Please select a file to upload.");
        }

        const mimeType = (req.file.mimetype || "").toLowerCase();
        const rawContext = String(req.body.context || "").trim().toLowerCase();
        const context = rawContext === "renewal" ? "renewal" : "application";

        // Application uploads target a draft explicitly. If a student has no
        // draft but does have a locked application, return the useful 409 rather
        // than a misleading 404. Renewal uploads keep their existing latest-
        // application behavior.
        let application;
        if (context === "application") {
            application = await Application.findOne({ student: req.user.id, status: "draft" })
                .sort({ createdAt: -1 });
            if (!application) {
                const lockedApplication = await Application.findOne({ student: req.user.id })
                    .sort({ createdAt: -1 });
                removeStoredFileByFilename(req.file.filename);
                if (lockedApplication) {
                    console.warn(`Document upload rejected for application ${lockedApplication._id}: status=${lockedApplication.status}`);
                    return sendError(409, "Documents can no longer be changed because your application was already submitted.");
                }
                return sendError(404, "No application found. Please create your application first, then upload documents.");
            }
        } else {
            application = await Application.findOne({ student: req.user.id })
                .sort({ createdAt: -1 });
        }

        if (!application) {
            removeStoredFileByFilename(req.file.filename);
            return sendError(404, "No application found. Please create your application first, then upload documents.");
        }

        const ownsApplication = application.student &&
            application.student.toString() === req.user.id;
        if (!ownsApplication) {
            removeStoredFileByFilename(req.file.filename);
            return sendError(403, "You can only upload documents for your own application.");
        }

        if (context === "application" && application.status !== "draft") {
            console.warn(`Document upload rejected for application ${application._id}: status=${application.status}`);
            removeStoredFileByFilename(req.file.filename);
            return sendError(409, "Documents can no longer be changed because your application was already submitted.");
        }

        const requestedType = String(req.body.docType || req.body.type || "").trim();
        const originalName = String(req.body.originalName || req.file.originalname || "").trim();
        const documentType = requestedType || guessDocumentType(originalName);
        if (!documentType) {
            removeStoredFileByFilename(req.file.filename);
            return sendError(400, "Please select a document type.");
        }
        if (context === "application" && !APPLICATION_DOCUMENT_TYPES.includes(documentType)) {
            removeStoredFileByFilename(req.file.filename);
            return sendError(400, "Please select a valid Application document type.");
        }

        const filter = {
            application: application._id,
            context,
            type: documentType
        };
        const replacement = {
            student: req.user.id,
            originalName: req.file.originalname,
            filename: req.file.filename,
            mimeType,
            status: "pending",
            remarks: ""
        };

        let previousDocument;
        try {
            // Return the pre-update document so replacement cleanup is safe even
            // when two uploads for the same slot overlap. The unique compound
            // index makes simultaneous first upserts converge on one row.
            previousDocument = await Document.findOneAndUpdate(filter, {
                $set: replacement,
                $setOnInsert: {
                    application: application._id,
                    context,
                    type: documentType
                }
            }, {
                new: false,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true
            });
        } catch (error) {
            if (error?.code !== 11000) throw error;

            // A parallel request created the same slot first. Re-run without
            // upsert so this legitimate re-upload becomes a replacement, never 409.
            previousDocument = await Document.findOneAndUpdate(filter, { $set: replacement }, {
                new: false,
                runValidators: true
            });
        }

        const document = await Document.findOne(filter);
        uploadCommitted = true;
        const replacedFilename = String(previousDocument?.filename || "");
        if (replacedFilename && replacedFilename !== req.file.filename) {
            removeStoredFile({ filename: replacedFilename });
        }

        const freshApplication = await Application.findById(application._id)
            .populate("student", "name email");
        const documents = await Document.find({ application: application._id, context })
            .sort({ createdAt: 1 });

        return res.status(200).json({
            success: true,
            applicationId: application._id.toString(),
            application: freshApplication,
            document: publicDocument(document),
            documents: publicDocuments(documents),
            message: "Document uploaded successfully."
        });
    } catch (error) {
        // An uncommitted upload is orphaned. Once the DB write succeeds, retain
        // the file even if a later response-building query fails.
        if (!uploadCommitted) removeStoredFileByFilename(req.file && req.file.filename);
        next(error);
    }
};

// Fallback slot guessing when a client uploads without a docType field.
// The Certificates of Residency / Indigency (student and parent/guardian) were
// dropped from the application flow, so they are no longer recognised here —
// such a file falls through to "Other" instead of being filed in a removed slot.

async function missingRequiredApplicationDocuments(applicationId) {
    const uploaded = await Document.find({ application: applicationId, context: "application" })
        .select("type")
        .lean();
    return APPLICATION_DOCUMENT_TYPES.filter((requiredType) =>
        !uploaded.some((document) => matchesRequiredDocument(document.type, requiredType))
    );
}

const KNOWN_DOC_TYPES = [
    "Certificate of Matriculation",
    "Report Card",
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
    if (/report card/i.test(lower) || /reportcard/i.test(lower)) return KNOWN_DOC_TYPES[1];
    if (/school id/i.test(lower)) return KNOWN_DOC_TYPES[2];
    if (/valid id/i.test(lower) && /parent/i.test(lower)) return KNOWN_DOC_TYPES[3];
    if (/clearance/i.test(lower)) return KNOWN_DOC_TYPES[4];
    if (/birth/i.test(lower)) return KNOWN_DOC_TYPES[5];
    if (/moral/i.test(lower)) return KNOWN_DOC_TYPES[6];
    return KNOWN_DOC_TYPES[7];
}

module.exports = { listStudentDocuments, uploadStudentDocument, missingRequiredApplicationDocuments };
