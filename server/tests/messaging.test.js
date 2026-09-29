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

// Real 24-hex ids: the controller now rejects anything that is not a valid
// ObjectId before it reaches Mongoose, so the fixtures must look like the ids
// the API actually receives.
const ID = {
    me: "6a9e4c34f86766b456a321aa",
    city: "6a9e4c34f86766b456a321bb",
    brgy: "6a9e4c34f86766b456a321cc",
    brgyStaff: "6a9e4c34f86766b456a321dd",
    superAdmin: "6a9e4c34f86766b456a321ee",
    student: "6a9e4c34f86766b456a321ff",
    conversation: "6a9e4c34f86766b456a32200",
    brgy9: "6a9e4c34f86766b456a32211"
};

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

describe("Barangay office threads (student messages across accounts)", () => {
    afterEach(() => jest.restoreAllMocks());

    // A student thread is created against ONE staff account of the barangay. The
    // office has to see it from ANY of its accounts, otherwise the message a
    // student already sent looks like it never arrived.
    const officeUser = { id: ID.brgy, role: "barangay_admin", barangay: ID.brgy9 };
    const colleagueUser = { id: ID.brgyStaff, role: "barangay_staff", barangay: ID.brgy9 };
    const studentThread = {
        _id: ID.conversation,
        participants: [
            { _id: ID.student, name: "Student", role: "student" },
            { _id: ID.brgyStaff, name: "Colleague", role: "barangay_staff" }
        ],
        toObject: () => ({ _id: ID.conversation })
    };

    it("lists a student thread held by a colleague account of the same office", async() => {
        const find = jest.spyOn(User, "find").mockReturnValue(query([
            { _id: ID.brgy },
            { _id: ID.brgyStaff }
        ]));
        jest.spyOn(Conversation, "find").mockReturnValue(query([studentThread]));
        jest.spyOn(Message, "find").mockReturnValue(query([
            { conversation: ID.conversation, body: "hi", createdAt: new Date(), sender: ID.student }
        ]));

        const res = response();
        await listConversations({ user: officeUser }, res, jest.fn());

        // The thread is looked up across the whole office, not just "me".
        expect(find).toHaveBeenCalledWith(expect.objectContaining({ barangay: ID.brgy9 }));
        expect(find.mock.results.length).toBeGreaterThan(0);
        expect(Conversation.find.mock.calls[0][0].participants.$in).toEqual(
            expect.arrayContaining([ID.brgy, ID.brgyStaff])
        );
        expect(res.json.mock.calls[0][0].conversations.map((c) => c._id)).toEqual([ID.conversation]);
    });

    it("does not treat a colleague of the same office as the other side of the thread", async() => {
        jest.spyOn(User, "find").mockReturnValue(query([{ _id: ID.brgy }, { _id: ID.brgyStaff }]));
        jest.spyOn(Conversation, "find").mockReturnValue(query([studentThread]));
        jest.spyOn(Message, "find").mockReturnValue(query([]));

        const res = response();
        await listConversations({ user: officeUser }, res, jest.fn());

        // Student <-> Barangay is allowed, so the thread survives the filter
        // even though one participant is a fellow staff account.
        expect(res.json.mock.calls[0][0].conversations).toHaveLength(1);
    });

    it("lets the office account reply to the student, not to the colleague", async() => {
        jest.spyOn(User, "find").mockReturnValue(query([{ _id: ID.brgy }, { _id: ID.brgyStaff }]));
        jest.spyOn(Conversation, "findOne").mockResolvedValue({
            _id: ID.conversation,
            participants: [ID.student, ID.brgyStaff],
            lastMessageAt: null,
            save: jest.fn().mockResolvedValue(undefined)
        });
        jest.spyOn(User, "findOne").mockReturnValue(query({ _id: ID.student, name: "Student", role: "student" }));
        const create = jest.spyOn(Message, "create").mockResolvedValue({
            _id: "m9",
            body: "Noted, thank you.",
            readAt: null,
            populate: jest.fn().mockResolvedValue(undefined),
            toObject: () => ({ _id: "m9" })
        });
        jest.spyOn(Notification, "create").mockResolvedValue({});

        const res = response();
        await sendMessage({
            params: { conversationId: ID.conversation },
            body: { body: "Noted, thank you." },
            user: officeUser
        }, res, jest.fn());

        // The student is the recipient; the colleague is filtered out by $nin.
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            conversation: ID.conversation,
            sender: ID.brgy,
            recipient: ID.student
        }));
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it("keeps the strict participants:me rule for non-Barangay roles", async() => {
        const find = jest.spyOn(Conversation, "find").mockReturnValue(query([]));

        await listConversations({ user: { id: ID.city, role: "city_admin" } }, response(), jest.fn());

        // A City account must NOT inherit office-wide visibility.
        expect(find.mock.calls[0][0].participants).toEqual({ $in: [ID.city] });
    });
});

describe("thread access and read state", () => {
    afterEach(() => jest.restoreAllMocks());

    it("marks the received messages as read when the thread is opened", async() => {
        jest.spyOn(Conversation, "findOne").mockResolvedValue({ _id: ID.conversation, participants: [ID.me, ID.brgy] });
        jest.spyOn(User, "find").mockReturnValue(query([{ _id: ID.brgy, role: "barangay_admin" }]));
        const updateMany = jest.spyOn(Message, "updateMany").mockResolvedValue({});
        jest.spyOn(Message, "find").mockReturnValue(query([
            { _id: "m1", body: "hi", readAt: new Date(), toObject: () => ({ _id: "m1", body: "hi" }) }
        ]));

        const res = response();
        await listMessages({ params: { conversationId: ID.conversation }, user: { id: ID.me, role: "city_admin" } }, res, jest.fn());

        expect(updateMany).toHaveBeenCalledWith(
            { conversation: ID.conversation, sender: { $ne: ID.me }, readAt: null },
            { $set: { readAt: expect.any(Date) } }
        );
        expect(res.json.mock.calls[0][0].messages[0].isRead).toBe(true);
    });

    it("refuses to open a conversation with a disallowed role pair", async() => {
        jest.spyOn(Conversation, "findOne").mockResolvedValue({ _id: "6a9e4c34f86766b456a32233", participants: [ID.me, ID.student] });
        jest.spyOn(User, "find").mockReturnValue(query([{ _id: ID.student, role: "student" }]));

        const res = response();
        await listMessages({
            params: { conversationId: "6a9e4c34f86766b456a32222" },
            user: { id: ID.me, role: "city_admin" }
        }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(403);
    });
});

describe("starting a conversation (backend role enforcement)", () => {
    afterEach(() => jest.restoreAllMocks());

    it("refuses a Super Admin conversation with a Barangay account", async() => {
        jest.spyOn(User, "findById").mockReturnValue(query({ _id: ID.brgy, name: "Brgy", role: "barangay_admin" }));
        const create = jest.spyOn(Conversation, "create");

        const res = response();
        await createConversation({ user: { id: ID.me, role: "super_admin" }, body: { recipientId: ID.brgy } }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(403);
        expect(create).not.toHaveBeenCalled();
    });

    it("refuses a City conversation with a student", async() => {
        jest.spyOn(User, "findById").mockReturnValue(query({ _id: ID.student, name: "Student", role: "student" }));
        const create = jest.spyOn(Conversation, "create");

        const res = response();
        await createConversation({ user: { id: ID.me, role: "city_admin" }, body: { recipientId: ID.student } }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(403);
        expect(create).not.toHaveBeenCalled();
    });

    it("rejects a display label sent as the recipient with a clear 400", async() => {
        // The picker bug: "Ana Reyes - City Office" posted as recipientId.
        const findById = jest.spyOn(User, "findById");
        const create = jest.spyOn(Conversation, "create");

        const res = response();
        await createConversation({
            user: { id: ID.me, role: "city_admin" },
            body: { recipientId: "Ana Reyes - City Office" }
        }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].message).toBe("Invalid recipient ID");
        // The guard runs BEFORE Mongoose, so no CastError is ever raised.
        expect(findById).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });

    it("opens the City <-> Barangay conversation for a City account", async() => {
        jest.spyOn(User, "findById").mockReturnValue(query({ _id: ID.brgy, name: "Brgy", role: "barangay_admin" }));
        jest.spyOn(Conversation, "findOne").mockResolvedValue(null);
        const conversation = { _id: "c9", participants: [ID.me, ID.brgy], populate: jest.fn().mockResolvedValue(undefined) };
        const create = jest.spyOn(Conversation, "create").mockResolvedValue(conversation);

        const res = response();
        await createConversation({
            user: { id: ID.me, role: "city_admin" },
            body: { recipientId: ID.brgy, subject: "Residency re-check" }
        }, res, jest.fn());

        expect(create).toHaveBeenCalledWith({ participants: [ID.me, ID.brgy], subject: "Residency re-check" });
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it("opens the City <-> Super Admin conversation for a City account", async() => {
        jest.spyOn(User, "findById").mockReturnValue(query({ _id: ID.superAdmin, name: "System Administrator", role: "super_admin" }));
        jest.spyOn(Conversation, "findOne").mockResolvedValue(null);
        const create = jest.spyOn(Conversation, "create").mockResolvedValue({
            _id: "c11",
            participants: [ID.me, ID.superAdmin],
            populate: jest.fn().mockResolvedValue(undefined)
        });

        const res = response();
        await createConversation({
            user: { id: ID.me, role: "city_admin" },
            body: { recipientId: ID.superAdmin, subject: "Budget release" }
        }, res, jest.fn());

        expect(create).toHaveBeenCalledWith({ participants: [ID.me, ID.superAdmin], subject: "Budget release" });
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it("keeps the student flow: the message always goes to their own barangay staff", async() => {
        // The student record resolves on the first lookup, the staff account on
        // the address lookup — mirroring the real id-based queries.
        jest.spyOn(User, "findById").mockImplementation((id) =>
            id === ID.me ? query({ barangay: ID.brgy9 }) : query({ _id: ID.brgyStaff, name: "Staff", role: "barangay_staff" })
        );
        const staff = jest.spyOn(User, "findOne").mockReturnValue(query({ _id: ID.brgyStaff, role: "barangay_staff" }));
        jest.spyOn(Conversation, "findOne").mockResolvedValue(null);
        const conversation = { _id: "c10", participants: [ID.me, ID.brgyStaff], populate: jest.fn().mockResolvedValue(undefined) };
        jest.spyOn(Conversation, "create").mockResolvedValue(conversation);

        const res = response();
        await createConversation({ user: { id: ID.me, role: "student" }, body: { recipientType: "barangay" } }, res, jest.fn());

        expect(staff).toHaveBeenCalledWith(expect.objectContaining({ barangay: ID.brgy9 }));
        expect(res.status).toHaveBeenCalledWith(201);
    });
});

describe("sending a message", () => {
    afterEach(() => jest.restoreAllMocks());

    it("refuses a reply between disallowed roles", async() => {
        jest.spyOn(Conversation, "findOne").mockResolvedValue({ _id: "6a9e4c34f86766b456a32233", participants: [ID.me, ID.student] });
        jest.spyOn(User, "findOne").mockReturnValue(query({ _id: ID.student, name: "Student", role: "student" }));
        const create = jest.spyOn(Message, "create");

        const res = response();
        await sendMessage({
            params: { conversationId: "6a9e4c34f86766b456a32233" },
            body: { body: "hello" },
            user: { id: ID.me, role: "city_admin" }
        }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(403);
        expect(create).not.toHaveBeenCalled();
    });

    it("stores recipient, sender role and notifies the recipient's bell", async() => {
        const conversation = {
            _id: ID.conversation,
            participants: [ID.me, ID.brgy],
            lastMessageAt: null,
            save: jest.fn().mockResolvedValue(undefined)
        };
        jest.spyOn(Conversation, "findOne").mockResolvedValue(conversation);
        jest.spyOn(User, "findOne").mockReturnValue(query({ _id: ID.brgy, name: "Barangay Office", role: "barangay_admin" }));
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
            params: { conversationId: ID.conversation },
            body: { body: "Please send the residency slip" },
            user: { id: ID.me, role: "city_admin", name: "City Reviewer" }
        }, res, jest.fn());

        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            conversation: ID.conversation,
            sender: ID.me,
            recipient: ID.brgy,
            senderRole: "city_admin",
            body: "Please send the residency slip"
        }));
        expect(conversation.save).toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith(expect.objectContaining({
            recipient: ID.brgy,
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
