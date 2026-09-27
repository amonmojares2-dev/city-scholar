const express = require("express");
const { readPublicContent, readStudentView } = require("../controllers/citySettingsController");

const router = express.Router();

// No sign-in required. These routes only expose content the public site shows:
// the editable page copy plus the document slots and application/renewal
// windows. Eligibility thresholds and disbursement figures are stripped by
// utils/cityProgramSettings.publicProgramView().
router.get("/content", readPublicContent);
router.get("/program", readStudentView);

module.exports = router;
