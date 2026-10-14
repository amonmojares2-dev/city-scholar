const {
    ALLOWED_IMAGE_TYPES,
    ALLOWED_DOCUMENT_TYPES,
    hasAllowedType,
    uploadTypeError,
    MAX_UPLOAD_BYTES,
    upload
} = require("../config/storage");

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
    uploadSingleDocument: upload.single("file"),
    validateDocumentUpload: validateStoredFile(ALLOWED_DOCUMENT_TYPES, false),
    validateProfilePhotoUpload: validateStoredFile(ALLOWED_IMAGE_TYPES, true),
    actualMimeTypeFromBuffer
};
