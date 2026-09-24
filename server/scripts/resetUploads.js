require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Document = require("../models/Document");
const { uploadDirectory } = require("../config/storage");

const confirmed = process.argv.includes("--confirm");

async function main() {
    if (!confirmed) {
        console.error("Refusing to reset uploads without --confirm.");
        console.error("This command permanently deletes all files in server/uploads and all Document records.");
        process.exitCode = 1;
        return;
    }

    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is required to reset Document records.");
    }

    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });

    let filesRemoved = 0;
    if (fs.existsSync(uploadDirectory)) {
        for (const entry of fs.readdirSync(uploadDirectory, { withFileTypes: true })) {
            const entryPath = path.join(uploadDirectory, entry.name);
            if (entry.isFile()) {
                fs.unlinkSync(entryPath);
                filesRemoved += 1;
            }
        }
    }

    const result = await Document.deleteMany({});
    console.log(`Removed ${filesRemoved} upload file(s) and ${result.deletedCount} Document record(s).`);
    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error(`Upload reset failed: ${error.message}`);
    if (mongoose.connection.readyState) await mongoose.disconnect();
    process.exitCode = 1;
});
