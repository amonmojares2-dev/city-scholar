// ==========================================================
// One-time migration: "submitted" -> "renewal" for renewal submissions
// ==========================================================
// Root cause of the City Renewal page showing no renewals (academic-monitoring
// issue #…): the student submit flow always stored applications as
// status: "submitted", while City readers (CityRenewals, the review guard,
// the staff queue) expect status: "renewal" for renewals.
//
// This script finds existing submissions made by scholars whose
// registrationType (User.scholarType) is "existing_scholar" and moves those
// rows to "renewal". It is DRY-RUN by default: it prints the IDs it would
// change and touches nothing. Pass --apply to write.
//
// Run:
//   node server/scripts/migrateRenewalStatus.js            # dry run
//   node server/scripts/migrateRenewalStatus.js --apply     # write (careful!)
// Atlas example:
//   MONGO_URI="mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority" \
//     node server/scripts/migrateRenewalStatus.js --apply
// ==========================================================

const mongoose = require("mongoose");
const Application = require("../models/Application");

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    (args.includes("--uri") ? args[args.indexOf("--uri") + 1] : null);

  if (!uri) {
    console.error("MONGO_URI (or MONGODB_URI) is required. Retry with it set.");
    process.exit(1);
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    tls: true // Atlas and other cloud MongoDBs require TLS.
  });
  console.log(`MongoDB connected: ${mongoose.connection.host}`);

  // Renewal-identifying condition (identical to the submit flow in
  // studentApplicationController): an application is a renewal when the
  // owning scholar's scholarType is "existing_scholar".
  const pipeline = [
    {
      $lookup: {
        from: "users",
        localField: "student",
        foreignField: "_id",
        as: "student"
      }
    },
    { $unwind: "$student" },
    {
      $match: {
        "student.scholarType": "existing_scholar",
        status: "submitted"
      }
    }
  ];

  const rows = await Application.aggregate(pipeline);
  const ids = rows.map((row) => row._id.toString());

  if (!apply) {
    console.log("DRY RUN — nothing was changed.");
    console.log(`Would move ${ids.length} submitted application(s) by existing scholars to "renewal":`);
    for (const id of ids) console.log("  " + id);
    await mongoose.disconnect();
    return;
  }

  const result = await Application.updateMany(
    { _id: { $in: ids }, status: "submitted" },
    { $set: { status: "renewal" } }
  );

  console.log(`WRITTEN: moved ${result.modifiedCount} of ${ids.length} application(s) to status "renewal".`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
