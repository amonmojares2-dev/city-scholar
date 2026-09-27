const {
    getProgramSettings,
    updateProgramSettings,
    restoreProgramDefaults,
    publicProgramView,
    INCOME_THRESHOLDS,
    FREQUENCIES,
    PAYMENT_METHODS
} = require("../utils/cityProgramSettings");
const {
    getPublicPages,
    updatePublicPages,
    restorePublicPageDefaults,
    PAGE_DEFAULTS
} = require("../utils/publicPageContent");
const { DEFAULT_PROGRAM_SETTINGS } = require("../config/cityProgramDefaults");

// Sent alongside the settings so the City Office form renders the same choices
// the server accepts instead of hard-coding its own list.
const OPTIONS = Object.freeze({
    incomeThresholds: [...INCOME_THRESHOLDS],
    frequencies: [...FREQUENCIES],
    paymentMethods: [...PAYMENT_METHODS]
});

/** GET /api/city/settings/program */
const readProgramSettings = async(req, res, next) => {
    try {
        const settings = await getProgramSettings({ fresh: true });
        res.json({ success: true, settings, defaults: DEFAULT_PROGRAM_SETTINGS, options: OPTIONS });
    } catch (error) {
        next(error);
    }
};

/** PUT /api/city/settings/program */
const saveProgramSettings = async(req, res, next) => {
    try {
        const { settings, errors } = await updateProgramSettings(req.body || {}, req.user?.id || null);
        if (Object.keys(errors).length) {
            return res.status(400).json({
                success: false,
                message: "Please review the highlighted settings before saving.",
                errors,
                settings
            });
        }
        return res.json({ success: true, settings, message: "Program settings saved." });
    } catch (error) {
        next(error);
    }
};

/** POST /api/city/settings/program/restore-defaults */
const restoreProgramSettings = async(req, res, next) => {
    try {
        const settings = await restoreProgramDefaults();
        res.json({ success: true, settings, message: "Program settings restored to the shipped defaults." });
    } catch (error) {
        next(error);
    }
};

/** GET /api/city/settings/public-pages */
const readPublicPages = async(req, res, next) => {
    try {
        const pages = await getPublicPages({ fresh: true });
        res.json({ success: true, pages, defaults: PAGE_DEFAULTS });
    } catch (error) {
        next(error);
    }
};

/** PUT /api/city/settings/public-pages */
const savePublicPages = async(req, res, next) => {
    try {
        const { pages, errors } = await updatePublicPages(req.body || {}, req.user?.id || null);
        if (Object.keys(errors).length) {
            return res.status(400).json({
                success: false,
                message: "Please review the highlighted page content before saving.",
                errors,
                pages
            });
        }
        return res.json({ success: true, pages, message: "Public page content saved." });
    } catch (error) {
        next(error);
    }
};

/** POST /api/city/settings/public-pages/restore-defaults */
const restorePublicPages = async(req, res, next) => {
    try {
        const pages = await restorePublicPageDefaults();
        res.json({ success: true, pages, message: "Public page content restored to the shipped defaults." });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/public/content (no sign-in)
 * Everything the public pages render: the editable copy plus the student-facing
 * program facts (document slots and windows). Internal eligibility thresholds
 * and disbursement figures are never included.
 */
const readPublicContent = async(req, res, next) => {
    try {
        const [pages, settings] = await Promise.all([getPublicPages(), getProgramSettings()]);
        res.json({ success: true, pages, defaults: PAGE_DEFAULTS, program: publicProgramView(settings) });
    } catch (error) {
        next(error);
    }
};

/** GET /api/city/settings/student-view — same shape, for signed-in students. */
const readStudentView = async(req, res, next) => {
    try {
        const settings = await getProgramSettings();
        res.json({ success: true, ...publicProgramView(settings) });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    readProgramSettings,
    saveProgramSettings,
    restoreProgramSettings,
    readPublicPages,
    savePublicPages,
    restorePublicPages,
    readPublicContent,
    readStudentView
};
