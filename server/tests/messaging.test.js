const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const User = require("../models/User");
const {
    allowedRecipientRoles,
    canMessage,
    messagingGroup,
    messagingPolicyMessage,
    messagesLinkForRole
} = require("../utils/messaging");
const {
    listConversations,
    createConversation,
    listMessages,
    sendMessage,
    listRecipients
} = require("../controllers/messageController");

// A mongoose-like query: chainable, awaitable, and .lean()-able.
function query(result) {
    const promise = Promise.resolve(result);
    const stub = {
        then: (onFulfilled, onRejected) => promise.then(onFulfilled, onRejected),
        catch: (onRejected) => promise.catch(onRejected),
        finally: (onFinally) => promise.finally(onFinally)
    };
    stub.select = jest.fn(() => stub);
    stub.populate = jest.fn(() => stub);
    stub.sort = jest.fn(() => stub);
    stub.lean = jest.fn(() => Promise.resolve(result));
    return stub;
}

function response() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
}

describe("allowed messaging role pairs", () => {
    it("allows exactly City<->Barangay, City<->Super Admin and Barangay<->Student", () => {
        expect(canMessage("city_admin", "barangay_admin")).toBe(true);
        expect(canMessage("barangay_staff", "admin_staff")).toBe(true);
        expect(canMessage("admin_staff", "super_admin")).toBe(true);
        expect(canMessage("superadmin", "city_admin")).toBe(true);
        expect(canMessage("student", "barangay_staff")).toBe(true);
        expect(canMessage("barangay_admin", "student")).toBe(true);
    });

    it("refuses Barangay<->Super Admin and every pair involving a student and City/Super Admin", () => {
        expect(canMessage("barangay_admin", "super_admin")).toBe(false);
        expect(canMessage("superadmin", "barangay_staff")).toBe(false);
        expect(canMessage("city_admin", "student")).toBe(false);
        expect(canMessage("student", "super_admin")).toBe(false);
        expect(canMessage("city_admin", "city_admin")).toBe(false);
        expect(canMessage("not_a_role", "city_admin")).toBe(false);
    });

    it("groups the canonical and the legacy role names together", () => {
        expect(messagingGroup("barangay_staff")).toBe("barangay");
        expect(messagingGroup("barangay_admin")).toBe("barangay");
        expect(messagingGroup("admin_staff")).toBe("city");
        expect(messagingGroup("superadmin")).toBe("super_admin");
        expect(messagingGroup("ghost")).toBeNull();
    });

    it("never offers a student to City or Super Admin, and never a Barangay to a Super Admin", () => {
        expect(allowedRecipientRoles("super_admin").sort()).toEqual(["admin_staff", "city_admin"].sort());
        expect(allowedRecipientRoles("city_admin")).not.toContain("student");
        expect(allowedRecipientRoles("city_admin")).toEqual(expect.arrayContaining([
            "barangay_admin", "barangay_staff", "super_admin", "superadmin"
        ]));
        // A Barangay account keeps the shipped student flow, so students ARE a
        // valid partner group for it (the compose picker filters them out).
        expect(allowedRecipientRoles("barangay_admin")).toEqual(expect.arrayContaining(["student", "city_admin", "admin_staff"]));
        expect(allowedRecipientRoles("student")).toEqual(expect.arrayContaining(["barangay_admin", "barangay_staff"]));
    });

    it("explains the rule and routes the bell to the right Messages page", () => {
        expect(messagingPolicyMessage("barangay_staff")).toContain("City Scholarship Office");
        expect(messagesLinkForRole("city_admin")).toBe("/city/messages");
        expect(messagesLinkForRole("barangay_admin")).toBe("/barangay/messages");
        expect(messagesLinkForRole("super_admin")).toBe("/superadmin/messages");
        expect(messagesLinkForRole("student")).toBe("/student/messages");
    });
});

describe("conversation listing", () => {
    afterEach(() => jest.restoreAllMocks());

    it("only returns conversations and unread counts for allowed pairs", async() => {
        jest.spyOn(Conversation, "find").mockReturnValue(query([
            {
                _id: "c1",
                participants: [
                    { _id: "me", name: "Super", role: "super_admin" },
                    { _id: "city-1", name: "City", role: "city_admin" }
                ],
                toObject: () => ({ _id: "c1" })
            },
            {
                _id: "c2",
                participants: [
                    { _id: "me", name: "Super", role: "super_admin" },
                    { _id: "brgy-1", name: "Brgy", role: "barangay_admin" }
                ],
                toObject: () => ({ _id: "c2" })
            }
        ]));
        jest.spyOn(Message, "find").mockImplementation((filter) =>
            filter && filter.readAt === null ?
                query([{ conversation: "c1", sender: "city-1" }]) :
                query([{ conversation: "c1", body: "Please review", createdAt: new Date(), sender: "city-1" }])
        );

        const res = response();
        await listConversations({ user: { id: "me", role: "super_admin" } }, res, jest.fn());

        const payload = res.json.mock.calls[0][0];
        expect(payload.conversations.map((conversation) => conversation._id)).toEqual(["c1"]);
        expect(payload.conversations[0].unreadCount).toBe(1);
        expect(payload.conversations[0].lastMessage.body).toBe("Please review");
    });

    it("never counts the caller's own message as unread", async() => {
        jest.spyOn(Conversation, "find").mockReturnValue(query([
            {
                _id: "c1",
                participants: [
                    { _id: "me", name: "City", role: "city_admin" },
                    { _id: "brgy-1", name: "Brgy", role: "barangay_admin" }
                ],
                toObject: () => ({ _id: "c1" })
            }
        ]));
        jest.spyOn(Message, "find").mockImplementation((filter) =>
            filter && filter.readAt === null ?
                query([{ conversation: "c1", sender: "me" }]) :
                query([])
        );

        const res = response();
        await listConversations({ user: { id: "me", role: "city_admin" } }, res, jest.fn());

        expect(res.json.mock.calls[0][0].conversations[0].unreadCount).toBe(0);
    });
});

describe("thread access and read state", () => {
    afterEach(() => jest.restoreAllMocks());

    it("marks the received messages as read when the thread is opened", async() => {
        jest.spyOn(Conversation, "findOne").mockResolvedValue({ _id: "c1", participants: ["me", "brgy-1"] });
        jest.spyOn(User, "find").mockReturnValue(query([{ _id: "brgy-1", role: "barangay_admin" }]));
        const updateMany = jest.spyOn(Message, "updateMany").mockResolvedValue({});
        jest.spyOn(Message, "find").mockReturnValue(query([
            { _id: "m1", body: "hi", readAt: new Date(), toObject: () => ({ _id: "m1", body: "hi" }) }
        ]));

        const res = response();
        await listMessages({ params: { conversationId: "c1" }, user: { id: "me", role: "city_admin" } }, res, jest.fn());

        expect(updateMany).toHaveBeenCalledWith(
            { conversation: "c1", sender: { $ne: "me" }, readAt: null },
            { $set: { readAt: expect.any(Date) } }
        );
        expect(res.json.mock.calls[0][0].messages[0].isRead).toBe(true);
    });

    it("refuses to open a conversation with a disallowed role pair", async() => {
        jest.spyOn(Conversation, "findOne").mockResolvedValue({ _id: "c3", participants: ["me", "stu-1"] });
        jest.spyOn(User, "find").mockReturnValue(query([{ _id: "stu-1", role: "student" }]));

        const res = response();
        await listMessages({ params: { conversationId: "c3" }, user: { id: "me", role: "city_admin" } }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(403);
    });
});

describe("starting a conversation (backend role enforcement)", () => {
    afterEach(() => jest.restoreAllMocks());

    it("refuses a Super Admin conversation with a Barangay account", async() => {
        jest.spyOn(User, "findById").mockReturnValue(query({ _id: "brgy-1", name: "Brgy", role: "barangay_admin" }));
        const create = jest.spyOn(Conversation, "create");

        const res = response();
        await createConversation({ user: { id: "me", role: "super_admin" }, body: { recipientId: "brgy-1" } }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(403);
        expect(create).not.toHaveBeenCalled();
    });

    it("refuses a City conversation with a student", async() => {
        jest.spyOn(User, "findById").mockReturnValue(query({ _id: "stu-1", name: "Student", role: "student" }));
        const create = jest.spyOn(Conversation, "create");

        const res = response();
        await createConversation({ user: { id: "me", role: "city_admin" }, body: { recipientId: "stu-1" } }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(403);
        expect(create).not.toHaveBeenCalled();
    });

    it("opens the City <-> Barangay conversation for a City account", async() => {
        jest.spyOn(User, "findById").mockReturnValue(query({ _id: "brgy-1", name: "Brgy", role: "barangay_admin" }));
        jest.spyOn(Conversation, "findOne").mockResolvedValue(null);
        const conversation = { _id: "c9", participants: ["me", "brgy-1"], populate: jest.fn().mockResolvedValue(undefined) };
        const create = jest.spyOn(Conversation, "create").mockResolvedValue(conversation);

        const res = response();
        await createConversation({
            user: { id: "me", role: "city_admin" },
            body: { recipientId: "brgy-1", subject: "Residency re-check" }
        }, res, jest.fn());

        expect(create).toHaveBeenCalledWith({ participants: ["me", "brgy-1"], subject: "Residency re-check" });
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it("keeps the student flow: the message always goes to their own barangay staff", async() => {
        // The student record resolves on the first lookup, the staff account on
        // the address lookup — mirroring the real id-based queries.
        jest.spyOn(User, "findById").mockImplementation((id) =>
            id === "me" ? query({ barangay: "brgy-9" }) : query({ _id: "staff-9", name: "Staff", role: "barangay_staff" })
        );
        const staff = jest.spyOn(User, "findOne").mockReturnValue(query({ _id: "staff-9", role: "barangay_staff" }));
        jest.spyOn(Conversation, "findOne").mockResolvedValue(null);
        const conversation = { _id: "c10", participants: ["me", "staff-9"], populate: jest.fn().mockResolvedValue(undefined) };
        jest.spyOn(Conversation, "create").mockResolvedValue(conversation);

        const res = response();
        await createConversation({ user: { id: "me", role: "student" }, body: { recipientType: "barangay" } }, res, jest.fn());

        expect(staff).toHaveBeenCalledWith(expect.objectContaining({ barangay: "brgy-9" }));
        expect(res.status).toHaveBeenCalledWith(201);
    });
});

describe("sending a message", () => {
    afterEach(() => jest.restoreAllMocks());

    it("refuses a reply between disallowed roles", async() => {
        jest.spyOn(Conversation, "findOne").mockResolvedValue({ _id: "c3", participants: ["me", "stu-1"] });
        jest.spyOn(User, "findOne").mockReturnValue(query({ _id: "stu-1", name: "Student", role: "student" }));
        const create = jest.spyOn(Message, "create");

        const res = response();
        await sendMessage({
            params: { conversationId: "c3" },
            body: { body: "hello" },
            user: { id: "me", role: "city_admin" }
        }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(403);
        expect(create).not.toHaveBeenCalled();
    });

    it("stores recipient, sender role and notifies the recipient's bell", async() => {
        const conversation = {
            _id: "c1",
            participants: ["me", "brgy-1"],
            lastMessageAt: null,
            save: jest.fn().mockResolvedValue(undefined)
        };
        jest.spyOn(Conversation, "findOne").mockResolvedValue(conversation);
        jest.spyOn(User, "findOne").mockReturnValue(query({ _id: "brgy-1", name: "Barangay Office", role: "barangay_admin" }));
        const create = jest.spyOn(Message, "create").mockResolvedValue({
            _id: "m1",
            body: "Please send the residency slip",
            readAt: null,
            populate: jest.fn().mockResolvedValue(undefined),
            toObject: () => ({ _id: "m1", body: "Please send the residency slip" })
        });
        const notify = jest.spyOn(Notification, "create").mockResolvedValue({});

        const res = response();
        await sendMessage({
            params: { conversationId: "c1" },
            body: { body: "Please send the residency slip" },
            user: { id: "me", role: "city_admin", name: "City Reviewer" }
        }, res, jest.fn());

        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            conversation: "c1",
            sender: "me",
            recipient: "brgy-1",
            senderRole: "city_admin",
            body: "Please send the residency slip"
        }));
        expect(conversation.save).toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith(expect.objectContaining({
            recipient: "brgy-1",
            type: "message",
            link: "/barangay/messages",
            title: "New message from City Reviewer"
        }));
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json.mock.calls[0][0].message.isRead).toBe(false);
    });

    it("refuses an empty message", async() => {
        const create = jest.spyOn(Message, "create");

        const res = response();
        await sendMessage({ params: { conversationId: "c1" }, body: { body: "   " }, user: { id: "me", role: "city_admin" } }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(400);
        expect(create).not.toHaveBeenCalled();
    });
});

describe("recipient directory", () => {
    afterEach(() => jest.restoreAllMocks());

    it("only offers allowed recipients to a City Office account", async() => {
        const find = jest.spyOn(User, "find").mockReturnValue(query([]));

        await listRecipients({ user: { id: "me", role: "city_admin" } }, response(), jest.fn());

        const filter = find.mock.calls[0][0];
        expect(filter.role.$in).toEqual(expect.arrayContaining(["barangay_admin", "barangay_staff", "super_admin", "superadmin"]));
        expect(filter.role.$in).not.toContain("student");
    });

    it("only offers City Office accounts to a Barangay account", async() => {
        const find = jest.spyOn(User, "find").mockReturnValue(query([]));

        await listRecipients({ user: { id: "me", role: "barangay_admin" } }, response(), jest.fn());

        expect(find.mock.calls[0][0].role.$in.slice().sort()).toEqual(["admin_staff", "city_admin"].sort());
    });

    it("only offers City Office accounts to a Super Admin", async() => {
        const find = jest.spyOn(User, "find").mockReturnValue(query([]));

        await listRecipients({ user: { id: "me", role: "super_admin" } }, response(), jest.fn());

        expect(find.mock.calls[0][0].role.$in.slice().sort()).toEqual(["admin_staff", "city_admin"].sort());
    });
});
