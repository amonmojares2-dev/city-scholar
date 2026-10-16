const express = require("express");
const { protect, requirePortal } = require("../middleware/authMiddleware");
const {
    readProgramSettings,
    saveProgramSettings,
    restoreProgramSettings,
    readPublicPages,
    savePublicPages,
    restorePublicPages,
    readTermsPrivacySettings,
    saveTermsPrivacyDocument,
    restoreTermsPrivacyDocumentDefault,
    restoreTermsPrivacyDocumentVersion
} = require("../controllers/citySettingsController");

const router = express.Router();

// Legal copy is editable by City Office administrators only.
router.get("/terms-privacy", protect, requirePortal("city"), readTermsPrivacySettings);
router.put("/terms-privacy/:key", protect, requirePortal("city"), saveTermsPrivacyDocument);
router.post("/terms-privacy/:key/restore-default", protect, requirePortal("city"), restoreTermsPrivacyDocumentDefault);
router.post("/terms-privacy/:key/history/:version/restore", protect, requirePortal("city"), restoreTermsPrivacyDocumentVersion);

// City-wide program settings. The City Office owns these; the Super Admin
// keeps them too because the two roles historically shared Program Config.
router.use(protect, requirePortal("city", "superadmin"));

// Program configuration: document slots, eligibility, disbursement, windows.
router.get("/program", readProgramSettings);
router.put("/program", saveProgramSettings);
router.post("/program/restore-defaults", restoreProgramSettings);

// Editable copy for the public Eligibility, How to Apply and Guidelines pages.
router.get("/public-pages", readPublicPages);
router.put("/public-pages", savePublicPages);
router.post("/public-pages/restore-defaults", restorePublicPages);

module.exports = router;
