const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { listBarangays } = require("../controllers/barangayController");
const { listBarangayApplicationsCanonical, getBarangayApplication, decideBarangayApplication } = require("../controllers/applicationController");
const { BARANGAY_ADMIN_ROLES } = require("../utils/validation");

const router = express.Router();

// Public: the Create Account page reads the barangay list before sign-in.
router.get("/", listBarangays);

// Application residency review — stage 1 of Application -> Barangay -> City.
// Barangay Admin only; scoped server-side to the admin's own barangay.
router.get("/applications", protect, authorize(...BARANGAY_ADMIN_ROLES), listBarangayApplicationsCanonical);
router.get("/applications/:id", protect, authorize(...BARANGAY_ADMIN_ROLES), getBarangayApplication);
const withDecision = (decision) => (req, res, next) => {
  req.body = { ...(req.body || {}), decision };
  return decideBarangayApplication(req, res, next);
};

router.post("/applications/:id/approve", protect, authorize(...BARANGAY_ADMIN_ROLES), withDecision("approve"));
router.post("/applications/:id/reject", protect, authorize(...BARANGAY_ADMIN_ROLES), withDecision("reject"));

module.exports = router;
