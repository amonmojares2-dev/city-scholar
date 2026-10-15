const express = require("express");
const AuditLog = require("../models/AuditLog");
const { protect, authorize } = require("../middleware/authMiddleware");
const { CITY_ADMIN_ROLES } = require("../utils/validation");

const router = express.Router();

router.use(protect, authorize(...CITY_ADMIN_ROLES));

router.get("/", async(req, res, next) => {
    try {
        if (req.query.scope !== "city") {
            return res.status(400).json({ success: false, message: "A city audit scope is required." });
        }
        const requestedLimit = Number(req.query.limit) || 6;
        const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), 50);
        const logs = await AuditLog.find({ actorRole: { $in: CITY_ADMIN_ROLES } })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select("description actionType createdAt")
            .lean();
        return res.json({
            success: true,
            logs: logs.map((log) => ({
                _id: String(log._id),
                description: log.description,
                actionType: log.actionType,
                createdAt: log.createdAt
            }))
        });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
