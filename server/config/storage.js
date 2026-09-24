const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const uploadDirectory = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadDirectory, { recursive: true });

// Every uploaded file gets a random, non-guessable stored name:
//   <uuidv4 without dashes><lowercased original extension>
// The human-readable name is kept separately in Document.originalName —
// only this hashed `filename` is stored in the DB and ever served.
function hashedFilename(originalname) {
    const extension = path.extname(originalname || "").toLowerCase();
    return `${crypto.randomUUID().replace(/-/g, "")}${extension}`;
}

// Resolve the on-disk file for a Document record. New records carry only the
// opaque generated filename; raw absolute paths are never accepted or resolved.
function resolveStoredFile(document) {
    if (!document || typeof document.filename !== "string") return null;
    const filename = document.filename;
    // UUIDv4 without dashes + an optional sanitized extension. This also prevents
    // traversal, alternate path separators, and legacy raw-path values.
    if (!/^[a-f0-9]{32}(?:\.[a-z0-9]{1,10})?$/.test(filename)) return null;
    return path.join(uploadDirectory, filename);
}

// Best-effort removal of the on-disk file behind a Document record.
// Used when a document is replaced or its upload fails partway.
function removeStoredFile(document) {
    try {
        const full = resolveStoredFile(document);
        if (full) fs.unlinkSync(full);
    } catch { /* best effort */ }
}

function removeStoredFileByFilename(filename) {
    try {
        if (!filename || !/^[a-f0-9]{32}(?:\.[a-z0-9]{1,10})?$/.test(filename)) return;
        fs.unlinkSync(path.join(uploadDirectory, filename));
    } catch { /* best effort */ }
}

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDirectory),
    filename: (_req, file, callback) => {
        callback(null, hashedFilename(file.originalname));
    }
});

const upload = multer({
    storage,
    // Cap slightly above the controller's 5 MB document limit so oversized
    // files hit the controller's friendly 400 message, not a raw 500.
    limits: { fileSize: 6 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
        // Students upload scanned documents as images only: JPG and PNG.
        callback(null, ["image/jpeg", "image/png"].includes((file.mimetype || "").toLowerCase()));
    }
});

module.exports = { upload, uploadDirectory, hashedFilename, resolveStoredFile, removeStoredFile, removeStoredFileByFilename };