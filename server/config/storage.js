const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const uploadDirectory = path.join(__dirname, "..", "uploads");
const profilePhotoDirectory = uploadDirectory;
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

function isSafeGeneratedFilename(filename) {
    return typeof filename === "string" && /^[a-f0-9]{32}(?:\.[a-z0-9]{1,10})?$/.test(filename);
}

function removeStoredFileByFilename(filename, directory = uploadDirectory) {
    try {
        if (!isSafeGeneratedFilename(filename)) return;
        fs.unlinkSync(path.join(directory, filename));
    } catch { /* best effort */ }
}

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

function uploadTypeError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function hasAllowedType(typeMap, file) {
    const mimeType = (file.mimetype || "").toLowerCase();
    const extension = path.extname(file.originalname || "").toLowerCase();
    return Boolean(typeMap.get(mimeType)?.has(extension));
}

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDirectory),
    filename: (_req, file, callback) => {
        callback(null, hashedFilename(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter: (_req, file, callback) => {
        if (!hasAllowedType(ALLOWED_DOCUMENT_TYPES, file)) {
            return callback(uploadTypeError("Only PNG, JPEG, and PDF documents are allowed."));
        }
        return callback(null, true);
    }
});

const profilePhotoUpload = multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter: (_req, file, callback) => {
        if (!hasAllowedType(ALLOWED_IMAGE_TYPES, file)) {
            return callback(uploadTypeError("Only PNG and JPEG images are allowed."));
        }
        return callback(null, true);
    }
});

module.exports = {
    upload,
    profilePhotoUpload,
    uploadDirectory,
    profilePhotoDirectory,
    hashedFilename,
    resolveStoredFile,
    removeStoredFile,
    removeStoredFileByFilename,
    isSafeGeneratedFilename,
    ALLOWED_IMAGE_TYPES,
    ALLOWED_DOCUMENT_TYPES,
    MAX_UPLOAD_BYTES,
    hasAllowedType,
    uploadTypeError
};