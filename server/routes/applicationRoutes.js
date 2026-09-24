const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { listApplications, getApplication, createApplication, updateApplication, reviewApplication } = require("../controllers/applicationController");
const { SUPER_ADMIN_ROLES } = require("../utils/validation");

const router = express.Router();
router.use(protect);
router.route("/").get(listApplications).post(createApplication);
// City Office review decision (approve / reject / request documents).
// Students are deliberately excluded — they may never decide their own case.
router.patch("/:id/review", authorize("city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), reviewApplication);
router.route("/:id").get(getApplication).patch(updateApplication);
module.exports = router;