const mongoose = require("mongoose");

// IMPORTANT — STORAGE LIMITATION (launch blocker, do not ignore):
// Documents are stored on the server's local disk (server/uploads/) via multer.
// This WILL be lost on redeploy to Render, Railway, Vercel, Fly, or any
// ephemeral-filesystem host. Before launching, migrate to Cloudinary / S3 /
// another persistent object store and update server/config/storage.js + any
// public-file serving logic in server.js.
//
// context distinguishes which portal flow created the document:
//   "application"  → uploaded from the Application page (default, backward-compatible)
//   "renewal"      → uploaded from the Renewal page
//
// Every new upload stores only the random generated filename in `filename`.
// `originalName` is the separate human-readable label used by the UI. The
// dedicated GET /api/documents/:id/file endpoint resolves the opaque filename
// internally; the server directory structure is never exposed.
// The stored filename is the only file locator persisted in MongoDB.
// The dedicated endpoint resolves this opaque name internally.
const documentSchema = new mongoose.Schema({
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    context: { type: String, enum: ["application", "renewal"], default: "application" },
    type: { type: String, required: true, trim: true },
    originalName: { type: String, required: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
    remarks: { type: String, default: "" }
}, { timestamps: true });

module.exports = mongoose.model("Document", documentSchema);