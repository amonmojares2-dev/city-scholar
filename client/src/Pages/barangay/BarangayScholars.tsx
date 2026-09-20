import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import StatusBadge from '../../components/StatusBadge';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';
import { getSessionUser } from '../../lib/auth';

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

// Barangay view: ONLY the approved scholars of the logged-in staff member's
// own barangay. The staff account's barangay id is sent as the ?barangay=
// filter on /api/scholars, so this page never sees city-wide data.
export default function BarangayScholars() {
  const [scholars, setScholars] = useState<ApprovedScholar[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const barangayId = getSessionUser()?.barangay?._id || '';
  const barangayName = getSessionUser()?.barangay?.name || '';

  useEffect(() => {
    if (!barangayId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    api<{ scholars: ApprovedScholar[] }>('/scholars?barangay=' + encodeURIComponent(barangayId))
      .then((result) => { if (!cancelled) setScholars(result.scholars || []); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load scholars.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [barangayId]);

  const query = search.trim().toLowerCase();
  const filtered = scholars.filter((scholar) =>
    (scholar.name + ' ' + scholar.school + ' ' + scholar.scholarId).toLowerCase().includes(query));

  if (!barangayId) {
    return (
      <div>
        <PageHeader title="Scholars" subtitle="Verified scholars of your barangay" breadcrumb={['Barangay Portal', 'Scholars']} />
        <div className="p-10 text-center text-sm text-[#6B7280]">
          Your account is not assigned to a barangay yet. Ask the City Office to link your account to a barangay.
        </div>
      </div>
    );
  }

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading scholars...</div>;

  return (
    <div>
      <PageHeader title="Scholars" subtitle={'Verified existing scholars of ' + (barangayName || 'your barangay')} breadcrumb={['Barangay Portal', 'Scholars']} />
      {error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}
      <div className="relative mb-5">
        <Icon name="search" size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E5E7EB] text-sm bg-white" placeholder="Search scholars by name, school or scholar ID..." />
      </div>
      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F6F7F9]">
                {['Scholar', 'Scholar ID', 'School', 'Email', 'Status'].map((header) => (
                  <th key={header} className="px-5 py-3 text-left text-xs font-600 text-[#6B7280]">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filtered.map((scholar) => (
                <tr key={scholar.id}>
                  <td className="px-5 py-3.5 font-600 text-sm text-[#1F2937]">{scholar.name}</td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{scholar.scholarId || '—'}</td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{scholar.school || '—'}</td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{scholar.email}</td>
                  <td className="px-5 py-3.5"><StatusBadge status="scholar" size="sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-10 text-center text-sm text-[#6B7280]">
            {scholars.length === 0
              ? 'No verified scholars in your barangay yet.'
              : 'No scholars match your search.'}
          </div>
        )}
      </div>
    </div>
  );
}
