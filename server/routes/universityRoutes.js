const express = require("express");
const { UNIVERSITY_OPTIONS } = require("../config/universities");

const router = express.Router();

// Public, read-only registration metadata. This route is mounted before the
// database guard and API rate limiter in server.js.
router.get("/", (req, res) => {
    return res.json({
        success: true,
        universities: UNIVERSITY_OPTIONS
    });
});

module.exports = router;
