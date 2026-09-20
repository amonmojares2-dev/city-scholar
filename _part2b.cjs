// Part 2 (barangay portal): scope Dashboard + Applicants to the staff's own
// barangay and add the verified-scholars tile.
const fs = require('fs');
const ROOT = 'c:/Users/amonm/city-scholar';

function write(rel, content) {
    fs.writeFileSync(ROOT + '/' + rel, content, 'utf8');
    console.log('wrote', rel, content.length, 'bytes');
}

const bdashA = `import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';
import { getSessionUser } from '../../lib/auth';

// Barangay-scoped overview. Applications and scholars are filtered to the
// logged-in staff member's own barangay; the staff account carries the
// barangay link, so this page never shows city-wide totals.
interface Application {
  _id: string;
  student?: { name: string };
  school: string;
  status: string;
  createdAt: string;
  barangay?: { _id: string; name: string };
}

const date = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
`;
const bdashB = `
export default function BarangayDashboard() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [scholarCount, setScholarCount] = useState<number | null>(null);
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
    Promise.all([
      api<{ applications: Application[] }>('/applications'),
      api<{ count: number }>('/scholars?barangay=' + encodeURIComponent(barangayId)),
    ])
      .then(([applicationResult, scholarResult]) => {
        if (cancelled) return;
        // Scope to this barangay: only applications whose barangay matches
        // the logged-in staff account.
        const scoped = (applicationResult.applications || []).filter((application) => application.barangay?._id === barangayId);
        setApplications(scoped);
        setScholarCount(scholarResult.count);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load barangay data.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [barangayId]);

  if (!barangayId) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Barangay-Level Overview" breadcrumb={['Barangay Portal', 'Dashboard']} />
        <div className="p-10 text-center text-sm text-[#6B7280]">
          Your account is not assigned to a barangay yet. Ask the City Office to link your account to a barangay.
        </div>
      </div>
    );
  }

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading barangay data...</div>;

  const approved = applications.filter((application) => application.status === 'approved');
  const pending = applications.filter((application) => ['submitted', 'under_review'].includes(application.status));

  return (
    <div>
      <div className="mb-6">
        <div className="text-xs text-[#6B7280] mb-1">Barangay-Level Overview</div>
        <h1 className="text-xl font-700 text-[#1F2937]">{barangayName || 'Barangay'} — Applications &amp; Scholars</h1>
        <p className="text-sm text-[#6B7280]">Live records for your barangay only: applications submitted by your students and scholars verified by the City Office.</p>
      </div>
      {error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard label="Verified Scholars" value={scholarCount === null ? '—' : String(scholarCount)} icon="award" change="Approved by the City Office" changeType="neutral" accent />
        <StatCard label="Applications" value={String(applications.length)} icon="users" change="Submitted by your students" changeType="neutral" />
        <StatCard label="Approved" value={String(approved.length)} icon="check-circle" change="Reviewed by city office" changeType="neutral" />
        <StatCard label="Pending" value={String(pending.length)} icon="clipboard" change="Awaiting review" changeType="neutral" />
        <StatCard label="Schools" value={String(new Set(applications.map((application) => application.school)).size)} icon="book" change="From applications" changeType="neutral" />
      </div>
      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <h2 className="font-600 text-sm text-[#1F2937]">Recent Applications (your barangay)</h2>
          <Link to="/barangay/applicants" className="text-xs font-600 text-[#163A63]">View all</Link>
        </div>
        {applications.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#6B7280]">No applications from your barangay yet.</div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {applications.slice(0, 8).map((application) => (
              <div key={application._id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex-1">
                  <div className="font-600 text-sm text-[#1F2937]">{application.student?.name || 'Unknown student'}</div>
                  <div className="text-xs text-[#6B7280]">{application.school} · {date(application.createdAt)}</div>
                </div>
                <StatusBadge status={application.status.replace('_', '-')} size="sm" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
`;

write('client/src/Pages/barangay/BarangayDashboard.tsx', bdashA + bdashB);
const bappsA = `import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import StatusBadge from '../../components/StatusBadge';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';
import { getSessionUser } from '../../lib/auth';

// Applicants are scoped to the logged-in staff member's barangay: only
// applications whose barangay matches the staff account are shown.
interface Application {
  _id: string;
  student?: { name: string; email: string };
  school: string;
  status: string;
  createdAt: string;
  barangay?: { _id: string; name: string };
}

const date = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
`;
const bappsB = `
export default function BarangayApplicants() {
  const [applications, setApplications] = useState<Application[]>([]);
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
    api<{ applications: Application[] }>('/applications')
      .then((result) => {
        if (!cancelled) {
          // Scope to this barangay: only applications whose barangay matches
          // the logged-in staff account.
          setApplications((result.applications || []).filter((application) => application.barangay?._id === barangayId));
        }
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load applicants.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [barangayId]);

  const query = search.trim().toLowerCase();
  const filtered = applications.filter((application) =>
    ((application.student?.name || '') + ' ' + application.school).toLowerCase().includes(query));

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

  return (
    <div>
      <PageHeader title="Applicants" subtitle={'Application records from ' + (barangayName || 'your barangay')} breadcrumb={['Barangay Portal', 'Applicants']} />
      {error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2 mb-5">
        <Icon name="info" size={15} className="text-[#D97706]" />
        <p className="text-sm text-[#1F2937]">Barangay staff can view records submitted by students of this barangay. Approval actions remain with the City Scholarship Office.</p>
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
                {['Applicant', 'School', 'Date Submitted', 'Status'].map((header) => (
                  <th key={header} className="px-5 py-3 text-left text-xs font-600 text-[#6B7280]">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filtered.map((application) => (
                <tr key={application._id}>
                  <td className="px-5 py-3.5">
                    <div className="font-600 text-sm text-[#1F2937]">{application.student?.name || 'Unknown student'}</div>
                    <div className="text-xs text-[#6B7280]">{application.student?.email}</div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{application.school}</td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{date(application.createdAt)}</td>
                  <td className="px-5 py-3.5"><StatusBadge status={application.status.replace('_', '-')} size="sm" /></td>
                </tr>
              ))}
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
    </div>
  );
}
`;

write('client/src/Pages/barangay/BarangayApplicants.tsx', bappsA + bappsB);

console.log('PART 2 BARANGAY FILES WRITTEN');



