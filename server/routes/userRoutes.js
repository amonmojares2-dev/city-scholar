const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { SUPER_ADMIN_ROLES } = require("../utils/validation");
const { profilePhotoUpload } = require("../config/storage");
const { validateProfilePhotoUpload } = require("../middleware/uploadMiddleware");
const {
    deleteCurrentUser,
    getProfilePhoto,
    uploadProfilePhoto
} = require("../controllers/userAccountController");
const { listDirectoryUsers } = require("../controllers/directoryController");

const router = express.Router();

// Read-only account directory for City Office pages (User Management,
// Barangay Accounts). Super Admin roles are included so shared tooling
// keeps working.
router.get("/", protect, authorize("city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), listDirectoryUsers);

// Photo upload is available to every authenticated account and always acts
// only on the user id from the token. The global API limiter is mounted in
// server.js. Keep the authenticated GET fallback for existing clients that
// still request /api/users/me/photo.
router.delete("/me", protect, authorize("student"), deleteCurrentUser);
router.get("/me/photo", protect, getProfilePhoto);
router.post("/me/photo", protect, profilePhotoUpload.single("file"), validateProfilePhotoUpload, uploadProfilePhoto);

module.exports = router;
