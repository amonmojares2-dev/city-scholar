import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';

// Approved scholar record from GET /api/scholars.
interface ApprovedScholar {
  id: string;
  name: string;
  email: string;
  scholarId: string;
  school: string;
  course: string;
  yearLevel: string;
  gwa: string;
  barangayId: string | null;
  barangay: string;
  verifiedAt: string | null;
}

// Super Admin view: every approved scholar across all barangays (no filter).
export default function SuperAdminScholars() {
  const [scholars, setScholars] = useState<ApprovedScholar[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api<{ scholars: ApprovedScholar[] }>('/scholars')
      .then((result) => { if (!cancelled) setScholars(result.scholars || []); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load scholars.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const query = search.trim().toLowerCase();
  const filtered = scholars.filter((scholar) =>
    (scholar.name + ' ' + scholar.email + ' ' + scholar.school + ' ' + scholar.barangay + ' ' + scholar.scholarId).toLowerCase().includes(query));

  return (
    <div className="space-y-6">
      <PageHeader title="Approved Scholars" subtitle="Every scholar verified by the City Office, across all barangays." />
      {error && <div className="rounded bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <div className="relative">
        <Icon name="search" size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E5E7EB] text-sm bg-white" placeholder="Search by name, email, school, barangay or scholar ID..." />
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="overflow-auto rounded border">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Name', 'Scholar ID', 'Email', 'School', 'Course / Year', 'Barangay', 'GWA', 'Verified'].map((header) => (
                  <th key={header} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filtered.map((scholar) => (
                <tr key={scholar.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{scholar.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{scholar.scholarId || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{scholar.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{scholar.school || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{(scholar.course || '—') + (scholar.yearLevel ? ' · Year ' + scholar.yearLevel : '')}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{scholar.barangay || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{scholar.gwa || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{scholar.verifiedAt ? new Date(scholar.verifiedAt).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-10 text-center text-sm text-[#6B7280]">
              {scholars.length === 0 ? 'No approved scholars yet.' : 'No scholars match your search.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
