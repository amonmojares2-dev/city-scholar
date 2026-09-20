import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';

interface Announcement {
  id: string;
  title: string;
  message: string;
  target: string;
  priority: 'Normal' | 'Important' | 'Urgent';
  dateSent: string;
}

const PRIORITY_BADGE: Record<string, string> = {
  Normal: 'bg-gray-100 text-gray-600',
  Important: 'bg-amber-100 text-amber-700',
  Urgent: 'bg-red-100 text-red-700',
};

const BARANGAYS = ['Barangay 1', 'Barangay 2', 'Barangay 3', 'Barangay 4', 'Barangay 5', 'Barangay 6'];
const SCHOOLS = ['City College', 'State University', 'Polytechnic Institute', 'Community College', 'Technical School'];

export default function SuperAdminAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetAudience, setTargetAudience] = useState('All Users');
  const [barangay, setBarangay] = useState(BARANGAYS[0]);
  const [school, setSchool] = useState(SCHOOLS[0]);
  const [priority, setPriority] = useState<'Normal' | 'Important' | 'Urgent'>('Normal');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    setError('');
    try {
      const result = await api<{ announcement: Announcement }>('/announcements', {
        method: 'POST',
        body: JSON.stringify({
          category: 'General',
          title: title.trim(),
          body: message.trim(),
          target: targetAudience,
          priority,
        }),
      });
      setAnnouncements(current => [result.announcement, ...current]);
      setSent(true);
      setTitle('');
      setMessage('');
      setTargetAudience('All Users');
      setPriority('Normal');
      setTimeout(() => setSent(false), 3000);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Unable to send the announcement.');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    api<{ announcements: Announcement[] }>('/announcements')
      .then(result => setAnnouncements(result.announcements))
      .catch(requestError => setError(requestError instanceof Error ? requestError.message : 'Unable to load announcements.'))
      .finally(() => setLoading(false));
  }, []);

  const AUDIENCE_OPTIONS = [
    'All Users',
    'Students Only',
    'Barangay Officials Only',
    'City Office Staff Only',
    'Specific Barangay',
    'Specific School',
  ];

  return (
    <div className="p-6 min-h-screen" style={{ background: '#F6F7F9' }}>
      <PageHeader
        title="Announcements"
        subtitle="Broadcast announcements to scholars, officials, and staff"
        breadcrumb={['Super Admin', 'Announcements']}
      />

      <div className="flex gap-6 items-start">
        {/* Create Form — 60% */}
        <div className="flex-[3] rounded-xl border p-6" style={{ background: '#fff', borderColor: '#E5E7EB' }}>
          <div className="flex items-center gap-2 mb-5">
            <Icon name="megaphone" size={18} className="text-[#163A63]" />
            <span className="font-600 text-base" style={{ fontWeight: 600, color: '#0B1F3A' }}>Create Announcement</span>
          </div>

          <div className="flex flex-col gap-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Enter announcement title"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                style={{ borderColor: '#E5E7EB', color: '#0B1F3A' }}
              />
            </div>

            {/* Message */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>Message</label>
              <textarea
                rows={4}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Write your announcement message…"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63] resize-none"
                style={{ borderColor: '#E5E7EB', color: '#0B1F3A' }}
              />
            </div>

            {/* Target Audience */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#374151' }}>Target Audience</label>
              <div className="flex flex-col gap-2">
                {AUDIENCE_OPTIONS.map(opt => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="audience"
                      value={opt}
                      checked={targetAudience === opt}
                      onChange={() => setTargetAudience(opt)}
                      className="accent-[#163A63]"
                    />
                    <span className="text-sm" style={{ color: '#374151' }}>{opt}</span>
                  </label>
                ))}
              </div>
              {targetAudience === 'Specific Barangay' && (
                <div className="mt-2">
                  <select
                    value={barangay}
                    onChange={e => setBarangay(e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm w-full focus:outline-none"
                    style={{ borderColor: '#E5E7EB', color: '#0B1F3A' }}
                  >
                    {BARANGAYS.map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
              )}
              {targetAudience === 'Specific School' && (
                <div className="mt-2">
                  <select
                    value={school}
                    onChange={e => setSchool(e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm w-full focus:outline-none"
                    style={{ borderColor: '#E5E7EB', color: '#0B1F3A' }}
                  >
                    {SCHOOLS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as 'Normal' | 'Important' | 'Urgent')}
                className="border rounded-lg px-3 py-2 text-sm w-full focus:outline-none"
                style={{
                  borderColor: '#E5E7EB',
                  color: priority === 'Urgent' ? '#B91C1C' : priority === 'Important' ? '#B45309' : '#0B1F3A',
                }}
              >
                <option value="Normal">Normal</option>
                <option value="Important">Important</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>

            {/* Send Button */}
            {sent && (
              <div className="flex items-center gap-2 text-sm font-medium rounded-lg px-3 py-2" style={{ background: '#DCFCE7', color: '#15803D' }}>
                <Icon name="check-circle" size={16} />
                Announcement sent successfully!
              </div>
            )}
            <button
              onClick={handleSend}
              disabled={sending || !title.trim() || !message.trim()}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: '#0B1F3A', color: '#fff' }}
            >
              {sending ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sending…
                </>
              ) : (
                <>
                  <Icon name="send" size={15} />
                  Send Announcement
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sent Announcements — 40% */}
        <div className="flex-[2] flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="bell" size={16} className="text-[#163A63]" />
            <span className="font-600 text-sm" style={{ fontWeight: 600, color: '#0B1F3A' }}>Sent Announcements</span>
          </div>
          {loading && (
            <div className="rounded-xl border p-6 text-center text-sm" style={{ background: '#fff', borderColor: '#E5E7EB', color: '#6B7280' }}>
              Loading announcements…
            </div>
          )}
          {!loading && error && (
            <div className="rounded-xl border p-4 text-sm" style={{ background: '#FEF2F2', borderColor: '#FECACA', color: '#B91C1C' }}>
              {error}
            </div>
          )}
          {!loading && !error && announcements.length === 0 && (
            <div className="rounded-xl border p-6 text-center text-sm" style={{ background: '#fff', borderColor: '#E5E7EB', color: '#6B7280' }}>
              No announcements have been published yet.
            </div>
          )}
          {announcements.map(ann => (
            <div key={ann.id} className="rounded-xl border p-4" style={{ background: '#fff', borderColor: '#E5E7EB' }}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="text-sm font-medium leading-snug" style={{ color: '#0B1F3A' }}>{ann.title}</div>
                <span className={`shrink-0 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_BADGE[ann.priority]}`}>
                  {ann.priority}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs mb-2" style={{ color: '#6B7280' }}>
                <span>{ann.target}</span>
                <span>·</span>
                <span>{ann.dateSent}</span>
              </div>
              {expandedId === ann.id && (
                <p className="text-xs leading-relaxed mb-2" style={{ color: '#374151' }}>{ann.message}</p>
              )}
              <button
                onClick={() => setExpandedId(expandedId === ann.id ? null : ann.id)}
                className="text-xs font-medium flex items-center gap-1"
                style={{ color: '#163A63' }}
              >
                <Icon name={expandedId === ann.id ? 'chevron-down' : 'chevron-right'} size={12} />
                {expandedId === ann.id ? 'Hide' : 'View'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
