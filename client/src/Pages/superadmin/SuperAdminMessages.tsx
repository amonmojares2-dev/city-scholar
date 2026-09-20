import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../../components/Icon";
import PageHeader from "../../components/PageHeader";
import EmptyState from "../../components/EmptyState";
import { api } from "../../lib/api";
import { getSession } from "../../lib/auth";

// ─── Types (match server messageController responses) ─────────────────────────

interface Participant {
  _id: string;
  name: string;
  role: string;
  barangay?: { _id: string; name: string } | null;
}

interface ConversationDto {
  _id: string;
  participants: Participant[];
  subject: string;
  lastMessageAt: string | null;
  updatedAt: string;
}

interface MessageDto {
  _id: string;
  sender: { _id: string; name: string; role: string };
  body: string;
  createdAt: string;
  readAt: string | null;
}

// Row shape from GET /super-admin/users (used for the recipient picker)
interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  role: string;
  dbRole: string;
}

interface ConversationsResponse { success: boolean; conversations: ConversationDto[] }
interface MessagesResponse { success: boolean; messages: MessageDto[] }
interface CreateConversationResponse { success: boolean; conversation: ConversationDto }
interface SendMessageResponse { success: boolean; message: MessageDto }
interface UsersResponse { success: boolean; users: DirectoryUser[] }

const ROLE_LABELS: Record<string, string> = {
  student: "Student",
  barangay_staff: "Barangay Staff",
  city_admin: "City Office",
  admin_staff: "City Office",
  super_admin: "Super Admin",
  superadmin: "Super Admin",
};

function roleLabel(role?: string) {
  return ROLE_LABELS[role || ""] || role || "User";
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const now = Date.now();
  const diff = now - date.getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  if (diff < oneDay && diff >= 0) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatStamp(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function SuperAdminMessages() {
  const myId = getSession()?.user?.id || "";

  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const [showCompose, setShowCompose] = useState(false);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [recipientId, setRecipientId] = useState("");
  const [subject, setSubject] = useState("");
  const [composeError, setComposeError] = useState("");
  const [composeSending, setComposeSending] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const data = await api<ConversationsResponse>("/messages/conversations");
      setConversations(data.conversations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load conversations.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    setThreadLoading(true);
    try {
      const data = await api<MessagesResponse>(`/messages/conversations/${conversationId}/messages`);
      setMessages(data.messages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the conversation.");
    } finally {
      setThreadLoading(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (activeId) loadMessages(activeId);
    else { setMessages([]); }
  }, [activeId, loadMessages]);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages]);

  // Title = the other participant(s); subject as fallback
  function conversationTitle(conversation: ConversationDto) {
    const others = conversation.participants.filter((p) => p._id !== myId);
    if (others.length > 0) return others.map((p) => p.name).join(", ");
    return conversation.subject || "Conversation";
  }

  function conversationMeta(conversation: ConversationDto) {
    const others = conversation.participants.filter((p) => p._id !== myId);
    const parts = others.map((p) => {
      const label = roleLabel(p.role);
      return p.barangay?.name ? `${label} · ${p.barangay.name}` : label;
    });
    return parts.join(", ") || "No participants";
  }

  const filtered = conversations.filter((conversation) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return `${conversationTitle(conversation)} ${conversation.subject}`.toLowerCase().includes(query);
  });

  async function handleSend() {
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    setSending(true);
    setError("");
    try {
      await api<SendMessageResponse>(`/messages/conversations/${activeId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setDraft("");
      await Promise.all([loadMessages(activeId), loadConversations()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send the message.");
    } finally {
      setSending(false);
    }
  }

  function openCompose() {
    setShowCompose(true);
    setComposeError("");
    setRecipientId("");
    setSubject("");
    if (directory.length === 0) {
      setDirectoryLoading(true);
      api<UsersResponse>("/super-admin/users")
        .then((data) => setDirectory((data.users || []).filter((user) => user.id !== myId)))
        .catch((err) => setComposeError(err instanceof Error ? err.message : "Unable to load the user directory."))
        .finally(() => setDirectoryLoading(false));
    }
  }

  async function handleCreateConversation() {
    if (!recipientId || composeSending) return;
    setComposeSending(true);
    setComposeError("");
    try {
      const data = await api<CreateConversationResponse>("/messages/conversations", {
        method: "POST",
        body: JSON.stringify({ participants: [recipientId], subject: subject.trim() }),
      });
      setShowCompose(false);
      await loadConversations();
      setActiveId(data.conversation._id);
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : "Unable to start the conversation.");
    } finally {
      setComposeSending(false);
    }
  }

  const activeConversation = conversations.find((conversation) => conversation._id === activeId) || null;

  return (
    <div className="p-6 min-h-screen" style={{ background: "#F6F7F9" }}>
      <PageHeader
        title="Messages"
        subtitle="Coordinate with barangay staff, city office staff, and students."
        breadcrumb={["Super Admin", "Messages"]}
        action={
          <button
            onClick={openCompose}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: "#163A63" }}
          >
            <Icon name="plus" size={15} />
            New Message
          </button>
        }
      />

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      <div className="flex gap-4 h-[calc(100vh-230px)] min-h-[480px]">
        {/* Conversation list */}
        <div className="w-80 flex-shrink-0 bg-white rounded-xl border border-[#E5E7EB] flex flex-col overflow-hidden">
          <div className="p-3 border-b border-[#E5E7EB]">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]">
                <Icon name="search" size={14} />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#E5E7EB] text-sm outline-none focus:ring-2 focus:ring-[#163A63]/20"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="py-12 flex flex-col items-center gap-2 text-[#6B7280]">
                <Icon name="refresh" size={18} className="animate-spin" />
                <span className="text-xs">Loading conversations…</span>
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon="message-square"
                title={search ? "No matches" : "No conversations yet"}
                description={search ? "Try a different search term." : "Start one with the New Message button."}
              />
            ) : (
              filtered.map((conversation) => {
                const isActive = conversation._id === activeId;
                return (
                  <button
                    key={conversation._id}
                    onClick={() => setActiveId(conversation._id)}
                    className="w-full text-left px-4 py-3 border-b border-[#F3F4F6] transition-colors"
                    style={{ backgroundColor: isActive ? "#F0F4FA" : undefined }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0B1F3A] truncate">{conversationTitle(conversation)}</p>
                        <p className="text-xs text-[#6B7280] truncate mt-0.5">{conversationMeta(conversation)}</p>
                      </div>
                      <span className="text-[10px] text-[#9CA3AF] whitespace-nowrap mt-0.5">
                        {formatTime(conversation.lastMessageAt || conversation.updatedAt)}
                      </span>
                    </div>
                    {conversation.subject && (
                      <p className="text-xs text-[#374151] truncate mt-1.5">{conversation.subject}</p>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Thread */}
        {/* Thread */}
        <div className="flex-1 bg-white rounded-xl border border-[#E5E7EB] flex flex-col overflow-hidden">
          {!activeConversation ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon="message-square"
                title="Select a conversation"
                description="Pick a conversation from the list or start a new one."
              />
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center gap-3" style={{ backgroundColor: "#F6F7F9" }}>
                <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#163A63", color: "#fff" }}>
                  <Icon name="user" size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0B1F3A] truncate">{conversationTitle(activeConversation)}</p>
                  <p className="text-xs text-[#6B7280] truncate">{conversationMeta(activeConversation)}</p>
                </div>
                <button
                  onClick={() => { loadConversations(); loadMessages(activeConversation._id); }}
                  className="ml-auto text-[#6B7280] hover:text-[#163A63] transition-colors"
                  title="Refresh"
                >
                  <Icon name="refresh" size={16} />
                </button>
              </div>

              <div ref={threadRef} className="flex-1 overflow-y-auto p-5 space-y-3">
                {threadLoading ? (
                  <div className="py-10 flex flex-col items-center gap-2 text-[#6B7280]">
                    <Icon name="refresh" size={18} className="animate-spin" />
                    <span className="text-xs">Loading messages…</span>
                  </div>
                ) : messages.length === 0 ? (
                  <EmptyState icon="message-square" title="No messages yet" description="Send the first message below." />
                ) : (
                  messages.map((message) => {
                    const mine = message.sender?._id === myId;
                    return (
                      <div key={message._id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div
                          className="max-w-[70%] rounded-2xl px-4 py-2.5"
                          style={{
                            backgroundColor: mine ? "#163A63" : "#F3F4F6",
                            color: mine ? "#fff" : "#1F2937",
                            borderBottomRightRadius: mine ? 4 : undefined,
                            borderBottomLeftRadius: mine ? undefined : 4,
                          }}
                        >
                          {!mine && (
                            <p className="text-[11px] font-semibold mb-0.5" style={{ color: "#163A63" }}>
                              {message.sender?.name || "Unknown"} · {roleLabel(message.sender?.role)}
                            </p>
                          )}
                          <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>
                          <p className={`text-[10px] mt-1 ${mine ? "text-slate-300" : "text-[#9CA3AF]"}`}>
                            {formatStamp(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-4 border-t border-[#E5E7EB]">
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    rows={2}
                    placeholder="Type a message… (Enter to send, Shift+Enter for a new line)"
                    className="flex-1 resize-none rounded-lg border border-[#E5E7EB] px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#163A63]/20"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!draft.trim() || sending}
                    className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 flex items-center gap-2"
                    style={{ backgroundColor: "#163A63" }}
                  >
                    {sending ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="send" size={14} />}
                    Send
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* COMPOSE MODAL */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-[#0B1F3A]">New Message</h2>
              <button onClick={() => setShowCompose(false)} className="text-[#9CA3AF] hover:text-[#374151]">
                <Icon name="x" size={20} />
              </button>
            </div>

            {composeError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {composeError}
              </div>
            )}

            <label className="block text-sm font-medium text-[#374151] mb-1.5">Recipient</label>
            {directoryLoading ? (
              <p className="text-sm text-[#6B7280] mb-4">Loading users…</p>
            ) : (
              <select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5E7EB] text-sm outline-none focus:ring-2 focus:ring-[#163A63]/20 bg-white mb-4"
              >
                <option value="">Select a user…</option>
                {directory.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} — {roleLabel(user.dbRole)} ({user.email})
                  </option>
                ))}
              </select>
            )}

            <label className="block text-sm font-medium text-[#374151] mb-1.5">Subject (optional)</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What is this about?"
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5E7EB] text-sm outline-none focus:ring-2 focus:ring-[#163A63]/20"
            />

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCompose(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[#E5E7EB] text-sm font-medium text-[#374151] hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateConversation}
                disabled={!recipientId || composeSending}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: "#163A63" }}
              >
                {composeSending ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="send" size={14} />}
                Start Conversation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




