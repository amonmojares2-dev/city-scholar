const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");
require("../models/Barangay");

const listConversations = async(req, res, next) => {
    try {
        const conversations = await Conversation.find({ participants: req.user.id }).populate({ path: "participants", select: "name role barangay", populate: { path: "barangay", select: "name" } }).sort({ lastMessageAt: -1, updatedAt: -1 });
        res.json({ success: true, conversations });
    } catch (error) { next(error); }
};

const createConversation = async(req, res, next) => {
    try {
        let recipientIds = req.body.participants || [];

        if (req.user.role === "student" && req.body.recipientType !== "barangay") {
            return res.status(403).json({ success: false, message: "Students can only message their assigned barangay" });
        }

        if (req.user.role === "student" && req.body.recipientType === "barangay") {
            const student = await User.findById(req.user.id).select("barangay");
            if (!student?.barangay) return res.status(400).json({ success: false, message: "Your account is not assigned to a barangay yet" });

            const barangayStaff = await User.findOne({ role: "barangay_staff", barangay: student.barangay });
            if (!barangayStaff) return res.status(404).json({ success: false, message: "No staff account is assigned to your barangay" });
            recipientIds = [barangayStaff._id.toString()];
        }

        if (!recipientIds.length) return res.status(400).json({ success: false, message: "A message recipient is required" });
        const participants = [...new Set([req.user.id, ...recipientIds.map(String)])];
        let conversation = await Conversation.findOne({
            participants: { $all: participants },
            $expr: { $eq: [{ $size: "$participants" }, participants.length] }
        });

        if (!conversation) conversation = await Conversation.create({ participants, subject: req.body.subject || "" });
        await conversation.populate({ path: "participants", select: "name role barangay", populate: { path: "barangay", select: "name" } });
        res.status(201).json({ success: true, conversation });
    } catch (error) { next(error); }
};

const listMessages = async(req, res, next) => {
    try {
        const conversation = await Conversation.findOne({ _id: req.params.conversationId, participants: req.user.id });
        if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });
        const messages = await Message.find({ conversation: conversation._id }).populate("sender", "name role").sort({ createdAt: 1 });
        res.json({ success: true, messages });
    } catch (error) { next(error); }
};

const sendMessage = async(req, res, next) => {
    try {
        const conversation = await Conversation.findOne({ _id: req.params.conversationId, participants: req.user.id });
        if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });
        const message = await Message.create({ conversation: conversation._id, sender: req.user.id, body: req.body.body });
        conversation.lastMessageAt = new Date();
        await conversation.save();
        res.status(201).json({ success: true, message });
    } catch (error) { next(error); }
};

module.exports = { listConversations, createConversation, listMessages, sendMessage };