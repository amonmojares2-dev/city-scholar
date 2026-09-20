const express = require("express");
const { protect, requirePortal } = require("../middleware/authMiddleware");
const {
    listScholarRegistrations,
    reviewScholarRegistration
} = require("../controllers/scholarApprovalController");

const router = express.Router();

// Only the City Office approves Existing Scholar registrations. The same
// decision governs whether the student's Renewal page unlocks.
router.use(protect);
router.use(requirePortal("city"));

router.get("/", listScholarRegistrations);
router.patch("/:id", reviewScholarRegistration);

module.exports = router;
