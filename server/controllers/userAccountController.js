const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Application = require("../models/Application");
const Document = require("../models/Document");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const OTPVerification = require("../models/OTPVerification");
const Event = require("../models/Event");
const Announcement = require("../models/Announcement");
const AuditLog = require("../models/AuditLog");
const ProgramConfig = require("../models/ProgramConfig");
const {
    removeStoredFile,
    removeStoredFileByFilename,
    isSafeGeneratedFilename,
    profilePhotoDirectory
} = require("../config/storage");

const uploadProfilePhoto = async(req, res, next) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "Please select a PNG or JPEG image." });
    }

    try {
        const mimeType = (req.file.mimetype || "").toLowerCase();
        const user = await User.findById(req.user.id);
        if (!user) {
            removeStoredFileByFilename(req.file.filename, profilePhotoDirectory);
            return res.status(404).json({ success: false, message: "User account not found." });
        }

        const oldFilename = user.profilePhoto?.filename || "";
        const uploadedAt = new Date();
        const photoUrl = "/api/users/me/photo";
        user.profilePhoto = {
            filename: req.file.filename,
            url: photoUrl,
            mimeType,
            uploadedAt
        };
        await user.save();
        if (oldFilename && oldFilename !== req.file.filename) {
            removeStoredFileByFilename(oldFilename, profilePhotoDirectory);
        }

        const publicUser = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            hasProfilePhoto: true,
            profilePhotoUrl: photoUrl,
            profilePhotoUpdatedAt: uploadedAt.toISOString()
        };

        return res.status(201).json({
            success: true,
            message: "Profile photo updated successfully.",
            user: publicUser
        });
    } catch (error) {
        removeStoredFileByFilename(req.file && req.file.filename, profilePhotoDirectory);
        return next(error);
    }
};

const getProfilePhoto = async(req, res) => {
    const user = await User.findById(req.user.id).select("profilePhoto");
    if (!isSafeGeneratedFilename(user?.profilePhoto?.filename)) {
        return res.status(404).json({ success: false, message: "Profile photo not found." });
    }

    const fullPath = path.join(profilePhotoDirectory, user.profilePhoto.filename);
    if (!fullPath || !fs.existsSync(fullPath)) {
        return res.status(404).json({ success: false, message: "Profile photo file not found." });
    }

    res.setHeader("Content-Type", user.profilePhoto.mimeType || "application/octet-stream");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cache-Control", "private, no-store");
    return res.sendFile(fullPath);
};

const deleteCurrentUser = async(req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "Student account not found." });
        }

        const confirmation = String(req.body?.confirmation || "").trim();
        const passwordMatches = user.password && await bcrypt.compare(confirmation, user.password);
        if (confirmation !== "DELETE" && !passwordMatches) {
            return res.status(400).json({
                success: false,
                message: "Incorrect password. Type DELETE to confirm account deletion."
            });
        }

        const applications = await Application.find({ student: user._id }).select("_id");
        const applicationIds = applications.map(application => application._id);
        const documentFilter = {
            $or: [{ student: user._id }, { application: { $in: applicationIds } }]
        };
        const documents = await Document.find(documentFilter);
        const conversations = await Conversation.find({ participants: user._id }).select("_id");
        const conversationIds = conversations.map(conversation => conversation._id);

        documents.forEach(document => removeStoredFile(document));
        if (user.profilePhoto?.filename) removeStoredFileByFilename(user.profilePhoto.filename, profilePhotoDirectory);

        await Promise.all([
            Document.deleteMany(documentFilter),
            Application.deleteMany({ student: user._id }),
            Message.deleteMany({ $or: [{ sender: user._id }, { conversation: { $in: conversationIds } }] }),
            Notification.deleteMany({ recipient: user._id }),
            OTPVerification.deleteMany({ $or: [{ userId: user._id }, { email: user.email }] }),
            Event.updateMany({ attendees: user._id }, { $pull: { attendees: user._id } }),
            Announcement.updateMany({ createdBy: user._id }, { $set: { createdBy: null } }),
            AuditLog.deleteMany({
                $or: [
                    { actor: user._id },
                    { targetType: "User", targetId: String(user._id) }
                ]
            }),
            ProgramConfig.updateMany({ updatedBy: user._id }, { $set: { updatedBy: null } }),
            Application.updateMany({ reviewedBy: user._id }, { $set: { reviewedBy: null } }),
            Application.updateMany({ barangayReviewedBy: user._id }, { $set: { barangayReviewedBy: null } }),
            Conversation.deleteMany({ _id: { $in: conversationIds } })
        ]);

        await user.deleteOne();
        return res.json({
            success: true,
            message: "Your account and all related data have been permanently deleted."
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = { deleteCurrentUser, getProfilePhoto, uploadProfilePhoto };