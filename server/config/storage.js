const fs = require("fs");
const path = require("path");
const multer = require("multer");

const uploadDirectory = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDirectory),
    filename: (_req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const safeName = path.basename(file.originalname, extension).replace(/[^a-z0-9]/gi, "-").toLowerCase();
        callback(null, `${Date.now()}-${safeName}${extension}`);
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

module.exports = { upload, uploadDirectory };