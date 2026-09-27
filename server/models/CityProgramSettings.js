const mongoose = require("mongoose");
const {
    DEFAULT_APPLICATION_DOCUMENTS,
    DEFAULT_RENEWAL_DOCUMENTS,
    DEFAULT_APPLICATION_PERIOD,
    DEFAULT_RENEWAL_PERIOD,
    DEFAULT_ELIGIBILITY,
    DEFAULT_DISBURSEMENT
} = require("../config/cityProgramDefaults");

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

// City-wide program settings. This is a single document (scope: "city") that
// holds settings that apply to the whole scholarship office, as opposed to
// ProgramConfig, which stores one record per program/AY/semester.
const documentItemSchema = new mongoose.Schema({
    key: { type: String, trim: true, required: true },
    label: { type: String, trim: true, default: "" },
    note: { type: String, trim: true, default: "" },
    required: { type: Boolean, default: true },
    enabled: { type: Boolean, default: true }
}, { _id: false });

const periodSchema = new mongoose.Schema({
    enabled: { type: Boolean, default: true },
    openDate: { type: Date, default: null },
    closeDate: { type: Date, default: null },
    academicYear: { type: String, trim: true, default: "" }
}, { _id: false });

const eligibilitySchema = new mongoose.Schema({
    residencyYears: { type: Number, min: 0, default: DEFAULT_ELIGIBILITY.residencyYears },
    incomeThreshold: { type: String, trim: true, default: DEFAULT_ELIGIBILITY.incomeThreshold },
    maximumAge: { type: Number, min: 1, default: DEFAULT_ELIGIBILITY.maximumAge },
    noOtherScholarship: { type: Boolean, default: DEFAULT_ELIGIBILITY.noOtherScholarship },
    accreditedSchool: { type: Boolean, default: DEFAULT_ELIGIBILITY.accreditedSchool }
}, { _id: false });

const disbursementSchema = new mongoose.Schema({
    stipendAmount: { type: Number, min: 0, default: DEFAULT_DISBURSEMENT.stipendAmount },
    frequency: { type: String, trim: true, default: DEFAULT_DISBURSEMENT.frequency },
    paymentMethod: { type: String, trim: true, default: DEFAULT_DISBURSEMENT.paymentMethod },
    maxScholarsPerSemester: { type: Number, min: 1, default: DEFAULT_DISBURSEMENT.maxScholarsPerSemester },
    autoNotify: { type: Boolean, default: DEFAULT_DISBURSEMENT.autoNotify }
}, { _id: false });

const cityProgramSettingsSchema = new mongoose.Schema({
    // Ensures only one settings document ever exists.
    scope: { type: String, default: "city", unique: true },
    applicationDocuments: {
        type: [documentItemSchema],
        default: () => clone(DEFAULT_APPLICATION_DOCUMENTS)
    },
    renewalDocuments: {
        type: [documentItemSchema],
        default: () => clone(DEFAULT_RENEWAL_DOCUMENTS)
    },
    eligibility: { type: eligibilitySchema, default: () => clone(DEFAULT_ELIGIBILITY) },
    disbursement: { type: disbursementSchema, default: () => clone(DEFAULT_DISBURSEMENT) },
    applicationPeriod: { type: periodSchema, default: () => clone(DEFAULT_APPLICATION_PERIOD) },
    renewalPeriod: { type: periodSchema, default: () => clone(DEFAULT_RENEWAL_PERIOD) },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

cityProgramSettingsSchema.statics.read = async function read() {
    const existing = await this.findOne({}).sort({ updatedAt: -1 }).lean({ defaults: true });
    return existing || null;
};

module.exports = mongoose.model("CityProgramSettings", cityProgramSettingsSchema);
