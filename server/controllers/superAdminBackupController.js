const {
    BackupError,
    createBackup,
    deleteBackup,
    listBackups,
    restoreBackup
} = require("../services/superAdminBackupService");
const { logAudit } = require("../utils/audit");

function reportError(res, error, action) {
    console.error(`Super Admin ${action} error:`, error.message);
    const status = error instanceof BackupError ? error.status : 500;
    const message = status === 500 && !(error instanceof BackupError)
        ? `Unable to ${action.toLowerCase()}.`
        : error.message;
    return res.status(status).json({ success: false, message });
}

async function list(req, res) {
    try {
        const backups = await listBackups();
        return res.json({ success: true, backups, automatedSchedule: null });
    } catch (error) {
        return reportError(res, error, "load backups");
    }
}

async function create(req, res) {
    const { type, notes = "" } = req.body || {};
    if (!["full", "incremental"].includes(type)) {
        return res.status(400).json({ success: false, message: "Choose a valid backup type." });
    }
    if (typeof notes !== "string" || notes.length > 500) {
        return res.status(400).json({ success: false, message: "Backup notes must be 500 characters or fewer." });
    }

    try {
        const backup = await createBackup({
            type,
            notes: notes.trim(),
            createdBy: req.user?.name || req.user?.email || "Super Administrator"
        });
        await logAudit({
            req,
            actionType: "Create",
            description: `Created ${backup.type} backup "${backup.name}"`,
            targetType: "Backup",
            targetId: backup.id
        });
        return res.status(201).json({ success: true, backup });
    } catch (error) {
        return reportError(res, error, "create backup");
    }
}

async function remove(req, res) {
    try {
        const backup = await deleteBackup(req.params.id);
        await logAudit({
            req,
            actionType: "Delete",
            description: `Deleted backup "${backup.name}"`,
            targetType: "Backup",
            targetId: backup.id
        });
        return res.json({ success: true });
    } catch (error) {
        return reportError(res, error, "delete backup");
    }
}

async function restore(req, res) {
    try {
        const result = await restoreBackup(
            req.params.id,
            req.body?.confirmation,
            req.user?.name || req.user?.email || "Super Administrator"
        );
        await logAudit({
            req,
            actionType: "Update",
            description: `Restored database from backup "${result.restored.name}"; safety backup "${result.safetyBackup.name}" created`,
            targetType: "Backup",
            targetId: result.restored.id
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        return reportError(res, error, "restore backup");
    }
}

module.exports = { list, create, remove, restore };
