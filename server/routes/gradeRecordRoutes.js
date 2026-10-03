const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { aiLimiter } = require("../middleware/rateLimiter");
const {
    listRecords,
    listPendingDocuments,
    updateRecord
} = require("../controllers/gradeRecordController");
const { CITY_ADMIN_ROLES, SUPER_ADMIN_ROLES } = require("../utils/validation");

// Everything here exposes AI-extracted student data and spends provider
// credits, so it is City Office / Super Admin only — never a student or a
// Barangay account.
const REVIEWER_ROLES = [...CITY_ADMIN_ROLES, ...SUPER_ADMIN_ROLES];

const router = express.Router();
router.use(protect, authorize(...REVIEWER_ROLES));

router.get("/", listRecords);
// Registered before the "/:id" routes below so "pending" is not parsed as an id.
router.get("/pending", listPendingDocuments);
router.patch("/:id", updateRecord);

module.exports = router;