const express = require("express");

const {
    registerUser,
    loginUser,
    loginSuperAdmin,
    setSuperAdminPassword,
    forgotSuperAdminPassword,
    requestPasswordReset,
    setInitialPassword,
    verifyOtp,
    resendOtp,
    getCurrentUser,
    updateCurrentUser,
    createStaffAccount
} = require("../controllers/userController");
const { protect, superAdminOnly } = require("../middleware/authMiddleware");

const router = express.Router();

// Register
router.post("/register", registerUser);

// Login
router.post("/login", loginUser);
router.post("/forgot-password", requestPasswordReset);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);

// Super Admin uses the SAME shared OTP handlers — the role is read from
// MongoDB, so a super_admin account signs in through these aliases and
// verify-otp returns role "super_admin" for portal routing.
router.post("/super-admin/login", loginSuperAdmin);
router.post("/super-admin/set-password", setSuperAdminPassword);
router.post("/super-admin/forgot-password", forgotSuperAdminPassword);

// Super Admin: Create staff account (barangay_admin / city_admin)
// This endpoint creates an account directly without password/OTP.
// The user sets their password via the standard forgot-password flow.
router.post("/super-admin/create-user", protect, superAdminOnly, createStaffAccount);

router.get("/me", protect, getCurrentUser);
router.patch("/me", protect, updateCurrentUser);

module.exports = router;