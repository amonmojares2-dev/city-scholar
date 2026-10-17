const { normalizeOrigin } = require("../config/cors");

// ==========================================
// CSRF PROTECTION (Origin-based)
//
// Same-site cookie authentication is vulnerable to cross-site request
// forgery, so every non-GET request must come from our own client origin.
//
// A browser only sends an `Origin` header on cross-origin requests, so an
// absent Origin means a same-origin request (our production setup routes the
// frontend through the same origin via the Vercel rewrite) and is allowed.
// When Origin is present it must exactly match CLIENT_ORIGIN, otherwise 403.
// ==========================================
function csrfMiddleware(req, res, next) {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
        return next();
    }

    const origin = normalizeOrigin(req.headers.origin);
    const expected = normalizeOrigin(process.env.CLIENT_ORIGIN);

    if (!origin) {
        // Same-origin request (or non-browser client): no cross-site risk.
        return next();
    }

    if (!expected || origin !== expected) {
        return res.status(403).json({
            success: false,
            code: "CSRF_REJECTED",
            message: "Request rejected: the request origin is not allowed."
        });
    }

    return next();
}

module.exports = { csrfMiddleware };
