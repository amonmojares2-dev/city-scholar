const rateLimit = require("express-rate-limit");

// ==========================================
// Auth rate limiter
//
// Applied to sensitive /api/auth endpoints such as login, OTP verification,
// and OTP resend.
// These are the endpoints an attacker would brute-force: password
// guessing on login, OTP guessing on verify, or spamming resend to
// exhaust the email quota / annoy the account owner.
//
// 10 attempts per 15 minutes per IP is tight enough to block automated
// guessing but loose enough that a real user mistyping their password
// a few times won't get locked out.
// ==========================================
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    standardHeaders: true, // return RateLimit-* headers
    legacyHeaders: false, // disable the deprecated X-RateLimit-* headers
    message: {
        success: false,
        message: "Too many attempts. Please wait a few minutes before trying again."
    },
    handler: (req, res, _next, options) => {
        res.status(options.statusCode).json(options.message);
    }
});

// ==========================================
// General API rate limiter
//
// A looser, catch-all limit for every other /api route, mainly to blunt
// scripted abuse or a runaway client-side loop rather than to stop a
// targeted attack.
// ==========================================
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests. Please slow down and try again shortly."
    },
    handler: (req, res, _next, options) => {
        res.status(options.statusCode).json(options.message);
    }
});

module.exports = { authLimiter, apiLimiter };