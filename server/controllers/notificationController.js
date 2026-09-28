const Notification = require("../models/Notification");

// Only the signed-in user's own notifications ever leave the server.
const listNotifications = async(req, res, next) => {
    try {
        const notifications = await Notification.find({ recipient: req.user.id }).sort({ createdAt: -1 });
        res.json({ success: true, notifications });
    } catch (error) { next(error); }
};

const markNotificationRead = async(req, res, next) => {
    try {
        const notification = await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user.id }, { readAt: new Date() }, { new: true });
        if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });
        res.json({ success: true, notification });
    } catch (error) { next(error); }
};

// "Mark all as read" for the bell dropdown — one call instead of N.
const markAllNotificationsRead = async(req, res, next) => {
    try {
        await Notification.updateMany(
            { recipient: req.user.id, readAt: null },
            { $set: { readAt: new Date() } }
        );
        res.json({ success: true });
    } catch (error) { next(error); }
};

module.exports = { listNotifications, markNotificationRead, markAllNotificationsRead };