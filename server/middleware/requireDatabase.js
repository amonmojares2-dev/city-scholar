const mongoose = require("mongoose");

module.exports = function requireDatabase(req, res, next) {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
            success: false,
            message: "Database unavailable. Please try again shortly."
        });
    }
    next();
};
