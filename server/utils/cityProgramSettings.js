const mongoose = require("mongoose");
const CityProgramSettings = require("../models/CityProgramSettings");
const {
    DEFAULT_APPLICATION_DOCUMENTS,
    DEFAULT_RENEWAL_DOCUMENTS,
    DEFAULT_ELIGIBILITY,
    DEFAULT_DISBURSEMENT,
    DEFAULT_APPLICATION_PERIOD,
    DEFAULT_RENEWAL_PERIOD
} = require("../config/cityProgramDefaults");

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function asDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

// The settings are read on almost every student request (document slots and
// application windows), so the last good read is reused for a short window.
// Every write invalidates it immediately.
const CACHE_TTL_MS = 15000;
let cache = null;
let cachedAt = 0;

function normalizeDocumentList(stored, defaults) {
    const base = Array.isArray(stored) && stored.length ? stored : defaults;
    const items = base
        .map((item) => ({
            key: String(item?.key || "").trim(),
            label: String(item?.label || "").trim(),
            note: String(item?.note || "").trim(),
            required: item?.required !== false,
            enabled: item?.enabled !== false
        }))
        .filter((item) => item.key)
        // One row per slot key, so a bad write can never duplicate a slot.
        .filter((item, index, list) => list.findIndex((other) => other.key === item.key) === index)
        .map((item) => ({ ...item, label: item.label || item.key }));
    return items.length ? items : clone(defaults);
}

function normalizePeriod(stored, defaults) {
    const source = stored && typeof stored === "object" ? stored : {};
    const open = asDate(source.openDate);
    const close = asDate(source.closeDate);
    return {
        enabled: source.enabled !== false,
        openDate: open ? open.toISOString() : null,
        closeDate: close ? close.toISOString() : null,
        academicYear: String(source.academicYear || defaults.academicYear || "").trim()
    };
}

// Always returns a complete settings object: any section missing from the
// stored document (or from a fresh database) falls back to config defaults.
function normalizeSettings(stored) {
    const source = stored || {};
    return {
        applicationDocuments: normalizeDocumentList(source.applicationDocuments, DEFAULT_APPLICATION_DOCUMENTS),
        renewalDocuments: normalizeDocumentList(source.renewalDocuments, DEFAULT_RENEWAL_DOCUMENTS),
        eligibility: { ...clone(DEFAULT_ELIGIBILITY), ...(source.eligibility || {}) },
        disbursement: { ...clone(DEFAULT_DISBURSEMENT), ...(source.disbursement || {}) },
        applicationPeriod: normalizePeriod(source.applicationPeriod, DEFAULT_APPLICATION_PERIOD),
        renewalPeriod: normalizePeriod(source.renewalPeriod, DEFAULT_RENEWAL_PERIOD),
        updatedAt: source.updatedAt ? new Date(source.updatedAt).toISOString() : null
    };
}

function readFromDatabase() {
    // With no live connection Mongoose buffers the query for ten seconds
    // before failing, so skip straight to the shipped defaults.
    if (mongoose.connection.readyState !== 1) return Promise.resolve(normalizeSettings(null));
    return CityProgramSettings.read()
        .then((stored) => normalizeSettings(stored))
        .catch((error) => {
            // A missing collection or a downed database must not block student
            // flows: fall back to the shipped defaults for this read only.
            console.error("City program settings read failed:", error.message);
            return normalizeSettings(null);
        });
}

async function getProgramSettings({ fresh = false } = {}) {
    const now = Date.now();
    if (!fresh && cache && now - cachedAt < CACHE_TTL_MS) return cache;
    cache = await readFromDatabase();
    cachedAt = now;
    return cache;
}

function invalidateProgramSettingsCache() {
    cache = null;
    cachedAt = 0;
}

// ---- Document slots -------------------------------------------------------

function enabledDocuments(list) {
    return list.filter((item) => item.enabled);
}

async function applicationDocumentTypes() {
    const settings = await getProgramSettings();
    const enabled = enabledDocuments(settings.applicationDocuments);
    return {
        accepted: enabled.map((item) => item.key),
        required: enabled.filter((item) => item.required).map((item) => item.key)
    };
}

async function renewalDocumentTypes() {
    const settings = await getProgramSettings();
    const enabled = enabledDocuments(settings.renewalDocuments);
    return {
        accepted: enabled.map((item) => item.key),
        required: enabled.filter((item) => item.required).map((item) => item.key)
    };
}

// A stored document still satisfies a slot when the City Office renamed the
// label but kept the key, and the legacy names older uploads used are still
// honoured so existing applications never look incomplete.
function matchesRequiredDocument(documentType, requiredKey) {
    const document = String(documentType || "").trim();
    const required = String(requiredKey || "").trim();
    if (!document || !required) return false;
    if (document === required) return true;
    const legacyEquivalents = {
        "Report Card": ["Report Card (Grade 12)", "Copy of Grades"],
        "School ID (Current)": ["Student's Current School ID", "School ID"],
        "Parent Valid ID": ["Parent's Valid ID"]
    };
    return (legacyEquivalents[required] || []).includes(document);
}

async function missingRequiredApplicationDocuments(applicationId, Document) {
    const uploaded = await Document.find({ application: applicationId, context: "application" })
        .select("type")
        .lean();
    const { required } = await applicationDocumentTypes();
    return required.filter((key) =>
        !uploaded.some((document) => matchesRequiredDocument(document.type, key))
    );
}

// ---- Application / renewal windows ---------------------------------------

// Returns { open, reason, openDate, closeDate, academicYear }.
// `open` is false only when the City Office closed the window. A period with
// no dates configured is always open, so a fresh install never locks students
// out of applying.
function evaluatePeriod(period, now = new Date()) {
    const base = {
        openDate: period.openDate,
        closeDate: period.closeDate,
        academicYear: period.academicYear
    };
    if (!period.enabled) return { ...base, open: false, reason: "disabled" };

    const currentTime = now.getTime();
    const open = asDate(period.openDate);
    const close = asDate(period.closeDate);

    // Inclusive of the whole closing day, so "closes Jan 31" means Jan 31 EOD.
    const closeEnd = close ? close.getTime() + 24 * 60 * 60 * 1000 - 1 : null;

    if (open && currentTime < open.getTime()) return { ...base, open: false, reason: "not-open-yet" };
    if (closeEnd !== null && currentTime > closeEnd) return { ...base, open: false, reason: "closed" };
    return { ...base, open: true, reason: open || close ? "within-window" : "always" };
}

async function applicationWindow(now = new Date()) {
    const settings = await getProgramSettings();
    return evaluatePeriod(settings.applicationPeriod, now);
}

async function renewalWindow(now = new Date()) {
    const settings = await getProgramSettings();
    return evaluatePeriod(settings.renewalPeriod, now);
}

// What students and the public pages are allowed to see: document slots and
// windows only. Eligibility thresholds and disbursement figures stay internal.
function publicProgramView(settings) {
    const shape = (items) => enabledDocuments(items).map((item) => ({
        key: item.key,
        label: item.label,
        note: item.note,
        required: item.required
    }));
    return {
        applicationDocuments: shape(settings.applicationDocuments),
        renewalDocuments: shape(settings.renewalDocuments),
        applicationPeriod: settings.applicationPeriod,
        renewalPeriod: settings.renewalPeriod,
        applicationWindow: evaluatePeriod(settings.applicationPeriod),
        renewalWindow: evaluatePeriod(settings.renewalPeriod)
    };
}

// ---- Writes ---------------------------------------------------------------

function toBoolean(value, fallback) {
    if (value === undefined) return fallback;
    return value === true || value === "true" || value === 1 || value === "1";
}

function toNumber(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    if (value === undefined || value === null || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

function cleanString(value, fallback = "", maxLength = 500) {
    if (value === undefined) return fallback;
    return String(value).trim().slice(0, maxLength);
}

function pickEnum(value, allowed, fallback) {
    const cleaned = cleanString(value, "", 40);
    return allowed.includes(cleaned) ? cleaned : fallback;
}

function normalizeDocumentPayload(stored, current, errors, field) {
    if (!Array.isArray(stored)) return current;
    const items = [];
    for (const item of stored) {
        const key = cleanString(item?.key, "", 120);
        if (!key) continue;
        if (items.some((existing) => existing.key === key)) {
            errors[field] = "Each document slot must appear only once.";
            continue;
        }
        items.push({
            key,
            label: cleanString(item?.label, "", 120) || key,
            note: cleanString(item?.note, "", 300),
            required: toBoolean(item?.required, true),
            enabled: toBoolean(item?.enabled, true)
        });
    }
    if (!items.length) {
        errors[field] = "Keep at least one document slot in the list.";
        return current;
    }
    return items;
}

function normalizePeriodPayload(stored, current, errors, field) {
    const source = stored && typeof stored === "object" ? stored : {};
    // null and "" both mean "no date on this side", which clears the stored one.
    const suppliedOpen = source.openDate !== undefined && source.openDate !== null && source.openDate !== "";
    const suppliedClose = source.closeDate !== undefined && source.closeDate !== null && source.closeDate !== "";
    const openDate = suppliedOpen ? asDate(source.openDate) : null;
    const closeDate = suppliedClose ? asDate(source.closeDate) : null;

    if (suppliedOpen && !openDate) errors[field] = "The opening date is not a valid date.";
    if (suppliedClose && !closeDate) errors[field] = "The closing date is not a valid date.";
    if (openDate && closeDate && closeDate.getTime() < openDate.getTime()) {
        errors[field] = "The closing date must be on or after the opening date.";
    }

    return {
        enabled: toBoolean(source.enabled, current.enabled),
        openDate: openDate ? openDate.toISOString() : null,
        closeDate: closeDate ? closeDate.toISOString() : null,
        academicYear: cleanString(source.academicYear, current.academicYear, 40)
    };
}

const INCOME_THRESHOLDS = ["below-5000", "5000-10000", "10001-15000", "15001-20000"];
const FREQUENCIES = ["monthly", "per-semester", "annual"];
const PAYMENT_METHODS = ["cash-pickup", "bank-transfer", "gcash"];

// Returns { settings, errors }. When errors is non-empty nothing was written,
// so a City Office user never saves a half-valid configuration.
async function updateProgramSettings(payload = {}, updatedBy = null) {
    const errors = {};
    const current = await getProgramSettings({ fresh: true });
    const eligibilitySource = payload.eligibility || {};
    const disbursementSource = payload.disbursement || {};

    const eligibility = {
        residencyYears: toNumber(eligibilitySource.residencyYears, current.eligibility.residencyYears, { min: 0, max: 60 }),
        incomeThreshold: pickEnum(eligibilitySource.incomeThreshold, INCOME_THRESHOLDS, current.eligibility.incomeThreshold),
        maximumAge: toNumber(eligibilitySource.maximumAge, current.eligibility.maximumAge, { min: 15, max: 99 }),
        noOtherScholarship: toBoolean(eligibilitySource.noOtherScholarship, current.eligibility.noOtherScholarship),
        accreditedSchool: toBoolean(eligibilitySource.accreditedSchool, current.eligibility.accreditedSchool)
    };

    const disbursement = {
        stipendAmount: toNumber(disbursementSource.stipendAmount, current.disbursement.stipendAmount, { min: 0, max: 1000000 }),
        frequency: pickEnum(disbursementSource.frequency, FREQUENCIES, current.disbursement.frequency),
        paymentMethod: pickEnum(disbursementSource.paymentMethod, PAYMENT_METHODS, current.disbursement.paymentMethod),
        maxScholarsPerSemester: toNumber(disbursementSource.maxScholarsPerSemester, current.disbursement.maxScholarsPerSemester, { min: 1, max: 1000000 }),
        autoNotify: toBoolean(disbursementSource.autoNotify, current.disbursement.autoNotify)
    };

    const applicationDocuments = payload.applicationDocuments !== undefined
        ? normalizeDocumentPayload(payload.applicationDocuments, current.applicationDocuments, errors, "applicationDocuments")
        : current.applicationDocuments;
    const renewalDocuments = payload.renewalDocuments !== undefined
        ? normalizeDocumentPayload(payload.renewalDocuments, current.renewalDocuments, errors, "renewalDocuments")
        : current.renewalDocuments;
    const applicationPeriod = payload.applicationPeriod !== undefined
        ? normalizePeriodPayload(payload.applicationPeriod, current.applicationPeriod, errors, "applicationPeriod")
        : current.applicationPeriod;
    const renewalPeriod = payload.renewalPeriod !== undefined
        ? normalizePeriodPayload(payload.renewalPeriod, current.renewalPeriod, errors, "renewalPeriod")
        : current.renewalPeriod;

    if (Object.keys(errors).length) return { settings: current, errors };

    const document = await CityProgramSettings.findOneAndUpdate(
        {},
        {
            $set: {
                scope: "city",
                applicationDocuments,
                renewalDocuments,
                eligibility,
                disbursement,
                applicationPeriod,
                renewalPeriod,
                updatedBy: updatedBy || null
            }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();

    invalidateProgramSettingsCache();
    return { settings: normalizeSettings(document), errors: {} };
}

// Restores the shipped defaults by clearing the stored sections, which keeps
// one source of truth (config/cityProgramDefaults.js) for the reset action.
async function restoreProgramDefaults() {
    await CityProgramSettings.updateMany({}, {
        $unset: {
            applicationDocuments: "",
            renewalDocuments: "",
            eligibility: "",
            disbursement: "",
            applicationPeriod: "",
            renewalPeriod: ""
        }
    });
    invalidateProgramSettingsCache();
    return getProgramSettings({ fresh: true });
}

module.exports = {
    getProgramSettings,
    updateProgramSettings,
    restoreProgramDefaults,
    invalidateProgramSettingsCache,
    normalizeSettings,
    publicProgramView,
    applicationDocumentTypes,
    renewalDocumentTypes,
    matchesRequiredDocument,
    missingRequiredApplicationDocuments,
    applicationWindow,
    renewalWindow,
    evaluatePeriod,
    INCOME_THRESHOLDS,
    FREQUENCIES,
    PAYMENT_METHODS
};




