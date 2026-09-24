import { useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';
import { getSessionUser } from '../../lib/auth';

/* ============================================================
   Barangay Portal — Applicants  (/barangay/applicants)

   Stage 1 of the Application -> Barangay -> City approval chain.
   Scoped to the logged-in Barangay Admin's own barangay
   (User.barangay — residency source of truth, chosen by the
   student at registration).

   GET   /api/barangays/applications
     Submitted applications from this admin's barangay.

   The residency-review popup (Name, School, Barangay, City,
   Address with Approve / Reject) lives here — the old standalone
   "Application Review" page was merged into this one, so there is
   a single entry point. The underlying logic is unchanged:

   PATCH /api/barangays/applications/:id/verification
     body: { status: 'approved' | 'rejected', notes?: string }

     approved -> application.barangayVerificationStatus = 'approved'
                 (the application becomes visible on the City side)
     rejected -> application.barangayVerificationStatus = 'rejected'
                 (it never appears in the City Office queue)

   Student-facing mapping is untouched (lib/applicationStatus.ts):
   a barangay approval only confirms residency, so the student sees
   "Under Review" — never "Approved" — until the City Office decides.
   ============================================================ */

interface Application {
  _id: string;
  status: string;
  barangayVerificationStatus?: string;
  barangayVerificationNotes?: string;
  barangayReviewedAt?: string | null;
  barangay?: { _id?: string; name: string } | null;
  school: string;
  // `program` was removed from the Application form but older submitted
  // applications may still carry it — kept optional for historical reads.
  program?: string;
  applicant?: { address?: string; lotNo?: string; city?: string };
  student?: { _id?: string; name: string; email: string } | null;
  submittedAt?: string | null;
  createdAt: string;
}

type VerificationStatus = 'pending' | 'approved' | 'rejected';

const date = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

// Residency status chip — the barangay's own view of the verification
// stage. This is NOT the City Office's final decision.
const VERIFY_CONFIG: Record<VerificationStatus, { label: string; bg: string; text: string; dot: string }> = {
  pending:  { label: 'For Review',          bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  approved: { label: 'Residency Confirmed', bg: 'bg-green-50', text: 'text-[#22A06B]', dot: 'bg-[#22A06B]' },
  rejected: { label: 'Rejected',            bg: 'bg-red-50',   text: 'text-[#DC2626]', dot: 'bg-[#DC2626]' },
};

const verificationOf = (application: Application): VerificationStatus =>
  application.barangayVerificationStatus === 'approved'
    ? 'approved'
    : application.barangayVerificationStatus === 'rejected'
      ? 'rejected'
      : 'pending';

const initials = (name: string) =>
  name.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();

export default function BarangayApplicants() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Application | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const barangayId = getSessionUser()?.barangay?._id || '';
  const barangayName = getSessionUser()?.barangay?.name || '';

  // The server scopes the queue to this admin's own barangay, so the
  // request either succeeds with the right rows or fails loudly —
  // never with another barangay's data.
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api<{ applications: Application[] }>('/barangays/applications');
      setApplications(result.applications || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load applicants.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!barangayId) {
      setLoading(false);
      return;
    }
    load();
  }, [barangayId, load]);

  const query = search.trim().toLowerCase();
  const filtered = applications.filter((application) =>
    ((application.student?.name || '') + ' ' + application.school).toLowerCase().includes(query));

  // Approve / Reject writes barangayVerificationStatus on the
  // application: approved rows become visible to the City Office;
  // rejected rows never do. Rejections require notes.
  const decide = async (status: 'approved' | 'rejected') => {
    if (!selected) return;
    if (status === 'rejected' && !notes.trim()) {
      setModalError('Please add a reason for the rejection.');
      return;
    }
    setSaving(true);
    setModalError('');
    try {
      await api(`/barangays/applications/${selected._id}/verification`, {
        method: 'PATCH',
        body: JSON.stringify({ status, notes: notes.trim() }),
      });
      setSelected(null);
      setNotes('');
      await load();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to save this decision.');
    } finally {
      setSaving(false);
    }
  };

  const openReview = (application: Application) => {
    setSelected(application);
    setNotes('');
    setModalError('');
  };

  if (!barangayId) {
    return (
      <div>
        <PageHeader title="Applicants" subtitle="Applicants from your barangay" breadcrumb={['Barangay Portal', 'Applicants']} />
        <div className="p-10 text-center text-sm text-[#6B7280]">
          Your account is not assigned to a barangay yet. Ask the City Office to link your account to a barangay.
        </div>
      </div>
    );
  }

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading applicants...</div>;

  const selectedStatus: VerificationStatus = selected ? verificationOf(selected) : 'pending';
  const selectedConfig = VERIFY_CONFIG[selectedStatus];
  const selectedDetails = selected ? [
    { label: 'Name', value: selected.student?.name || 'Unknown student' },
    { label: 'School', value: selected.school || '—' },
    { label: 'Barangay', value: selected.barangay?.name || barangayName || '—' },
    { label: 'City', value: selected.applicant?.city || '—' },
    { label: 'Address', value: [selected.applicant?.lotNo, selected.applicant?.address].filter(Boolean).join(', ') || '—' },
  ] : [];

  return (
    <div>
      <PageHeader title="Applicants" subtitle={'Application records from ' + (barangayName || 'your barangay')} breadcrumb={['Barangay Portal', 'Applicants']} />
      {error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2 mb-5">
        <Icon name="info" size={15} className="text-[#D97706]" />
        <p className="text-sm text-[#1F2937]">Review residency for applicants from your barangay. Approving confirms residency and sends the application to the City Scholarship Office for final review.</p>
      </div>
      <div className="relative mb-5">
        <Icon name="search" size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E5E7EB] text-sm bg-white" placeholder="Search applicants or schools..." />
      </div>
      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F6F7F9]">
                {['Applicant', 'School', 'Date Submitted', 'Residency', 'Action'].map((header) => (
                  <th key={header} className="px-5 py-3 text-left text-xs font-600 text-[#6B7280]">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filtered.map((application) => {
                const status = verificationOf(application);
                const config = VERIFY_CONFIG[status];
                return (
                  <tr key={application._id} className="hover:bg-[#F6F7F9]/60">
                    <td className="px-5 py-3.5">
                      <div className="font-600 text-sm text-[#1F2937]">{application.student?.name || 'Unknown student'}</div>
                      <div className="text-xs text-[#6B7280]">{application.student?.email}</div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-[#6B7280]">{application.school}</td>
                    <td className="px-5 py-3.5 text-sm text-[#6B7280]">{date(application.createdAt)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-600 ${config.bg} ${config.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                        {config.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => openReview(application)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-600 border border-[#E5E7EB] text-[#163A63] hover:bg-[#F0F4FA] transition"
                      >
                        <Icon name="eye" size={13} /> Review
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-10 text-center text-sm text-[#6B7280]">
            {applications.length === 0
              ? 'No applications from your barangay yet.'
              : 'No applicants match your search.'}
          </div>
        )}
        {applications.length > 0 && (
          <div className="px-5 py-3 border-t border-[#E5E7EB] text-xs text-[#6B7280]">Showing {filtered.length} of {applications.length} applicants</div>
        )}
      </div>

      {/* ── Residency review popup — same logic as the old standalone
          Application Review page, relocated here. ── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1F3A]/50" onClick={() => !saving && setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h2 className="text-base text-[#0B1F3A]" style={{ fontWeight: 700 }}>Application Review</h2>
                <p className="text-xs text-[#6B7280]">Confirm residency for this applicant</p>
              </div>
              <button
                onClick={() => !saving && setSelected(null)}
                className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#374151] hover:bg-[#F6F7F9] transition-colors"
                aria-label="Close review"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <ReviewBody
              selected={selected}
              barangayName={barangayName}
              details={selectedDetails}
              status={selectedStatus}
              config={selectedConfig}
              notes={notes}
              setNotes={setNotes}
              modalError={modalError}
              saving={saving}
              onClose={() => setSelected(null)}
              onDecide={decide}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Popup body kept as a module-scope component so typing in the notes
// textarea never remounts the modal (stable component identity).
function ReviewBody({ selected, barangayName, details, status, config, notes, setNotes, modalError, saving, onClose, onDecide }: {
  selected: Application;
  barangayName: string;
  details: { label: string; value: string }[];
  status: VerificationStatus;
  config: { label: string; bg: string; text: string; dot: string };
  notes: string;
  setNotes: (v: string) => void;
  modalError: string;
  saving: boolean;
  onClose: () => void;
  onDecide: (s: 'approved' | 'rejected') => void;
}) {
  void barangayName;
  return (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#163A63] text-white flex items-center justify-center text-sm flex-shrink-0" style={{ fontWeight: 700 }}>
                  {initials(selected.student?.name || '?')}
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-[#0B1F3A] truncate" style={{ fontWeight: 700 }}>{selected.student?.name || 'Unknown student'}</div>
                  <div className="text-xs text-[#6B7280] truncate">{selected.student?.email || ''}</div>
                </div>
                <span className={`ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-600 flex-shrink-0 ${config.bg} ${config.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                  {config.label}
                </span>
              </div>

              <div className="bg-[#F6F7F9] border border-[#E5E7EB] rounded-xl divide-y divide-[#E5E7EB]">
                {details.map((item) => (
                  <div key={item.label} className="px-4 py-2.5">
                    <div className="text-[11px] uppercase tracking-wide text-[#9CA3AF]" style={{ fontWeight: 600 }}>{item.label}</div>
                    <div className="text-sm text-[#1F2937] font-600" style={{ fontWeight: 600 }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {status !== 'pending' && (
                <div className="flex items-start gap-2 bg-[#F6F7F9] border border-[#E5E7EB] rounded-xl p-3">
                  <Icon name="info" size={14} className="text-[#6B7280] mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-[#6B7280]">
                    {status === 'approved'
                      ? 'Residency confirmed. The City Scholarship Office now reviews this application for final approval.'
                      : 'Rejected at the barangay stage. The City Scholarship Office never sees this application.'}
                    {selected.barangayVerificationNotes ? ` Reason: ${selected.barangayVerificationNotes}` : ''}
                  </p>
                </div>
              )}

              {status === 'pending' && (
                <div>
                  <label className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>
                    Review Notes <span className="text-[#9CA3AF]" style={{ fontWeight: 400 }}>(required when rejecting)</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]"
                    rows={3}
                    placeholder="Add notes for this decision…"
                  />
                </div>
              )}

              {modalError && (
                <div className="text-sm text-red-600 flex items-center gap-2">
                  <Icon name="alert-circle" size={14} />{modalError}
                </div>
              )}

              {status === 'pending' ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => onDecide('rejected')}
                    disabled={saving}
                    className="flex-1 py-2.5 flex items-center justify-center gap-2 border border-[#DC2626] text-[#DC2626] rounded-xl text-sm font-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    style={{ fontWeight: 600 }}
                  >
                    <Icon name="x-circle" size={15} /> {saving ? 'Saving…' : 'Reject'}
                  </button>
                  <button
                    onClick={() => onDecide('approved')}
                    disabled={saving}
                    className="flex-1 py-2.5 flex items-center justify-center gap-2 bg-[#22A06B] text-white rounded-xl text-sm font-700 hover:bg-green-700 transition-colors disabled:opacity-50"
                    style={{ fontWeight: 700 }}
                  >
                    <Icon name="check-circle" size={15} /> {saving ? 'Saving…' : 'Approve'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={onClose}
                  className="w-full py-2.5 border border-[#E5E7EB] rounded-xl text-sm text-[#6B7280] font-600 hover:bg-[#F6F7F9] transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  Close
                </button>
              )}
            </div>
  );
}
