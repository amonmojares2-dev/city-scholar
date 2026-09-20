const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { listAnnouncements, createAnnouncement, updateAnnouncement } = require("../controllers/announcementController");
const { SUPER_ADMIN_ROLES } = require("../utils/validation");

const router = express.Router();
router.get("/", protect, listAnnouncements);
router.post("/", protect, authorize("city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), createAnnouncement);
router.patch("/:id", protect, authorize("city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), updateAnnouncement);
module.exports = router;