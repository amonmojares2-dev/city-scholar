const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const User = require("../models/User");
require("../models/Barangay");
const {
    GROUP_ROLES,
    messagingGroup,
    allowedPartnerGroups,
    canMessage,
    canViewConversationWith,
    messagingPolicyMessage,
    messagingPartnerSummary,
    messagesLinkForRole,
    roleLabelForMessaging
} = require("../utils/messaging");

// ==========================================================
// MESSAGING
//
// Allowed conversations (two-way in every pair):
//   City <-> Barangay, City <-> Super Admin
//   Barangay <-> Student  (shipped earlier and kept working)
//
// Every rule below is enforced HERE, not only in the UI:
//   - a user only ever fetches their own conversations (participants: me),
//   - a conversation is only returned when every other participant is a role
//     pair the caller is allowed to talk to,
//   - sending to a disallowed pair is rejected with 403,
//   - the recipient of a new message gets a bell notification.
// ==========================================================

const PARTICIPANT_POPULATE = {
    path: "participants",
    select: "name role barangay",
    populate: { path: "barangay", select: "name" }
};

const MAX_MESSAGE_LENGTH = 2000;

const sameId = (a, b) => String(a) === String(b);

const otherParticipants = (conversation, userId) =>
    (conversation.participants || []).filter((participant) => !sameId(participant._id || participant, userId));

// A recipient id arrives straight from the client, so a display label ("Ana
// Reyes — City Office") must be rejected with a clear 400 BEFORE it reaches
// Mongoose — otherwise findById raises a CastError and a 500 lands in the logs.
const isValidUserId = (value) => typeof value === "string" || value instanceof mongoose.Types.ObjectId
    ? mongoose.Types.ObjectId.isValid(value)
    : false;

// A Barangay office can be shared by several accounts (barangay_admin +
// barangay_staff on the same barangay). A student thread is created against ONE
// of those accounts, so the other account of the same office could not see it.
// The office — not the individual login — is the conversation owner, so a
// Barangay account also sees the threads held by its colleagues on the same
// barangay. Every other role keeps the strict "participants: me" rule.
const isBarangayGroup = (role) => messagingGroup(role) === "barangay";

const barangayOfficeIds = async(user) => {
    if (!isBarangayGroup(user.role)) return [String(user.id)];
    const ownBarangay = user.barangay?._id || user.barangay || user.account?.barangay || null;
    if (!ownBarangay) return [String(user.id)];
    const colleagues = await User.find({ role: { $in: GROUP_ROLES.barangay }, barangay: ownBarangay })
        .select("_id")
        .lean();
    return [...new Set([String(user.id), ...colleagues.map((colleague) => String(colleague._id))])];
};

// ==========================================================
// GET /api/messages/recipients
// The accounts the signed-in user is allowed to start a conversation with.
// The list is built from the role-pair rules, so the compose picker can never
// offer a disallowed contact.
// ==========================================================
const listRecipients = async(req, res, next) => {
    try {
        const group = messagingGroup(req.user.role);
        if (!group) {
            return res.status(403).json({ success: false, message: messagingPolicyMessage(req.user.role) });
        }

        let partnerGroups = allowedPartnerGroups(group);
        // Student threads are always started by the student (existing behavior),
        // so a Barangay account's picker lists City Office accounts only.
        if (group === "barangay") partnerGroups = partnerGroups.filter((partner) => partner !== "student");

        const filter = { role: { $in: partnerGroups.flatMap((partner) => GROUP_ROLES[partner]) } };

        if (group === "student") {
            // Preserved behavior: a student reaches the staff of their own barangay.
            const student = await User.findById(req.user.id).select("barangay").lean();
            if (!student || !student.barangay) {
                return res.json({
                    success: true,
                    recipients: [],
                    policy: messagingPolicyMessage(req.user.role),
                    summary: messagingPartnerSummary(req.user.role),
                    message: "Your account is not assigned to a barangay yet."
                });
            }
            filter.barangay = student.barangay;
        }

        const recipients = await User.find(filter)
            .select("name email role barangay")
            .populate("barangay", "name")
            .sort({ name: 1 })
            .lean();

        res.json({
            success: true,
            recipients: recipients.map((account) => ({
                id: String(account._id),
                name: account.name || account.email,
                email: account.email,
                role: account.role,
                roleLabel: roleLabelForMessaging(account.role),
                barangay: (account.barangay && account.barangay.name) || ""
            })),
            policy: messagingPolicyMessage(req.user.role),
            summary: messagingPartnerSummary(req.user.role)
        });
    } catch (error) { next(error); }
};

// ==========================================================
// GET /api/messages/conversations
// Only the caller's OWN conversations, only with allowed role pairs, each with
// its unread count and a last-message preview for the list.
// ==========================================================
const listConversations = async(req, res, next) => {
    try {
        // A Barangay office sees the threads of every account on its barangay, so
        // student threads created against a colleague account still show up.
        const officeIds = await barangayOfficeIds(req.user);
        const officeSet = new Set(officeIds);

        const conversations = await Conversation.find({ participants: { $in: officeIds } })
            .populate(PARTICIPANT_POPULATE)
            .sort({ lastMessageAt: -1, updatedAt: -1 });

        const visible = conversations.filter((conversation) => {
            // Colleagues of the same office are not "the other side" of the
            // thread, so they are excluded before the role-pair check.
            const others = otherParticipants(conversation, req.user.id)
                .filter((participant) => !officeSet.has(String(participant._id || participant)));
            return others.length > 0 &&
                others.every((participant) => canViewConversationWith(req.user.role, participant.role));
        });

        const ids = visible.map((conversation) => conversation._id);
        const [unreadRows, recentRows] = ids.length ? await Promise.all([
            Message.find({ conversation: { $in: ids }, readAt: null }).select("conversation sender").lean(),
            Message.find({ conversation: { $in: ids } })
                .select("conversation body createdAt sender")
                .sort({ createdAt: -1 })
                .lean()
        ]) : [
            [],
            []
        ];

        const unreadCounts = new Map();
        unreadRows.forEach((row) => {
            if (sameId(row.sender, req.user.id)) return; // unread FOR ME only
            const key = String(row.conversation);
            unreadCounts.set(key, (unreadCounts.get(key) || 0) + 1);
        });

        const lastMessages = new Map();
        recentRows.forEach((row) => {
            const key = String(row.conversation);
            if (!lastMessages.has(key)) lastMessages.set(key, row);
        });

        const payload = visible.map((conversation) => {
            const last = lastMessages.get(String(conversation._id));
            return {
                ...conversation.toObject(),
                unreadCount: unreadCounts.get(String(conversation._id)) || 0,
                lastMessage: last ? {
                    body: last.body,
                    createdAt: last.createdAt,
                    sender: String(last.sender)
                } : null
            };
        });

        res.json({
            success: true,
            conversations: payload,
            policy: messagingPolicyMessage(req.user.role),
            summary: messagingPartnerSummary(req.user.role)
        });
    } catch (error) { next(error); }
};

// ==========================================================
// POST /api/messages/conversations
// Start (or reuse) a two-way conversation with ONE recipient.
// The role pair is checked on the backend; a request for a disallowed pair is
// refused with 403 even though the UI never offers it.
// ==========================================================
const createConversation = async(req, res, next) => {
    try {
        const requested = [];
        if (Array.isArray(req.body && req.body.participants)) requested.push(...req.body.participants);
        if (req.body && req.body.recipientId) requested.push(req.body.recipientId);
        let recipientIds = [...new Set(requested.filter(Boolean).map(String))]
            .filter((value) => !sameId(value, req.user.id));

        if (req.user.role === "student" && req.body && req.body.recipientType && req.body.recipientType !== "barangay") {
            return res.status(403).json({ success: false, message: messagingPolicyMessage(req.user.role) });
        }

        // Students never pick a person: the message goes to the staff account of
        // their own barangay (existing behavior, preserved).
        if (req.user.role === "student") {
            const student = await User.findById(req.user.id).select("barangay");
            if (!student || !student.barangay) {
                return res.status(400).json({ success: false, message: "Your account is not assigned to a barangay yet" });
            }
            const barangayStaff = await User.findOne({
                role: { $in: GROUP_ROLES.barangay },
                barangay: student.barangay
            });
            if (!barangayStaff) {
                return res.status(404).json({ success: false, message: "No staff account is assigned to your barangay" });
            }
            recipientIds = [String(barangayStaff._id)];
        }

        if (recipientIds.length !== 1) {
            return res.status(400).json({ success: false, message: "Select one recipient for this conversation." });
        }

        // The picker must send the account _id. A display label arriving here is
        // a client bug, so answer 400 instead of letting findById throw.
        if (!isValidUserId(recipientIds[0])) {
            return res.status(400).json({ success: false, message: "Invalid recipient ID" });
        }

        const recipient = await User.findById(recipientIds[0]).select("name role");
        if (!recipient) {
            return res.status(404).json({ success: false, message: "Recipient account not found." });
        }

        // BACKEND enforcement of the allowed role pairs.
        if (!canMessage(req.user.role, recipient.role)) {
            return res.status(403).json({ success: false, message: messagingPolicyMessage(req.user.role) });
        }

        const participants = [req.user.id, String(recipient._id)];
        let conversation = await Conversation.findOne({
            participants: { $all: participants },
            $expr: { $eq: [{ $size: "$participants" }, participants.length] }
        });

        if (!conversation) {
            conversation = await Conversation.create({ participants, subject: (req.body && req.body.subject) || "" });
        }
        await conversation.populate(PARTICIPANT_POPULATE);
        res.status(201).json({ success: true, conversation });
    } catch (error) { next(error); }
};

// ==========================================================
// GET /api/messages/conversations/:conversationId/messages
// The caller must be a participant AND the other side must be an allowed pair.
// Opening the thread marks the messages addressed to the caller as read, which
// is what clears the unread indicator in the conversation list.
// ==========================================================
const listMessages = async(req, res, next) => {
    try {
        if (!isValidUserId(req.params.conversationId)) {
            return res.status(400).json({ success: false, message: "Invalid conversation ID" });
        }

        // Same office rule as the list: a Barangay account may open a thread
        // held by a colleague account on its barangay (student threads).
        const officeIds = await barangayOfficeIds(req.user);

        const conversation = await Conversation.findOne({ _id: req.params.conversationId, participants: { $in: officeIds } });
        if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });

        const others = await User.find({ _id: { $in: conversation.participants, $nin: officeIds } }).select("name role");
        if (!others.length) return res.status(404).json({ success: false, message: "Conversation not found" });
        if (others.some((participant) => !canViewConversationWith(req.user.role, participant.role))) {
            return res.status(403).json({ success: false, message: messagingPolicyMessage(req.user.role) });
        }

        await Message.updateMany(
            { conversation: conversation._id, sender: { $ne: req.user.id }, readAt: null },
            { $set: { readAt: new Date() } }
        );

        const messages = await Message.find({ conversation: conversation._id })
            .populate("sender", "name role")
            .sort({ createdAt: 1 });

        res.json({
            success: true,
            messages: messages.map((message) => ({ ...message.toObject(), isRead: Boolean(message.readAt) }))
        });
    } catch (error) { next(error); }
};

// ==========================================================
// POST /api/messages/conversations/:conversationId/messages
// Reply inside a conversation. Stores sender, recipient, sender role, body and
// the read state, then notifies the recipient through the notifications system.
// ==========================================================
const sendMessage = async(req, res, next) => {
    try {
        const body = typeof (req.body && req.body.body) === "string" ? req.body.body.trim() : "";
        if (!body) {
            return res.status(400).json({ success: false, message: "Please type a message before sending." });
        }
        if (body.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({ success: false, message: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.` });
        }

        if (!isValidUserId(req.params.conversationId)) {
            return res.status(400).json({ success: false, message: "Invalid conversation ID" });
        }

        // Same office rule as the list: a Barangay account may reply to a thread
        // held by a colleague account on its barangay.
        const officeIds = await barangayOfficeIds(req.user);

        const conversation = await Conversation.findOne({ _id: req.params.conversationId, participants: { $in: officeIds } });
        if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });

        // The recipient is the counterparty on the other side of the office — a
        // colleague of the same barangay is skipped, so a reply always reaches
        // the student (or the City), never a co-worker.
        const recipient = await User.findOne({ _id: { $in: conversation.participants, $nin: officeIds } }).select("name role");
        if (!recipient) {
            return res.status(400).json({ success: false, message: "This conversation has no recipient to reply to." });
        }

        // BACKEND enforcement: a disallowed role pair is refused even when a
        // conversation row already exists (legacy data or a crafted request).
        if (!canMessage(req.user.role, recipient.role)) {
            return res.status(403).json({ success: false, message: messagingPolicyMessage(req.user.role) });
        }

        const message = await Message.create({
            conversation: conversation._id,
            sender: req.user.id,
            recipient: recipient._id,
            senderRole: req.user.role,
            body
        });

        conversation.lastMessageAt = new Date();
        await conversation.save();
        await message.populate("sender", "name role");

        // Bell notification for the recipient (reuses the notifications system).
        // Best effort — a notification failure must never lose the message.
        try {
            await Notification.create({
                recipient: recipient._id,
                title: `New message from ${req.user.name || roleLabelForMessaging(req.user.role)}`,
                message: body.length > 140 ? `${body.slice(0, 137)}...` : body,
                type: "message",
                link: messagesLinkForRole(recipient.role)
            });
        } catch (notificationError) {
            console.error("Message notification error:", notificationError.message);
        }

        res.status(201).json({ success: true, message: { ...message.toObject(), isRead: false } });
    } catch (error) { next(error); }
};

module.exports = { listConversations, createConversation, listMessages, sendMessage, listRecipients };
