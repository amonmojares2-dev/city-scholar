const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { SUPER_ADMIN_ROLES } = require("../utils/validation");
const { listPrograms } = require("../controllers/directoryController");

const router = express.Router();

// Read-only program configuration for City Office pages (Scholarship
// Programs, System Settings). Program writes stay with the Super Admin.
router.get("/", protect, authorize("city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), listPrograms);

module.exports = router;
