const mongoose = require("mongoose");
const PublicPageContent = require("../models/PublicPageContent");
const {
    DEFAULT_ELIGIBILITY_CONTENT,
    DEFAULT_HOW_TO_APPLY_CONTENT,
    DEFAULT_GUIDELINES_CONTENT
} = require("../config/publicPageDefaults");
const { DEFAULT_HOME_CONTENT } = require("../config/homePageDefaults");

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

const PAGE_DEFAULTS = {
    home: DEFAULT_HOME_CONTENT,
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

// The landing page is the only nested page, so it gets its own normaliser: a
// blank text field falls back to the shipped copy (an edited page can never
// end up with an empty headline), while a list that was cleared on purpose
// stays empty so the section hides itself on the public page.
const HOME_STAT_ICONS = ["award", "users", "book", "check-circle", "grid", "bar-chart-2", "megaphone", "calendar", "map-pin"];
const HOME_SECTIONS = ["hero", "about", "programCard", "process", "testimonials", "announcements", "cta"];

function toFlag(value, fallback = false) {
    if (value === undefined || value === null || value === "") return fallback;
    return value === true || value === "true" || value === 1 || value === "1";
}

function copyText(source, fields, fallback) {
    const values = {};
    for (const field of fields) values[field] = text(source?.[field], fallback[field], MAX_TEXT) || fallback[field];
    return values;
}

// Returns null when the caller never sent the list, so the shipped copy is
// kept; a list that was sent - even an empty one - is respected.
function sentList(value) {
    return Array.isArray(value) ? value : null;
}

function sectionOf(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeIcon(value) {
    const icon = text(value, "", 40);
    return HOME_STAT_ICONS.includes(icon) ? icon : HOME_STAT_ICONS[0];
}

function normalizeHomeStats(value, fallback) {
    const list = sentList(value);
    if (!list) return clone(fallback);
    return list
        .map((stat, index) => ({
            key: text(stat?.key, `stat-${index + 1}`, 60) || `stat-${index + 1}`,
            value: text(stat?.value, "", 40),
            label: text(stat?.label, "", 120),
            icon: normalizeIcon(stat?.icon)
        }))
        .filter((stat) => stat.value || stat.label);
}

function normalizeHomeBullets(value, fallback) {
    const list = sentList(value);
    if (!list) return clone(fallback);
    return list.map((item) => text(item, "", MAX_TEXT)).filter(Boolean);
}

function normalizeHomeHighlights(value, fallback) {
    const list = sentList(value);
    if (!list) return clone(fallback);
    return list
        .map((item) => ({ value: text(item?.value, "", 40), label: text(item?.label, "", 120) }))
        .filter((item) => item.value || item.label);
}

function normalizeHomeRows(value, fallback) {
    const list = sentList(value);
    if (!list) return clone(fallback);
    return list
        .map((row) => ({ label: text(row?.label, "", 120), value: text(row?.value, "", 200) }))
        .filter((row) => row.label || row.value);
}

function normalizeHomeSteps(value, fallback) {
    const list = sentList(value);
    if (!list) return clone(fallback);
    return list
        .map((step, index) => ({
            num: text(step?.num, String(index + 1).padStart(2, "0"), 8),
            title: text(step?.title, "", 160),
            description: text(step?.description, "", MAX_TEXT)
        }))
        .filter((step) => step.title || step.description)
        .map((step, index) => ({ ...step, num: step.num || String(index + 1).padStart(2, "0") }));
}

function normalizeHomeRating(value) {
    const rating = Number(value);
    if (!Number.isFinite(rating)) return 5;
    return Math.min(5, Math.max(0, Math.round(rating)));
}

function normalizeHomeTestimonials(value, fallback) {
    const list = sentList(value);
    if (!list) return clone(fallback);
    return list
        .map((item) => ({
            name: text(item?.name, "", 120),
            batch: text(item?.batch, "", 80),
            school: text(item?.school, "", 160),
            text: text(item?.text, "", MAX_TEXT),
            rating: normalizeHomeRating(item?.rating)
        }))
        .filter((item) => item.name || item.text);
}

function normalizeHomeAnnouncements(value, fallback) {
    const list = sentList(value);
    if (!list) return clone(fallback);
    return list
        .map((item) => ({
            tag: text(item?.tag, "", 60),
            date: text(item?.date, "", 60),
            title: text(item?.title, "", 200),
            excerpt: text(item?.excerpt, "", MAX_TEXT)
        }))
        .filter((item) => item.title || item.excerpt);
}

function normalizeHome(source) {
    const defaults = PAGE_DEFAULTS.home;
    const base = sectionOf(source);
    const hero = sectionOf(base.hero);
    const about = sectionOf(base.about);
    const card = sectionOf(base.programCard);
    const process = sectionOf(base.process);
    const testimonials = sectionOf(base.testimonials);
    const announcements = sectionOf(base.announcements);
    return {
        hero: {
            ...copyText(hero, ["badge", "titleLine1", "titleLine2", "subtitle", "primaryCtaLabel", "primaryCtaHref", "secondaryCtaLabel", "secondaryCtaHref", "imageUrl"], defaults.hero),
            followWindow: toFlag(hero.followWindow, defaults.hero.followWindow)
        },
        stats: normalizeHomeStats(base.stats, defaults.stats),
        about: {
            ...copyText(about, ["eyebrow", "title", "body"], defaults.about),
            bullets: normalizeHomeBullets(about.bullets, defaults.about.bullets),
            highlights: normalizeHomeHighlights(about.highlights, defaults.about.highlights)
        },
        programCard: {
            ...copyText(card, ["title", "subtitle", "statusLabel", "ctaLabel", "ctaHref"], defaults.programCard),
            followWindow: toFlag(card.followWindow, defaults.programCard.followWindow),
            rows: normalizeHomeRows(card.rows, defaults.programCard.rows)
        },
        process: {
            ...copyText(process, ["eyebrow", "title", "ctaLabel", "ctaHref"], defaults.process),
            steps: normalizeHomeSteps(process.steps, defaults.process.steps)
        },
        testimonials: {
            ...copyText(testimonials, ["eyebrow", "title"], defaults.testimonials),
            items: normalizeHomeTestimonials(testimonials.items, defaults.testimonials.items)
        },
        announcements: {
            ...copyText(announcements, ["eyebrow", "title"], defaults.announcements),
            items: normalizeHomeAnnouncements(announcements.items, defaults.announcements.items)
        },
        cta: copyText(base.cta, ["title", "body", "primaryLabel", "primaryHref", "secondaryLabel", "secondaryHref"], defaults.cta)
    };
}

// The landing page is nested, so a partial payload is merged section by section
// and a section that was not sent keeps the copy already stored.
function mergePage(key, current, incoming) {
    const stored = sectionOf(current);
    if (key !== "home") return { ...stored, ...incoming };
    const merged = { ...stored, ...incoming };
    for (const section of HOME_SECTIONS) {
        const sent = incoming[section];
        if (sent && typeof sent === "object" && !Array.isArray(sent)) {
            merged[section] = { ...sectionOf(stored[section]), ...sent };
        }
    }
    return merged;
}

function normalizePage(key, stored) {
    const defaults = PAGE_DEFAULTS[key];
    const source = stored && typeof stored === "object" ? stored : {};
    // The landing page is assembled from its own nested sections.
    if (key === "home") return normalizeHome(source);
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
        const merged = mergePage(key, current[key], payload[key]);
        const page = normalizePage(key, merged);
        // Only the flat pages have a single headline to guard; the landing page
        // restores every blank field from the shipped copy on its own.
        if (page.title !== undefined && !text(page.title, "", 200)) errors[key] = "The page title cannot be empty.";
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
    normalizePage,
    normalizeHome,
    mergePage
};

