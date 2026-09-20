const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true },
    readAt: Date
}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);