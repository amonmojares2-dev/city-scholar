import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import StatusBadge from '../../components/StatusBadge';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';

// Approved scholar record from GET /api/scholars (User collection:
// role=student, scholarType=existing_scholar, scholarVerificationStatus=approved).
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

// City Office view: every approved scholar in the city (no barangay filter).
export default function CityScholars() {
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
    (scholar.name + ' ' + scholar.school + ' ' + scholar.barangay + ' ' + scholar.scholarId).toLowerCase().includes(query));

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading approved scholars...</div>;

  return (
    <div>
      <PageHeader title="Scholar Directory" subtitle="Students verified as existing scholars by the City Office" breadcrumb={['City Office', 'Scholars']} />
      {error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}
      <div className="relative mb-5">
        <Icon name="search" size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E5E7EB] text-sm bg-white" placeholder="Search scholars by name, school, barangay or scholar ID..." />
      </div>
      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F6F7F9]">
                {['Scholar', 'Scholar ID', 'Course', 'School', 'Barangay', 'Email', 'Status'].map((header) => (
                  <th key={header} className="px-5 py-3 text-left text-xs font-600 text-[#6B7280]">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filtered.map((scholar) => (
                <tr key={scholar.id}>
                  <td className="px-5 py-3.5 text-sm font-600 text-[#1F2937]">{scholar.name}</td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{scholar.scholarId || '—'}</td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{scholar.course || '—'}</td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{scholar.school || '—'}</td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{scholar.barangay || '—'}</td>
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
              ? 'No approved scholars yet. Scholars appear here once the City Office approves their Scholar ID on the Scholar Approval page.'
              : 'No scholars match your search.'}
          </div>
        )}
      </div>
    </div>
  );
}
