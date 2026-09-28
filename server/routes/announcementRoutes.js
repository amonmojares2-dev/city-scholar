const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { listAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } = require("../controllers/announcementController");
const { SUPER_ADMIN_ROLES } = require("../utils/validation");

const router = express.Router();
// GET is open to every signed-in role: the controller returns only the
// announcements that role is allowed to see (backend filtering).
router.get("/", protect, listAnnouncements);
// Create / edit / delete are City Office (plus Super Admin) only.
router.post("/", protect, authorize("city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), createAnnouncement);
router.patch("/:id", protect, authorize("city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), updateAnnouncement);
router.delete("/:id", protect, authorize("city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), deleteAnnouncement);
module.exports = router;