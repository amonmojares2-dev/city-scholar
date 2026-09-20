const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { SUPER_ADMIN_ROLES } = require("../utils/validation");
const { listDirectoryUsers } = require("../controllers/directoryController");

const router = express.Router();

// Read-only account directory for City Office pages (User Management,
// Barangay Accounts). Super Admin roles are included so shared tooling
// keeps working.
router.get("/", protect, authorize("city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), listDirectoryUsers);

module.exports = router;
