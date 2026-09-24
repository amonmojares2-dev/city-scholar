const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const User = require("../models/User");

const router = express.Router();
router.use(protect);

// GET /api/scholars
//
// Single source of truth for "approved scholar":
//   User documents where role=student, scholarType=existing_scholar and
//   scholarVerificationStatus=approved - exactly what the City Office
//   Scholar Approval page writes when it approves a claim.
//
// Query scope:
//   - City Office / Super Admin: omit ?barangay -> all approved scholars.
//   - Barangay staff:            ?barangay=<id> -> only their barangay.
router.get("/", async (req, res, next) => {
    try {
        const filter = {
            role: "student",
            scholarType: "existing_scholar",
            scholarVerificationStatus: "approved",
        };

        if (req.query.barangay) {
            filter.barangay = req.query.barangay;
        }

                        const rows = await User.find(filter)
            .select(
                "name email scholarVerificationStatus scholarVerifiedAt " +
                "barangay profile.schoolName profile.course profile.yearLevel profile.gwa"
            )
            .populate("barangay", "name")
            .sort({ name: 1 })
            .lean();

        const scholars = rows.map((row) => ({
            id: String(row._id),
            name: row.name,
            email: row.email,
            school: (row.profile && row.profile.schoolName) || "",
            course: (row.profile && row.profile.course) || "",
            yearLevel: (row.profile && row.profile.yearLevel) || "",
            gwa: (row.profile && row.profile.gwa) || "",
            barangayId: row.barangay && row.barangay._id ? String(row.barangay._id) : null,
            barangay: (row.barangay && row.barangay.name) || "",
            verifiedAt: row.scholarVerifiedAt || null,
        }));

        res.json({ success: true, count: scholars.length, scholars });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
