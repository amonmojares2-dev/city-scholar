const isProduction = process.env.NODE_ENV === "production";

// Helmet v7+ option names. On helmet v6 or older, use `hsts` and `frameguard` instead.
const helmetOptions = {
    // JSON API: nothing should be loaded, framed, or submitted from an API response.
    // Set CSP_REPORT_ONLY=true to test without enforcing.
    contentSecurityPolicy: {
        useDefaults: false,
        reportOnly: process.env.CSP_REPORT_ONLY === "true",
        directives: {
            defaultSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'none'"],
            formAction: ["'none'"]
        }
    },

    // Helmet's default is "same-origin", which blocks the frontend (a different origin)
    // from loading files served by this API via <img>, <embed>, etc.
    // Use "same-site" if frontend and API share the same registrable domain.
    crossOriginResourcePolicy: { policy: process.env.CORP_POLICY || "cross-origin" },

    referrerPolicy: { policy: "no-referrer" },

    // Only meaningful over HTTPS, so enable in production only.
    strictTransportSecurity: isProduction ? { maxAge: 15552000, includeSubDomains: true } : false,

    xFrameOptions: { action: "deny" }
};

// Helmet doesn't set Permissions-Policy.
const permissionsPolicy = (req, res, next) => {
    res.setHeader(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    );
    next();
};

module.exports = { helmetOptions, permissionsPolicy, isProduction };