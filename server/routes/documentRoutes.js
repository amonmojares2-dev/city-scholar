const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { uploadSingleDocument } = require("../middleware/uploadMiddleware");
const { listDocuments, uploadDocument, updateDocument } = require("../controllers/documentController");
const { SUPER_ADMIN_ROLES } = require("../utils/validation");

const router = express.Router();
router.use(protect);
router.get("/", listDocuments);
router.post("/", uploadSingleDocument, uploadDocument);
router.patch("/:id", authorize("barangay_staff", "city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), updateDocument);
module.exports = router;