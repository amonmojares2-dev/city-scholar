import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import Icon from '../../components/Icon';
import StatusBadge from '../../components/StatusBadge';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';
import { applicationDisplayId } from '../../lib/applicationId';

type Application = {
  _id: string;
  student?: { name: string; email: string };
  barangay?: { name: string };
  // `program` was removed from the Application form (kept optional for
  // historical reads — older submitted applications may still carry it).
  program?: string;
  school: string;
  status: string;
  barangayVerificationStatus?: string;
  createdAt: string;
  submittedAt?: string;
};

const PAGE_SIZE = 8;

const date = (value: string) =>
  new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Same label the review page shows for a record, so a row in this table and
// the page it opens use one identical application number.
const labels: Record<string, string> = {
  submitted: 'Submitted',
  barangay_approved: 'Approved by barangay',
  barangay_rejected: 'Rejected',
  under_review: 'Under Review',
  additional_requirements: 'Additional Requirements',
  approved: 'Approved',
  rejected: 'Rejected',
};

const initials = (name: string) =>
  name.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();

export default function CityApplications() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [barangayFilter, setBarangayFilter] = useState('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ applications: Application[] }>('/applications')
      // The API already hides drafts from the City Office; this second filter
      // keeps the page correct even if the browser is talking to an older
      // build, because a draft is never reviewable work.
      .then(result => setApplications((result.applications || []).filter(a => a.status !== 'draft' && (a.status !== 'submitted' || a.barangayVerificationStatus === 'approved'))))
      .catch(requestError => setError(requestError instanceof Error ? requestError.message : 'Unable to load applications.'))
      .finally(() => setLoading(false));
  }, []);

  const barangays = useMemo(() => {
    const names = new Set(applications.map(a => a.barangay?.name).filter((n): n is string => Boolean(n)));
    return [...names].sort();
  }, [applications]);

  const tabs = useMemo(() => {
    const statuses = ['all', 'barangay_approved', 'under_review', 'additional_requirements', 'approved', 'rejected'];
    return statuses.map(key => ({
      key,
      label: key === 'all' ? 'All' : labels[key] || key.replace('_', ' '),
      count: key === 'all' ? applications.length : applications.filter(a => a.status === key).length,
    }));
  }, [applications]);

  const filtered = useMemo(() => {
    return applications.filter(a => {
      const name = a.student?.name || '';
      const barangay = a.barangay?.name || '';
      const matchesSearch = `${name} ${barangay} ${a.school}`.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = filter === 'all' || a.status === filter;
      const matchesBarangay = barangayFilter === 'all' || barangay === barangayFilter;
      return matchesSearch && matchesStatus && matchesBarangay;
    });
  }, [applications, search, filter, barangayFilter]);

  // Any change to search/filter/barangay invalidates the current page.
  useEffect(() => { setPage(1); }, [search, filter, barangayFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading applications...</div>;

  return (
    <div>
      <PageHeader title="Applications" subtitle="Review and process applications submitted by students" breadcrumb={['City Office', 'Applications']} />

      {error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}

      <div className="flex gap-2 overflow-x-auto pb-1 mb-5">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-600 whitespace-nowrap border transition-colors ${
              filter === t.key ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]' : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#163A63]'
            }`}
            style={{ fontWeight: 600 }}
          >
            {t.label}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-700 ${filter === t.key ? 'bg-white/20 text-white' : 'bg-[#F6F7F9] text-[#6B7280]'}`} style={{ fontWeight: 700 }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="flex gap-3 mb-4 relative">
        <div className="relative flex-1">
          <Icon name="search" size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E5E7EB] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]"
            placeholder="Search by student, school, or barangay..."
          />
        </div>
        <button
          onClick={() => setShowFilterMenu(v => !v)}
          className={`flex items-center gap-2 px-3 py-2.5 border rounded-xl text-sm font-600 transition-colors ${
            barangayFilter !== 'all' ? 'border-[#163A63] text-[#163A63] bg-[#163A63]/5' : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:border-[#163A63]'
          }`}
          style={{ fontWeight: 600 }}
        >
          <Icon name="filter" size={14} /> Filter{barangayFilter !== 'all' ? `: ${barangayFilter}` : ''}
        </button>

        {showFilterMenu && (
          <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl border border-[#E5E7EB] shadow-lg z-10 p-2">
            <p className="text-xs font-600 text-[#6B7280] px-2 py-1.5" style={{ fontWeight: 600 }}>Filter by barangay</p>
            <button
              onClick={() => { setBarangayFilter('all'); setShowFilterMenu(false); }}
              className={`w-full text-left px-2 py-1.5 rounded-lg text-sm ${barangayFilter === 'all' ? 'bg-[#163A63]/10 text-[#163A63]' : 'text-[#1F2937] hover:bg-[#F6F7F9]'}`}
            >
              All barangays
            </button>
            {barangays.map(b => (
              <button
                key={b}
                onClick={() => { setBarangayFilter(b); setShowFilterMenu(false); }}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-sm ${barangayFilter === b ? 'bg-[#163A63]/10 text-[#163A63]' : 'text-[#1F2937] hover:bg-[#F6F7F9]'}`}
              >
                {b}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F6F7F9]">
                {['App. ID', 'Applicant', 'Program / School', 'Barangay', 'Date Submitted', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-600 text-[#6B7280]" style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {paged.map(a => (
                <tr key={a._id} className="hover:bg-[#F6F7F9] transition-colors">
                  <td className="px-5 py-3.5 text-xs font-600 text-[#163A63]" style={{ fontWeight: 600 }}>{applicationDisplayId(a)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#163A63] flex items-center justify-center text-white text-xs font-700 flex-shrink-0" style={{ fontWeight: 700 }}>
                        {initials(a.student?.name || '?')}
                      </div>
                      <div>
                        <div className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{a.student?.name || 'Unknown student'}</div>
                        <div className="text-xs text-[#9CA3AF]">{a.student?.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">
                    {a.program || '—'}
                    <div className="text-xs text-[#9CA3AF]">{a.school}</div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{a.barangay?.name || 'Not provided'}</td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{date(a.submittedAt || a.createdAt)}</td>
                  <td className="px-5 py-3.5"><StatusBadge status={a.status.replace('_', '-')} size="sm" /></td>
                  <td className="px-5 py-3.5">
                    <Link
                      to={`/city/applications/${a._id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 border border-[#E5E7EB] text-xs font-600 text-[#6B7280] rounded-lg hover:border-[#163A63] hover:text-[#163A63] transition-colors"
                      style={{ fontWeight: 600 }}
                    >
                      <Icon name="eye" size={12} /> Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="p-10 text-center text-sm text-[#6B7280]">
            {applications.length === 0
              ? 'No submitted applications yet. A student’s application appears here as soon as they submit it.'
              : 'No student applications match this view.'}
          </div>
        )}

        <div className="px-5 py-3 border-t border-[#E5E7EB] flex items-center justify-between">
          <span className="text-xs text-[#6B7280]">
            Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} applications
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-[#E5E7EB] rounded-lg text-xs text-[#6B7280] hover:bg-[#F6F7F9] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 bg-[#0B1F3A] text-white rounded-lg text-xs font-600" style={{ fontWeight: 600 }}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-[#E5E7EB] rounded-lg text-xs text-[#6B7280] hover:bg-[#F6F7F9] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}