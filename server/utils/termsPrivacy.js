const mongoose = require("mongoose");
const TermsPrivacy = require("../models/TermsPrivacy");
const { DEFAULT_TERMS_PRIVACY } = require("../config/termsPrivacyDefaults");
const { logAudit } = require("./audit");

const MAX_CONTENT_LENGTH = 50000;
const DOCUMENT_KEYS = Object.keys(DEFAULT_TERMS_PRIVACY);

function sanitizePlainText(value) {
    return String(value)
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
        .replace(/<[^>]*>/g, "")
        .trim();
}

function defaultDocument(key) {
    const document = DEFAULT_TERMS_PRIVACY[key];
    return {
        ...document,
        version: 0,
        updatedAt: null,
        updatedBy: null,
        updatedByName: "",
        history: []
    };
}

function serialiseDocument(key, stored) {
    if (!stored) return defaultDocument(key);
    return {
        ...DEFAULT_TERMS_PRIVACY[key],
        content: stored.content || DEFAULT_TERMS_PRIVACY[key].content,
        version: Number(stored.version) || 0,
        updatedAt: stored.updatedAt ? new Date(stored.updatedAt).toISOString() : null,
        updatedBy: stored.updatedBy ? String(stored.updatedBy._id || stored.updatedBy) : null,
        updatedByName: stored.updatedByName || stored.updatedBy?.name || "",
        history: (stored.history || []).slice(0, 20).map((entry) => ({
            content: entry.content,
            version: Number(entry.version) || 0,
            updatedAt: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : null,
            updatedBy: entry.updatedBy ? String(entry.updatedBy._id || entry.updatedBy) : null,
            updatedByName: entry.updatedByName || entry.updatedBy?.name || ""
        }))
    };
}

function serialiseRecord(record) {
    return Object.fromEntries(DOCUMENT_KEYS.map((key) => [
        key,
        serialiseDocument(key, record?.[key])
    ]));
}

async function getTermsPrivacy({ fresh = false } = {}) {
    if (mongoose.connection.readyState !== 1) return serialiseRecord(null);
    try {
        const record = await TermsPrivacy.findOne({ scope: "terms-privacy" }).lean();
        return serialiseRecord(record);
    } catch (error) {
        console.error("Terms and privacy read failed:", error.message);
        return serialiseRecord(null);
    }
}

function snapshot(document) {
    return {
        content: document.content,
        version: document.version || 0,
        updatedAt: document.updatedAt || null,
        updatedBy: document.updatedBy || null,
        updatedByName: document.updatedByName || ""
    };
}

async function writeDocument(key, content, actor, req, action) {
    if (!DOCUMENT_KEYS.includes(key)) {
        return { document: null, error: "Document must be terms or privacy." };
    }
    if (typeof content !== "string" || content.length > MAX_CONTENT_LENGTH) {
        return { document: null, error: "Content must be a string of at most 50,000 characters." };
    }
    const safeContent = sanitizePlainText(content);
    if (!safeContent) return { document: null, error: "Document content cannot be empty." };
    if (safeContent.length > MAX_CONTENT_LENGTH) {
        return { document: null, error: "Content must be a string of at most 50,000 characters." };
    }
    if (mongoose.connection.readyState !== 1) {
        throw new Error("Terms and privacy storage is unavailable.");
    }

    let record = await TermsPrivacy.findOne({ scope: "terms-privacy" });
    if (!record) {
        record = new TermsPrivacy({
            scope: "terms-privacy",
            terms: defaultDocument("terms"),
            privacy: defaultDocument("privacy")
        });
    }

    const current = record[key] || defaultDocument(key);
    const history = [snapshot(current), ...(current.history || [])].slice(0, 20);
    const updatedAt = new Date();
    const nextVersion = (Number(current.version) || 0) + 1;
    record[key] = {
        content: safeContent,
        version: nextVersion,
        updatedAt,
        updatedBy: actor?.id || actor?._id || null,
        updatedByName: actor?.name || "",
        history
    };
    await record.save();
    await logAudit({
        req,
        actor,
        actionType: "Config Change",
        description: `${action} ${DEFAULT_TERMS_PRIVACY[key].title} (version ${nextVersion})`,
        targetType: "terms_privacy",
        targetId: key
    });
    return { document: serialiseDocument(key, record[key]), error: null };
}

async function saveTermsPrivacy(key, content, actor, req) {
    return writeDocument(key, content, actor, req, "Saved");
}

async function restoreTermsPrivacyDefault(key, actor, req) {
    if (!DOCUMENT_KEYS.includes(key)) return { document: null, error: "Document must be terms or privacy." };
    return writeDocument(key, DEFAULT_TERMS_PRIVACY[key].content, actor, req, "Restored default for");
}

async function restoreTermsPrivacyVersion(key, version, actor, req) {
    if (!DOCUMENT_KEYS.includes(key)) return { document: null, error: "Document must be terms or privacy." };
    if (!Number.isInteger(Number(version)) || Number(version) < 0) {
        return { document: null, error: "Version must be a non-negative integer." };
    }
    if (mongoose.connection.readyState !== 1) {
        throw new Error("Terms and privacy storage is unavailable.");
    }
    const record = await TermsPrivacy.findOne({ scope: "terms-privacy" });
    const previous = record?.[key]?.history?.find((entry) => Number(entry.version) === Number(version));
    if (!previous) return { document: null, error: "That document version was not found." };
    return writeDocument(key, previous.content, actor, req, `Restored version ${version} of`);
}

module.exports = {
    MAX_CONTENT_LENGTH,
    DOCUMENT_KEYS,
    DEFAULT_TERMS_PRIVACY,
    sanitizePlainText,
    getTermsPrivacy,
    saveTermsPrivacy,
    restoreTermsPrivacyDefault,
    restoreTermsPrivacyVersion
};
