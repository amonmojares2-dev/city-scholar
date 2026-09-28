const mongoose = require("mongoose");
const Announcement = require("../models/Announcement");
const Barangay = require("../models/Barangay");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { logAudit } = require("../utils/audit");
const {
    SUPER_ADMIN_ROLES,
    CITY_ADMIN_ROLES,
    BARANGAY_ADMIN_ROLES
} = require("../utils/validation");

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The only audiences the portals support. "City Office Staff Only" and
// "Specific School" were removed on purpose — nothing else is accepted on
// write, so a stale value can never be created again.
const AUDIENCES = ["All Users", "Students Only", "Barangay Officials Only", "Specific Barangay"];

const STUDENT_ROLE = "student";
const ALL_BARANGAY_ROLES = [...BARANGAY_ADMIN_ROLES];
// City Office + Super Admin manage every announcement, so they always see
// the full list regardless of audience.
const STAFF_ROLES = [...CITY_ADMIN_ROLES, ...SUPER_ADMIN_ROLES];

function formatLongDay(value) {
    const date = new Date(value || 0);

    if (!value || Number.isNaN(date.getTime())) return "";

    return `${MONTHS_LONG[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// Keeps the original document fields (_id, body, publishedAt) that the
// City Office page already relies on, and adds the display fields used
// by the Super Admin page.
function serializeAnnouncement(announcement) {
    return {
        _id: String(announcement._id),
        id: String(announcement._id),
        category: announcement.category,
        title: announcement.title,
        body: announcement.body,
        message: announcement.body,
        target: announcement.target || "All Users",
        targetBarangay: announcement.targetBarangay || "",
        priority: announcement.priority || "Normal",
        published: announcement.published,
        publishedAt: announcement.publishedAt,
        createdAt: announcement.createdAt,
        createdBy: announcement.createdBy ? String(announcement.createdBy) : null,
        dateSent: formatLongDay(announcement.publishedAt || announcement.createdAt)
    };
}

// ==========================================
// BACKEND VISIBILITY FILTER
//
// Filtering happens in the database query, not in the UI:
//   Students           -> All Users + Students Only + Specific Barangay
//                         matching their own barangay
//   Barangay staff     -> All Users + Barangay Officials Only +
//                         Specific Barangay matching their assigned barangay
//   City / Super Admin -> everything (they create, edit and delete all)
// ==========================================
function visibleAnnouncementsFilter(user) {
    if (!user) return { _id: null };
    if (STAFF_ROLES.includes(user.role)) return {};

    // Same value type as User.barangay (the populated Barangay document from
    // the auth middleware) — an ObjectId, never a name string.
    const ownBarangay = user.barangay?._id || user.barangay || null;
    const ownRoleAudience = user.role === STUDENT_ROLE ? "Students Only" : "Barangay Officials Only";

    const clauses = [
        { target: "All Users" },
        { target: ownRoleAudience }
    ];
    if (ownBarangay) {
        clauses.push({ target: "Specific Barangay", targetBarangayId: ownBarangay });
    }

    return { $or: clauses };
}

// Resolves the Specific Barangay target to the canonical Barangay record so
// the stored filter value (targetBarangayId) is the exact ObjectId that user
// records carry. Returns null when the barangay cannot be resolved.
async function resolveTargetBarangay(audience, value) {
    if (audience !== "Specific Barangay") return { name: "", id: null };

    const raw = String(value || "").trim();
    if (!raw) return null;

    let barangay = null;
    if (mongoose.isValidObjectId(raw)) {
        barangay = await Barangay.findById(raw);
    }
    if (!barangay) {
        barangay = await Barangay.findOne({ name: raw });
    }
    if (!barangay) {
        const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        barangay = await Barangay.findOne({ name: { $regex: `^${escaped}$`, $options: "i" } });
    }
    if (!barangay) return null;

    return { name: barangay.name, id: barangay._id };
}

// Where a notification should take each role when an announcement lands.
function announcementLinkForRole(role) {
    if (role === STUDENT_ROLE) return "/student/announcements";
    if (ALL_BARANGAY_ROLES.includes(role)) return "/barangay/announcements";
    if (CITY_ADMIN_ROLES.includes(role)) return "/city/announcements";
    return "/superadmin/announcements";
}

// Notifies every user inside the announcement's audience. Best effort: a
// notification failure must never undo a successful announcement.
async function notifyAudience({ audience, targetBarangayId, title, message }) {
    try {
        const filter = { archived: { $ne: true } };

        if (audience === "Students Only") {
            filter.role = STUDENT_ROLE;
        } else if (audience === "Barangay Officials Only") {
            filter.role = { $in: ALL_BARANGAY_ROLES };
        } else if (audience === "Specific Barangay") {
            if (!targetBarangayId) return 0;
            // Barangay admins AND students assigned to that barangay.
            filter.barangay = targetBarangayId;
            filter.role = { $in: [STUDENT_ROLE, ...ALL_BARANGAY_ROLES] };
        }
        // "All Users" -> no extra clause: every role is included.

        const recipients = await User.find(filter).select("_id role").lean();
        if (!recipients.length) return 0;

        const text = String(message || "").slice(0, 500);
        await Notification.insertMany(recipients.map((recipient) => ({
            recipient: recipient._id,
            title,
            message: text,
            type: "announcement",
            link: announcementLinkForRole(recipient.role)
        })));

        return recipients.length;
    } catch (error) {
        console.error("Announcement notification error:", error.message);
        return 0;
    }
}

const listAnnouncements = async(req, res, next) => {
    try {
        // Backend filtering: each role only receives what it may see.
        const filter = { published: true, ...visibleAnnouncementsFilter(req.user) };
        const announcements = await Announcement.find(filter).sort({ publishedAt: -1 });

        res.json({
            success: true,
            announcements: announcements.map(serializeAnnouncement)
        });
    } catch (error) { next(error); }
};

const createAnnouncement = async(req, res, next) => {
    try {
        const {
            category = "General",
            title,
            body,
            published = true,
            priority = "Normal",
            target = "All Users",
            targetBarangay
        } = req.body || {};

        if (!title || !body) {
            return res.status(400).json({ success: false, message: "Title and body are required" });
        }
        if (!AUDIENCES.includes(target)) {
            return res.status(400).json({
                success: false,
                message: `Audience must be one of: ${AUDIENCES.join(", ")}`
            });
        }

        const barangay = await resolveTargetBarangay(target, targetBarangay);
        if (target === "Specific Barangay" && !barangay) {
            return res.status(400).json({ success: false, message: "Please choose a valid barangay." });
        }

        const announcement = await Announcement.create({
            category,
            title,
            body,
            published,
            priority,
            target,
            targetBarangay: barangay.name,
            targetBarangayId: barangay.id,
            publishedAt: new Date(),
            createdBy: req.user?.id || null
        });

        // Trigger: a new announcement notifies every user in its audience.
        await notifyAudience({
            audience: target,
            targetBarangayId: barangay.id,
            title,
            message: body
        });

        await logAudit({
            req,
            actionType: "Announcement",
            description: `Published announcement "${title}" to ${target}${barangay.name ? ` (${barangay.name})` : ""}`,
            targetType: "Announcement",
            targetId: announcement._id
        });

        res.status(201).json({ success: true, announcement: serializeAnnouncement(announcement) });
    } catch (error) { next(error); }
};

const updateAnnouncement = async(req, res, next) => {
    try {
        const { category, title, body, published, priority, target, targetBarangay } = req.body || {};

        const announcement = await Announcement.findById(req.params.id);
        if (!announcement) return res.status(404).json({ success: false, message: "Announcement not found" });

        const nextAudience = target !== undefined ? target : announcement.target;
        if (!AUDIENCES.includes(nextAudience)) {
            return res.status(400).json({
                success: false,
                message: `Audience must be one of: ${AUDIENCES.join(", ")}`
            });
        }
        if (title !== undefined && !title) {
            return res.status(400).json({ success: false, message: "Title is required" });
        }
        if (body !== undefined && !body) {
            return res.status(400).json({ success: false, message: "Body is required" });
        }

        const nextBarangayValue = targetBarangay !== undefined ? targetBarangay : announcement.targetBarangay;
        const barangay = await resolveTargetBarangay(nextAudience, nextBarangayValue);
        if (nextAudience === "Specific Barangay" && !barangay) {
            return res.status(400).json({ success: false, message: "Please choose a valid barangay." });
        }

        // Only touch keys the caller actually sent.
        const updates = {};
        if (category !== undefined) updates.category = category;
        if (title !== undefined) updates.title = title;
        if (body !== undefined) updates.body = body;
        if (published !== undefined) updates.published = published;
        if (priority !== undefined) updates.priority = priority;
        updates.target = nextAudience;
        updates.targetBarangay = barangay.name;
        updates.targetBarangayId = barangay.id;

        Object.assign(announcement, updates);
        await announcement.save();

        await logAudit({
            req,
            actionType: "Announcement",
            description: `Updated announcement "${announcement.title}" (audience: ${nextAudience}${barangay.name ? ` — ${barangay.name}` : ""})`,
            targetType: "Announcement",
            targetId: announcement._id
        });

        res.json({ success: true, announcement: serializeAnnouncement(announcement) });
    } catch (error) { next(error); }
};

const deleteAnnouncement = async(req, res, next) => {
    try {
        const announcement = await Announcement.findByIdAndDelete(req.params.id);
        if (!announcement) return res.status(404).json({ success: false, message: "Announcement not found" });

        await logAudit({
            req,
            actionType: "Announcement",
            description: `Deleted announcement "${announcement.title}"`,
            targetType: "Announcement",
            targetId: announcement._id
        });

        res.json({ success: true, announcement: serializeAnnouncement(announcement) });
    } catch (error) { next(error); }
};

module.exports = { listAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement };