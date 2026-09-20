const express = require("express");
const { getEligibility, askAssistant } = require("../controllers/aiController");

const router = express.Router();
router.post("/eligibility", getEligibility);
router.post("/ask", askAssistant);
module.exports = router;