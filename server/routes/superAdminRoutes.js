const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { SUPER_ADMIN_ROLES } = require("../utils/validation");
const {
    getDashboard,
    listAccounts,
    reviewAccount,
    listUsers,
    updateUser,
    resetUserPassword,
    getProgramConfig,
    saveProgramConfig,
    listData,
    saveSchool,
    saveBarangay,
    listArchive,
    listAuditLogs,
    getReports,
    exportReport
} = require("../controllers/superAdminController");

const router = express.Router();

// Every Super Admin endpoint requires an authenticated Super Admin.
router.use(protect);
router.use(authorize(...SUPER_ADMIN_ROLES));

// Dashboard
router.get("/dashboard", getDashboard);

// Staff account review
router.get("/accounts", listAccounts);
router.patch("/accounts/:id", reviewAccount);

// All users
router.get("/users", listUsers);
router.patch("/users/:id", updateUser);
router.post("/users/:id/reset-password", resetUserPassword);

// Scholarship program configuration
router.get("/program", getProgramConfig);
router.put("/program", saveProgramConfig);

// Schools & barangays
router.get("/data", listData);
router.post("/schools", saveSchool);
router.patch("/schools/:id", saveSchool);
router.post("/barangays", saveBarangay);
router.patch("/barangays/:id", saveBarangay);

// Archive + audit trail
router.get("/archive", listArchive);
router.get("/audit", listAuditLogs);

// Reports
router.get("/reports", getReports);
router.post("/reports/:reportId/export", exportReport);

module.exports = router;