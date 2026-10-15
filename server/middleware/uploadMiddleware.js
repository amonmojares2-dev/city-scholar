const path = require("path");
const multer = require("multer");
const { hashedFilename } = require("../config/storage");

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([
    ["image/png", new Set([".png"])],
    ["image/jpeg", new Set([".jpg", ".jpeg"])]
]);
const ALLOWED_DOCUMENT_TYPES = new Map([
    ...ALLOWED_IMAGE_TYPES,
    ["application/pdf", new Set([".pdf"])]
]);

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

const multerUploadOptions = [];

function createUploadMiddleware(typeMap, rejectedTypeMessage) {
    const storage = multer.memoryStorage();
    const options = {
        storage,
        limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
        fileFilter: (_req, file, callback) => {
            if (!hasAllowedType(typeMap, file)) {
                return callback(uploadTypeError(rejectedTypeMessage));
            }
            return callback(null, true);
        }
    };
    multerUploadOptions.push(options);

    const parseSingleFile = multer(options).single("file");

    return (req, res, next) => parseSingleFile(req, res, (error) => {
        if (error) return next(error);
        if (req.file) req.file.filename = hashedFilename(req.file.originalname);
        return next();
    });
}

const uploadSingleDocument = createUploadMiddleware(
    ALLOWED_DOCUMENT_TYPES,
    "Only PNG, JPEG, and PDF documents are allowed."
);
const profilePhotoUpload = createUploadMiddleware(
    ALLOWED_IMAGE_TYPES,
    "Only PNG and JPEG images are allowed."
);

// Read the real file type from the first bytes (magic numbers). With GridFS the
// bytes never touch disk — multer keeps them in req.file.buffer — so the
// signature is read straight from that buffer. This is what rejects a renamed
// .exe or a spoofed Content-Type before the file is ever persisted.
function actualMimeTypeFromBuffer(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 3) return null;
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return "image/png";
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return "image/jpeg";
    }
    if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF") {
        return "application/pdf";
    }
    return null;
}

function validateStoredFile(typeMap, imageOnly) {
    return (req, _res, next) => {
        if (!req.file) return next();
        try {
            if ((req.file.size || 0) > MAX_UPLOAD_BYTES) {
                throw uploadTypeError(imageOnly ? "Image must be 5 MB or smaller." : "File must be 5 MB or smaller.");
            }
            if (!Buffer.isBuffer(req.file.buffer) || req.file.buffer.length === 0) {
                throw uploadTypeError(imageOnly
                    ? "The selected file is not a valid PNG or JPEG image."
                    : "The selected file is not a valid PNG, JPEG, or PDF document.");
            }
            if (!hasAllowedType(typeMap, req.file) || actualMimeTypeFromBuffer(req.file.buffer) !== req.file.mimetype.toLowerCase()) {
                throw uploadTypeError(imageOnly
                    ? "The selected file is not a valid PNG or JPEG image."
                    : "The selected file is not a valid PNG, JPEG, or PDF document.");
            }
            return next();
        } catch (error) {
            // Nothing was written to disk or GridFS yet, so there is nothing to
            // clean up; the in-memory buffer is simply dropped.
            return next(error);
        }
    };
}

module.exports = {
    uploadSingleDocument,
    profilePhotoUpload,
    multerUploadOptions,
    validateDocumentUpload: validateStoredFile(ALLOWED_DOCUMENT_TYPES, false),
    validateProfilePhotoUpload: validateStoredFile(ALLOWED_IMAGE_TYPES, true),
    actualMimeTypeFromBuffer
};
