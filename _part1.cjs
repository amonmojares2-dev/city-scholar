// Part 1: rewrite the four files that switch the Scholars views to
// GET /api/scholars (User collection: role=student, existing_scholar, approved).
const fs = require('fs');
const ROOT = 'c:/Users/amonm/city-scholar';

function write(rel, content) {
    const file = ROOT + '/' + rel;
    fs.writeFileSync(file, content, 'utf8');
    console.log('wrote', rel, content.length, 'bytes');
}

write('server/routes/scholarsRoutes.js', `const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const User = require("../models/User");

const router = express.Router();
router.use(protect);

// GET /api/scholars
//
// Single source of truth for "approved scholar":
//   User documents where role=student, scholarType=existing_scholar and
//   scholarVerificationStatus=approved - exactly what the City Office
//   Scholar Approval page writes when it approves a claim.
//
// Query scope:
//   - City Office / Super Admin: omit ?barangay -> all approved scholars.
//   - Barangay staff:            ?barangay=<id> -> only their barangay.
router.get("/", async (req, res, next) => {
    try {
        const filter = {
            role: "student",
            scholarType: "existing_scholar",
            scholarVerificationStatus: "approved",
        };

        if (req.query.barangay) {
            filter.barangay = req.query.barangay;
        }

        const rows = await User.find(filter)
            .select(
                "name email scholarId scholarVerificationStatus scholarVerifiedAt " +
                "barangay profile.schoolName profile.course profile.yearLevel profile.gwa"
            )
            .populate("barangay", "name")
            .sort({ name: 1 })
            .lean();

        const scholars = rows.map((row) => ({
            id: String(row._id),
            name: row.name,
            email: row.email,
            scholarId: row.scholarId || "",
            school: (row.profile && row.profile.schoolName) || "",
            course: (row.profile && row.profile.course) || "",
            yearLevel: (row.profile && row.profile.yearLevel) || "",
            gwa: (row.profile && row.profile.gwa) || "",
            barangayId: row.barangay && row.barangay._id ? String(row.barangay._id) : null,
            barangay: (row.barangay && row.barangay.name) || "",
            verifiedAt: row.scholarVerifiedAt || null,
        }));

        res.json({ success: true, count: scholars.length, scholars });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
`);
write('client/src/Pages/city/CityScholars.tsx', `import { useEffect, useState } from 'react';
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
`);
write('client/src/Pages/barangay/BarangayScholars.tsx', `import { useEffect, useState } from 'react';
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
`);
write('client/src/Pages/superadmin/SuperAdminScholars.tsx', `import { useEffect, useState } from 'react';
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
`);

console.log('PART 1 FILES WRITTEN');



