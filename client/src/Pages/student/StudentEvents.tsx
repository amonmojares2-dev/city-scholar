import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon';
import PageHeader from '../../components/PageHeader';
import { api, uploadWithProgress, validateImageFile } from '../../lib/api';
import { usePrivateResourceUrl } from '../../lib/docUrl';
import { isEventAttendanceAccess, useStudentAccess } from '../../lib/studentAccess';

type ProofStatus = 'pending' | 'verified' | 'rejected';
type OwnProof = { _id: string; status: ProofStatus; reason: string; submittedAt: string; reviewedAt?: string | null } | null;
type EventRecord = {
  _id: string;
  name: string;
  startsAt: string;
  endsAt?: string;
  location: string;
  required: boolean;
  approved: boolean;
  canSubmit: boolean;
  proofDeadline: string;
  attendanceStatus?: string | null;
  ownProof?: OwnProof;
};

const PHILIPPINES_TIME_ZONE = 'Asia/Manila';
const date = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: PHILIPPINES_TIME_ZONE });
const time = (value: string) => new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: PHILIPPINES_TIME_ZONE });
const stamp = (value: string) => new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: PHILIPPINES_TIME_ZONE });

const STATUS_STYLES: Record<ProofStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};
const STATUS_LABEL: Record<ProofStatus, string> = {
  pending: 'Under review',
  verified: 'Verified',
  rejected: 'Rejected',
};

function StatusBadge({ status }: { status: ProofStatus }) {
  return <span className={`inline-block text-xs font-600 px-2 py-0.5 rounded-full border ${STATUS_STYLES[status]}`}>{STATUS_LABEL[status]}</span>;
}

// The caller's own proof image, fetched through the authenticated image route.
function ProofThumb({ eventId, proofId }: { eventId: string; proofId: string }) {
  const { url, loading, error } = usePrivateResourceUrl(`/events/${eventId}/attendance-proofs/${proofId}/image`);
  if (loading) return <div className="w-16 h-16 rounded-lg bg-[#F3F4F6] flex items-center justify-center text-[10px] text-[#9CA3AF]">…</div>;
  if (error || !url) return <div className="w-16 h-16 rounded-lg bg-[#F3F4F6] flex items-center justify-center text-[10px] text-[#9CA3AF]">No image</div>;
  return <a href={url} target="_blank" rel="noreferrer" className="w-16 h-16 rounded-lg overflow-hidden border border-[#E5E7EB] block"><img src={url} alt="Your attendance proof" className="w-full h-full object-cover" /></a>;
}
// Attendance proof uploader for a single required event.
function ProofSection({ event, onDone, canSubmit }: { event: EventRecord; onDone: () => void; canSubmit: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [fileError, setFileError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (chosen: File | undefined) => {
    setSubmitError('');
    if (!chosen) return;
    const problem = validateImageFile(chosen);
    if (problem) { setFileError(problem); setFile(null); setPreview(''); return; }
    setFileError('');
    setFile(chosen);
    setPreview(URL.createObjectURL(chosen));
  };

  const submit = async () => {
    if (!canSubmit) return;
    if (!file) { setFileError('Please choose an image first.'); return; }
    setSaving(true);
    setSubmitError('');
    setProgress(0);
    try {
      const body = new FormData();
      body.append('file', file);
      await uploadWithProgress<{ proof: OwnProof }>(`/events/${event._id}/attendance-proof`, body, setProgress);
      setFile(null);
      setPreview('');
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
      onDone();
    } catch (requestError) {
      setSubmitError(requestError instanceof Error ? requestError.message : 'Unable to upload your proof.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!event.ownProof) return;
    setRemoving(true);
    setSubmitError('');
    try {
      await api(`/events/${event._id}/attendance-proofs/${event.ownProof._id}`, { method: 'DELETE' });
      onDone();
    } catch (requestError) {
      setSubmitError(requestError instanceof Error ? requestError.message : 'Unable to remove your proof.');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <div className="text-xs text-[#6B7280]">Submit your proof by <span className="font-600 text-[#374151]">{stamp(event.proofDeadline)}</span></div>
      {event.ownProof && (
        <div className="flex items-start gap-3">
          <ProofThumb eventId={event._id} proofId={event.ownProof._id} />
          <div className="text-xs text-[#6B7280] space-y-1">
            <div>Submitted {stamp(event.ownProof.submittedAt)}</div>
            {event.ownProof.status === 'rejected' && event.ownProof.reason && <div className="text-red-600">Reason: {event.ownProof.reason}</div>}
            {event.ownProof.status === 'verified' && <div className="text-emerald-600">Verified by the City Office.</div>}
          </div>
        </div>
      )}
      {event.ownProof?.status === 'verified' ? (
        <div className="text-xs text-emerald-700">Your attendance is approved; this proof can no longer be replaced.</div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg" onChange={e => pick(e.target.files?.[0])} className="text-xs" />
          {preview && <img src={preview} alt="Selected preview" className="w-16 h-16 rounded-lg object-cover border border-[#E5E7EB]" />}
          <button onClick={submit} disabled={saving || !file || !canSubmit} className="px-3 py-1.5 rounded-lg bg-[#0B1F3A] text-white text-xs font-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? `Uploading ${progress}%` : canSubmit ? event.ownProof ? 'Replace proof' : 'Submit proof' : 'Available at event start'}
          </button>
          {event.ownProof?.status === 'pending' && (<button onClick={remove} disabled={removing} className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] text-xs font-600 text-[#6B7280] disabled:opacity-50">{removing ? 'Removing…' : 'Remove'}</button>)}
        </div>
      )}
      {fileError && <div className="text-xs text-red-600">{fileError}</div>}
      {submitError && <div className="text-xs text-red-600">{submitError}</div>}
    </>
  );
}

function RequiredProofBlock({
  event,
  now,
  hasAttendanceAccess,
  onDone,
}: {
  event: EventRecord;
  now: number;
  hasAttendanceAccess: boolean;
  onDone: () => void;
}) {
  const beforeStart = now < new Date(event.startsAt).getTime();
  const beforeDeadline = now <= new Date(event.proofDeadline).getTime();
  const canSubmitNow = hasAttendanceAccess && !beforeStart && beforeDeadline;

  return (
    <div className="mt-3 pt-3 border-t border-[#E5E7EB] space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-700 text-[#1F2937] flex items-center gap-1.5"><Icon name="paperclip" size={13} /> Attendance proof</div>
        {event.ownProof ? <StatusBadge status={event.ownProof.status} /> : <span className="text-xs text-[#9CA3AF]">No proof</span>}
      </div>
      {hasAttendanceAccess && beforeDeadline ? (
        <>
          {beforeStart && <div className="text-xs text-[#6B7280]">Submission opens at the event start ({date(event.startsAt)} at {time(event.startsAt)}). You may select an image now and submit it once the event begins.</div>}
          <ProofSection event={event} onDone={onDone} canSubmit={canSubmitNow} />
        </>
      ) : !beforeDeadline ? (
        <div className="text-xs text-[#6B7280]">Deadline passed on {stamp(event.proofDeadline)}</div>
      ) : (
        <div className="text-xs text-[#6B7280]">Attendance proof is unavailable for this account.</div>
      )}
    </div>
  );
}

export default function StudentEvents() {
  const access = useStudentAccess();
  const hasAttendanceAccess = access ? isEventAttendanceAccess(access) : false;
  const [now, setNow] = useState(Date.now());
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [error, setError] = useState('');
  const [attending, setAttending] = useState('');
  const load = () => api<{ events: EventRecord[] }>('/events')
    .then(result => setEvents(result.events))
    .catch(requestError => setError(requestError instanceof Error ? requestError.message : 'Unable to load events.'));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const markAttendance = async (id: string) => {
    setAttending(id);
    try { await api(`/events/${id}/attendance`, { method: 'POST' }); await load(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to record attendance.'); }
    finally { setAttending(''); }
  };
  const upcoming = events.filter(event => new Date(event.startsAt).getTime() >= now);
  const completed = events.filter(event => new Date(event.startsAt).getTime() < now);

  return (
    <div>
      <PageHeader title="Event Attendance" subtitle="Track scholarship events and attendance" breadcrumb={['Student Portal', 'Event Attendance']} />
      {error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-center">
          <div className="text-2xl font-800 text-[#0B1F3A]">{events.filter(event => event.attendanceStatus === 'attended').length}</div>
          <div className="text-xs text-[#6B7280] mt-1">Attended</div>
        </div>
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-center">
          <div className="text-2xl font-800 text-[#D97706]">{upcoming.length}</div>
          <div className="text-xs text-[#6B7280] mt-1">Upcoming</div>
        </div>
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-center">
          <div className="text-2xl font-800 text-[#DC2626]">{upcoming.filter(event => event.required).length}</div>
          <div className="text-xs text-[#6B7280] mt-1">Required Remaining</div>
        </div>
      </div>

      <h3 className="font-700 text-sm text-[#1F2937] mb-3">Upcoming Events</h3>
      <div className="space-y-3 mb-6">
        {upcoming.length === 0 ? <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 text-center text-sm text-[#6B7280]">No upcoming events.</div> : upcoming.map(event => (
          <div key={event._id} className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#0B1F3A] flex items-center justify-center text-white"><Icon name="calendar" size={17} /></div>
              <div className="flex-1">
                <div className="font-600 text-sm text-[#1F2937]">{event.name} {event.required && <span className="text-xs text-red-600 ml-1">Required</span>}</div>
                <div className="text-xs text-[#6B7280]">{date(event.startsAt)} · {time(event.startsAt)} · {event.location}</div>
              </div>
              {!event.required && (
                event.attendanceStatus === 'attended'
                  ? <span className="inline-flex items-center gap-1 text-xs font-600 text-emerald-700"><Icon name="check-circle" size={14} /> Attended</span>
                  : <button onClick={() => markAttendance(event._id)} disabled={attending === event._id} className="px-3 py-1.5 rounded-lg bg-[#0B1F3A] text-white text-xs font-700 disabled:opacity-50">{attending === event._id ? 'Saving…' : 'Mark attended'}</button>
              )}
            </div>
            {event.required && <RequiredProofBlock event={event} now={now} hasAttendanceAccess={hasAttendanceAccess} onDone={load} />}
          </div>
        ))}
      </div>

      <h3 className="font-700 text-sm text-[#1F2937] mb-3">Attendance History</h3>
      <div className="space-y-3">
        {completed.length === 0 ? <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 text-center text-sm text-[#6B7280]">No past events.</div> : completed.map(event => (
          <div key={event._id} className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#6B7280] flex items-center justify-center text-white"><Icon name="calendar" size={17} /></div>
              <div className="flex-1">
                <div className="font-600 text-sm text-[#1F2937]">{event.name} {event.required && <span className="text-xs text-red-600 ml-1">Required</span>}</div>
                <div className="text-xs text-[#6B7280]">{date(event.startsAt)} · {time(event.startsAt)} · {event.location}</div>
              </div>
            </div>
            {event.required && <RequiredProofBlock event={event} now={now} hasAttendanceAccess={hasAttendanceAccess} onDone={load} />}
          </div>
        ))}
      </div>
    </div>
  );
}
