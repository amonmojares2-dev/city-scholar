const mongoose = require("mongoose");

// Immutable trail of privileged actions — powers the Super Admin
// "Audit Log" page and the "System Activity" feed on the dashboard.
const auditLogSchema = new mongoose.Schema({
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actorName: { type: String, trim: true, default: "System" },
    actorEmail: { type: String, trim: true, lowercase: true, default: "" },
    actorRole: { type: String, trim: true, default: "" },
    actionType: {
        type: String,
        enum: [
            "Login",
            "Logout",
            "Account Approval",
            "Account Rejection",
            "Account Change",
            "User Suspension",
            "User Reactivation",
            "Password Reset",
            "Reassignment",
            "Config Change",
            "Data Change",
            "Announcement",
            "Report Export",
            "Archive"
        ],
        required: true
    },
    description: { type: String, trim: true, required: true },
    targetType: { type: String, trim: true, default: "" },
    targetId: { type: String, trim: true, default: "" },
    ip: { type: String, trim: true, default: "" }
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);