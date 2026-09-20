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
    updateCurrentUser
} = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");

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

router.get("/me", protect, getCurrentUser);
router.patch("/me", protect, updateCurrentUser);

module.exports = router;