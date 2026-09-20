const express = require("express");
const cors = require("cors");
const path = require("path");
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

const app = express();

const mongoose = require("mongoose");
const requireDatabase = require("./middleware/requireDatabase");

// Middleware
const allowedOrigins = new Set([
    process.env.CLIENT_ORIGIN || "http://localhost:5173",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
]);

const isDevelopmentOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+):\d+$/.test(origin);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        return callback(null, allowedOrigins.has(origin) || isDevelopmentOrigin(origin) ? origin : false);
    },
    optionsSuccessStatus: 204
}));

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Test route
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "City Scholar API is running"
    });
});

app.use("/api", requireDatabase);
app.use("/api/auth", authRoutes);
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