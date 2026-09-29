const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { listConversations, createConversation, listMessages, sendMessage, listRecipients } = require("../controllers/messageController");

const router = express.Router();
router.use(protect);
// Recipients the signed-in account is allowed to message (role-pair rule lives
// in the controller/utils/messaging.js, never in the client).
router.get("/recipients", listRecipients);
router.route("/conversations").get(listConversations).post(createConversation);
router.route("/conversations/:conversationId/messages").get(listMessages).post(sendMessage);
module.exports = router;
