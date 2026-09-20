import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';

// Live barangay directory: barangays from GET /api/barangays (Barangay
// collection), verified-scholar counts from GET /api/scholars, applicant
// counts from GET /api/applications, and assigned officials from
// GET /api/users (barangay_staff accounts). Barangay records themselves are
// managed by the Super Admin (Schools & Barangays), so this page is
// intentionally read-only.
interface BarangayRecord { _id: string; name: string; city?: string; province?: string }
interface ScholarRow { id: string; barangayId: string | null }
interface ApplicationRow { _id: string; barangay?: { name: string } }
interface DirectoryUser { id: string; name: string; role: string; barangayId: string | null }

export default function CityBarangays() {
  const [barangays, setBarangays] = useState<BarangayRecord[]>([]);
  const [scholars, setScholars] = useState<ScholarRow[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ barangays: BarangayRecord[] }>('/barangays'),
      api<{ scholars: ScholarRow[] }>('/scholars'),
      api<{ applications: ApplicationRow[] }>('/applications'),
      api<{ users: DirectoryUser[] }>('/users'),
    ])
      .then(([barangayResult, scholarResult, applicationResult, userResult]) => {
        if (cancelled) return;
        setBarangays(barangayResult.barangays || []);
        setScholars(scholarResult.scholars || []);
        setApplications(applicationResult.applications || []);
        setUsers(userResult.users || []);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load barangay data.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Officials: every barangay_staff account, grouped by barangay id.
  const officialsByBarangay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const user of users) {
      if (user.role !== 'barangay_staff' || !user.barangayId) continue;
      const names = map.get(user.barangayId) || [];
      names.push(user.name);
      map.set(user.barangayId, names);
    }
    return map;
  }, [users]);

  // Verified scholars per barangay id.
  const scholarCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const scholar of scholars) {
      if (!scholar.barangayId) continue;
      counts.set(scholar.barangayId, (counts.get(scholar.barangayId) || 0) + 1);
    }
    return counts;
  }, [scholars]);

  // Applicants per barangay name (applications carry the populated name).
  const applicantCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const application of applications) {
      const name = (application.barangay?.name || '').trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return counts;
  }, [applications]);

  const query = search.trim().toLowerCase();
  const filtered = barangays.filter((barangay) => barangay.name.toLowerCase().includes(query));

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading barangay data...</div>;

  return (
    <div>
      <PageHeader title="Barangay Accounts" subtitle="Live barangay directory. Barangay records are managed by the Super Admin under Schools & Barangays." breadcrumb={['City Office', 'Barangay Accounts']} />
      {error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}

      <div className="relative mb-5">
        <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-[#E5E7EB] text-sm bg-white" placeholder="Search barangays..." />
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F6F7F9]">
                {['Barangay', 'Assigned Official', 'Verified Scholars', 'Applicants'].map((header) => (
                  <th key={header} className="px-5 py-3 text-left text-xs font-600 text-[#6B7280]" style={{ fontWeight: 600 }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filtered.map((barangay) => {
                const officials = (officialsByBarangay.get(barangay._id) || []).join(', ');
                return (
                  <tr key={barangay._id} className="hover:bg-[#F6F7F9]">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-[#163A63] flex items-center justify-center text-white text-xs font-700 flex-shrink-0" style={{ fontWeight: 700 }}>
                          {barangay.name.charAt(0)}
                        </div>
                        <span className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{barangay.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-[#6B7280]">{officials || 'No official assigned yet'}</td>
                    <td className="px-5 py-3.5 text-sm font-600 text-[#1F2937]" style={{ fontWeight: 600 }}>{scholarCounts.get(barangay._id) || 0}</td>
                    <td className="px-5 py-3.5 text-sm text-[#6B7280]">{applicantCounts.get(barangay.name) || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-[#E5E7EB] text-xs text-[#6B7280]">Showing {filtered.length} of {barangays.length} barangays</div>
      </div>
    </div>
  );
}
