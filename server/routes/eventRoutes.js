const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { listEvents, markAttendance, createEvent, updateEvent } = require("../controllers/eventController");
const { SUPER_ADMIN_ROLES } = require("../utils/validation");

const router = express.Router();
router.use(protect);
router.get("/", listEvents);
router.post("/", authorize("city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), createEvent);
router.patch("/:id", authorize("city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), updateEvent);
router.post("/:id/attendance", authorize("student"), markAttendance);
module.exports = router;