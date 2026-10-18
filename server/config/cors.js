const cors = require("cors");

function normalizeOrigin(origin) {
    return String(origin || "").trim().replace(/\/+$/, "");
}

function createCorsMiddleware({
    clientOrigin = process.env.CLIENT_ORIGIN,
    isProduction = process.env.NODE_ENV === "production"
} = {}) {
    const defaultOrigin = isProduction
        ? "https://city-scholar.vercel.app"
        : "http://localhost:5173";
    const allowedOrigins = new Set([
        normalizeOrigin(clientOrigin || defaultOrigin),
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ]);

    const isDevelopmentOrigin = (origin) =>
        !isProduction &&
        /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+):\d+$/.test(origin);

    return cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            const normalizedOrigin = normalizeOrigin(origin);
            return callback(
                null,
                allowedOrigins.has(normalizedOrigin) || isDevelopmentOrigin(normalizedOrigin)
                    ? normalizedOrigin
                    : false
            );
        },
        optionsSuccessStatus: 204,
        credentials: true,
        methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Authorization", "Content-Type"]
    });
}

module.exports = { createCorsMiddleware, normalizeOrigin };
