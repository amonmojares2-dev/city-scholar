import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { api } from '../../lib/api';
import { getSession } from '../../lib/auth';

type Participant = { _id?: string; name: string; role?: string };
type Conversation = { _id: string; subject: string; participants: Participant[]; lastMessageAt?: string };
type Message = { _id: string; sender: Participant; body: string; createdAt: string };
const formatTime = (value: string) => new Date(value).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });

export default function BarangayMessages() {
  const sessionUser = getSession()?.user;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ conversations: Conversation[] }>('/messages/conversations').then(result => {
      setConversations(result.conversations);
      setActive(result.conversations[0] || null);
    }).catch(requestError => setError(requestError instanceof Error ? requestError.message : 'Unable to load student messages.')).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!active) { setMessages([]); return; }
    api<{ messages: Message[] }>(`/messages/conversations/${active._id}/messages`).then(result => setMessages(result.messages)).catch(requestError => setError(requestError instanceof Error ? requestError.message : 'Unable to load conversation.'));
  }, [active]);

  const sendMessage = async () => {
    if (!active || !input.trim()) return;
    setSending(true); setError('');
    try {
      const result = await api<{ message: Message }>(`/messages/conversations/${active._id}/messages`, { method: 'POST', body: JSON.stringify({ body: input.trim() }) });
      setMessages(current => [...current, result.message]); setInput('');
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to send reply.'); }
    finally { setSending(false); }
  };

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading student messages...</div>;
  return <div className="-m-6"><div className="flex h-[calc(100vh-56px)]"><aside className="w-72 border-r border-[#E5E7EB] bg-white flex flex-col flex-shrink-0"><div className="p-4 border-b border-[#E5E7EB]"><h2 className="font-700 text-[#1F2937]">Student Messages</h2><p className="text-xs text-[#6B7280] mt-2">Messages from students assigned to your barangay</p></div><div className="flex-1 overflow-y-auto divide-y divide-[#E5E7EB]">{conversations.length === 0 ? <div className="p-6 text-center text-sm text-[#6B7280]">No student messages yet.</div> : conversations.map(conversation => { const student = conversation.participants.find(participant => participant._id !== sessionUser?.id && participant.name !== sessionUser?.name); return <button key={conversation._id} onClick={() => setActive(conversation)} className={`w-full text-left px-4 py-3.5 hover:bg-[#F6F7F9] ${active?._id === conversation._id ? 'bg-[#F6F7F9]' : ''}`}><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-[#7C3AED] flex items-center justify-center text-white text-xs font-700">{(student?.name || 'ST').split(' ').map(word => word[0]).join('').slice(0, 2)}</div><div className="flex-1 min-w-0"><div className="text-sm font-600 text-[#1F2937] truncate">{student?.name || 'Student'}</div><div className="text-xs text-[#6B7280]">{conversation.lastMessageAt ? formatTime(conversation.lastMessageAt) : 'No messages'}</div></div></div></button>; })}</div></aside><section className="flex-1 flex flex-col bg-[#F6F7F9]">{error && <div className="m-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}{!active ? <div className="flex-1 flex items-center justify-center text-sm text-[#6B7280]">Student messages will appear here.</div> : <><div className="bg-white border-b border-[#E5E7EB] px-5 py-3.5 flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-[#7C3AED] flex items-center justify-center text-white"><Icon name="user" size={15} /></div><div className="font-600 text-sm text-[#1F2937]">{active.participants.find(participant => participant._id !== sessionUser?.id && participant.name !== sessionUser?.name)?.name || 'Student'}</div></div><div className="flex-1 overflow-y-auto p-5 space-y-3">{messages.map(message => { const mine = message.sender._id === sessionUser?.id || message.sender.name === sessionUser?.name; return <div key={message._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[60%] px-4 py-2.5 rounded-2xl text-sm ${mine ? 'bg-[#7C3AED] text-white rounded-tr-none' : 'bg-white text-[#1F2937] border border-[#E5E7EB] rounded-tl-none'}`}><p>{message.body}</p><p className={`text-[10px] mt-1 ${mine ? 'text-white/60' : 'text-[#9CA3AF]'}`}>{formatTime(message.createdAt)}</p></div></div>; })}</div><div className="bg-white border-t border-[#E5E7EB] p-4 flex gap-3"><input value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => event.key === 'Enter' && (event.preventDefault(), sendMessage())} className="flex-1 px-4 py-2.5 rounded-xl border border-[#E5E7EB] text-sm" placeholder="Reply to student..." /><button onClick={sendMessage} disabled={sending || !input.trim()} className="p-2.5 rounded-xl bg-[#7C3AED] text-white disabled:opacity-40"><Icon name="send" size={16} /></button></div></>}</section></div></div>;
}
