const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");

// GridFS persists uploads in MongoDB so they survive Render redeploys and
// restarts. The bucket is created lazily after the database connects — this
// module is required at require time (routes, controllers, tests), which
// happens before `connectDB()` has run.
let bucket = null;

function getBucket() {
    if (!bucket && mongoose.connection && mongoose.connection.db) {
        bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: "uploads"
        });
    }
    return bucket;
}

// Every uploaded file gets a random, non-guessable stored name:
//   <uuidv4 without dashes><lowercased original extension>
// The human-readable name is kept separately in Document.originalName —
// only this hashed `filename` is stored in the DB and ever served.
function hashedFilename(originalname) {
    const extension = path.extname(originalname || "").toLowerCase();
    return `${crypto.randomUUID().replace(/-/g, "")}` + extension;
}

function isSafeGeneratedFilename(filename) {
    return typeof filename === "string" && /^[a-f0-9]{32}(?:\.[a-z0-9]{1,10})?$/.test(filename);
}

// ---- GridFS helpers -------------------------------------------------------

// Persist a multer `file` (whose bytes live in `file.buffer`) into GridFS.
// Returns a truthy { filename } on success, or false if the buffer is empty,
// the bucket is not connected, or the write failed.
async function persistUpload(file) {
    if (!file || !file.buffer || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
        return false;
    }
    const bucket = getBucket();
    if (!bucket) return false;
    try {
        const filename = isSafeGeneratedFilename(file.filename)
            ? file.filename
            : hashedFilename(file.originalname || "upload");
        file.filename = filename;
        return await new Promise((resolve, reject) => {
            const stream = bucket.openUploadStream(filename, {
                contentType: file.mimetype || undefined,
                metadata: { originalName: file.originalname || "" }
            });
            stream.end(file.buffer);
            stream.on("finish", () => resolve({ filename, originalName: file.originalname || "" }));
            stream.on("error", (error) => reject(error));
        });
    } catch {
        return false;
    }
}

// GridFS filenames are the stable application identifier; MongoDB generates
// an ObjectId for each GridFS file's `_id`, which is used only for deletion.
async function removeStoredFileByFilename(filename) {
    if (!isSafeGeneratedFilename(filename)) return;
    try {
        const bucket = getBucket();
        if (!bucket) {
            console.warn(`GridFS cleanup skipped because the database is unavailable: ${filename}`);
            return;
        }
        const files = await bucket.find({ filename }).toArray();
        if (files.length === 0) {
            console.info(`GridFS file already missing: ${filename}`);
            return;
        }
        await Promise.all(files.map((file) => bucket.delete(file._id)));
    } catch (error) {
        if (/File not found for id/i.test(error?.message || "")) {
            console.info(`GridFS file already missing: ${filename}`);
            return;
        }
        console.error(`GridFS cleanup failed for ${filename}:`, error);
    }
}

// Resolve the GridFS filename (not its Mongo-generated ObjectId) and stream
// the file. Used by the authenticated
// profile-photo and attendance-proof endpoints: the client addresses files by
// Document/proof id, the server resolves the hashed filename internally, and
// the real filename is never exposed to the client.
function openStoredDownload(filename) {
    const bucket = getBucket();
    if (!bucket || !isSafeGeneratedFilename(filename)) return undefined;
    try {
        return bucket.openDownloadStreamByName(filename);
    } catch {
        return undefined;
    }
}

// Read a GridFS file into an in-memory Buffer. Used by the AI extraction
// endpoint so bytes are never copied to server disk.
async function readStoredBuffer(filename) {
    const bucket = getBucket();
    if (!bucket || !isSafeGeneratedFilename(filename)) return undefined;
    try {
        const stream = bucket.openDownloadStreamByName(filename);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return Buffer.concat(chunks);
    } catch {
        return undefined;
    }
}

module.exports = {
    hashedFilename,
    isSafeGeneratedFilename,
    persistUpload,
    removeStoredFileByFilename,
    openStoredDownload,
    readStoredBuffer,
    getBucket
};
