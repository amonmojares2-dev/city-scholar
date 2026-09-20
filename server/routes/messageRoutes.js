const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { listConversations, createConversation, listMessages, sendMessage } = require("../controllers/messageController");

const router = express.Router();
router.use(protect);
router.route("/conversations").get(listConversations).post(createConversation);
router.route("/conversations/:conversationId/messages").get(listMessages).post(sendMessage);
module.exports = router;