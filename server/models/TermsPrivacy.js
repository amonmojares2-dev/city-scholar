const mongoose = require("mongoose");

const versionSchema = new mongoose.Schema({
    content: { type: String, required: true, maxlength: 50000 },
    version: { type: Number, default: 0, min: 0 },
    updatedAt: { type: Date, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedByName: { type: String, trim: true, default: "" },
    history: {
        type: [{
            content: { type: String, required: true, maxlength: 50000 },
            version: { type: Number, required: true, min: 0 },
            updatedAt: { type: Date, default: null },
            updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
            updatedByName: { type: String, trim: true, default: "" }
        }],
        default: []
    }
}, { _id: false });

const termsPrivacySchema = new mongoose.Schema({
    scope: { type: String, default: "terms-privacy", unique: true },
    terms: { type: versionSchema, required: true },
    privacy: { type: versionSchema, required: true }
}, { timestamps: true });

module.exports = mongoose.model("TermsPrivacy", termsPrivacySchema);
