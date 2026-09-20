import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Icon from '../../components/Icon';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import { api } from '../../lib/api';
import { getSession } from '../../lib/auth';
import { buildStudentAccess, type StudentAccess } from '../../lib/studentAccess';

type Application = { _id: string; program: string; school: string; status: string; submittedAt?: string; createdAt: string };
type Document = { _id: string; type: string; originalName: string; status: string; createdAt: string };
type Conversation = { _id: string; subject: string; participants: { name: string }[]; lastMessageAt?: string };
type Notification = { _id: string; title: string; message: string; createdAt: string; readAt?: string };

const formatDate = (value?: string) => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not submitted';
const formatRelative = (value?: string) => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

export default function StudentDashboard() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sessionUser = getSession()?.user;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const latestApplication = applications[0];
  const unreadNotifications = notifications.filter(notification => !notification.readAt).length;

  useEffect(() => {
    Promise.all([
      api<{ applications: Application[] }>('/applications'),
      api<{ documents: Document[] }>('/documents'),
      api<{ conversations: Conversation[] }>('/messages/conversations'),
      api<{ notifications: Notification[] }>('/notifications'),
    ]).then(([applicationResult, documentResult, conversationResult, notificationResult]) => {
      setApplications(applicationResult.applications);
      setDocuments(documentResult.documents);
      setConversations(conversationResult.conversations);
      setNotifications(notificationResult.notifications);
    }).catch((requestError) => {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load your dashboard.');
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading your scholarship data...</div>;
  if (error) return <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-sm text-red-700">{error}</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-700 text-[#1F2937]" style={{ fontWeight: 700 }}>{greeting}, {sessionUser?.name || 'Scholar'}!</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">Here is the latest update on your scholarship journey.</p>
      </div>

      <div className="bg-[#0B1F3A] rounded-2xl p-6 mb-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-white/50 mb-1">{latestApplication?.program || 'Scholarship Applications'}</div>
            <div className="font-700 text-lg mb-2" style={{ fontWeight: 700 }}>Scholarship Status</div>
            {latestApplication ? <StatusBadge status={latestApplication.status.replace('_', '-')} /> : <span className="text-sm text-white/60">No application submitted</span>}
            <p className="text-sm text-white/60 mt-3 max-w-sm">
              {latestApplication ? `Your application for ${latestApplication.school} was submitted on ${formatDate(latestApplication.submittedAt || latestApplication.createdAt)}.` : 'Start an application to see your scholarship status and document requirements here.'}
            </p>
          </div>
          <div className="w-14 h-14 bg-[#D4A72C]/20 rounded-2xl flex items-center justify-center flex-shrink-0"><Icon name="award" size={24} className="text-[#D4A72C]" /></div>
        </div>
        <div className="mt-5 pt-5 border-t border-white/10 grid grid-cols-3 gap-4">
          <div><div className="text-xs text-white/40 mb-1">Documents</div><div className="font-700 text-white" style={{ fontWeight: 700 }}>{documents.length}</div><div className="text-xs text-white/50 mt-0.5">uploaded</div></div>
          <div><div className="text-xs text-white/40 mb-1">Applications</div><div className="font-700 text-white" style={{ fontWeight: 700 }}>{applications.length}</div><div className="text-xs text-white/50 mt-0.5">recorded</div></div>
          <div><div className="text-xs text-white/40 mb-1">Last submitted</div><div className="font-600 text-white text-sm" style={{ fontWeight: 600 }}>{formatDate(latestApplication?.submittedAt || latestApplication?.createdAt)}</div></div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        <StatCard label="Documents Submitted" value={String(documents.length)} icon="file-text" change={documents.length ? 'Saved to your account' : 'None uploaded yet'} changeType={documents.length ? 'neutral' : 'down'} />
        <StatCard label="Applications" value={String(applications.length)} icon="clipboard" change={latestApplication?.status.replace('_', '-') || 'Get started'} changeType="neutral" />
        <StatCard label="Unread Notifications" value={String(unreadNotifications)} icon="bell" change={unreadNotifications ? 'Needs your attention' : 'All caught up'} changeType={unreadNotifications ? 'down' : 'neutral'} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]"><h2 className="font-600 text-[#1F2937] text-sm" style={{ fontWeight: 600 }}>Your Applications</h2><Link to="/student/renewal" className="text-xs font-600 text-[#163A63]">New application</Link></div>
          {applications.length === 0 ? <div className="px-5 py-10 text-center text-sm text-[#6B7280]">No applications have been submitted yet.</div> : <div className="divide-y divide-[#E5E7EB]">{applications.map(application => <div key={application._id} className="flex items-center gap-4 px-5 py-4"><div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center"><Icon name="file-text" size={16} className="text-[#2563EB]" /></div><div className="flex-1 min-w-0"><div className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{application.program}</div><div className="text-xs text-[#6B7280]">{application.school} · {formatDate(application.submittedAt || application.createdAt)}</div></div><StatusBadge status={application.status.replace('_', '-')} size="sm" /></div>)}</div>}
        </div>

        <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB]"><h2 className="font-600 text-[#1F2937] text-sm" style={{ fontWeight: 600 }}>Recent Messages</h2></div>
          {conversations.length === 0 ? <div className="px-5 py-10 text-center text-sm text-[#6B7280]">No conversations yet.</div> : <div className="divide-y divide-[#E5E7EB]">{conversations.slice(0, 3).map(conversation => <Link key={conversation._id} to="/student/messages" className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#F6F7F9]"><div className="w-8 h-8 rounded-full bg-[#163A63] flex items-center justify-center text-white text-xs font-700">CS</div><div className="flex-1 min-w-0"><div className="text-sm font-600 text-[#1F2937]">{conversation.subject || conversation.participants.find(participant => participant.name !== sessionUser?.name)?.name || 'Conversation'}</div><div className="text-xs text-[#6B7280]">{formatRelative(conversation.lastMessageAt)}</div></div></Link>)}</div>}
        </div>
      </div>

      {notifications.length > 0 && <div className="mt-5 bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden"><div className="px-5 py-4 border-b border-[#E5E7EB]"><h2 className="font-600 text-[#1F2937] text-sm" style={{ fontWeight: 600 }}>Latest Notification</h2></div><div className="px-5 py-4"><div className="font-600 text-sm text-[#1F2937]">{notifications[0].title}</div><div className="text-xs text-[#6B7280] mt-1">{notifications[0].message}</div></div></div>}
    </div>
  );
}
