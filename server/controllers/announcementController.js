const Announcement = require("../models/Announcement");
const { logAudit } = require("../utils/audit");

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
        priority: announcement.priority || "Normal",
        published: announcement.published,
        publishedAt: announcement.publishedAt,
        createdAt: announcement.createdAt,
        dateSent: formatLongDay(announcement.publishedAt || announcement.createdAt)
    };
}

const listAnnouncements = async(_req, res, next) => {
    try {
        const announcements = await Announcement.find({ published: true }).sort({ publishedAt: -1 });

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
            target = "All Users"
        } = req.body || {};

        if (!title || !body) {
            return res.status(400).json({ success: false, message: "Title and body are required" });
        }

        const announcement = await Announcement.create({
            category,
            title,
            body,
            published,
            priority,
            target,
            publishedAt: new Date(),
            createdBy: req.user?.id || null
        });

        await logAudit({
            req,
            actionType: "Announcement",
            description: `Published announcement "${title}" to ${target}`,
            targetType: "Announcement",
            targetId: announcement._id
        });

        res.status(201).json({ success: true, announcement: serializeAnnouncement(announcement) });
    } catch (error) { next(error); }
};

const updateAnnouncement = async(req, res, next) => {
    try {
        const { category, title, body, published, priority, target } = req.body || {};

        const announcement = await Announcement.findByIdAndUpdate(
            req.params.id,
            { category, title, body, published, priority, target },
            { new: true, runValidators: true }
        );

        if (!announcement) return res.status(404).json({ success: false, message: "Announcement not found" });

        res.json({ success: true, announcement: serializeAnnouncement(announcement) });
    } catch (error) { next(error); }
};

module.exports = { listAnnouncements, createAnnouncement, updateAnnouncement };