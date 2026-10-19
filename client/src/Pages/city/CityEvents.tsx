import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';
import { usePrivateResourceUrl } from '../../lib/docUrl';

type EventRecord = { _id: string; name: string; description: string; startsAt: string; endsAt?: string; location: string; required: boolean; attendanceCount?: number };

type AttendanceStatus = 'pending' | 'attended' | 'absent' | 'not_submitted';
type ProofRow = {
  _id: string;
  proofId?: string | null;
  student: { _id: string; name: string; email: string; school: string; barangay: string };
  submittedAt?: string | null;
  status: string;
  attendanceStatus: AttendanceStatus;
  reason: string;
  hasProof: boolean;
  hasImage: boolean;
  updatedAt?: string | null;
};
type AttendanceData = {
  event: { name: string; location: string; startsAt: string; endsAt?: string; required: boolean; proofDeadline: string };
  proofCounts: { pending: number; verified: number; rejected: number; absent: number; notSubmitted: number; selfMarked: number };
  proofs: ProofRow[];
  selfMarkedAttendees: string[];
};

const PHILIPPINES_TIME_ZONE = 'Asia/Manila';
const date = (value: string) => new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: PHILIPPINES_TIME_ZONE });
const stamp = (value?: string | null) => (value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: PHILIPPINES_TIME_ZONE }) : '—');

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  attended: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  absent: 'bg-red-50 text-red-700 border-red-200',
  not_submitted: 'bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]',
};
const STATUS_LABEL: Record<AttendanceStatus, string> = { pending: 'Pending review', attended: 'Attended', absent: 'Absent', not_submitted: 'Not submitted' };

function StatusBadge({ status }: { status: AttendanceStatus }) {
  return <span className={`inline-block text-xs font-600 px-2 py-0.5 rounded-full border ${STATUS_STYLES[status]}`}>{STATUS_LABEL[status]}</span>;
}

// Full-size image in a modal; the thumbnail is just a smaller instance.
function ProofImagePopup({ eventId, proofId, onClose }: { eventId: string; proofId: string; onClose: () => void }) {
  const { url, loading, error } = usePrivateResourceUrl(`/events/${eventId}/attendance-proofs/${proofId}/image`);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h4 className="font-700 text-sm text-[#1F2937]">Attendance proof</h4>
          <button type="button" onClick={onClose} className="text-[#6B7280] hover:text-[#1F2937] text-xl leading-none">×</button>
        </div>
        {loading && <div className="py-16 text-center text-sm text-[#9CA3AF]">Loading image…</div>}
        {error && <div className="py-16 text-center text-sm text-red-600">{error}</div>}
        {url && <img src={url} alt="Attendance proof" className="max-h-[70vh] mx-auto rounded-xl" />}
      </div>
    </div>
  );
}

function Thumb({ eventId, proofId, onClick }: { eventId: string; proofId: string; onClick: () => void }) {
  const { url, loading, error } = usePrivateResourceUrl(`/events/${eventId}/attendance-proofs/${proofId}/image`);
  if (loading) return <div className="w-12 h-12 rounded-lg bg-[#F3F4F6] flex items-center justify-center text-[10px] text-[#9CA3AF]">…</div>;
  if (error || !url) return <div className="w-12 h-12 rounded-lg bg-[#F3F4F6] flex items-center justify-center text-[10px] text-[#9CA3AF]">No image</div>;
  return <button type="button" onClick={onClick} className="w-12 h-12 rounded-lg overflow-hidden border border-[#E5E7EB] block" title="View full image"><img src={url} alt="Attendance proof thumbnail" className="w-full h-full object-cover" /></button>;
}
// Attendees review panel for a single required event: counts, name search,
// status filter, thumbnails (click to open full image), and Verify/Reject.
function AttendeesPanel({ eventId }: { eventId: string }) {
  const [data, setData] = useState<AttendanceData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | AttendanceStatus>('all');
  const [popupId, setPopupId] = useState('');
  const [rejectId, setRejectId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');

  const load = () => api<AttendanceData>(`/events/${eventId}/attendance-proofs`)
    .then(result => { setData(result); setError(''); })
    .catch(requestError => setError(requestError instanceof Error ? requestError.message : 'Unable to load attendees.'))
    .finally(() => setLoading(false));
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [eventId]);

  const act = async (proofId: string, action: 'verify' | 'reject', body?: unknown) => {
    setBusy(proofId);
    setError('');
    try {
      await api(`/events/${eventId}/attendance-proofs/${proofId}/${action}`, {
        method: 'PATCH',
        body: body ? JSON.stringify(body) : undefined,
      });
      setRejectId('');
      setReason('');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Unable to ${action} the proof.`);
    } finally {
      setBusy('');
    }
  };

  const rows = useMemo(() => {
    const list = (data?.proofs || []).slice();
    const needle = search.trim().toLowerCase();
    return list
      .filter(row => (status === 'all' ? true : row.attendanceStatus === status))
      .filter(row => (needle ? (row.student?.name || '').toLowerCase().includes(needle) : true));
  }, [data, search, status]);

  if (loading) return <div className="p-4 text-sm text-[#6B7280]">Loading attendees…</div>;
  return (
    <div className="border-t border-[#E5E7EB] mt-3 pt-3">
      {error && <div className="mb-3 bg-red-50 rounded-lg p-3 text-xs text-red-700">{error}</div>}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="text-xs font-700 text-[#1F2937]">Attendees</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Pending {data?.proofCounts.pending || 0}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Attended {data?.proofCounts.verified || 0}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">Absent {data?.proofCounts.absent || 0}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[#F3F4F6] text-[#6B7280] border border-[#E5E7EB]">Not submitted {data?.proofCounts.notSubmitted || 0}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[#F3F4F6] text-[#6B7280] border border-[#E5E7EB]">Self-marked {data?.proofCounts.selfMarked || 0}</span>
        <span className="text-xs text-[#6B7280]">Proof deadline: {stamp(data?.event.proofDeadline)}</span>
        <div className="flex-1" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name…" className="px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg text-xs w-40" />
        <select value={status} onChange={e => setStatus(e.target.value as 'all' | AttendanceStatus)} className="px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg text-xs">
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="attended">Attended</option>
          <option value="absent">Absent</option>
          <option value="not_submitted">Not submitted</option>
        </select>
      </div>
      {rows.length === 0 ? (
        <div className="p-4 text-center text-xs text-[#6B7280]">No students match the current filter.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[#6B7280] border-b border-[#E5E7EB]">
                <th className="py-2 pr-3 font-600">Name</th>
                <th className="py-2 pr-3 font-600">School</th>
                <th className="py-2 pr-3 font-600">Barangay</th>
                <th className="py-2 pr-3 font-600">Submitted</th>
                <th className="py-2 pr-3 font-600">Status</th>
                <th className="py-2 pr-3 font-600">Proof</th>
                <th className="py-2 font-600">Actions</th>
              </tr>
            </thead>

            <tbody>
              {rows.map(row => (
                <tr key={row._id} className="border-b border-[#F3F4F6]">
                  <td className="py-2 pr-3 text-[#1F2937]">{row.student?.name || '—'}</td>
                  <td className="py-2 pr-3 text-[#6B7280]">{row.student?.school || '—'}</td>
                  <td className="py-2 pr-3 text-[#6B7280]">{row.student?.barangay || '—'}</td>
                  <td className="py-2 pr-3 text-[#6B7280]">{stamp(row.submittedAt)}</td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={row.attendanceStatus} />
                      {row.status === 'rejected' && row.reason && <span className="text-[10px] text-red-600 max-w-[160px]">{row.reason}</span>}
                    </div>
                  </td>
                  <td className="py-2 pr-3">{row.hasImage && row.proofId ? <Thumb eventId={eventId} proofId={row.proofId} onClick={() => setPopupId(row.proofId!)} /> : <span className="text-[#9CA3AF]">—</span>}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      {row.proofId ? <>
                        <button onClick={() => act(row.proofId!, 'verify')} disabled={busy === row.proofId || row.status === 'verified'} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-700 disabled:opacity-40">{busy === row.proofId ? '…' : 'Approve'}</button>
                        <button onClick={() => { setRejectId(rejectId === row.proofId ? '' : row.proofId!); setReason(''); }} className="px-2.5 py-1 rounded-lg border border-red-300 text-red-600 text-[11px] font-700">Reject</button>
                      </> : <span className="text-[#9CA3AF]">—</span>}
                    </div>
                    {row.proofId && rejectId === row.proofId && (
                      <div className="mt-2 flex items-center gap-2">
                        <input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for rejection…" className="px-2 py-1 border border-[#E5E7EB] rounded-lg text-[11px] w-48" />
                        <button onClick={() => act(row.proofId!, 'reject', { reason })} disabled={busy === row.proofId || !reason.trim()} className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-[11px] font-700 disabled:opacity-40">Confirm</button>
                        <button onClick={() => setRejectId('')} className="px-2 py-1 text-[11px] text-[#6B7280]">Cancel</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(data?.selfMarkedAttendees?.length || 0) > 0 && (
        <div className="mt-3 text-xs text-[#6B7280]">{data!.selfMarkedAttendees.length} self-marked attendee(s) with no proof image.</div>
      )}
      {popupId && <ProofImagePopup eventId={eventId} proofId={popupId} onClose={() => setPopupId('')} />}
    </div>
  );
}
export default function CityEvents() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [form, setForm] = useState({ name: '', description: '', startsAt: '', endsAt: '', location: '', required: false });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState('');
  const load = () => api<{ events: EventRecord[] }>('/events').then(result => setEvents(result.events)).catch(requestError => setError(requestError instanceof Error ? requestError.message : 'Unable to load events.'));
  useEffect(() => { load().finally(() => setLoading(false)); }, []);
  const manilaDateTimeIso = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
      throw new Error('Enter a valid event date and time.');
    }
    const dateTime = new Date(`${value.length === 16 ? `${value}:00` : value}+08:00`);
    if (Number.isNaN(dateTime.getTime())) throw new Error('Enter a valid event date and time.');
    return dateTime.toISOString();
  };
  const publish = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/events', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          startsAt: manilaDateTimeIso(form.startsAt),
          endsAt: form.endsAt ? manilaDateTimeIso(form.endsAt) : undefined,
        }),
      });
      setForm({ name: '', description: '', startsAt: '', endsAt: '', location: '', required: false });
      setOpen(false);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to publish event.');
    } finally {
      setSaving(false);
    }
  };
  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading events...</div>;
  return (
    <div>
      <PageHeader title="Events & Attendance" subtitle="Publish events visible to students and barangay staff" breadcrumb={['City Office', 'Events']} action={<button onClick={() => setOpen(true)} className="px-4 py-2 rounded-xl bg-[#0B1F3A] text-white text-sm font-700">Create Event</button>} />
      {error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}
      <div className="space-y-3">
        {events.length === 0 ? <div className="bg-white rounded-2xl border border-[#E5E7EB] p-10 text-center text-sm text-[#6B7280]">No events published yet.</div> : events.map(event => (
          <article key={event._id} className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#0B1F3A] text-white flex items-center justify-center">{event.attendanceCount || 0}</div>
              <div className="flex-1">
                <h2 className="font-700 text-sm text-[#1F2937]">{event.name} {event.required && <span className="ml-2 text-xs text-red-600">Requires attendance proof</span>}</h2>
                <p className="text-xs text-[#6B7280] mt-1">{date(event.startsAt)} · {event.location}</p>
                <p className="text-sm text-[#6B7280] mt-2">{event.description}</p>
                <p className="text-xs text-[#6B7280] mt-1">{event.attendanceCount || 0} attended</p>
              </div>
              {event.required && (
                <button onClick={() => setExpanded(expanded === event._id ? '' : event._id)} className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] text-xs font-600 text-[#1F2937]">
                  {expanded === event._id ? 'Hide attendees' : 'Attendees'}
                </button>
              )}
            </div>
            {event.required && expanded === event._id && <AttendeesPanel eventId={event._id} />}
          </article>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <form onSubmit={publish} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-3">
            <div className="flex justify-between mb-2">
              <h2 className="font-700 text-[#1F2937]">Create Event</h2>
              <button type="button" onClick={() => setOpen(false)}>×</button>
            </div>
            <input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-xl text-sm" placeholder="Event name" />
            <textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-xl text-sm" placeholder="Description (optional)" />
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-[#6B7280]">Start<input required type="datetime-local" value={form.startsAt} onChange={event => setForm({ ...form, startsAt: event.target.value })} className="mt-1 w-full px-3 py-2.5 border border-[#E5E7EB] rounded-xl text-sm" /></label>
              <label className="text-xs text-[#6B7280]">End (optional)<input type="datetime-local" value={form.endsAt} onChange={event => setForm({ ...form, endsAt: event.target.value })} className="mt-1 w-full px-3 py-2.5 border border-[#E5E7EB] rounded-xl text-sm" /></label>
            </div>
            <input required value={form.location} onChange={event => setForm({ ...form, location: event.target.value })} className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-xl text-sm" placeholder="Location" />
            <label className="flex items-center gap-2 text-sm text-[#1F2937]"><input type="checkbox" checked={form.required} onChange={event => setForm({ ...form, required: event.target.checked })} /> Requires attendance proof</label>
            <p className="text-xs text-[#6B7280]">When required, eligible students can upload an image from the event start until 48 hours after the end time (or 7 days after the start if no end time is set). Times use Philippine time.</p>
            <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-[#0B1F3A] text-white text-sm font-700 disabled:opacity-50">{saving ? 'Publishing…' : 'Publish Event'}</button>
          </form>
        </div>
      )}
    </div>
  );
}
