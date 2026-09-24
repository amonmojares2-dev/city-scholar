const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema({
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    barangay: { type: mongoose.Schema.Types.ObjectId, ref: "Barangay" },
    // school and program are validated at the controller layer (only enforced
    // when the application is being SUBMITTED, not for in-progress drafts).
    // This lets a student start uploading documents before filling every
    // field — the draft is created empty and populated later.
    program: { type: String, trim: true, default: "" },
    school: { type: String, trim: true, default: "" },
    // Canonical source copied from User.university when the student creates,
    // saves, or submits an application. `school` remains as a compatibility
    // alias for existing views and historical records.
    university: { type: String, trim: true, default: "" },
    applicant: {
        dateOfBirth: String,
        sex: String,
        civilStatus: String,
        mobileNumber: String,
        address: String,
        houseNo: { type: String, trim: true },
        streetName: { type: String, trim: true },
        // DEPRECATED (kept for historical reads only): `nationality`, `city`
        // and `zipCode` were removed from the Application form. The server no
        // longer writes them (see stripRemovedApplicantFields in
        // studentApplicationController), so values already stored on
        // previously submitted applications stay readable but nothing new is
        // collected. Do not re-add form inputs for these without a migration.
        nationality: String,
        city: String,
        zipCode: String,
        studentId: String,
        parentName: String,
        parentRelationship: String,
        parentMobile: String,
        course: String,
        yearLevel: String,
        academicTerm: String,
        gwa: String,
        unitsEnrolled: String,
        // Historical data only. New requests are filtered by
        // studentApplicationController so old applications still load.
        strand: String,
        schoolAddress: String,
        schoolType: String,
        schoolYear: String,
        // Historical lot number, retained so old applications still load.
        // Current submissions store the full address in `address`.
        lotNo: String
    },
    // "additional_requirements" is set by the City Office (PATCH
    // /api/applications/:id/review) when the student has to complete or
    // replace documents before the application can be processed.
    status: {
        type: String,
        enum: ["draft", "submitted", "barangay_approved", "barangay_rejected", "under_review", "additional_requirements", "approved", "rejected", "renewal"],
        default: "draft"
    },
    decision: { type: String, enum: ["barangay_approved", "barangay_rejected", "approved", "rejected", "additional_requirements"], default: null },
    rejectionReason: { type: String, trim: true, maxlength: 500, default: "" },
    barangayDecision: { type: String, enum: ["approved", "rejected"], default: null },
    remarks: { type: String, trim: true, default: "" },
    submittedAt: Date,
    // Decision trail written by the City Office review endpoint. Kept on the
    // application so the reviewer's name and the decision date survive
    // (the Activity tab on the review page reads them back).
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // ==========================================================
    // Stage 1 of the Application -> Barangay -> City approval chain.
    // The applicant's Barangay Admin confirms residency first:
    //   pending  – submitted, no barangay action yet (default)
    //   approved – residency confirmed; the application becomes visible
    //              to the City Office, which makes the final decision
    //   rejected – residency not confirmed; hidden from the City Office
    // The City Office may only approve an application once this is
    // "approved" (enforced in applicationController.reviewApplication).
    // Legacy documents without this field are treated as "pending".
    // ==========================================================
    barangayVerificationStatus: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending"
    },
    barangayVerificationNotes: { type: String, trim: true, default: "" },
    barangayReviewedAt: { type: Date, default: null },
    barangayReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

module.exports = mongoose.model("Application", applicationSchema);