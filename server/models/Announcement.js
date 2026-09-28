const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema({
    category: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    // "content" of the announcement (the body text shown by every portal).
    body: { type: String, required: true, trim: true },

    // Used by the Super Admin "Announcements" page.
    priority: {
        type: String,
        enum: ["Normal", "Important", "Urgent"],
        default: "Normal"
    },

    // Audience type. Only these four values are supported:
    //   "All Users" | "Students Only" | "Barangay Officials Only" |
    //   "Specific Barangay"
    // ("City Office Staff Only" and "Specific School" were removed.)
    target: { type: String, trim: true, default: "All Users" },

    // Specific Barangay audience target. The name is kept for display, but
    // audience filtering uses targetBarangayId — the exact same value type
    // stored on User.barangay / Application.barangay (a Barangay ObjectId),
    // so an ID is never compared against a name.
    targetBarangay: { type: String, trim: true, default: "" },
    targetBarangayId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Barangay",
        default: null
    },

    publishedAt: { type: Date, default: Date.now },
    published: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

announcementSchema.index({ publishedAt: -1 });
announcementSchema.index({ target: 1, targetBarangayId: 1 });

module.exports = mongoose.model("Announcement", announcementSchema);