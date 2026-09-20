const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { listNotifications, markNotificationRead } = require("../controllers/notificationController");

const router = express.Router();
router.use(protect);
router.get("/", listNotifications);
router.patch("/:id/read", markNotificationRead);
module.exports = router;