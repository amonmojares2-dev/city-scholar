const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const universityRoutes = require("./routes/universityRoutes");
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
const Document = require("./models/Document");
const programRoutes = require("./routes/programRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const { authLimiter, apiLimiter } = require("./middleware/rateLimiter");

const app = express();

const requireDatabase = require("./middleware/requireDatabase");

// [ADDED] Environment flag used by Helmet and CORS below
const isProduction = process.env.NODE_ENV === "production";

// [ADDED] Hide framework fingerprint (Helmet also removes it, this is a safety net)
app.disable("x-powered-by");

// Render terminates the public connection at a reverse proxy and supplies
// X-Forwarded-For. Trust exactly one proxy hop so req.ip and the rate limiters
// use the real client address without trusting arbitrary client headers.
app.set("trust proxy", 1);

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
    // Keep Helmet's same-origin default globally; only the authenticated
    // document/profile file routes override CORP for their blob responses.
    crossOriginResourcePolicy: { policy: "same-origin" },
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
    optionsSuccessStatus: 204,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"]
}));

app.use(express.json());

// Uploaded files are private. Profile photos use the authenticated
// GET /api/users/me/photo route; application documents use
// GET /api/documents/:id/file. Never expose the uploads directory statically.
// Test route
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "City Scholar API is running"
    });
});

// Public static registration metadata must not depend on MongoDB or consume
// either API/auth rate-limit buckets. Keep this before the guards below.
app.use("/api/universities", universityRoutes);

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

process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
});

const PORT = process.env.PORT || 5000;

async function startServer() {
    // Bind first so health checks receive a response even while MongoDB is
    // reconnecting. API routes are guarded by requireDatabase and return 503
    // until the connection is ready, instead of causing ERR_CONNECTION_REFUSED.
    const server = app.listen(PORT, () => {
        console.log(`City Scholar server running on port ${PORT}`);
    });
    server.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
            console.error(`Port ${PORT} is already in use. Stop the other server process and restart this one.`);
        } else {
            console.error("HTTP server error:", error);
        }
    });

    const connect = async () => {
        const connected = await connectDB();
        if (connected) {
            try {
                // Materialize the upload-slot uniqueness rule even when the
                // runtime disables Mongoose automatic background index creation.
                await Document.createIndexes();
            } catch (error) {
                console.error("Document index initialization failed:", error.message);
            }
            console.log('DATABASE_CONNECTED');
            return;
        }
        console.error('DATABASE_NOT_CONNECTED; API requests will return 503. Retrying in 10 seconds.');
        setTimeout(connect, 10000);
    };
    connect();

    return server;
}

if (require.main === module) {
    startServer().catch((error) => {
        console.error('Server startup failed:', error.stack || error.message);
        process.exitCode = 1;
    });
}

module.exports = { app, startServer };