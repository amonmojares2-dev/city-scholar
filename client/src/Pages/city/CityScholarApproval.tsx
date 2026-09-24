/* How Scholar Approval works
=========================

The City Scholar Approval page loads students who registered as
"Existing Scholar" and are waiting for the City Office to confirm
their existing-scholar claim. Students no longer supply a Scholar
ID at registration — the City Office verifies each claim manually
against its own records outside the system.

GET /api/city/scholar-approval
  Returns every student record where:
    scholarType === "existing_scholar"
    AND scholarVerificationStatus === "pending"

  (i.e. existing scholars who have not yet been decided)

PATCH /api/city/scholar-approval/:id
  body: { status: "approved" | "rejected", notes?: string }

  approved  -> scholarVerificationStatus = "approved"
              (Renewal unlocks for this student on their next login)

  rejected  -> scholarType = "new_applicant"
              scholarVerificationStatus = "not_required"
              (the account becomes a new applicant — they can apply,
               Renewal and Event Attendance stay locked)

  Both branches use a single findByIdAndUpdate so the DB change is
  atomic and the student's next request sees the new access level.

  After a successful PATCH the approval page removes the account from
  its local list (it is no longer pending), then re-fetches the
  pending queue. The city admin sees only still-pending scholars.

  The student's session in localStorage is not updated by the city
  admin's action. The student sees the new access level the next time
  they sign in, or within the Shell's periodic session refresh.

Records already approved are NOT part of the pending queue, so they
are not listed on this page and cannot be acted on again here.
 */
import { useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';

type ApprovalStatus = 'pending' | 'approved' | 'rejected';

// Row returned by GET /api/city/scholar-approval: a student who signed up on
// the Create Account page as an "Existing Scholar" (no Scholar ID is
// collected any more — the claim is verified manually by the City Office).
interface ScholarAccount {
  id: string;
  name: string;
  barangay: string | null;
  school: string | null;
  registeredDate: string | null;
  email: string;
  status: ApprovalStatus;
  // Which portal the account is currently on. An Existing Scholar claim is
  // still "existing_scholar"; a rejected claim has been moved to
  // "new_applicant" (so the student gets New Applicant access).
  portalAccess: 'new_applicant' | 'existing_scholar';
  movedToNewApplicant: boolean;
  notes: string | null;
  // When the City Office confirmed (approved) or moved (rejected) the account.
  verifiedAt: string | null;
}

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const STATUS_CONFIG: Record<ApprovalStatus, { label: string; bg: string; text: string; dot: string }> = {
  pending:  { label: 'Pending Review', bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400' },
  approved: { label: 'Approved',       bg: 'bg-green-50',  text: 'text-[#22A06B]',  dot: 'bg-[#22A06B]' },
  rejected: { label: 'Rejected',       bg: 'bg-red-50',    text: 'text-[#DC2626]',  dot: 'bg-[#DC2626]' },
};



// Approving an account here is what unlocks that student's Renewal page.
// Rejecting a claim that cannot be confirmed moves the account to New Applicant
// access so the student lands in the applicant portal (Application open,
// Event Attendance and Renewal locked).
export default function CityScholarApproval() {
  const [accounts, setAccounts] = useState<ScholarAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | ApprovalStatus>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ScholarAccount | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'warning'; text: string } | null>(null);

  const normalise = (account: ScholarAccount): ScholarAccount => ({
    ...account,
    // Anything still waiting on the City Office is "pending", even if the
    // server returned a different casing.
    status: account.status === 'approved' || account.status === 'rejected' ? account.status : 'pending',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api<{ accounts: ScholarAccount[] }>('/city/scholar-approval');
      const normalised = (result.accounts || []).map(normalise);
      setAccounts(normalised);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load existing scholar registrations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Counts are computed from the current list so they stay correct after a
  // decision is saved and the list refreshes.
  const counts = {
    all: accounts.length,
    pending: accounts.filter(a => a.status === 'pending').length,
    approved: accounts.filter(a => a.status === 'approved').length,
    rejected: accounts.filter(a => a.status === 'rejected').length,
  };

  const visible = accounts.filter(a => {
    const matchFilter = filter === 'all' || a.status === filter;
    const q = search.toLowerCase();
    const matchSearch = !q
      || a.name.toLowerCase().includes(q)
      || (a.barangay || '').toLowerCase().includes(q)
      || a.email.toLowerCase().includes(q)
      || (a.school || '').toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const openReview = (account: ScholarAccount) => {
    setSelected(account);
    setReviewNotes(account.notes || '');
  };

  const applyDecision = async (decision: 'approved' | 'rejected') => {
    if (!selected) return;
    setSaving(true);
    setError('');
    setNotice(null);
    try {
      const result = await api<{ account: ScholarAccount }>(`/city/scholar-approval/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: decision, notes: reviewNotes }),
      });
      setNotice(decision === 'approved' ? {
        kind: 'success',
        text: `${result.account.name} is confirmed as an Existing Scholar — the Renewal page is now unlocked for that student and Event Attendance is available.`,
      } : {
        kind: 'warning',
        text: `${result.account.name} was moved to New Applicant access — Renewal and Event Attendance are locked and the Application page is available again. The student can now apply like a first-time applicant.`,
      });
      // Re-fetch the pending queue so the row disappears (it is no longer
      // pending). The GET query only returns scholars still awaiting review.
      load();
      setSelected(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save the decision.');
    } finally {
      setSaving(false);
    }
  };

  const sc = selected ? STATUS_CONFIG[selected.status] : null;

  return (
    <div>
      <PageHeader
        title="Scholar Approval"
        subtitle="Students who registered as Existing Scholar"
        breadcrumb={['City Office', 'Scholar Approval']}
      />

      {error && (
        <div className="mb-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {notice && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm border ${notice.kind === 'success' ? 'bg-green-50 border-green-100 text-[#22A06B]' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
          {notice.text}
        </div>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {([['all', 'Total Accounts', '#0B1F3A', 'users'], ['pending', 'Pending Review', '#D97706', 'clock'], ['approved', 'Approved', '#22A06B', 'check-circle'], ['rejected', 'Rejected', '#DC2626', 'x-circle']] as const).map(([key, label, color, icon]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`text-left bg-white rounded-2xl border p-4 transition-all ${filter === key ? 'border-[#163A63] ring-2 ring-[#163A63]/10' : 'border-[#E5E7EB] hover:border-[#163A63]/40'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-600 text-[#6B7280]" style={{ fontWeight: 600 }}>{label}</span>
              <span style={{ color }}><Icon name={icon} size={15} /></span>
            </div>
            <div className="text-2xl font-800 text-[#0B1F3A]" style={{ fontWeight: 800, color }}>{counts[key]}</div>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center gap-3">
          <div className="relative flex-1">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]"
              placeholder="Search by name or barangay…"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-[#6B7280]">Loading existing scholar registrations…</div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#9CA3AF]">
            {accounts.length === 0
              ? 'No accounts registered as Existing Scholars yet.'
              : 'No accounts match your search.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F6F7F9]">
                  {['Scholar', 'Barangay', 'School', 'Registered', 'Portal Access', 'Status', 'Action'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-600 text-[#6B7280]" style={{ fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {visible.map(a => {
                  const cfg = STATUS_CONFIG[a.status];
                  return (
                    <tr key={a.id} className="hover:bg-[#F6F7F9] transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#163A63] flex items-center justify-center text-white text-xs font-700 flex-shrink-0" style={{ fontWeight: 700 }}>
                            {a.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{a.name}</div>
                            <div className="text-xs text-[#9CA3AF]">{a.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-[#6B7280]">{a.barangay || 'Not provided'}</td>
                      <td className="px-5 py-3.5 text-sm text-[#6B7280] max-w-[160px] truncate">{a.school || 'Not provided'}</td>
                      <td className="px-5 py-3.5 text-sm text-[#6B7280]">{formatDate(a.registeredDate)}</td>
                      <td className="px-5 py-3.5">
                        {a.portalAccess === 'existing_scholar' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-600 px-2.5 py-1 rounded-full bg-blue-50 text-[#2563EB]" style={{ fontWeight: 600 }}>
                            <Icon name="award" size={11} /> Existing Scholar
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-600 px-2.5 py-1 rounded-full bg-[#F6F7F9] text-[#6B7280]" style={{ fontWeight: 600 }}>
                            <Icon name="user-plus" size={11} />
                            {a.movedToNewApplicant ? 'Moved to New Applicant' : 'New Applicant'}
                          </span>
                         )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-600 px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`} style={{ fontWeight: 600 }}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => openReview(a)}
                          className="px-3 py-1.5 border border-[#E5E7EB] text-xs font-600 text-[#6B7280] rounded-lg hover:border-[#163A63] hover:text-[#163A63] transition-colors"
                          style={{ fontWeight: 600 }}
                        >
                          {a.status === 'pending' ? 'Review' : 'View'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review modal */}
      {selected && sc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[#E5E7EB] px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-700 text-[#1F2937]" style={{ fontWeight: 700 }}>Scholar Account Review</h2>
                <p className="text-xs text-[#6B7280] mt-0.5">Verify this account against the active scholar registry</p>
              </div>
              <button onClick={() => setSelected(null)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#F6F7F9] text-[#6B7280]">
                <Icon name="x" size={15} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Scholar info */}
              <div className="flex items-center gap-4 p-4 bg-[#F6F7F9] rounded-2xl">
                <div className="w-12 h-12 rounded-full bg-[#163A63] flex items-center justify-center text-white font-800 flex-shrink-0" style={{ fontWeight: 800 }}>
                  {selected.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <div className="font-700 text-[#0B1F3A]" style={{ fontWeight: 700 }}>{selected.name}</div>
                  <div className="text-xs text-[#6B7280] mt-0.5">{selected.email}</div>
                  <div className="mt-1">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-600 px-2 py-0.5 rounded-full ${sc.bg} ${sc.text}`} style={{ fontWeight: 600 }}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                      {sc.label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Details grid — real data, no placeholders */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Registered', value: formatDate(selected.registeredDate) },
                  { label: 'Barangay', value: selected.barangay || 'Not provided' },
                  { label: 'School', value: selected.school || 'Not provided' },
                  {
                    label: 'Portal Access',
                    value: selected.portalAccess === 'existing_scholar'
                      ? 'Existing Scholar'
                      : selected.movedToNewApplicant ? 'Moved to New Applicant' : 'New Applicant',
                  },
                  {
                    label: selected.status === 'approved' ? 'Verified at' : selected.status === 'rejected' ? 'Decided at' : 'Decision',
                    value: selected.verifiedAt ? formatDate(selected.verifiedAt) : '—',
                  },
                ].map(f => (
                  <div key={f.label} className="bg-[#F6F7F9] rounded-xl p-3">
                    <div className="text-xs text-[#9CA3AF] mb-0.5">{f.label}</div>
                    <div className="text-sm font-600 text-[#1F2937]" style={{ fontWeight: 600 }}>{f.value}</div>
                  </div>
                ))}
              </div>

              {/* Verification guidance */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="info" size={14} className="text-[#2563EB]" />
                  <span className="text-xs font-700 text-[#2563EB]" style={{ fontWeight: 700 }}>Verification Checklist</span>
                </div>
                <ul className="space-y-1.5 text-xs text-blue-700">
                  <li className="flex items-start gap-2"><Icon name="check" size={11} className="text-[#2563EB] mt-0.5 flex-shrink-0" />Verify the existing-scholar claim against the City Office&rsquo;s own records</li>
                  <li className="flex items-start gap-2"><Icon name="check" size={11} className="text-[#2563EB] mt-0.5 flex-shrink-0" />Verify the name matches the name on file</li>
                  <li className="flex items-start gap-2"><Icon name="check" size={11} className="text-[#2563EB] mt-0.5 flex-shrink-0" />Confirm barangay and school details are consistent</li>
                  <li className="flex items-start gap-2"><Icon name="check" size={11} className="text-[#2563EB] mt-0.5 flex-shrink-0" />Check that the scholar is still within active enrollment period</li>
                  <li className="flex items-start gap-2"><Icon name="check" size={11} className="text-[#2563EB] mt-0.5 flex-shrink-0" />Approving unlocks the student&rsquo;s Renewal page</li>
                  <li className="flex items-start gap-2"><Icon name="check" size={11} className="text-[#2563EB] mt-0.5 flex-shrink-0" />Rejecting moves the account to New Applicant access — Renewal and Event Attendance stay locked</li>
                </ul>
              </div>

              {/* Rejection moves the account to New Applicant access, so the
                  reviewer sees that before deciding. */}
              {selected.status === 'pending' && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <Icon name="alert-triangle" size={14} className="text-[#D97706] mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-[#92400E]">
                    If this student is <span style={{ fontWeight: 700 }}>not</span> an existing scholar, rejecting moves the account to
                    {' '}<span style={{ fontWeight: 700 }}>New Applicant access</span> — the Application page reopens and Event Attendance and Renewal are locked until the City Office approves a new application.
                  </p>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>Review Notes</label>
                <textarea
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]"
                  rows={3}
                  placeholder="Add notes for this decision (optional)…"
                />
              </div>

              {/* Actions */}
              {selected.status === 'pending' ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => applyDecision('rejected')}
                    disabled={saving}
                    className="flex-1 py-2.5 flex items-center justify-center gap-2 border border-[#DC2626] text-[#DC2626] rounded-xl text-sm font-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    style={{ fontWeight: 600 }}
                  >
                    <Icon name="x-circle" size={15} /> {saving ? 'Saving…' : 'Reject'}
                  </button>
                  <button
                    onClick={() => applyDecision('approved')}
                    disabled={saving}
                    className="flex-1 py-2.5 flex items-center justify-center gap-2 bg-[#22A06B] text-white rounded-xl text-sm font-700 hover:bg-green-700 transition-colors disabled:opacity-50"
                    style={{ fontWeight: 700 }}
                  >
                    <Icon name="check-circle" size={15} /> {saving ? 'Saving…' : 'Approve'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {selected.notes && (
                    <div className="text-xs text-[#6B7280] bg-[#F6F7F9] rounded-xl p-3">
                      <span className="font-600 text-[#1F2937]" style={{ fontWeight: 600 }}>Previous notes: </span>{selected.notes}
                    </div>
                  )}
                  <button
                    onClick={() => setSelected(null)}
                    className="w-full py-2.5 border border-[#E5E7EB] rounded-xl text-sm text-[#6B7280] font-600 hover:bg-[#F6F7F9] transition-colors"
                    style={{ fontWeight: 600 }}
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
