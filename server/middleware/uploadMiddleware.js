const fs = require("fs");
const {
    upload,
    ALLOWED_IMAGE_TYPES,
    ALLOWED_DOCUMENT_TYPES,
    hasAllowedType,
    uploadTypeError
} = require("../config/storage");

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function actualMimeType(filename) {
    const descriptor = fs.openSync(filename, "r");
    const signature = Buffer.alloc(8);
    try {
        fs.readSync(descriptor, signature, 0, signature.length, 0);
    } finally {
        fs.closeSync(descriptor);
    }
    if (signature.length >= 8 && signature.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return "image/png";
    }
    if (signature.length >= 3 && signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff) {
        return "image/jpeg";
    }
    if (signature.length >= 4 && signature.subarray(0, 4).toString("ascii") === "%PDF") {
        return "application/pdf";
    }
    return null;
}

function validateStoredFile(typeMap, imageOnly) {
    return (req, _res, next) => {
        if (!req.file) return next();
        const filename = req.file.path;
        try {
            if ((req.file.size || 0) > MAX_UPLOAD_BYTES) {
                throw uploadTypeError(imageOnly ? "Image must be 5 MB or smaller." : "File must be 5 MB or smaller.");
            }
            if (!hasAllowedType(typeMap, req.file) || actualMimeType(filename) !== req.file.mimetype.toLowerCase()) {
                throw uploadTypeError(imageOnly
                    ? "The selected file is not a valid PNG or JPEG image."
                    : "The selected file is not a valid PNG, JPEG, or PDF document.");
            }
            return next();
        } catch (error) {
            try { fs.unlinkSync(filename); } catch { /* best effort */ }
            return next(error);
        }
    };
}

module.exports = {
    uploadSingleDocument: upload.single("file"),
    validateDocumentUpload: validateStoredFile(ALLOWED_DOCUMENT_TYPES, false),
    validateProfilePhotoUpload: validateStoredFile(ALLOWED_IMAGE_TYPES, true)
};