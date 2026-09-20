const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { listApplications, getApplication, createApplication, updateApplication } = require("../controllers/applicationController");

const router = express.Router();
router.use(protect);
router.route("/").get(listApplications).post(createApplication);
router.route("/:id").get(getApplication).patch(updateApplication);
module.exports = router;