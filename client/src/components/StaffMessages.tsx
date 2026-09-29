// ============================================================
// StaffMessages — the SHARED inbox for City Office, Barangay, and
// Super Admin reviewers. All three portals talk to the SAME endpoints:
//   GET/POST /api/messages/conversations, GET/POST .../:id/messages,
//   GET /api/messages/recipients.
// Who may message whom is enforced on the server (utils/messaging.js):
// City <-> Barangay, City <-> Super Admin, Barangay <-> Student.
// The client only displays the allowed recipients and the policy text the
// server returns — it can never widen them. 15s polling keeps every portal
// fresh; unread badges show per thread and on New Message.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import PageHeader from './PageHeader';
import EmptyState from './EmptyState';
import { api } from '../lib/api';
import { getSession } from '../lib/auth';

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
  unreadCount?: number;
  lastMessageAt: string | null;
  updatedAt: string;
}

interface MessageDto {
  _id: string;
  sender: { _id: string; name: string; role: string };
  body: string;
  createdAt: string;
  isRead?: boolean;
}

// GET /api/messages/recipients returns each account with `id` (the string form
// of the Mongo _id) — NOT `_id`, which is undefined on the wire. `barangay`
// comes back as a plain name string for the same reason.
interface RecipientDto {
  id: string;
  name: string;
  email?: string;
  role: string;
  roleLabel?: string;
  barangay?: string;
}

interface ConversationsResponse {
  success: boolean;
  conversations: ConversationDto[];
  totalUnread?: number;
}

interface MessagesResponse {
  success: boolean;
  messages: MessageDto[];
}

interface RecipientsResponse {
  success: boolean;
  recipients: RecipientDto[];
  summary?: string;
  policy?: string;
  message?: string;
}


// Re-poll interval for the thread list AND the open thread.
const POLL_MS = 15000;

const STAFF_ROLE_LABELS: Record<string, string> = {
  student: 'Student',
  barangay_admin: 'Barangay Office',
  barangay_staff: 'Barangay Office',
  city_admin: 'City Office',
  admin_staff: 'City Office',
  super_admin: 'Super Admin',
  superadmin: 'Super Admin',
};

function staffRoleLabel(role?: string) {
  return STAFF_ROLE_LABELS[role || ''] || role || 'User';
}

// Staff accounts are provisioned by the Super Admin with an email only, so the
// name can be blank — fall back to the email so a row is never unreadable.
function personLabel(person: RecipientDto) {
  const who = (person.name || '').trim() || person.email || 'Unnamed account';
  const role = person.roleLabel || staffRoleLabel(person.role);
  const where = person.barangay ? ` (Brgy. ${person.barangay})` : '';
  return `${who} — ${role}${where}`;
}

// A MongoDB _id is 24 hex characters. createConversation needs the real _id, so
// this guards against ever posting a display label.
const OBJECT_ID = /^[a-f\d]{24}$/i;

function initials(name: string) {
  return name.split(' ').filter(Boolean).map(word => word[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function formatThreadTime(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  if (diff >= 0 && diff < 24 * 60 * 60 * 1000) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatStamp(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

interface StaffMessagesProps {
  title: string;
  subtitle: string;
  breadcrumb: string[];
  // Shown above the thread list; each portal documents which threads it sees.
  threadHint: string;
  emptyThreadsTitle: string;
  emptyThreadsHint: string;
  composeButtonLabel?: string;
}


export default function StaffMessages({
  title,
  subtitle,
  breadcrumb,
  threadHint,
  emptyThreadsTitle,
  emptyThreadsHint,
  composeButtonLabel = 'New Message',
}: StaffMessagesProps) {
  const myId = getSession()?.user?.id || '';

  const [threads, setThreads] = useState<ConversationDto[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const [showCompose, setShowCompose] = useState(false);
  const [directory, setDirectory] = useState<RecipientDto[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryHint, setDirectoryHint] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [subject, setSubject] = useState('');
  const [composeError, setComposeError] = useState('');
  const [composeSending, setComposeSending] = useState(false);

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const activeThread = useMemo(
    () => threads.find(thread => thread._id === activeId) || null,
    [threads, activeId]
  );
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  // The person on the other side of the OPEN thread.
  const otherSide = useMemo(
    () => activeThread?.participants.find(participant => String(participant._id) !== String(myId)) || null,
    [activeThread, myId]
  );


  const loadThreads = useCallback(async () => {
    try {
      const result = await api<ConversationsResponse>('/messages/conversations');
      setThreads(result.conversations || []);
      setTotalUnread(result.totalUnread || 0);
      setError('');
      return result.conversations || [];
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load conversations.');
      return null;
    }
  }, []);

  // First load: threads; the selection stays empty until the reviewer picks one.
  useEffect(() => {
    loadThreads().finally(() => setLoading(false));
  }, [loadThreads]);

  // Open-thread messages when the selection changes.
  const loadThread = useCallback(async (conversationId: string) => {
    setThreadLoading(true);
    try {
      const result = await api<MessagesResponse>(`/messages/conversations/${conversationId}/messages`);
      setMessages(result.messages || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load conversation.');
    } finally {
      setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    loadThread(activeId);
  }, [activeId, loadThread]);

  // Poll the list AND the open thread every 15s so replies sent from another
  // portal appear without a refresh. Refetching the open thread marks it read,
  // and the next list refresh already carries the new (zero) unread count.
  useEffect(() => {
    const timer = window.setInterval(async () => {
      const current = activeIdRef.current;
      if (current) {
        try {
          const result = await api<MessagesResponse>(`/messages/conversations/${current}/messages`);
          setMessages(result.messages || []);
        } catch {
          // Keep the messages already on screen; retry on the next tick.
        }
      }
      const fresh = await loadThreads();
      if (fresh && current && !fresh.some(thread => thread._id === current)) {
        setActiveId(null);
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadThreads]);

  // Keep the thread pinned to the newest message.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, activeId]);

  const openThread = (conversationId: string) => {
    if (conversationId === activeId) return;
    setDraft('');
    setActiveId(conversationId);
    // The thread opens read; the next refresh carries the real badge numbers.
    setThreads(current => current.map(thread =>
      thread._id === conversationId ? { ...thread, unreadCount: 0 } : thread
    ));
  };


  const openCompose = async () => {
    setShowCompose(true);
    setComposeError('');
    setDirectoryHint('');
    if (directory.length) return;
    setDirectoryLoading(true);
    try {
      const result = await api<RecipientsResponse>('/messages/recipients');
      // Guard the contract: an entry without a usable id cannot be selected, and
      // a <option> with a missing value falls back to its own text — which would
      // post a display label. Drop those rows instead of offering them.
      const usable = (result.recipients || []).filter((person) => OBJECT_ID.test(String(person.id || '')));
      setDirectory(usable);
      setDirectoryHint(result.summary || result.message || '');
      // Clear a selection that is no longer in the list.
      setRecipientId(current => (usable.some(person => person.id === current) ? current : ''));
    } catch (requestError) {
      setComposeError(requestError instanceof Error ? requestError.message : 'Unable to load recipients.');
    } finally {
      setDirectoryLoading(false);
    }
  };

  const startConversation = async () => {
    if (!recipientId || composeSending) return;
    // createConversation needs the account id. If this ever trips, the selection
    // is stale or malformed — say so honestly instead of implying nothing is
    // selected, and let the user pick again.
    if (!OBJECT_ID.test(recipientId)) {
      setRecipientId('');
      setComposeError('That recipient could not be read. Please select one from the list again.');
      return;
    }
    setComposeSending(true);
    setComposeError('');
    try {
      const result = await api<{ conversation: ConversationDto }>('/messages/conversations', {
        method: 'POST',
        body: JSON.stringify({ recipientId, subject: subject.trim() }),
      });
      setThreads(current => current.some(thread => thread._id === result.conversation._id)
        ? current.map(thread => thread._id === result.conversation._id ? { ...result.conversation, unreadCount: thread.unreadCount } : thread)
        : [result.conversation, ...current]);
      setActiveId(result.conversation._id);
      setShowCompose(false);
      setRecipientId('');
      setSubject('');
    } catch (requestError) {
      setComposeError(requestError instanceof Error ? requestError.message : 'Unable to start the conversation.');
    } finally {
      setComposeSending(false);
    }
  };

  const sendMessage = async () => {
    const body = draft.trim();
    if (!activeId || !body || sending) return;
    setSending(true);
    try {
      const result = await api<{ message: MessageDto }>(`/messages/conversations/${activeId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      setMessages(current => [...current, result.message]);
      setDraft('');
      await loadThreads();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to send message.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-sm text-[#6B7280]">Loading conversations…</div>;
  }


  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        breadcrumb={breadcrumb}
        action={(
          <button
            onClick={openCompose}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#163A63] text-sm text-white hover:bg-[#0B1F3A] transition-colors"
            style={{ fontWeight: 600 }}
          >
            <Icon name="plus" size={14} /> {composeButtonLabel}
            {totalUnread > 0 && (
              <span className="ml-1 min-w-[20px] h-5 px-1.5 rounded-full bg-white text-[#163A63] text-xs flex items-center justify-center" style={{ fontWeight: 700 }}>
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </button>
        )}
      />

      {error && <div className="mb-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <div className="grid md:grid-cols-[300px_1fr] min-h-[540px]">
          {/* Thread list with per-thread unread badges */}
          <aside className="border-b md:border-b-0 md:border-r border-[#E5E7EB] flex flex-col min-h-0">
            <div className="px-5 py-4 border-b border-[#E5E7EB]">
              <div className="text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>
                Conversations
                {totalUnread > 0 && <span className="ml-2 text-xs text-[#D97706]">{totalUnread} unread</span>}
              </div>
              <p className="text-xs text-[#9CA3AF] mt-0.5">{threadHint}</p>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-[#F1F5F9] max-h-[320px] md:max-h-none">
              {threads.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <EmptyState icon="message-square" title={emptyThreadsTitle} description={emptyThreadsHint} />
                </div>
              )}
              {threads.map(thread => {
                const other = thread.participants.find(participant => String(participant._id) !== String(myId));
                const unread = thread.unreadCount || 0;
                const isActive = thread._id === activeId;
                return (
                  <button
                    key={thread._id}
                    onClick={() => openThread(thread._id)}
                    className={`w-full text-left px-5 py-4 hover:bg-[#F6F7F9] transition-colors ${isActive ? 'bg-[#F0F4FA]' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#163A63] flex items-center justify-center text-white text-xs flex-shrink-0" style={{ fontWeight: 700 }}>
                        {initials(other?.name || thread.subject || '?')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[#1F2937] truncate" style={{ fontWeight: unread > 0 ? 700 : 600 }}>
                            {other?.name || thread.subject || 'Conversation'}
                          </span>
                          {unread > 0 && (
                            <span className="ml-auto flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#D97706] text-white text-xs flex items-center justify-center" style={{ fontWeight: 700 }}>
                              {unread > 99 ? '99+' : unread}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#9CA3AF] truncate mt-0.5">
                          {[other ? staffRoleLabel(other.role) : '', other?.barangay?.name ? `Brgy. ${other.barangay.name}` : '', thread.subject].filter(Boolean).join(' · ')}
                        </div>
                        <div className="text-xs text-[#9CA3AF] mt-0.5">{formatThreadTime(thread.lastMessageAt)}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Open thread */}
          <section className="flex flex-col min-h-[420px] bg-[#F6F7F9]">
            {!activeThread ? (
              <div className="flex-1 flex items-center justify-center">
                <EmptyState icon="message-square" title="Select a conversation" description="Pick a thread on the left, or start a new one." />
              </div>
            ) : (
              <>
                <div className="bg-white border-b border-[#E5E7EB] px-5 py-3.5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#163A63] flex items-center justify-center text-white text-xs flex-shrink-0" style={{ fontWeight: 700 }}>
                    {initials(otherSide?.name || activeThread.subject || '?')}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-[#1F2937] truncate" style={{ fontWeight: 600 }}>
                      {otherSide?.name || activeThread.subject || 'Conversation'}
                    </div>
                    <div className="text-xs text-[#9CA3AF] truncate">
                      {otherSide ? staffRoleLabel(otherSide.role) : ''}{otherSide?.barangay?.name ? ` · Brgy. ${otherSide.barangay.name}` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {threadLoading && messages.length === 0 ? (
                    <div className="text-center text-sm text-[#6B7280] mt-10">Loading messages…</div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-sm text-[#6B7280] mt-10">No messages in this thread yet — say hello below.</div>
                  ) : messages.map(message => {
                    const mine = String(message.sender?._id) === String(myId);
                    return (
                      <div key={message._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm ${mine ? 'bg-[#0B1F3A] text-white rounded-tr-none' : 'bg-white text-[#1F2937] border border-[#E5E7EB] rounded-tl-none'}`}>
                          {!mine && <p className="text-[11px] text-[#9CA3AF] mb-0.5">{message.sender?.name}</p>}
                          <p className="whitespace-pre-wrap break-words">{message.body}</p>
                          <p className={`text-[10px] mt-1 ${mine ? 'text-white/50' : 'text-[#9CA3AF]'}`}>{formatStamp(message.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={threadEndRef} />
                </div>

                <div className="bg-white border-t border-[#E5E7EB] p-4">
                  <div className="flex gap-3 items-end">
                    <textarea
                      value={draft}
                      onChange={event => setDraft(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          sendMessage();
                        }
                      }}
                      rows={2}
                      placeholder={`Message ${otherSide?.name || 'them'}… (Enter to send, Shift+Enter for a new line)`}
                      className="flex-1 resize-none rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={sending || !draft.trim()}
                      title="Send message"
                      className="p-2.5 rounded-xl bg-[#0B1F3A] text-white disabled:opacity-40 hover:bg-[#163A63] transition-colors flex-shrink-0"
                    >
                      <Icon name="send" size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {/* Compose modal — only the server-allowed recipients are offered. */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg text-[#0B1F3A]" style={{ fontWeight: 700 }}>{composeButtonLabel}</h2>
              <button onClick={() => setShowCompose(false)} disabled={composeSending} className="text-[#9CA3AF] hover:text-[#374151] disabled:opacity-40">
                <Icon name="x" size={20} />
              </button>
            </div>

            {composeError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {composeError}
              </div>
            )}
            {directoryHint && (
              <p className="mb-4 text-xs text-[#6B7280]">{directoryHint}</p>
            )}

            <label className="block text-sm font-medium text-[#374151] mb-1.5">Recipient</label>
            {directoryLoading ? (
              <p className="text-sm text-[#6B7280] mb-4">Loading recipients…</p>
            ) : (
              <select
                value={recipientId}
                onChange={event => setRecipientId(event.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5E7EB] text-sm outline-none focus:ring-2 focus:ring-[#163A63]/20 bg-white mb-4"
              >
                <option value="">Select a recipient…</option>
                {/* The option VALUE is the account id from the API — that is what
                    createConversation expects. The "name — role" text is only a
                    label; never bind it to the value. */}
                {directory.map(person => (
                  <option key={person.id} value={person.id}>
                    {personLabel(person)}
                  </option>
                ))}
              </select>
            )}

            <label className="block text-sm font-medium text-[#374151] mb-1.5">Subject (optional)</label>
            <input
              value={subject}
              onChange={event => setSubject(event.target.value)}
              placeholder="What is this about?"
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5E7EB] text-sm outline-none focus:ring-2 focus:ring-[#163A63]/20"
            />

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCompose(false)}
                disabled={composeSending}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[#E5E7EB] text-sm font-medium text-[#374151] hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={startConversation}
                disabled={!recipientId || composeSending}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: '#163A63' }}
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
