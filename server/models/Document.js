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

    // Per-document review status (see utils/documentReview.js):
    //   pending  – uploaded, no reviewer decision yet (default)
    //   approved – the City Office accepted this file (canonical value)
    //   rejected – the file is not acceptable; the student replaces it
    // "verified" is the OLDER label for the same state as "approved". Rows
    // created before the review gate existed still carry it, so both values
    // stay in the enum and both count as approved. New decisions are always
    // written as "approved" — no migration of historical rows is needed.
    status: { type: String, enum: ["pending", "verified", "approved", "rejected"], default: "pending" },
    remarks: { type: String, default: "" },

    // Reviewer trail for the single-document decision, plus the moment the
    // document was flagged as needing a replacement.
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null }
}, { timestamps: true });

// One stored file per document slot and portal flow. This supports replacement
// through findOneAndUpdate/upsert and prevents concurrent first uploads from
// creating duplicate rows.
documentSchema.index(
    { application: 1, context: 1, type: 1 },
    { unique: true, name: "application_context_type_unique" }
);

module.exports = mongoose.model("Document", documentSchema);