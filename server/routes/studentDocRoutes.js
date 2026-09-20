const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { uploadSingleDocument } = require("../middleware/uploadMiddleware");
const { listStudentDocuments, uploadStudentDocument } = require("../controllers/studentDocController");

const router = express.Router();
router.use(protect);
router.get("/", listStudentDocuments);
router.post("/", uploadSingleDocument, uploadStudentDocument);

module.exports = router;
