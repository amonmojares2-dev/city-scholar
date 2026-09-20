require("dotenv").config();
const connectDB = require("../config/db");
const User = require("../models/User");

// One-time cleanup: removes the DEMO existing-scholar accounts that were
// seeded for testing, so the Scholar Approval page only ever shows students
// who really registered through the Create Account page.
const DEMO_EMAILS = [
    "juan.delacruz.scholar@gmail.com",
    "angela.fernandez.scholar@gmail.com",
    "christian.aquino.scholar@gmail.com",
    "sophia.reyes.scholar@gmail.com",
    "daniel.mendoza.scholar@gmail.com",
];

async function cleanup() {
    const connected = await connectDB();
    if (!connected) {
        throw new Error("Could not connect to MongoDB — check MONGO_URI in .env");
    }

    const result = await User.deleteMany({ email: { $in: DEMO_EMAILS } });
    console.log(`Deleted ${result.deletedCount} demo scholar account(s).`);

    const remaining = await User.countDocuments({
        role: "student",
        $or: [
            { scholarType: "existing_scholar" },
            { scholarVerificationStatus: "rejected" }
        ]
    });
    console.log(`Scholar Approval page will now show ${remaining} record(s) — all real registrations.`);
    process.exit(0);
}

cleanup().catch((error) => {
    console.error("Cleanup failed:", error.message);
    process.exit(1);
});
