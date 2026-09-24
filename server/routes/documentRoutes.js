const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { uploadSingleDocument, validateDocumentUpload } = require("../middleware/uploadMiddleware");
const { listDocuments, uploadDocument, updateDocument, serveDocumentFile } = require("../controllers/documentController");
const { SUPER_ADMIN_ROLES } = require("../utils/validation");

const router = express.Router();
router.use(protect);
router.get("/", listDocuments);
// Dedicated file endpoint: the client addresses the file by Document id and
// the server resolves the hashed filename internally — the real directory
// structure is never exposed. Registered BEFORE "/:id" so "file" is not
// mistaken for a document id by the PATCH route below.
router.get("/:id/file", (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    serveDocumentFile(req, res, next);
});
router.post("/", uploadSingleDocument, validateDocumentUpload, uploadDocument);
router.patch("/:id", authorize("barangay_staff", "city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), updateDocument);
module.exports = router;