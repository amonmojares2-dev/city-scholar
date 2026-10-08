const { GRADING } = require("../utils/gradingConfig");

// ==========================================
// GradeRecord — the academic record extracted from an uploaded grade document
// ==========================================
//
// One record per (student, application, document). The `document` ref is what
// ties the extracted data back to the exact file City reviewed, and `context`
// mirrors Document.context so the Academic Monitoring page can tell an
// Application submission apart from a Renewal one.
//
// GRADE SCALES
//   Every grade field below lives on ONE of two scales, recorded per record
//   in `gradingScale` (see utils/aiVision.js):
//     "A" — 1.00-5.00 inverse (1.00 best, 3.00 passes, 5.00 failed)
//     "B" — 0-100 percentage (70 passes)
//   grades / averageGrade / highestGrade / lowestGrade are on that record's
//   own scale; highestGrade = the student's BEST mark (lowest number on
//   Scale A, highest number on Scale B). computedGwa is ALWAYS 1.00-5.00, so
//   the GWA chart and pass thresholds never mix scales.
//
// PROVENANCE (this is the whole point of the model)
//   aiExtracted  = true  → the numbers came from the AI, not a human
//   verifiedByCity = false → nobody at the City Office has confirmed them yet
// A record with aiExtracted:true and verifiedByCity:false MUST be shown to City
// as unverified. Only a reviewer action (see gradeRecordController) may flip
// verifiedByCity to true, and manual edits always stamp editedByCity so the UI
// can distinguish "AI got it wrong, City corrected it" from "AI was right".
const subjectSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    grade: { type: Number, required: true, min: 0, max: 100 }
}, { _id: false });

const gradeRecordSchema = new mongoose.Schema({
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application", required: true },
    // The uploaded grade file this data was read from.
    document: { type: mongoose.Schema.Types.ObjectId, ref: "Document", required: true },
    // "application" or "renewal", copied from Document.context.
    context: { type: String, enum: ["application", "renewal"], default: "application" },

    // ---- Extracted academic data ----
    // Which grading scale the source document used: "A" (1.00-5.00 inverse)
    // or "B" (0-100 percentage). Records extracted before this field existed
    // carry no value and are treated as "B" by the UI (legacy behaviour).
    gradingScale: { type: String, enum: ["A", "B"], default: null },
    studentName: { type: String, default: "" },
    school: { type: String, default: "" },
    gradeLevel: { type: String, default: "" },
    term: { type: String, default: "" },
    subjects: { type: [subjectSchema], default: [] },
    highestGrade: { type: Number, default: null },
    lowestGrade: { type: Number, default: null },
    averageGrade: { type: Number, default: null },
    // 1.00-5.00. Validated in this range so a 0-100 value can never land here.
    computedGwa: { type: Number, default: null, min: 1, max: 5 },
    passingMark: { type: Number, default: () => GRADING.percentage.passingMark, min: 0, max: 100 },
    subjectsFailed: { type: [String], default: [] },
    overallStatus: { type: String, default: "" },

    // ---- Extraction outcome ----
    // "extracted"            → usable data was read
    // "needs_manual_review"  → the AI ran but could not read the document
    // "failed"               → the provider call or JSON parse itself failed
    extractionStatus: {
        type: String,
        enum: ["extracted", "needs_manual_review", "failed"],
        default: "needs_manual_review"
    },
    // Why extraction failed or needs review, shown verbatim to City.
    extractionNote: { type: String, default: "" },

    // ---- Provenance / review flags ----
    aiExtracted: { type: Boolean, default: true },
    verifiedByCity: { type: Boolean, default: false },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date, default: null },
    // Set when a City reviewer corrects AI data, so the UI can label the row
    // as "corrected" rather than implying the AI was accurate.
    editedByCity: { type: Boolean, default: false },
    editorRemarks: { type: String, default: "" },

    extractedAt: { type: Date, default: null },
    // Which model produced this, for auditing cost and reproducing a result.
    provider: { type: String, default: "openai" },
    model: { type: String, default: "" }
}, { timestamps: true });

// The Academic Monitoring page loads a student's record by document (the
// Analyze button passes a document id) and the list view sorts newest-first.
gradeRecordSchema.index({ document: 1 }, { unique: true, name: "grade_record_document_unique" });
gradeRecordSchema.index({ student: 1, application: 1 });
gradeRecordSchema.index({ verifiedByCity: 1, extractionStatus: 1 });
gradeRecordSchema.index({ createdAt: -1 });

module.exports = mongoose.model("GradeRecord", gradeRecordSchema);