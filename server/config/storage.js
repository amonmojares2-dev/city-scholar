const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
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

// Main upload directory no longer exists — bytes live in MongoDB.
// Kept only so code that references the old name keeps existing; GridFS
// operations do not touch the local disk at all.
const uploadDirectory = path.join(__dirname, "..", "uploads");

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Map([
    ["image/png", new Set([".png"])],
    ["image/jpeg", new Set([".jpg", ".jpeg"])]
]);

// PDFs remain valid for document uploads because the existing Documents and
// Renewal pages already accept them. Profile photos use ALLOWED_IMAGE_TYPES only.
const ALLOWED_DOCUMENT_TYPES = new Map([
    ...ALLOWED_IMAGE_TYPES,
    ["application/pdf", new Set([".pdf"])]
]);

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

function hasAllowedType(typeMap, file) {
    const mimeType = (file.mimetype || "").toLowerCase();
    const extension = path.extname(file.originalname || "").toLowerCase();
    return Boolean(typeMap.get(mimeType)?.has(extension));
}

function uploadTypeError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

const upload = multer({
    storage: {
        storage: multer.memoryStorage(),
        filename: (_req, file, callback) => {
            callback(null, hashedFilename(file.originalname));
        }
    },
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter: (_req, file, callback) => {
        if (!hasAllowedType(ALLOWED_DOCUMENT_TYPES, file)) {
            return callback(uploadTypeError("Only PNG, JPEG, and PDF documents are allowed."));
        }
        return callback(null, true);
    }
});

const profilePhotoUpload = multer({
    storage: {
        storage: multer.memoryStorage(),
        filename: (_req, file, callback) => {
            callback(null, hashedFilename(file.originalname));
        }
    },
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter: (_req, file, callback) => {
        if (!hasAllowedType(ALLOWED_IMAGE_TYPES, file)) {
            return callback(uploadTypeError("Only PNG and JPEG images are allowed."));
        }
        return callback(null, true);
    }
});

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
        const filename = hashedFilename(file.originalname || "upload");
        return new Promise((resolve, reject) => {
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

// Delete the GridFS file identified by the hashed `filename`.
function removeStoredFileByFilename(filename) {
    const bucket = getBucket();
    if (!bucket || !isSafeGeneratedFilename(filename)) return;
    try {
        bucket.delete(filename);
    } catch { /* best effort — already removed or never existed */ }
}

// Best-effort removal of the file referenced by a Document/GradeRecord row.
function removeStoredFile(document) {
    if (!document || !document.filename) return;
    removeStoredFileByFilename(document.filename);
}

// Stream the GridFS file for a hashed `filename`. Used by the authenticated
// profile-photo and attendance-proof endpoints: the client addresses files by
// Document/proof id, the server resolves the hashed filename internally, and
// the real filename is never exposed to the client.
function openStoredDownload(filename) {
    const bucket = getBucket();
    if (!bucket || !isSafeGeneratedFilename(filename)) return undefined;
    try {
        return bucket.openDownloadStream(filename);
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
        const stream = bucket.openDownloadStream(filename);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return Buffer.concat(chunks);
    } catch {
        return undefined;
    }
}

module.exports = {
    upload,
    profilePhotoUpload,
    MAX_UPLOAD_BYTES,
    ALLOWED_IMAGE_TYPES,
    ALLOWED_DOCUMENT_TYPES,
    hashedFilename,
    isSafeGeneratedFilename,
    hasAllowedType,
    uploadTypeError,
    persistUpload,
    removeStoredFileByFilename,
    removeStoredFile,
    openStoredDownload,
    readStoredBuffer,
    getBucket
};
