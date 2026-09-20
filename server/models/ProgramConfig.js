const mongoose = require("mongoose");

// Scholarship program configuration. A single document is kept per
// academic year + semester (see superAdminController.getProgramConfig).
const programConfigSchema = new mongoose.Schema({
    programName: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: "" },
    academicYear: { type: String, trim: true, required: true },
    semester: { type: String, trim: true, required: true },
    minGwa: { type: Number, default: 2.0 },
    requiredUnits: { type: Number, default: 15 },
    grantAmount: { type: Number, default: 0 },
    slotsAvailable: { type: Number, default: 0 },
    applicationOpenAt: { type: Date, default: null },
    applicationCloseAt: { type: Date, default: null },
    requiredDocuments: { type: [String], default: [] },
    eligibleSchools: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

programConfigSchema.index({ academicYear: 1, semester: 1, programName: 1 }, { unique: true });

module.exports = mongoose.model("ProgramConfig", programConfigSchema);