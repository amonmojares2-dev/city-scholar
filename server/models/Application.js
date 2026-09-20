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
    applicant: {
        dateOfBirth: String,
        sex: String,
        civilStatus: String,
        nationality: String,
        mobileNumber: String,
        address: String,
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
        schoolAddress: String,
        schoolType: String,
        schoolYear: String
    },
    status: { type: String, enum: ["draft", "submitted", "under_review", "approved", "rejected", "renewal"], default: "draft" },
    remarks: { type: String, trim: true, default: "" },
    submittedAt: Date
}, { timestamps: true });

module.exports = mongoose.model("Application", applicationSchema);