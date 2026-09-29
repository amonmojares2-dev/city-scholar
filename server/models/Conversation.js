const mongoose = require("mongoose");

// A two-way thread between two accounts. `participants` holds the account ids;
// the participants' ROLES are deliberately not stored here — the allowed role
// pairs are re-checked from the accounts on every request
// (see utils/messaging.js), so a role change or a policy change can never be
// bypassed through a stale row.
const conversationSchema = new mongoose.Schema({
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
    subject: { type: String, trim: true, default: "" },
    lastMessageAt: Date
}, { timestamps: true });

conversationSchema.index({ participants: 1, lastMessageAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
