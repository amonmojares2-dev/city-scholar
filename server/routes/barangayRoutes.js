const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { listBarangays } = require("../controllers/barangayController");
const { listBarangayApplications, reviewBarangayApplication } = require("../controllers/applicationController");
const { BARANGAY_ADMIN_ROLES } = require("../utils/validation");

const router = express.Router();

// Public: the Create Account page reads the barangay list before sign-in.
router.get("/", listBarangays);

// Application residency review — stage 1 of Application -> Barangay -> City.
// Barangay Admin only; scoped server-side to the admin's own barangay.
router.get("/applications", protect, authorize(...BARANGAY_ADMIN_ROLES), listBarangayApplications);
router.patch("/applications/:id/verification", protect, authorize(...BARANGAY_ADMIN_ROLES), reviewBarangayApplication);

module.exports = router;
