const express = require("express");
const { listBarangays } = require("../controllers/barangayController");

const router = express.Router();
router.get("/", listBarangays);
module.exports = router;
