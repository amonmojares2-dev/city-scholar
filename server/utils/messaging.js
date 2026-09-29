const {
    BARANGAY_ADMIN_ROLES,
    CITY_ADMIN_ROLES,
    SUPER_ADMIN_ROLES
} = require("./validation");

// ==========================================================
// WHO MAY MESSAGE WHOM
//
// Accounts are grouped first, so the canonical and the legacy role names
// ("barangay_admin" / "barangay_staff", "city_admin" / "admin_staff",
// "super_admin" / "superadmin") behave identically.
//
// ALLOWED PAIRS — every one of them two-way:
//   City          <-> Barangay
//   City          <-> Super Admin
//   Barangay      <-> Student        (already shipped; kept working)
//
// NOT allowed, and NOT "not requested" by accident:
//   Barangay      <-> Super Admin
//   City          <-> Student
//   Super Admin   <-> Student
//
// The Super Admin account only ever talks to the City Office.
// ==========================================================
const MESSAGING_GROUPS = Object.freeze({
    STUDENT: "student",
    BARANGAY: "barangay",
    CITY: "city",
    SUPER_ADMIN: "super_admin"
});

const GROUP_ROLES = Object.freeze({
    student: ["student"],
    barangay: [...BARANGAY_ADMIN_ROLES],
    city: [...CITY_ADMIN_ROLES],
    super_admin: [...SUPER_ADMIN_ROLES]
});

// Each group's allowed partners (two-way).
const ALLOWED_PARTNERS = Object.freeze({
    student: ["barangay"],
    barangay: ["student", "city"],
    city: ["barangay", "super_admin"],
    super_admin: ["city"]
});

const GROUP_LABELS = Object.freeze({
    student: "Student",
    barangay: "Barangay Office",
    city: "City Scholarship Office",
    super_admin: "Super Admin"
});

// Sentence returned (and shown in the UI) when a pair is not allowed.
const POLICY_TEXT = Object.freeze({
    student: "Student accounts can only exchange messages with the Barangay Office assigned to them.",
    barangay: "Barangay accounts can only exchange messages with the City Scholarship Office and the students of their own barangay.",
    city: "City Office accounts can only exchange messages with Barangay Offices and Super Admin accounts.",
    super_admin: "Super Admin accounts can only exchange messages with the City Scholarship Office."
});

function messagingGroup(role) {
    const value = String(role || "").trim().toLowerCase();
    return Object.keys(GROUP_ROLES).find((group) => GROUP_ROLES[group].includes(value)) || null;
}

function allowedPartnerGroups(group) {
    return ALLOWED_PARTNERS[group] ? [...ALLOWED_PARTNERS[group]] : [];
}

// The single source of truth for "may these two accounts talk?".
function canMessage(roleA, roleB) {
    const groupA = messagingGroup(roleA);
    const groupB = messagingGroup(roleB);
    if (!groupA || !groupB) return false;
    if (groupA === groupB) return false;
    return allowedPartnerGroups(groupA).includes(groupB);
}

// Every database role value that the given account may open a conversation with.
function allowedRecipientRoles(role) {
    const group = messagingGroup(role);
    if (!group) return [];
    return allowedPartnerGroups(group).flatMap((partner) => GROUP_ROLES[partner]);
}

// True when the account is allowed to see a conversation whose other side is
// `otherRole`.
function canViewConversationWith(role, otherRole) {
    return canMessage(role, otherRole);
}

function messagingPolicyMessage(role) {
    const group = messagingGroup(role);
    return (group && POLICY_TEXT[group]) ||
        "Messaging between these accounts is not allowed.";
}

// Where the recipient of a new message reads it (used by the bell notification).
function messagesLinkForRole(role) {
    const group = messagingGroup(role);
    if (group === "student") return "/student/messages";
    if (group === "barangay") return "/barangay/messages";
    if (group === "super_admin") return "/superadmin/messages";
    return "/city/messages";
}

function roleLabelForMessaging(role) {
    const group = messagingGroup(role);
    return (group && GROUP_LABELS[group]) || "Account";
}

// Human-readable list of whom this account may message — shown next to the
// compose form so the rule is visible, not just enforced.
function messagingPartnerSummary(role) {
    const labels = allowedPartnerGroups(messagingGroup(role)).map((group) =>
        GROUP_LABELS[group] + (group === "barangay" ? "s" : " accounts")
    );
    if (!labels.length) return "";
    return labels.length === 1 ?
        `You can message ${labels[0]}.` :
        `You can message ${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}.`;
}

module.exports = {
    MESSAGING_GROUPS,
    GROUP_ROLES,
    ALLOWED_PARTNERS,
    GROUP_LABELS,
    messagingGroup,
    allowedPartnerGroups,
    allowedRecipientRoles,
    canMessage,
    canViewConversationWith,
    messagingPolicyMessage,
    messagingPartnerSummary,
    messagesLinkForRole,
    roleLabelForMessaging
};
