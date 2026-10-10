const fs = require("fs");
const GradeRecord = require("../models/GradeRecord");
const Document = require("../models/Document");
const { resolveStoredFile } = require("../config/storage");
const { analyzeGradeDocument, isAiConfigured, AiVisionError, resolveScale, summarizeSubjects } = require("../utils/aiVision");
const { logAudit } = require("../utils/audit");
// Grade-slot predicate is shared with documentController so the Analyze list
// and the resubmission flows can never disagree on which slots hold grades.
const { isGradeDocumentType } = require("../utils/documentReview");

// ==========================================================
// Shared helpers
// ==========================================================

// Grade documents City can reasonably expect a vision model to read. Anything
// else is rejected before we spend a paid API call on it.
const ANALYZABLE_TYPES = new Set(["image/png", "image/jpeg", "application/pdf"]);

// Grade-slot predicate lives in utils/documentReview.js so every consumer
// shares one definition; it is re-exported below for existing callers.

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
        // City's replacement request state (Failed Students flow) so the page
        // can show "requested / resubmitted" without a second round trip.
        plain.documentRequestedReissue = Boolean(document.requestedReissue);
        plain.documentRequestExplanation = document.requestExplanation || "";
        plain.documentRequestDeadline = document.requestDeadline || null;
        plain.documentAppealStatus = document.appealStatus || null;
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
                gradingScale: extraction.gradingScale,
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
// SCOPE: RENEWAL SUBMISSIONS ONLY. Academic Monitoring is about ongoing
// scholar performance, so it reads grade documents that arrived with a
// Renewal (Document.context === "renewal") — never the original Application
// upload. Students who have never renewed do not appear here at all.
// When a student has renewed more than once, only their MOST RECENT
// renewal's record is returned (see latestRenewalApplicationByStudent).
//
// Returns every extracted record joined to its student and source document,
// plus the documents that have NO record yet so City still sees an "Analyze"
// action for students nobody has run the AI on. The un-analyzed list is what
// makes the page useful on day one instead of showing an empty table.
const listRecords = async(req, res, next) => {
    try {
        // Renewal-only scope is not a query parameter on purpose: the page's
        // contract is "renewal grade documents", so the filter is fixed here.
        const filter = { context: "renewal" };

        // Optional filters, kept server-side so the client never has to pull
        // everything and filter in the browser.
        const rawStatus = String(req.query.status || "").trim().toLowerCase();
        if (rawStatus === "pending" || rawStatus === "verified") {
            filter.verifiedByCity = rawStatus === "verified";
        }
        if (req.query.application) filter.application = req.query.application;

        const records = await GradeRecord.find(filter)
            .populate("student", "name email barangay")
            .populate("document", "type originalName status mimeType createdAt updatedAt requestedReissue requestExplanation requestDeadline appealStatus")
            .sort({ createdAt: -1 })
            .lean();

        // Keep only records whose source document belongs to the student's
        // most recent renewal — older renewals drop out of the default view.
        const latest = await latestRenewalApplicationByStudent();
        const scoped = records.filter((record) => {
            const entry = latest.get(String(record.student?._id ?? record.student));
            return entry && entry.application === String(record.application);
        });

        res.json({
            success: true,
            count: scoped.length,
            records: scoped.map(publicRecord),
            // Lets the page explain itself when the provider key is missing.
            aiConfigured: isAiConfigured()
        });
    } catch (error) { next(error); }
};

// ==========================================================
// Renewal scope helpers (shared by both list endpoints)
// ==========================================================
// Academic Monitoring reads RENEWAL grade documents only. Two questions the
// endpoints must agree on, so both are answered here:
//
//   1. Which documents count? Document.context === "renewal" (uploaded from
//      the Renewal page) AND readable by the vision model AND a grade slot.
//      New Applicants only ever have context "application" documents, so they
//      never show up on this page.
//
//   2. Which renewal, when a student renewed more than once? Re-uploading a
//      renewal slot replaces the same Document row (unique index on
//      application+context+type), so a single Application can only ever hold
//      its newest renewal files. Older Application rows may still carry an
//      older renewal's files — those are grouped by application, and each
//      student keeps only the application holding their most recently
//      updated renewal grade document.
//
// FUTURE/NOT REQUIRED NOW: a history view listing past renewals' grade
// documents per student. The grouping below already separates renewals by
// application, so a history view can reuse latestRenewalApplicationByStudent
// without changing the data model.
async function latestRenewalApplicationByStudent() {
    const documents = await Document.find({
        context: "renewal",
        mimeType: { $in: ["image/png", "image/jpeg", "application/pdf"] }
    })
        .select("student application type createdAt updatedAt")
        .lean();

    const latest = new Map(); // studentId -> { application, stamp }
    for (const document of documents) {
        if (!isGradeDocumentType(document.type)) continue;
        const student = String(document.student);
        const stamp = new Date(document.updatedAt || document.createdAt).getTime() || 0;
        const current = latest.get(student);
        if (!current || stamp > current.stamp) {
            latest.set(student, { application: String(document.application), stamp });
        }
    }
    return latest;
}

// ==========================================================
// GET /api/academic-records/pending — grade documents not yet analyzed
// ==========================================================
//
// Same renewal-only scope as the list above: only Renewal grade documents are
// ever offered for analysis from Academic Monitoring, and only those from
// each student's most recent renewal.
const listPendingDocuments = async(req, res, next) => {
    try {
        const filter = { context: "renewal" };
        if (req.query.application) filter.application = req.query.application;

        // Only files a vision model can actually read.
        filter.mimeType = { $in: ["image/png", "image/jpeg", "application/pdf"] };

        const documents = await Document.find(filter)
            .populate("student", "name email barangay")
            .sort({ createdAt: -1 })
            .lean();

        // Drop documents that belong to an older renewal of the same student.
        const latest = await latestRenewalApplicationByStudent();
        const latestDocuments = documents.filter((doc) => {
            const entry = latest.get(String(doc.student?._id ?? doc.student));
            return entry && entry.application === String(doc.application);
        });

        const analyzed = await GradeRecord.find({ document: { $in: latestDocuments.map((doc) => doc._id) } })
            .select("document verifiedByCity extractionStatus")
            .lean();

        const byDocument = new Map(
            analyzed.map((row) => [String(row.document), row])
        );

        const pending = latestDocuments
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

        // The scale this record's marks live on. A reviewer may correct it (the
        // AI sometimes misreads a 1.25 as 1,250), but validation below always
        // follows the resulting scale so a 1.00-5.00 record can never accept a
        // 0-100 mark and vice versa.
        const scale = resolveScale(body.gradingScale, record.gradingScale);
        const bounds = scale === "A" ? { min: 1, max: 5 } : { min: 0, max: 100 };
        const inScale = (value) => Number.isFinite(value) && value >= bounds.min && value <= bounds.max;

        if (typeof body.passingMark === "number" || typeof body.passingMark === "string") {
            const mark = Number(body.passingMark);
            if (inScale(mark)) patch.passingMark = mark;
        }

        for (const field of ["averageGrade", "highestGrade", "lowestGrade"]) {
            if (body[field] === null) { patch[field] = null; continue; }
            const value = Number(body[field]);
            if (inScale(value)) patch[field] = value;
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
                    // Range-checked against the record's scale: a 0-100 mark can
                    // never be saved onto a 1.00-5.00 record.
                    if (!name || !inScale(grade)) return null;
                    return { name, grade: Math.round(grade * 100) / 100 };
                })
                .filter(Boolean)
                .slice(0, 30);
            patch.subjects = subjects;
        }

        // When the reviewer corrected the marks, the summary columns and the
        // failed list are recomputed from those marks so they cannot contradict
        // the subject table. Direction follows the scale: on inverse Scale A a
        // mark ABOVE the passing mark fails.
        if (patch.subjects) {
            const summary = summarizeSubjects(patch.subjects, scale, patch.passingMark ?? record.passingMark);
            patch.highestGrade = summary.highestGrade;
            patch.lowestGrade = summary.lowestGrade;
            patch.averageGrade = summary.averageGrade;
            patch.subjectsFailed = summary.subjectsFailed;
            if (body.computedGwa === undefined) patch.computedGwa = summary.computedGwa;
            if (summary.subjectsFailed.length > 0) patch.overallStatus = "Failed";
            else if (body.overallStatus === undefined) patch.overallStatus = "Passed";
        }

        if (scale !== (record.gradingScale || null)) patch.gradingScale = scale;

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