const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    type: { type: String, enum: ["application", "document", "message", "announcement", "system"], default: "system" },
    readAt: Date,
    link: String
}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);