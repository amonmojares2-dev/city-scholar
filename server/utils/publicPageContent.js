const mongoose = require("mongoose");
const PublicPageContent = require("../models/PublicPageContent");
const {
    DEFAULT_ELIGIBILITY_CONTENT,
    DEFAULT_HOW_TO_APPLY_CONTENT,
    DEFAULT_GUIDELINES_CONTENT
} = require("../config/publicPageDefaults");

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

const PAGE_DEFAULTS = {
    eligibility: DEFAULT_ELIGIBILITY_CONTENT,
    howToApply: DEFAULT_HOW_TO_APPLY_CONTENT,
    guidelines: DEFAULT_GUIDELINES_CONTENT
};

const PAGE_KEYS = Object.keys(PAGE_DEFAULTS);
const MAX_TEXT = 4000;

function text(value, fallback = "", maxLength = 1000) {
    if (value === undefined || value === null) return fallback;
    return String(value).trim().slice(0, maxLength);
}

function stringList(value, fallback = []) {
    if (!Array.isArray(value)) return fallback;
    const items = value.map((item) => text(item, "", MAX_TEXT)).filter(Boolean);
    return items.length ? items : fallback;
}

// Keeps the stored page aligned with the shape the public pages render, so a
// partially filled payload can never blank out a heading or a list.
function normalizeCategories(value, fallback) {
    if (!Array.isArray(value)) return fallback;
    const categories = value
        .map((category, index) => ({
            id: text(category?.id, `category-${index + 1}`, 60) || `category-${index + 1}`,
            title: text(category?.title, "", 160),
            items: Array.isArray(category?.items)
                ? category.items.map((item) => text(item, "", MAX_TEXT)).filter(Boolean)
                : []
        }))
        .filter((category) => category.title || category.items.length);
    return categories.length ? categories : fallback;
}

function normalizeSteps(value, fallback) {
    if (!Array.isArray(value)) return fallback;
    const steps = value
        .map((step, index) => ({
            num: text(step?.num, String(index + 1).padStart(2, "0"), 8),
            title: text(step?.title, "", 160),
            description: text(step?.description, "", MAX_TEXT),
            tips: Array.isArray(step?.tips)
                ? step.tips.map((tip) => text(tip, "", MAX_TEXT)).filter(Boolean)
                : [],
            link: text(step?.link, "", 300),
            linkLabel: text(step?.linkLabel, "", 120)
        }))
        .filter((step) => step.title || step.description);
    return steps.map((step, index) => ({
        ...step,
        num: step.num || String(index + 1).padStart(2, "0")
    }));
}

function normalizeSections(value, fallback) {
    if (!Array.isArray(value)) return fallback;
    const sections = value
        .map((section, index) => ({
            id: text(section?.id, `section-${index + 1}`, 60) || `section-${index + 1}`,
            title: text(section?.title, "", 160),
            content: Array.isArray(section?.content)
                ? section.content
                    .map((entry) => ({
                        heading: text(entry?.heading, "", 200),
                        text: text(entry?.text, "", MAX_TEXT)
                    }))
                    .filter((entry) => entry.heading || entry.text)
                : []
        }))
        .filter((section) => section.title || section.content.length);
    return sections.length ? sections : fallback;
}

function normalizePage(key, stored) {
    const defaults = PAGE_DEFAULTS[key];
    const source = stored && typeof stored === "object" ? stored : {};
    const page = {};
    for (const field of Object.keys(defaults)) {
        const fallback = defaults[field];
        if (Array.isArray(fallback)) {
            if (field === "categories") page[field] = normalizeCategories(source[field], clone(fallback));
            else if (field === "steps") page[field] = normalizeSteps(source[field], clone(fallback));
            else if (field === "sections") page[field] = normalizeSections(source[field], clone(fallback));
            else page[field] = stringList(source[field], clone(fallback));
        } else {
            // An empty field falls back to the shipped copy so a public page
            // never renders a blank headline.
            page[field] = text(source[field], fallback, MAX_TEXT) || fallback;
        }
    }
    return page;
}

// Public pages are requested by every visitor, so the last good read is reused
// briefly; each save clears it immediately.
const CACHE_TTL_MS = 15000;
let cache = null;
let cachedAt = 0;

function normalizeAll(stored) {
    const source = stored || {};
    const pages = {};
    for (const key of PAGE_KEYS) pages[key] = normalizePage(key, source[key]);
    pages.updatedAt = source.updatedAt ? new Date(source.updatedAt).toISOString() : null;
    return pages;
}

function readFromDatabase() {
    // With no live connection Mongoose buffers the query for ten seconds
    // before failing, so skip straight to the shipped defaults.
    if (mongoose.connection.readyState !== 1) return Promise.resolve(normalizeAll(null));
    return PublicPageContent.findOne({})
        .lean({ defaults: true })
        .then((stored) => normalizeAll(stored))
        .catch((error) => {
            console.error("Public page content read failed:", error.message);
            return normalizeAll(null);
        });
}

async function getPublicPages({ fresh = false } = {}) {
    const now = Date.now();
    if (!fresh && cache && now - cachedAt < CACHE_TTL_MS) return cache;
    cache = await readFromDatabase();
    cachedAt = now;
    return cache;
}

function invalidatePublicPagesCache() {
    cache = null;
    cachedAt = 0;
}

// Returns { pages, errors } for the pages supplied in `payload`. Pages that
// were not sent are left untouched, so each editor form saves its own page.
async function updatePublicPages(payload = {}, updatedBy = null) {
    const errors = {};
    const updates = {};
    for (const key of PAGE_KEYS) {
        if (payload[key] === undefined) continue;
        if (typeof payload[key] !== "object" || payload[key] === null) {
            errors[key] = "Page content must be an object.";
            continue;
        }
        const current = await getPublicPages();
        const merged = { ...current[key], ...payload[key] };
        const page = normalizePage(key, merged);
        if (!text(page.title, "", 200)) errors[key] = "The page title cannot be empty.";
        updates[key] = page;
    }
    if (Object.keys(errors).length) return { pages: await getPublicPages({ fresh: true }), errors };

    const document = await PublicPageContent.findOneAndUpdate(
        {},
        { $set: { scope: "public-pages", ...updates, updatedBy: updatedBy || null } },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean({ defaults: true });

    invalidatePublicPagesCache();
    return { pages: normalizeAll(document), errors: {} };
}

// Clears the stored pages so the shipped config defaults render again.
async function restorePublicPageDefaults() {
    await PublicPageContent.updateMany({}, { $unset: Object.fromEntries(PAGE_KEYS.map((key) => [key, ""])) });
    invalidatePublicPagesCache();
    return getPublicPages({ fresh: true });
}

module.exports = {
    PAGE_KEYS,
    PAGE_DEFAULTS,
    getPublicPages,
    updatePublicPages,
    restorePublicPageDefaults,
    invalidatePublicPagesCache,
    normalizePage
};

