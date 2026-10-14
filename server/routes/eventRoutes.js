const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { listEvents, markAttendance, createEvent, updateEvent, getEventAttendance, uploadProof, removeProof, verifyProof, rejectProof, serveProofFile } = require("../controllers/eventController");
const { SUPER_ADMIN_ROLES } = require("../utils/validation");
const { uploadSingleDocument, validateProfilePhotoUpload } = require("../middleware/uploadMiddleware");

const router = express.Router();
router.use(protect);
router.get("/", listEvents);
router.post("/", authorize("city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), createEvent);
router.patch("/:id", authorize("city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), updateEvent);
// Old self-marked "Attended" toggle (non-required events only; 409 otherwise).
router.post("/:id/attendance", authorize("student"), markAttendance);

// ---- attendance proof ----
// Submit / replace an image proof (approved scholars only). This is the SAME
// secure upload pipeline the document flow uses: uploadSingleDocument (multer
// image mimetype+extension+5 MB) followed by validateProfilePhotoUpload, which
// reads the real file signature (magic bytes) so a renamed .exe or a spoofed
// Content-Type is rejected and the temp file is removed. Field name is "file".
router.post("/:id/attendance-proof", authorize("student"), uploadSingleDocument, validateProfilePhotoUpload, uploadProof);
// City Office review list (city_admin, admin_staff, superadmin only).
router.get("/:id/attendance-proofs", authorize("city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), getEventAttendance);
// Owner removes their own pending proof.
router.delete("/:id/attendance-proofs/:proofId", authorize("student"), removeProof);
// City verifies / rejects (reject requires a reason in the body).
router.patch("/:id/attendance-proofs/:proofId/verify", authorize("city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), verifyProof);
router.patch("/:id/attendance-proofs/:proofId/reject", authorize("city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), rejectProof);
// Authenticated, scoped proof image (owner or city+). Registered last so the
// literal path segments above win over this route.
router.get("/:id/attendance-proofs/:proofId/image", protect, serveProofFile);
module.exports = router;
