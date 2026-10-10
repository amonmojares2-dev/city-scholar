const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { uploadSingleDocument, validateDocumentUpload } = require("../middleware/uploadMiddleware");
const { aiLimiter } = require("../middleware/rateLimiter");
const { listDocuments, uploadDocument, updateDocument, serveDocumentFile, requestResubmission, replaceDocument } = require("../controllers/documentController");
const { analyzeDocument } = require("../controllers/gradeRecordController");
const { CITY_ADMIN_ROLES, SUPER_ADMIN_ROLES } = require("../utils/validation");

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
// AI grade extraction. City/Super Admin only, and behind aiLimiter because
// every call bills the OpenAI account. Declared after "/:id/file" so "analyze"
// is not swallowed by that route.
router.post("/:id/analyze", authorize(...CITY_ADMIN_ROLES, ...SUPER_ADMIN_ROLES), aiLimiter, analyzeDocument);
// Failed-grade appeal flow: City asks for a replacement, the owning student
// answers with a new file. The request route is reviewer-only; the replace
// route checks ownership in the controller (and reuses the same upload
// validation as POST /).
router.post("/:id/request-resubmission", authorize(...CITY_ADMIN_ROLES, ...SUPER_ADMIN_ROLES), requestResubmission);
router.post("/:id/replace", uploadSingleDocument, validateDocumentUpload, replaceDocument);
router.patch("/:id", authorize("barangay_staff", "city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), updateDocument);
module.exports = router;