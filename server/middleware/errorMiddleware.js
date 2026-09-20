const notFound = (req, res) => {
    res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
};

const errorHandler = (error, _req, res, _next) => {
    console.error(error);
    const status = error.statusCode || (error.name === "ValidationError" ? 400 : 500);
    res.status(status).json({
        success: false,
        message: status === 500 ? "Internal server error" : error.message
    });
};

module.exports = { notFound, errorHandler };