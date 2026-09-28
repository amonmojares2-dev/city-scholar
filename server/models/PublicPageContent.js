const mongoose = require("mongoose");
const {
    DEFAULT_ELIGIBILITY_CONTENT,
    DEFAULT_HOW_TO_APPLY_CONTENT,
    DEFAULT_GUIDELINES_CONTENT
} = require("../config/publicPageDefaults");
const { DEFAULT_HOME_CONTENT } = require("../config/homePageDefaults");

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

// Landing page ("/") pieces. The page is nested (hero, stat strip, about,
// program card, process, testimonials, announcements, closing banner), so each
// piece gets its own sub-schema with the shipped copy as its default.
const homeStatSchema = new mongoose.Schema({
    key: { type: String, trim: true, default: "" },
    value: { type: String, trim: true, default: "" },
    label: { type: String, trim: true, default: "" },
    icon: { type: String, trim: true, default: "award" }
}, { _id: false });

const homeBulletSchema = new mongoose.Schema({
    value: { type: String, trim: true, default: "" },
    label: { type: String, trim: true, default: "" }
}, { _id: false });

const homeRowSchema = new mongoose.Schema({
    label: { type: String, trim: true, default: "" },
    value: { type: String, trim: true, default: "" }
}, { _id: false });

const homeTestimonialSchema = new mongoose.Schema({
    name: { type: String, trim: true, default: "" },
    batch: { type: String, trim: true, default: "" },
    school: { type: String, trim: true, default: "" },
    text: { type: String, trim: true, default: "" },
    rating: { type: Number, default: 5, min: 0, max: 5 }
}, { _id: false });

const homeAnnouncementSchema = new mongoose.Schema({
    tag: { type: String, trim: true, default: "" },
    date: { type: String, trim: true, default: "" },
    title: { type: String, trim: true, default: "" },
    excerpt: { type: String, trim: true, default: "" }
}, { _id: false });

const homeContentSchema = new mongoose.Schema({
    hero: {
        badge: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.hero.badge },
        followWindow: { type: Boolean, default: DEFAULT_HOME_CONTENT.hero.followWindow },
        titleLine1: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.hero.titleLine1 },
        titleLine2: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.hero.titleLine2 },
        subtitle: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.hero.subtitle },
        primaryCtaLabel: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.hero.primaryCtaLabel },
        primaryCtaHref: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.hero.primaryCtaHref },
        secondaryCtaLabel: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.hero.secondaryCtaLabel },
        secondaryCtaHref: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.hero.secondaryCtaHref },
        imageUrl: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.hero.imageUrl }
    },
    stats: { type: [homeStatSchema], default: () => clone(DEFAULT_HOME_CONTENT.stats) },
    about: {
        eyebrow: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.about.eyebrow },
        title: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.about.title },
        body: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.about.body },
        bullets: { type: [String], default: () => clone(DEFAULT_HOME_CONTENT.about.bullets) },
        highlights: { type: [homeBulletSchema], default: () => clone(DEFAULT_HOME_CONTENT.about.highlights) }
    },
    programCard: {
        title: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.programCard.title },
        followWindow: { type: Boolean, default: DEFAULT_HOME_CONTENT.programCard.followWindow },
        subtitle: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.programCard.subtitle },
        statusLabel: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.programCard.statusLabel },
        rows: { type: [homeRowSchema], default: () => clone(DEFAULT_HOME_CONTENT.programCard.rows) },
        ctaLabel: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.programCard.ctaLabel },
        ctaHref: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.programCard.ctaHref }
    },
    process: {
        eyebrow: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.process.eyebrow },
        title: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.process.title },
        steps: { type: [stepSchema], default: () => clone(DEFAULT_HOME_CONTENT.process.steps) },
        ctaLabel: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.process.ctaLabel },
        ctaHref: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.process.ctaHref }
    },
    testimonials: {
        eyebrow: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.testimonials.eyebrow },
        title: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.testimonials.title },
        items: { type: [homeTestimonialSchema], default: () => clone(DEFAULT_HOME_CONTENT.testimonials.items) }
    },
    announcements: {
        eyebrow: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.announcements.eyebrow },
        title: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.announcements.title },
        items: { type: [homeAnnouncementSchema], default: () => clone(DEFAULT_HOME_CONTENT.announcements.items) }
    },
    cta: {
        title: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.cta.title },
        body: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.cta.body },
        primaryLabel: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.cta.primaryLabel },
        primaryHref: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.cta.primaryHref },
        secondaryLabel: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.cta.secondaryLabel },
        secondaryHref: { type: String, trim: true, default: DEFAULT_HOME_CONTENT.cta.secondaryHref }
    }
}, { _id: false });

// Editable content for the public landing pages. Single document; missing
// pages fall back to the config defaults (see utils/publicPageContent.js).
const publicPageContentSchema = new mongoose.Schema({
    scope: { type: String, default: "public-pages", unique: true },
    home: { type: homeContentSchema, default: () => clone(DEFAULT_HOME_CONTENT) },
    eligibility: { type: eligibilityPageSchema, default: () => clone(DEFAULT_ELIGIBILITY_CONTENT) },
    howToApply: { type: howToApplyPageSchema, default: () => clone(DEFAULT_HOW_TO_APPLY_CONTENT) },
    guidelines: { type: guidelinesPageSchema, default: () => clone(DEFAULT_GUIDELINES_CONTENT) },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

module.exports = mongoose.model("PublicPageContent", publicPageContentSchema);
