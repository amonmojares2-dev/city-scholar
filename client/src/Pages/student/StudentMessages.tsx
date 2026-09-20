import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { api } from '../../lib/api';
import { getSession } from '../../lib/auth';

type Participant = { _id?: string; name: string; role?: string; barangay?: { name: string } };
type Conversation = { _id: string; subject: string; participants: Participant[]; lastMessageAt?: string };
type Message = { _id: string; sender: Participant; body: string; createdAt: string };
type CurrentUser = { barangay?: { name: string } };
const formatTime = (value: string) => new Date(value).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });

export default function StudentMessages() {
  const sessionUser = getSession()?.user;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [assignedBarangay, setAssignedBarangay] = useState('');

  useEffect(() => {
    Promise.all([
      api<{ conversations: Conversation[] }>('/messages/conversations'),
      api<{ user: CurrentUser }>('/auth/me'),
    ]).then(([conversationResult, userResult]) => {
      setConversations(conversationResult.conversations);
      setActive(conversationResult.conversations[0] || null);
      setAssignedBarangay(userResult.user.barangay?.name || 'Barangay not assigned');
    }).catch(requestError => setError(requestError instanceof Error ? requestError.message : 'Unable to load conversations.')).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!active) { setMessages([]); return; }
    api<{ messages: Message[] }>(`/messages/conversations/${active._id}/messages`).then(result => setMessages(result.messages)).catch(requestError => setError(requestError instanceof Error ? requestError.message : 'Unable to load messages.'));
  }, [active]);

  const openBarangayConversation = async () => {
    setCreating(true); setError('');
    try {
      const result = await api<{ conversation: Conversation }>('/messages/conversations', { method: 'POST', body: JSON.stringify({ recipientType: 'barangay', subject: 'Student inquiry' }) });
      setConversations(current => current.some(conversation => conversation._id === result.conversation._id) ? current : [result.conversation, ...current]);
      setActive(result.conversation);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to open your barangay conversation.'); }
    finally { setCreating(false); }
  };
  const sendMessage = async () => {
    if (!active || !input.trim()) return;
    setSending(true); setError('');
    try { const result = await api<{ message: Message }>(`/messages/conversations/${active._id}/messages`, { method: 'POST', body: JSON.stringify({ body: input.trim() }) }); setMessages(current => [...current, result.message]); setInput(''); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to send message.'); }
    finally { setSending(false); }
  };

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading your messages...</div>;
  const activeBarangay = active?.participants.find(participant => participant.role === 'barangay_staff')?.barangay?.name || assignedBarangay;

  return <div className="-m-6"><div className="flex h-[calc(100vh-56px)]">
    <aside className="w-72 border-r border-[#E5E7EB] bg-white flex flex-col flex-shrink-0"><div className="p-4 border-b border-[#E5E7EB]"><div className="flex items-center justify-between gap-2"><h2 className="font-700 text-[#1F2937]">Messages</h2><button onClick={openBarangayConversation} disabled={creating} title="Message Barangay" className="w-8 h-8 rounded-lg bg-[#F6F7F9] text-[#163A63] flex items-center justify-center disabled:opacity-50"><Icon name="users" size={16} /></button></div><p className="text-xs text-[#6B7280] mt-2">Message your assigned Barangay staff</p></div><div className="flex-1 overflow-y-auto divide-y divide-[#E5E7EB]">{conversations.length === 0 ? <div className="p-6 text-center text-sm text-[#6B7280]">Click the Barangay icon to start.</div> : conversations.map(conversation => { const other = conversation.participants.find(participant => participant._id !== sessionUser?.id && participant.name !== sessionUser?.name); const name = other?.role === 'barangay_staff' ? other.barangay?.name || 'Assigned Barangay' : conversation.subject || other?.name || 'Conversation'; return <button key={conversation._id} onClick={() => setActive(conversation)} className={`w-full text-left px-4 py-3.5 hover:bg-[#F6F7F9] ${active?._id === conversation._id ? 'bg-[#F6F7F9]' : ''}`}><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-[#163A63] flex items-center justify-center text-white"><Icon name="users" size={15} /></div><div className="flex-1 min-w-0"><div className="text-sm font-600 text-[#1F2937] truncate">{name}</div><div className="text-xs text-[#6B7280]">{conversation.lastMessageAt ? formatTime(conversation.lastMessageAt) : 'No messages'}</div></div></div></button>; })}</div></aside>
    <section className="flex-1 flex flex-col bg-[#F6F7F9]">{error && <div className="m-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}{!active ? <div className="flex-1 flex items-center justify-center text-sm text-[#6B7280]">Select the Barangay icon to start messaging.</div> : <><div className="bg-white border-b border-[#E5E7EB] px-5 py-3.5 flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-[#163A63] flex items-center justify-center text-white"><Icon name="users" size={15} /></div><div className="font-600 text-sm text-[#1F2937]">{activeBarangay}</div></div><div className="flex-1 overflow-y-auto p-5 space-y-3">{messages.length === 0 ? <div className="text-center text-sm text-[#6B7280] mt-10">No messages in this conversation.</div> : messages.map(message => { const mine = message.sender._id === sessionUser?.id || message.sender.name === sessionUser?.name; return <div key={message._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[60%] px-4 py-2.5 rounded-2xl text-sm ${mine ? 'bg-[#0B1F3A] text-white rounded-tr-none' : 'bg-white text-[#1F2937] border border-[#E5E7EB] rounded-tl-none'}`}><p>{message.body}</p><p className={`text-[10px] mt-1 ${mine ? 'text-white/50' : 'text-[#9CA3AF]'}`}>{formatTime(message.createdAt)}</p></div></div>; })}</div><div className="bg-white border-t border-[#E5E7EB] p-4 flex gap-3 items-end"><input value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => event.key === 'Enter' && !event.shiftKey && (event.preventDefault(), sendMessage())} className="flex-1 px-4 py-2.5 rounded-xl border border-[#E5E7EB] text-sm" placeholder={`Message ${activeBarangay}...`} /><button onClick={sendMessage} disabled={sending || !input.trim()} className="p-2.5 rounded-xl bg-[#0B1F3A] text-white disabled:opacity-40"><Icon name="send" size={16} /></button></div></>}</section>
  </div></div>;
}
