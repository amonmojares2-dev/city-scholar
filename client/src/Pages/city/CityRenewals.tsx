import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Icon from '../../components/Icon';
import StatusBadge from '../../components/StatusBadge';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';

// Renewals are applications whose status is "renewal" - an approved scholar
// submitted a renewal for review. Same Application collection the city
// Applications page reads; there is no separate renewal data source.
interface Application {
  _id: string;
  student?: { name: string; email: string };
  barangay?: { name: string };
  program: string;
  school: string;
  status: string;
  remarks?: string;
  createdAt: string;
  submittedAt?: string;
}

const date = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function CityRenewals() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api<{ applications: Application[] }>('/applications')
      .then((result) => { if (!cancelled) setApplications(result.applications || []); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load renewals.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const renewals = applications.filter((application) => application.status === 'renewal');
  const query = search.trim().toLowerCase();
  const filtered = renewals.filter((application) =>
    ((application.student?.name || '') + ' ' + (application.barangay?.name || '') + ' ' + application.school).toLowerCase().includes(query));

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading renewals...</div>;

  return (
    <div>
      <PageHeader title="Renewals" subtitle="Renewal applications submitted by approved scholars" breadcrumb={['City Office', 'Renewals']} />
      {error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}
      <div className="relative mb-5">
        <Icon name="search" size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E5E7EB] text-sm bg-white" placeholder="Search renewals by scholar, barangay or school..." />
      </div>
      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F6F7F9]">
                {['Scholar', 'Barangay', 'Program / School', 'Submitted', 'Status', 'Actions'].map((header) => (
                  <th key={header} className="px-5 py-3 text-left text-xs font-600 text-[#6B7280]">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filtered.map((application) => (
                <tr key={application._id} className="hover:bg-[#F6F7F9]">
                  <td className="px-5 py-3.5">
                    <div className="font-600 text-sm text-[#1F2937]">{application.student?.name || 'Unknown student'}</div>
                    <div className="text-xs text-[#6B7280]">{application.student?.email}</div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{application.barangay?.name || 'Not provided'}</td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">
                    {application.program}
                    <div className="text-xs text-[#9CA3AF]">{application.school}</div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{date(application.submittedAt || application.createdAt)}</td>
                  <td className="px-5 py-3.5"><StatusBadge status="renewal" size="sm" /></td>
                  <td className="px-5 py-3.5">
                    <Link to={'/city/applications/' + application._id} className="inline-flex items-center gap-1 px-3 py-1.5 border border-[#E5E7EB] text-xs font-600 text-[#6B7280] rounded-lg hover:border-[#163A63] hover:text-[#163A63]">
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
            {renewals.length === 0
              ? 'No renewal applications yet. Renewals appear here when an approved scholar submits one.'
              : 'No renewals match your search.'}
          </div>
        )}
        {renewals.length > 0 && (
          <div className="px-5 py-3 border-t border-[#E5E7EB] text-xs text-[#6B7280]">Showing {filtered.length} of {renewals.length} renewals</div>
        )}
      </div>
    </div>
  );
}
