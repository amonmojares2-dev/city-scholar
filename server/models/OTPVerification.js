const mongoose = require("mongoose");

const otpVerificationSchema = new mongoose.Schema({
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    otpHash: { type: String, required: true },
    purpose: {
        type: String,
        enum: ["login", "registration", "password_reset"],
        required: true
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    registrationData: { type: mongoose.Schema.Types.Mixed, default: null },
    resetPasswordHash: { type: String, default: null },
    expiresAt: { type: Date, required: true, index: true },
    lastSentAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    resendCount: { type: Number, default: 0 },
    blockedUntil: { type: Date, default: null },
    verified: { type: Boolean, default: false }
}, { timestamps: true });

// NOTE: no TTL auto-delete index on purpose.
// LOGIN OTP must NOT expire — it stays valid until replaced by a resend.
// Registration / password-reset expiry is enforced manually in the controller.

module.exports = mongoose.model("OTPVerification", otpVerificationSchema);
