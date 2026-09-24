const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Application = require("../models/Application");
const User = require("../models/User");
const { APPLICATION_STATUSES } = require("../config/applicationStatus");

const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "true";

(async () => {
    await connectDB();
    const legacySubmitted = await Application.find({
        status: APPLICATION_STATUSES.SUBMITTED,
        $or: [
            { barangayVerificationStatus: "approved" },
            { barangayVerificationStatus: "rejected" }
        ]
    }).select("_id barangayVerificationStatus barangay student");
    const missingBarangay = await Application.find({ barangay: null }).select("_id student");
    const changes = [];

    for (const application of legacySubmitted) {
        const nextStatus = application.barangayVerificationStatus === "approved"
            ? APPLICATION_STATUSES.BARANGAY_APPROVED
            : APPLICATION_STATUSES.BARANGAY_REJECTED;
        changes.push({ _id: application._id, status: nextStatus });
    }

    for (const application of missingBarangay) {
        const owner = await User.findById(application.student).select("barangay").lean();
        if (owner?.barangay) changes.push({ _id: application._id, barangay: owner.barangay });
    }

    console.log(`Dry run: ${dryRun}. Planned changes: ${changes.length}`);
    for (const change of changes) console.log(change);
    if (!dryRun) {
        for (const change of changes) {
            if (change.status) await Application.updateOne({ _id: change._id, status: APPLICATION_STATUSES.SUBMITTED }, { $set: { status: change.status } });
            if (change.barangay) await Application.updateOne({ _id: change._id, barangay: null }, { $set: { barangay: change.barangay } });
        }
    }
    await mongoose.disconnect();
})().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exitCode = 1;
});