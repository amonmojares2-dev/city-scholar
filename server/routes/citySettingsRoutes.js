const express = require("express");
const { protect, requirePortal } = require("../middleware/authMiddleware");
const {
    readProgramSettings,
    saveProgramSettings,
    restoreProgramSettings,
    readPublicPages,
    savePublicPages,
    restorePublicPages
} = require("../controllers/citySettingsController");

const router = express.Router();

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
