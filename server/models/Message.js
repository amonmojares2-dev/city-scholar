const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // The account this message was addressed to. Stored explicitly instead of
    // "everyone else in the conversation" so the recipient is always known.
    // Default null keeps rows written before this field existed readable —
    // unread counts fall back to "not sent by me" for those.
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // Role of the sender at send time, so the conversation list and the audit
    // trail never depend on the account's current role.
    senderRole: { type: String, trim: true, default: "" },
    body: { type: String, required: true, trim: true },
    // Read / unread: null (or absent) = unread, a date = the moment the
    // recipient opened the conversation.
    readAt: Date
}, { timestamps: true });

messageSchema.index({ conversation: 1, createdAt: 1 });
messageSchema.index({ recipient: 1, readAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
