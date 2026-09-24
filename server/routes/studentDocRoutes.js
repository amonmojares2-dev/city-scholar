const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { uploadSingleDocument, validateDocumentUpload } = require("../middleware/uploadMiddleware");
const { listStudentDocuments, uploadStudentDocument } = require("../controllers/studentDocController");

const router = express.Router();
router.use(protect);
router.get("/", listStudentDocuments);
router.post("/", uploadSingleDocument, validateDocumentUpload, uploadStudentDocument);

module.exports = router;
