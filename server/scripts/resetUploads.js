require("dotenv").config();

const mongoose = require("mongoose");
const Document = require("../models/Document");
const { getBucket } = require("../config/storage");

const confirmed = process.argv.includes("--confirm");

async function main() {
    if (!confirmed) {
        console.error("Refusing to reset uploads without --confirm.");
        console.error(
            "This command permanently deletes all files in the GridFS uploads bucket and all Document records."
        );
        process.exitCode = 1;
        return;
    }

    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is required to reset Document records.");
    }

    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });

    // Force the lazy GridFS bucket to initialize against the connected datastore.
    const bucket = getBucket();
    let filesRemoved = 0;
    if (bucket) {
        const files = await new Promise((resolve, reject) => {
            bucket.list({}, { batchSize: 0 }).toArray((err, files) => (err ? reject(err) : resolve(files)));
        });
        filesRemoved = files.length;
        for (const file of files) {
            await new Promise((resolve, reject) => {
                bucket.delete(file._id, (err) => (err ? reject(err) : resolve()));
            });
        }
        console.log(`Removed ${filesRemoved} upload file(s) from the GridFS bucket.`);
    }

    const result = await Document.deleteMany({});
    console.log(`Removed ${result.deletedCount} Document record(s).`);
    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error(`Upload reset failed: ${error.message}`);
    if (mongoose.connection.readyState) await mongoose.disconnect();
    process.exitCode = 1;
});
