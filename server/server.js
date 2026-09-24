const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const applicationRoutes = require("./routes/applicationRoutes");
const documentRoutes = require("./routes/documentRoutes");
const messageRoutes = require("./routes/messageRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const aiRoutes = require("./routes/aiRoutes");
const announcementRoutes = require("./routes/announcementRoutes");
const eventRoutes = require("./routes/eventRoutes");
const barangayRoutes = require("./routes/barangayRoutes");
const superAdminRoutes = require("./routes/superAdminRoutes");
const scholarApprovalRoutes = require("./routes/scholarApprovalRoutes");
const scholarsRoutes = require("./routes/scholarsRoutes");
const userRoutes = require("./routes/userRoutes");
const programRoutes = require("./routes/programRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const { authLimiter, apiLimiter } = require("./middleware/rateLimiter");

const app = express();

const mongoose = require("mongoose");
const requireDatabase = require("./middleware/requireDatabase");

// [ADDED] Environment flag used by Helmet and CORS below
const isProduction = process.env.NODE_ENV === "production";

// [ADDED] Hide framework fingerprint (Helmet also removes it, this is a safety net)
app.disable("x-powered-by");

// [ADDED] Only set TRUST_PROXY (e.g. 1) if deployed behind a proxy such as Nginx, Render, or Heroku.
// Needed so the rate limiter sees real client IPs.
if (process.env.TRUST_PROXY) {
    app.set("trust proxy", Number(process.env.TRUST_PROXY));
}

// [CHANGED] Was: app.use(helmet());
// Helmet v7+ option names. On helmet v6 or older, rename
// strictTransportSecurity -> hsts and xFrameOptions -> frameguard.
app.use(helmet({
    // This is a JSON API: nothing should be loaded, framed, or submitted from its responses.
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
    // Helmet's default "same-origin" would block the frontend (different origin)
    // from loading files served by this API via <img>, <embed>, etc.
    // Use "same-site" if frontend and API share the same registrable domain.
    crossOriginResourcePolicy: { policy: process.env.CORP_POLICY || "cross-origin" },
    referrerPolicy: { policy: "no-referrer" },
    // HSTS only makes sense over HTTPS, so enable in production only.
    strictTransportSecurity: isProduction ? { maxAge: 15552000, includeSubDomains: true } : false,
    xFrameOptions: { action: "deny" }
}));

// [ADDED] Helmet doesn't set Permissions-Policy, so add it manually
app.use((req, res, next) => {
    res.setHeader(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    );
    next();
});

// Middleware
const allowedOrigins = new Set([
    process.env.CLIENT_ORIGIN || "http://localhost:5173",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
]);

// [CHANGED] Local/private-network origins are now allowed only outside production
const isDevelopmentOrigin = (origin) =>
    !isProduction &&
    /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+):\d+$/.test(origin);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        return callback(null, allowedOrigins.has(origin) || isDevelopmentOrigin(origin) ? origin : false);
    },
    optionsSuccessStatus: 204
}));

app.use(express.json());

// Test route
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "City Scholar API is running"
    });
});

app.use("/api", requireDatabase);
app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter, authRoutes);
const studentDocRoutes = require("./routes/studentDocRoutes");

app.use("/api/applications", applicationRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/student/application/documents", studentDocRoutes);
const studentApplicationRoutes = require("./routes/studentApplicationRoutes");
app.use("/api/student/application", studentApplicationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/barangays", barangayRoutes);
app.use("/api/super-admin", superAdminRoutes);
app.use("/api/city/scholar-approval", scholarApprovalRoutes);
app.use("/api/scholars", scholarsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/programs", programRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function startServer() {
    console.log('STARTING_SERVER');
    console.log('MONGO_URI_SET', Boolean(process.env.MONGO_URI));

    const connected = await connectDB();
    if (!connected) {
        console.error('DATABASE_NOT_CONNECTED');
        await mongoose.disconnect();
        process.exitCode = 1;
        return;
    }

    console.log('DATABASE_CONNECTED');

    const server = app.listen(PORT, () => {
        console.log(`City Scholar server running on port ${PORT}`);
    });

    return server;
}

if (require.main === module) {
    startServer().catch((error) => {
        console.error('Server startup failed:', error.message);
        process.exitCode = 1;
    });
}

module.exports = { app, startServer };