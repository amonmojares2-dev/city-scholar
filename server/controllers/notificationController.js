const Notification = require("../models/Notification");

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

module.exports = { listNotifications, markNotificationRead };