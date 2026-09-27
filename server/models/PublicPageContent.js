const mongoose = require("mongoose");
const {
    DEFAULT_ELIGIBILITY_CONTENT,
    DEFAULT_HOW_TO_APPLY_CONTENT,
    DEFAULT_GUIDELINES_CONTENT
} = require("../config/publicPageDefaults");

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

const guidelineEntrySchema = new mongoose.Schema({
    heading: { type: String, trim: true, default: "" },
    text: { type: String, trim: true, default: "" }
}, { _id: false });

const guidelineSectionSchema = new mongoose.Schema({
    id: { type: String, trim: true, default: "" },
    title: { type: String, trim: true, default: "" },
    content: { type: [guidelineEntrySchema], default: [] }
}, { _id: false });

const eligibilityCategorySchema = new mongoose.Schema({
    id: { type: String, trim: true, default: "" },
    title: { type: String, trim: true, default: "" },
    items: { type: [String], default: [] }
}, { _id: false });

const stepSchema = new mongoose.Schema({
    num: { type: String, trim: true, default: "" },
    title: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    tips: { type: [String], default: [] },
    link: { type: String, trim: true, default: "" },
    linkLabel: { type: String, trim: true, default: "" }
}, { _id: false });

const eligibilityPageSchema = new mongoose.Schema({
    eyebrow: { type: String, trim: true, default: DEFAULT_ELIGIBILITY_CONTENT.eyebrow },
    title: { type: String, trim: true, default: DEFAULT_ELIGIBILITY_CONTENT.title },
    subtitle: { type: String, trim: true, default: DEFAULT_ELIGIBILITY_CONTENT.subtitle },
    noticeTitle: { type: String, trim: true, default: DEFAULT_ELIGIBILITY_CONTENT.noticeTitle },
    noticeText: { type: String, trim: true, default: DEFAULT_ELIGIBILITY_CONTENT.noticeText },
    ctaTitle: { type: String, trim: true, default: DEFAULT_ELIGIBILITY_CONTENT.ctaTitle },
    ctaText: { type: String, trim: true, default: DEFAULT_ELIGIBILITY_CONTENT.ctaText },
    ctaLabel: { type: String, trim: true, default: DEFAULT_ELIGIBILITY_CONTENT.ctaLabel },
    categories: { type: [eligibilityCategorySchema], default: () => clone(DEFAULT_ELIGIBILITY_CONTENT.categories) }
}, { _id: false });

const howToApplyPageSchema = new mongoose.Schema({
    eyebrow: { type: String, trim: true, default: DEFAULT_HOW_TO_APPLY_CONTENT.eyebrow },
    title: { type: String, trim: true, default: DEFAULT_HOW_TO_APPLY_CONTENT.title },
    subtitle: { type: String, trim: true, default: DEFAULT_HOW_TO_APPLY_CONTENT.subtitle },
    helpTitle: { type: String, trim: true, default: DEFAULT_HOW_TO_APPLY_CONTENT.helpTitle },
    helpText: { type: String, trim: true, default: DEFAULT_HOW_TO_APPLY_CONTENT.helpText },
    helpLinkLabel: { type: String, trim: true, default: DEFAULT_HOW_TO_APPLY_CONTENT.helpLinkLabel },
    readyTitle: { type: String, trim: true, default: DEFAULT_HOW_TO_APPLY_CONTENT.readyTitle },
    readyText: { type: String, trim: true, default: DEFAULT_HOW_TO_APPLY_CONTENT.readyText },
    steps: { type: [stepSchema], default: () => clone(DEFAULT_HOW_TO_APPLY_CONTENT.steps) }
}, { _id: false });

const guidelinesPageSchema = new mongoose.Schema({
    eyebrow: { type: String, trim: true, default: DEFAULT_GUIDELINES_CONTENT.eyebrow },
    title: { type: String, trim: true, default: DEFAULT_GUIDELINES_CONTENT.title },
    subtitle: { type: String, trim: true, default: DEFAULT_GUIDELINES_CONTENT.subtitle },
    sections: { type: [guidelineSectionSchema], default: () => clone(DEFAULT_GUIDELINES_CONTENT.sections) }
}, { _id: false });

// Editable content for the public landing pages. Single document; missing
// pages fall back to the config defaults (see utils/publicPageContent.js).
const publicPageContentSchema = new mongoose.Schema({
    scope: { type: String, default: "public-pages", unique: true },
    eligibility: { type: eligibilityPageSchema, default: () => clone(DEFAULT_ELIGIBILITY_CONTENT) },
    howToApply: { type: howToApplyPageSchema, default: () => clone(DEFAULT_HOW_TO_APPLY_CONTENT) },
    guidelines: { type: guidelinesPageSchema, default: () => clone(DEFAULT_GUIDELINES_CONTENT) },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

module.exports = mongoose.model("PublicPageContent", publicPageContentSchema);
