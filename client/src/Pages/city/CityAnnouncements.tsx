import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import PageHeader from '../../components/PageHeader';
import ConfirmDialog from '../../components/ConfirmDialog';
import { api } from '../../lib/api';
import { BARANGAYS } from '../../data/barangays';

interface Announcement {
  _id: string;
  id: string;
  title: string;
  message: string;
  target: string;
  targetBarangay?: string;
  priority: 'Normal' | 'Important' | 'Urgent';
  dateSent: string;
}

const PRIORITY_BADGE: Record<string, string> = {
  Normal: 'bg-gray-100 text-gray-600',
  Important: 'bg-amber-100 text-amber-700',
  Urgent: 'bg-red-100 text-red-700',
};

// The four audiences the backend accepts. "City Office Staff Only" and
// "Specific School" were removed — the server rejects them too.
const AUDIENCE_OPTIONS = ['All Users', 'Students Only', 'Barangay Officials Only', 'Specific Barangay'];

export default function SuperAdminAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetAudience, setTargetAudience] = useState('All Users');
  const [barangay, setBarangay] = useState<string>(BARANGAYS[0]);
  const [priority, setPriority] = useState<'Normal' | 'Important' | 'Urgent'>('Normal');
  const [sending, setSending] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api<{ announcements: Announcement[] }>('/announcements')
      .then(result => setAnnouncements(result.announcements || []))
      .catch(requestError => setError(requestError instanceof Error ? requestError.message : 'Unable to load announcements.'))
      .finally(() => setLoading(false));
  }, []);

  const resetForm = () => {
    setTitle('');
    setMessage('');
    setTargetAudience('All Users');
    setBarangay(BARANGAYS[0]);
    setPriority('Normal');
    setEditingId(null);
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    setError('');
    try {
      const payload = JSON.stringify({
        category: 'General',
        title: title.trim(),
        body: message.trim(),
        target: targetAudience,
        ...(targetAudience === 'Specific Barangay' ? { targetBarangay: barangay } : {}),
        priority,
      });

      if (editingId) {
        const result = await api<{ announcement: Announcement }>(`/announcements/${editingId}`, { method: 'PATCH', body: payload });
        setAnnouncements(current => current.map(item => (item._id === editingId ? result.announcement : item)));
        setSuccessMessage('Announcement updated successfully!');
      } else {
        const result = await api<{ announcement: Announcement }>('/announcements', { method: 'POST', body: payload });
        setAnnouncements(current => [result.announcement, ...current]);
        setSuccessMessage('Announcement sent successfully!');
      }

      resetForm();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Unable to save the announcement.');
    } finally {
      setSending(false);
    }
  };

  const startEdit = (announcement: Announcement) => {
    setEditingId(announcement._id);
    setTitle(announcement.title);
    setMessage(announcement.message);
    setTargetAudience(AUDIENCE_OPTIONS.includes(announcement.target) ? announcement.target : 'All Users');
    setBarangay(
      announcement.targetBarangay && (BARANGAYS as readonly string[]).includes(announcement.targetBarangay)
        ? announcement.targetBarangay
        : BARANGAYS[0],
    );
    setPriority(announcement.priority);
    setExpandedId(null);
    setError('');
    setSuccessMessage('');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      await api(`/announcements/${deleteTarget._id}`, { method: 'DELETE' });
      setAnnouncements(current => current.filter(item => item._id !== deleteTarget._id));
      if (editingId === deleteTarget._id) resetForm();
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete the announcement.');
    } finally {
      setDeleting(false);
    }
  };

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
            <span className="font-600 text-base" style={{ fontWeight: 600, color: '#0B1F3A' }}>{editingId ? 'Edit Announcement' : 'Create Announcement'}</span>
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
            {error && (
              <div className="flex items-center gap-2 text-sm font-medium rounded-lg px-3 py-2" style={{ background: '#FEF2F2', color: '#B91C1C' }}>
                <Icon name="info" size={16} />
                {error}
              </div>
            )}
            {successMessage && (
              <div className="flex items-center gap-2 text-sm font-medium rounded-lg px-3 py-2" style={{ background: '#DCFCE7', color: '#15803D' }}>
                <Icon name="check-circle" size={16} />
                {successMessage}
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
                  {editingId ? 'Saving…' : 'Sending…'}
                </>
              ) : (
                <>
                  <Icon name={editingId ? 'check' : 'send'} size={15} />
                  {editingId ? 'Save Changes' : 'Send Announcement'}
                </>
              )}
            </button>
            {editingId && !sending && (
              <button
                onClick={resetForm}
                className="py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-[#F6F7F9]"
                style={{ borderColor: '#E5E7EB', color: '#6B7280' }}
              >
                Cancel Edit
              </button>
            )}
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
          {!loading && announcements.length === 0 && (
            <div className="rounded-xl border p-6 text-center text-sm" style={{ background: '#fff', borderColor: '#E5E7EB', color: '#6B7280' }}>
              No announcements have been published yet.
            </div>
          )}
          {announcements.map(ann => (
            <div key={ann._id} className="rounded-xl border p-4" style={{ background: '#fff', borderColor: '#E5E7EB' }}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="text-sm font-medium leading-snug" style={{ color: '#0B1F3A' }}>{ann.title}</div>
                <span className={`shrink-0 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_BADGE[ann.priority]}`}>
                  {ann.priority}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs mb-2" style={{ color: '#6B7280' }}>
                <span>{ann.target}{ann.target === 'Specific Barangay' && ann.targetBarangay ? ` · ${ann.targetBarangay}` : ''}</span>
                <span>·</span>
                <span>{ann.dateSent}</span>
              </div>
              {expandedId === ann._id && (
                <p className="text-xs leading-relaxed mb-2" style={{ color: '#374151' }}>{ann.message}</p>
              )}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setExpandedId(expandedId === ann._id ? null : ann._id)}
                  className="text-xs font-medium flex items-center gap-1"
                  style={{ color: '#163A63' }}
                >
                  <Icon name={expandedId === ann._id ? 'chevron-down' : 'chevron-right'} size={12} />
                  {expandedId === ann._id ? 'Hide' : 'View'}
                </button>
                <button
                  onClick={() => startEdit(ann)}
                  className="text-xs font-medium flex items-center gap-1"
                  style={{ color: '#163A63' }}
                >
                  <Icon name="edit" size={12} />
                  Edit
                </button>
                <button
                  onClick={() => setDeleteTarget(ann)}
                  className="text-xs font-medium flex items-center gap-1"
                  style={{ color: '#DC2626' }}
                >
                  <Icon name="trash" size={12} />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete announcement?"
        message={deleteTarget ? `Delete "${deleteTarget.title}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
