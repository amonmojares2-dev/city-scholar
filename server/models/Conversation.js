const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
    subject: { type: String, trim: true, default: "" },
    lastMessageAt: Date
}, { timestamps: true });

module.exports = mongoose.model("Conversation", conversationSchema);