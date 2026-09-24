const fs = require("fs");
const { removeStoredFileByFilename } = require("../config/storage");
const multer = require("multer");

function fieldErrorsFromMongoose(error) {
  const errors = {};
  for (const [path, fieldError] of Object.entries(error.errors || {})) {
    const label = path.split('.').pop();
    errors[label] = fieldError.kind === 'required'
      ? `${label} is required.`
      : `${label} ${fieldError.message || 'is invalid.'}`;
  }
  return errors;
}

const notFound = (req, res) => {
    res.status(404).json({ success: false, message: `Route not found:
    ${req.method} ${req.originalUrl}` });
};

// Mongoose ValidationError messages look like
//   "Application validation failed: school: Path `school` is required., program: Path `program` is required."
// That is useful for developers but unreadable to end users. This helper
// turns each failing path into a human-friendly sentence.
function friendlyValidationError(error) {
    if (!error.errors) return "A validation error occurred. Please check your input.";

    const parts = Object.values(error.errors).map((fieldError) => {
        const field = fieldError.properties?.path || fieldError.path || "field";
        const label = field.charAt(0).toUpperCase() + field.slice(1);

        if (fieldError.kind === "required") {
            return `${label} is required.`;
        }
        if (fieldError.kind === "enum") {
            return `${label} has an invalid value.`;
        }
        return `${label} ${fieldError.message || "is invalid."}`;
    });

    // Deduplicate and join.
    const unique = [...new Set(parts)];
    return unique.join(" ");
}

const errorHandler = (error, req, res, _next) => {
    console.error(error);

    if (req.file?.filename) {
        removeStoredFileByFilename(req.file.filename);
        try { if (req.file.path) fs.unlinkSync(req.file.path); } catch { /* already removed */ }
    }

    const messageByCode = {
        LIMIT_FILE_SIZE: "File must be 5 MB or smaller.",
        LIMIT_FILE_COUNT: "Please upload one file at a time.",
        LIMIT_UNEXPECTED_FILE: "Use the file field to upload one document."
    };
    if (error instanceof multer.MulterError) {
        return res.status(400).json({
            success: false,
            message: messageByCode[error.code] || "Unable to upload this file. Please try again."
        });
    }

    if (error.name === "ValidationError") {
        const errors = fieldErrorsFromMongoose(error);
        return res.status(400).json({
            success: false,
            message: friendlyValidationError(error),
            errors
        });
    }

    if (error.name === "CastError") {
        return res.status(400).json({
            success: false,
            message: "One or more fields contain an invalid value.",
            errors: { [error.path]: "Invalid value." }
        });
    }

    if (error.code === 11000) {
        return res.status(409).json({
            success: false,
            message: "This record already exists. Please refresh and try again."
        });
    }

    const status = error.statusCode || 500;
    res.status(status).json({
        success: false,
        message: status === 500 ? "Internal server error" : (error.message || "An error occurred.")
    });
};

module.exports = { notFound, errorHandler };