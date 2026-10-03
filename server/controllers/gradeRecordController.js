const fs = require("fs");
const GradeRecord = require("../models/GradeRecord");
const Document = require("../models/Document");
const { resolveStoredFile } = require("../config/storage");
const { analyzeGradeDocument, isAiConfigured, AiVisionError } = require("../utils/aiVision");
const { logAudit } = require("../utils/audit");

// ==========================================================
// Shared helpers
// ==========================================================

// Grade documents City can reasonably expect a vision model to read. Anything
// else is rejected before we spend a paid API call on it.
const ANALYZABLE_TYPES = new Set(["image/png", "image/jpeg", "application/pdf"]);

// Document slot keys that hold grades (see KNOWN_DOC_TYPES in
// studentDocController.js). Only used to label/hide the Analyze button in the
// UI — the endpoint accepts any supported file type so a City Office that
// configured different slots still works.
const GRADE_DOCUMENT_HINTS = /report card|transcript|grades|\btor\b/i;

function isGradeDocumentType(type) {
    return GRADE_DOCUMENT_HINTS.test(String(type || ""));
}

// Shape a record for the client. Never expose mongoose internals.
function publicRecord(record) {
    if (!record) return null;
    const plain = typeof record.toObject === "function" ? record.toObject() : { ...record };
    plain.id = String(plain._id);

    // Flatten the populated student/document refs so the table can render a
    // name and the source filename without a second round trip.
    const student = plain.student;
    if (student && typeof student === "object") {
        plain.studentId = String(student._id);
        plain.studentNameOnAccount = student.name || "";
        plain.studentEmail = student.email || "";
        plain.barangay = student.barangay?.name || "";
    } else if (student) {
        plain.studentId = String(student);
    }

    const document = plain.document;
    if (document && typeof document === "object") {
        plain.documentId = String(document._id);
        plain.documentType = document.type || "";
        plain.documentName = document.originalName || "";
        plain.documentStatus = document.status || "";
        // Strip the server-side filename; clients address files by id only.
        delete plain.document;
        delete plain.filename;
    } else if (document) {
        plain.documentId = String(document);
    }

    delete plain._id;
    delete plain.__v;
    return plain;
}

// ==========================================================
// POST /api/documents/:id/analyze — run AI extraction on one document
// ==========================================================
//
// Manual by design: City clicks "Analyze" on the Academic Monitoring page and
// only then is a paid provider call made. Re-analyzing the same document
// upserts the same GradeRecord row (unique index on `document`), so a retry
// after a blurry upload replaces the bad result instead of piling up rows.
const analyzeDocument = async(req, res, next) => {
    try {
        if (!isAiConfigured()) {
            return res.status(503).json({
                success: false,
                code: "ai_not_configured",
                message: "AI extraction is not configured on this server. Set the OPENAI_API_KEY environment variable to enable it."
            });
        }

        const document = await Document.findById(req.params.id);
        if (!document) {
            return res.status(404).json({ success: false, message: "Document not found" });
        }

        // Fail before spending money on something the model cannot read.
        if (!ANALYZABLE_TYPES.has(String(document.mimeType || "").toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: "Only PNG, JPEG, and PDF documents can be analyzed."
            });
        }

        const fullPath = resolveStoredFile(document);
        if (!fullPath || !fs.existsSync(fullPath)) {
            return res.status(404).json({
                success: false,
                message: "This file is no longer available on the server, so it cannot be analyzed."
            });
        }

        const base64 = fs.readFileSync(fullPath).toString("base64");

        let extraction;
        try {
            extraction = await analyzeGradeDocument({
                base64,
                mimeType: document.mimeType,
                filename: document.originalName
            });
        } catch (error) {
            // The provider call or the JSON parse failed. Persist an explicit
            // "failed" row so the student shows up as needing manual review
            // instead of silently disappearing from the list.
            if (error instanceof AiVisionError) {
                await GradeRecord.findOneAndUpdate(
                    { document: document._id },
                    {
                        student: document.student,
                        application: document.application,
                        context: document.context,
                        extractionStatus: "failed",
                        extractionNote: error.message,
                        subjects: [],
                        subjectsFailed: [],
                        aiExtracted: true,
                        // A failure is never "verified" — reset the flag so a
                        // previously verified row cannot mask a new failure.
                        verifiedByCity: false,
                        verifiedBy: null,
                        verifiedAt: null,
                        extractedAt: new Date()
                    },
                    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
                );

                return res.status(error.statusCode || 502).json({
                    success: false,
                    code: "extraction_failed",
                    message: error.message
                });
            }
            throw error;
        }

        // The model ran and told us what it could read. An "unreadable" verdict
        // is a real result, not an error: store it as needs_manual_review so
        // the row is visible and explainable to City.
        const extractionStatus = extraction.readable ? "extracted" : "needs_manual_review";

        const saved = await GradeRecord.findOneAndUpdate(
            { document: document._id },
            {
                student: document.student,
                application: document.application,
                context: document.context,
                studentName: extraction.studentName,
                school: extraction.school,
                gradeLevel: extraction.gradeLevel,
                term: extraction.term,
                subjects: extraction.subjects,
                highestGrade: extraction.highestGrade,
                lowestGrade: extraction.lowestGrade,
                averageGrade: extraction.averageGrade,
                computedGwa: extraction.computedGwa,
                passingMark: extraction.passingMark,
                subjectsFailed: extraction.subjectsFailed,
                overallStatus: extraction.overallStatus,
                extractionStatus,
                extractionNote: extraction.extractionNote,
                // Re-analysis invalidates any earlier human sign-off: the data
                // on screen is about to change, so it must be re-reviewed.
                aiExtracted: true,
                verifiedByCity: false,
                verifiedBy: null,
                verifiedAt: null,
                editedByCity: false,
                extractedAt: new Date(),
                provider: "openai",
                model: process.env.OPENAI_VISION_MODEL || "gpt-4o"
            },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        );

        res.json({
            success: true,
            record: publicRecord(saved),
            message: extraction.readable
                ? "Grade data extracted. Please review and verify the values below."
                : "The AI could not read this document. Please enter the grades manually."
        });

        logAudit({
            req,
            actionType: "ai_grade_extraction",
            description: `AI grade extraction ran on "${document.originalName}" — ${extractionStatus}`,
            targetType: "GradeRecord",
            targetId: saved._id
        });
    } catch (error) { next(error); }
};

// ==========================================================
// GET /api/academic-records — the Academic Monitoring list
// ==========================================================
//
// Returns every extracted record joined to its student and source document,
// plus the documents that have NO record yet so City still sees an "Analyze"
// action for students nobody has run the AI on. The un-analyzed list is what
// makes the page useful on day one instead of showing an empty table.
const listRecords = async(req, res, next) => {
    try {
        const filter = {};

        // Optional filters, kept server-side so the client never has to pull
        // everything and filter in the browser.
        const rawStatus = String(req.query.status || "").trim().toLowerCase();
        if (rawStatus === "pending" || rawStatus === "verified") {
            filter.verifiedByCity = rawStatus === "verified";
        }
        if (req.query.application) filter.application = req.query.application;
        const rawContext = String(req.query.context || "").trim().toLowerCase();
        if (rawContext === "renewal" || rawContext === "application") filter.context = rawContext;

        const records = await GradeRecord.find(filter)
            .populate("student", "name email barangay")
            .populate("document", "type originalName status mimeType")
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            success: true,
            count: records.length,
            records: records.map(publicRecord),
            // Lets the page explain itself when the provider key is missing.
            aiConfigured: isAiConfigured()
        });
    } catch (error) { next(error); }
};

// ==========================================================
// GET /api/academic-records/pending — grade documents not yet analyzed
// ==========================================================
//
// Separate from the list above on purpose: this is "documents waiting to be
// analyzed" (not records), so it needs its own query — it joins Document
// against GradeRecord to find the gap.
const listPendingDocuments = async(req, res, next) => {
    try {
        const filter = {};
        if (req.query.application) filter.application = req.query.application;
        const rawContext = String(req.query.context || "").trim().toLowerCase();
        if (rawContext === "renewal" || rawContext === "application") filter.context = rawContext;

        // Only files a vision model can actually read.
        filter.mimeType = { $in: ["image/png", "image/jpeg", "application/pdf"] };

        const documents = await Document.find(filter)
            .populate("student", "name email barangay")
            .sort({ createdAt: -1 })
            .lean();

        const analyzed = await GradeRecord.find({ document: { $in: documents.map((doc) => doc._id) } })
            .select("document verifiedByCity extractionStatus")
            .lean();

        const byDocument = new Map(
            analyzed.map((row) => [String(row.document), row])
        );

        const pending = documents
            .map((doc) => {
                const record = byDocument.get(String(doc._id));
                const student = doc.student && typeof doc.student === "object" ? doc.student : null;
                return {
                    documentId: String(doc._id),
                    applicationId: String(doc.application),
                    context: doc.context,
                    documentType: doc.type,
                    documentName: doc.originalName,
                    documentStatus: doc.status,
                    mimeType: doc.mimeType,
                    createdAt: doc.createdAt,
                    studentId: student ? String(student._id) : String(doc.student),
                    studentName: student?.name || "",
                    studentEmail: student?.email || "",
                    barangay: student?.barangay?.name || "",
                    // True when a record exists but still needs a human look.
                    hasRecord: Boolean(record),
                    verifiedByCity: record ? Boolean(record.verifiedByCity) : false,
                    extractionStatus: record?.extractionStatus || null
                };
            })
            // Grade slots only — City should not be analyzing a School ID.
            .filter((entry) => isGradeDocumentType(entry.documentType));

        res.json({ success: true, count: pending.length, documents: pending, aiConfigured: isAiConfigured() });
    } catch (error) { next(error); }
};

// ==========================================================
// PATCH /api/academic-records/:id — verify or correct AI-extracted data
// ==========================================================
//
// One endpoint serves both reviewer actions, because in practice they happen
// together: City opens a row, fixes whatever the AI misread, then confirms.
//   { verified: true }                  → sign off as-is
//   { verified: true, patch: {...} }    → correct fields, then sign off
//   { verified: false, remarks: "..." } → send back for re-review
// Only a reviewer may set verifiedByCity — there is deliberately no code path
// that sets it to true anywhere else in the server.
const updateRecord = async(req, res, next) => {
    try {
        const record = await GradeRecord.findById(req.params.id);
        if (!record) {
            return res.status(404).json({ success: false, message: "Academic record not found" });
        }

        const body = req.body || {};
        const verified = body.verified === true || body.verified === "true";

        // --- Apply corrections ---
        // Each field is optional; only the ones present are written. Numbers
        // are range-checked here so a bad edit cannot poison the GWA chart.
        const patch = {};

        for (const field of ["studentName", "school", "gradeLevel", "term", "overallStatus"]) {
            if (typeof body[field] === "string") patch[field] = body[field].trim().slice(0, 200);
        }

        if (typeof body.passingMark === "number" || typeof body.passingMark === "string") {
            const mark = Number(body.passingMark);
            if (Number.isFinite(mark) && mark >= 0 && mark <= 100) patch.passingMark = mark;
        }

        for (const field of ["averageGrade", "highestGrade", "lowestGrade"]) {
            if (body[field] === null) { patch[field] = null; continue; }
            const value = Number(body[field]);
            if (Number.isFinite(value) && value >= 0 && value <= 100) patch[field] = value;
        }

        if (body.computedGwa === null) {
            patch.computedGwa = null;
        } else if (body.computedGwa !== undefined) {
            const value = Number(body.computedGwa);
            // The 1.00-5.00 guard again: a reviewer typo of "94" must not
            // become a GWA of 94.
            if (Number.isFinite(value) && value >= 1 && value <= 5) patch.computedGwa = value;
            else {
                return res.status(400).json({
                    success: false,
                    message: "GWA must be between 1.00 and 5.00."
                });
            }
        }

        if (Array.isArray(body.subjects)) {
            const subjects = body.subjects
                .map((subject) => {
                    if (!subject || typeof subject !== "object") return null;
                    const name = String(subject.name || "").trim().slice(0, 120);
                    const grade = Number(subject.grade);
                    if (!name || !Number.isFinite(grade) || grade < 0 || grade > 100) return null;
                    return { name, grade: Math.round(grade * 100) / 100 };
                })
                .filter(Boolean)
                .slice(0, 30);
            patch.subjects = subjects;
        }

        if (Array.isArray(body.subjectsFailed)) {
            patch.subjectsFailed = body.subjectsFailed
                .map((name) => String(name || "").trim().slice(0, 120))
                .filter(Boolean);
        }

        const corrected = Object.keys(patch).length > 0;
        if (corrected) {
            Object.assign(record, patch);
            // City changed something, so this is no longer pure AI output.
            record.editedByCity = true;
            // A manually corrected record should not stay stuck on the
            // "AI could not read this" banner.
            if (record.extractionStatus !== "failed") record.extractionStatus = "extracted";
        }

        if (typeof body.remarks === "string") record.editorRemarks = body.remarks.trim().slice(0, 500);

        record.verifiedByCity = verified;
        record.verifiedBy = verified ? req.user.id : null;
        record.verifiedAt = verified ? new Date() : null;

        await record.save();

        res.json({ success: true, record: publicRecord(record) });

        logAudit({
            req,
            actionType: verified ? "academic_record_verified" : "academic_record_unverified",
            description: verified
                ? `City verified AI-extracted grades${corrected ? " with corrections" : ""} for ${record.studentName || "a student"}`
                : `City sent AI-extracted grades back for re-review for ${record.studentName || "a student"}`,
            targetType: "GradeRecord",
            targetId: record._id
        });
    } catch (error) { next(error); }
};

module.exports = {
    analyzeDocument,
    listRecords,
    listPendingDocuments,
    updateRecord,
    isGradeDocumentType
};