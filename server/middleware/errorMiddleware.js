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

const errorHandler = (error, _req, res, _next) => {
    console.error(error);

    if (error.name === "ValidationError") {
        return res.status(400).json({
            success: false,
            message: friendlyValidationError(error)
        });
    }

    const status = error.statusCode || 500;
    res.status(status).json({
        success: false,
        message: status === 500 ? "Internal server error" : (error.message || "An error occurred.")
    });
};

module.exports = { notFound, errorHandler };