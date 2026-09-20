// ==========================================
// AUDIT LOG HELPER
//
// Fire-and-forget audit trail writer used by the privileged
// (Super Admin / City Office) actions. Never throws: a failed audit
// write must not break the request it describes.
// ==========================================
const AuditLog = require("../models/AuditLog");

async function logAudit({
    req = null,
    actionType,
    description,
    targetType = "",
    targetId = "",
    actor = null
}) {
    try {
        const user = actor || req?.user || null;

        await AuditLog.create({
            actor: user?._id || user?.id || null,
            actorName: user?.name || "System",
            actorEmail: user?.email || "",
            actorRole: user?.role || "",
            actionType,
            description,
            targetType,
            targetId: targetId ? String(targetId) : "",
            ip: req?.ip || req?.headers?.["x-forwarded-for"] || ""
        });
    } catch (error) {
        console.error("Audit log error:", error.message);
    }
}

module.exports = { logAudit };