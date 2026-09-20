const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema({
    category: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },

    // Used by the Super Admin "Announcements" page.
    priority: {
        type: String,
        enum: ["Normal", "Important", "Urgent"],
        default: "Normal"
    },
    target: { type: String, trim: true, default: "All Users" },

    publishedAt: { type: Date, default: Date.now },
    published: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

announcementSchema.index({ publishedAt: -1 });

module.exports = mongoose.model("Announcement", announcementSchema);