// ==========================================
// AI payload preparation — smaller requests, cheaper calls
// ==========================================
//
// What is sent to the vision model is capped here so one phone photo or one
// 40-page PDF cannot quadruple the cost of an analysis:
//   - Images are resized so the longest side is at most 1600 px and
//     re-encoded as JPEG. `sharp` is required lazily: when it is installed
//     the resize runs, otherwise the original bytes are sent as long as they
//     stay under MAX_IMAGE_BYTES.
//   - PDFs are sent whole only when the provider accepts them at that size.
//     The chat-completions provider has no "first N pages" option, so instead
//     of silently uploading a huge file we reject anything over
//     MAX_PDF_BYTES with a message City can act on.
//
// Failure here throws AiVisionError BEFORE any provider call, so an
// oversized file never costs money.

const crypto = require("crypto");
const { AiVisionError } = require("./aiVision");

const MAX_IMAGE_DIMENSION = 1600; // px, longest side
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // matches the upload cap
const MAX_PDF_BYTES = 4 * 1024 * 1024; // provider payload guard for PDFs
const JPEG_QUALITY = 80;

// Optional dependency: present in production when installed, absent otherwise.
let sharpModule;
function loadSharp() {
    if (sharpModule !== undefined) return sharpModule;
    try {
        sharpModule = require("sharp");
    } catch {
        sharpModule = null;
    }
    return sharpModule;
}

// sha-256 of the stored bytes — half of the extraction cache key
// (document id + this hash). Also used to detect a replaced upload.
function hashBuffer(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

function formatMb(bytes) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Turn a stored buffer into the { base64, mimeType } pair the provider gets,
// shrinking it on the way. Throws AiVisionError with a clear, actionable
// message when the file cannot be shrunk enough.
async function prepareDocumentForAi(buffer, mimeType) {
    const type = String(mimeType || "").toLowerCase();

    if (type === "application/pdf") {
        // No page-range support at this provider: cap the size instead of
        // uploading pages nobody asked for.
        if (buffer.length > MAX_PDF_BYTES) {
            throw new AiVisionError(
                `This PDF is ${formatMb(buffer.length)}; the AI service accepts PDFs up to ${formatMb(MAX_PDF_BYTES)}. Please upload only the pages with grades (for example the latest term) as a smaller PDF.`,
                413,
                "file_too_large"
            );
        }
        return { base64: buffer.toString("base64"), mimeType: "application/pdf" };
    }

    if (type !== "image/png" && type !== "image/jpeg") {
        throw new AiVisionError("Only PNG, JPEG, and PDF documents can be analyzed.", 400, "unsupported_type");
    }

    const sharp = loadSharp();
    if (sharp) {
        try {
            const resized = await sharp(buffer)
                .rotate() // respect EXIF orientation before measuring
                .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: "inside", withoutEnlargement: true })
                .jpeg({ quality: JPEG_QUALITY })
                .toBuffer();
            return { base64: resized.toString("base64"), mimeType: "image/jpeg" };
        } catch {
            // Corrupt or undecodable image: fall through and let the provider
            // (or the size check below) produce the user-facing failure.
        }
    }

    if (buffer.length > MAX_IMAGE_BYTES) {
        throw new AiVisionError(
            `This image is ${formatMb(buffer.length)}; the AI service accepts images up to ${formatMb(MAX_IMAGE_BYTES)}. Please upload a smaller photo of the grade document.`,
            413,
            "file_too_large"
        );
    }
    return { base64: buffer.toString("base64"), mimeType: type };
}

module.exports = {
    prepareDocumentForAi,
    hashBuffer,
    loadSharp,
    MAX_IMAGE_DIMENSION,
    MAX_IMAGE_BYTES,
    MAX_PDF_BYTES
};