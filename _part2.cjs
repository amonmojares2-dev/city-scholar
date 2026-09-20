// Part 2 (city portal): rewrite hardcoded pages to live data + new backend
// directory endpoints. Written wholesale to avoid fragile string matches.
const fs = require('fs');
const ROOT = 'c:/Users/amonm/city-scholar';

function write(rel, content) {
    fs.writeFileSync(ROOT + '/' + rel, content, 'utf8');
    console.log('wrote', rel, content.length, 'bytes');
}

// ---------------------------------------------------------------------------
write('server/controllers/directoryController.js', `const User = require("../models/User");
const ProgramConfig = require("../models/ProgramConfig");

// GET /api/users - read-only account directory.
// The City Office pages (User Management, Barangay Accounts) need every
// account with the barangay name resolved. Writes are NOT done here:
// staff accounts are provisioned by the Super Admin, students self-register.
const listDirectoryUsers = async (req, res, next) => {
    try {
        const users = await User.find()
            .select("name email role status barangay scholarType scholarVerificationStatus createdAt lastLoginAt")
            .populate("barangay", "name")
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            success: true,
            users: users.map((user) => ({
                id: String(user._id),
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                scholarType: user.scholarType,
                scholarVerificationStatus: user.scholarVerificationStatus,
                barangayId: user.barangay && user.barangay._id ? String(user.barangay._id) : null,
                barangay: (user.barangay && user.barangay.name) || "",
                createdAt: user.createdAt,
                lastLoginAt: user.lastLoginAt,
            })),
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/programs - read-only scholarship program configuration.
// Mirrors the Super Admin Program Config data (ProgramConfig collection) so
// City Office pages (Scholarship Programs, System Settings) show real
// values. Program writes stay with the Super Admin endpoints.
const listPrograms = async (req, res, next) => {
    try {
        const programs = await ProgramConfig.find()
            .sort({ academicYear: -1, semester: 1, programName: 1 })
            .lean();

        const academicYears = [...new Set(programs.map((program) => program.academicYear))];
        const semesters = [...new Set(programs.map((program) => program.semester))];

        res.json({
            success: true,
            programs: programs.map((program) => ({
                id: String(program._id),
                programName: program.programName,
                description: program.description,
                academicYear: program.academicYear,
                semester: program.semester,
                minGwa: program.minGwa,
                requiredUnits: program.requiredUnits,
                grantAmount: program.grantAmount,
                slotsAvailable: program.slotsAvailable,
                applicationOpenAt: program.applicationOpenAt,
                applicationCloseAt: program.applicationCloseAt,
                requiredDocuments: program.requiredDocuments,
                eligibleSchools: program.eligibleSchools,
                active: program.active,
            })),
            academicYears,
            semesters,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { listDirectoryUsers, listPrograms };
`);

// ---------------------------------------------------------------------------
write('server/routes/userRoutes.js', `const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { SUPER_ADMIN_ROLES } = require("../utils/validation");
const { listDirectoryUsers } = require("../controllers/directoryController");

const router = express.Router();

// Read-only account directory for City Office pages (User Management,
// Barangay Accounts). Super Admin roles are included so shared tooling
// keeps working.
router.get("/", protect, authorize("city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), listDirectoryUsers);

module.exports = router;
`);

// ---------------------------------------------------------------------------
write('server/routes/programRoutes.js', `const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { SUPER_ADMIN_ROLES } = require("../utils/validation");
const { listPrograms } = require("../controllers/directoryController");

const router = express.Router();

// Read-only program configuration for City Office pages (Scholarship
// Programs, System Settings). Program writes stay with the Super Admin.
router.get("/", protect, authorize("city_admin", "admin_staff", ...SUPER_ADMIN_ROLES), listPrograms);

module.exports = router;
`);
write('client/src/Pages/city/CityRenewals.tsx', `import { useEffect, useState } from 'react';
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
`);
const academicA = `import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Icon from '../../components/Icon';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';

// Academic monitoring is computed from the verified scholars' real GWA
// values (User.profile.gwa) returned by GET /api/scholars. No scholars with
// GWA records means an honest empty state - never invented numbers.
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

interface GradedScholar extends ApprovedScholar {
  gwaValue: number;
}

interface Bucket { range: string; label: string; count: number }

const BUCKETS: { max: number; range: string; label: string }[] = [
  { max: 1.5, range: '1.00-1.50', label: 'Exceptional' },
  { max: 1.75, range: '1.51-1.75', label: 'Excellent' },
  { max: 2.0, range: '1.76-2.00', label: 'Very Good' },
  { max: 2.25, range: '2.01-2.25', label: 'Good' },
  { max: 5.0, range: 'Above 2.25', label: 'At Risk' },
];

function parseGwa(value: string): number | null {
  const parsed = parseFloat(String(value || ''));
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
}

export default function CityAcademic() {
  const [scholars, setScholars] = useState<ApprovedScholar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api<{ scholars: ApprovedScholar[] }>('/scholars')
      .then((result) => { if (!cancelled) setScholars(result.scholars || []); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load scholar records.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const graded: GradedScholar[] = scholars
    .map((scholar) => ({ ...scholar, gwaValue: parseGwa(scholar.gwa) }))
    .filter((scholar): scholar is GradedScholar => scholar.gwaValue !== null);

  const data: Bucket[] = BUCKETS.map((bucket, index) => {
    const lower = index === 0 ? 0 : BUCKETS[index - 1].max;
    return {
      range: bucket.range,
      label: bucket.label,
      count: graded.filter((scholar) => scholar.gwaValue > lower && scholar.gwaValue <= bucket.max).length,
    };
  });

  const average = graded.length
    ? (graded.reduce((sum, scholar) => sum + scholar.gwaValue, 0) / graded.length).toFixed(2)
    : null;
  const exceptional = data[0]?.count ?? 0;
  const atRisk = graded.filter((scholar) => scholar.gwaValue > 2.25);
  const belowThreshold = graded.filter((scholar) => scholar.gwaValue > 2.5);

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading academic data...</div>;

  return (
    <div>
      <PageHeader title="Academic Monitoring" subtitle="GWA distribution of City Office-verified scholars" breadcrumb={['City Office', 'Academic Monitoring']} />
      {error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Average GWA', value: average === null ? '—' : average, color: 'text-[#22A06B]' },
          { label: 'Exceptional (1.50 or better)', value: String(exceptional), color: 'text-[#0B1F3A]' },
          { label: 'At Risk (above 2.25)', value: String(atRisk.length), color: 'text-[#D97706]' },
          { label: 'Above 2.50', value: String(belowThreshold.length), color: 'text-[#DC2626]' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-center">
            <div className="text-2xl text-[#1F2937]" style={{ fontWeight: 800 }}>{stat.value}</div>
            <div className="text-xs text-[#6B7280] mt-1">{stat.label}</div>
          </div>
        ))}
      </div>
`;
const academicB = `
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 mb-5">
        <h3 className="text-sm text-[#1F2937] mb-4" style={{ fontWeight: 700 }}>GWA Distribution ({graded.length} scholars with GWA records)</h3>
        {graded.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#6B7280]">
            No verified scholars have GWA records yet. Values appear here as scholars are approved and their profile GWA is recorded.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data}>
              <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }} />
              <Bar dataKey="count" fill="#163A63" radius={[4, 4, 0, 0]} name="Scholars" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <h3 className="text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>Students Requiring Attention (GWA above 2.25)</h3>
          <span className="px-2.5 py-1 bg-red-50 text-red-700 text-xs font-600 rounded-full" style={{ fontWeight: 600 }}>{atRisk.length} scholars</span>
        </div>
        {atRisk.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#6B7280]">
            {graded.length === 0
              ? 'Nothing to show yet - no verified scholar has a recorded GWA.'
              : 'No verified scholar is above the 2.25 monitoring threshold.'}
          </div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {atRisk
              .slice()
              .sort((a, b) => b.gwaValue - a.gwaValue)
              .slice(0, 10)
              .map((scholar) => (
                <div key={scholar.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Icon name="alert-triangle" size={16} className="text-[#DC2626]" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{scholar.name}</div>
                    <div className="text-xs text-[#6B7280]">
                      {scholar.school || 'School not recorded'} · GWA {scholar.gwaValue.toFixed(2)} is above the 2.25 monitoring threshold
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[#DC2626]" style={{ fontWeight: 700 }}>GWA {scholar.gwaValue.toFixed(2)}</div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
`;

write('client/src/Pages/city/CityAcademic.tsx', academicA + academicB);
write('client/src/Pages/city/CityPrograms.tsx', `import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import StatusBadge from '../../components/StatusBadge';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';

// Programs come from the ProgramConfig collection (GET /api/programs, the
// same data the Super Admin maintains in Program Config). Applicant counts
// are computed from live /applications records. Program creation/edition is
// owned by the Super Admin, so this page is intentionally read-only.
interface Program {
  id: string;
  programName: string;
  description: string;
  academicYear: string;
  semester: string;
  minGwa: number;
  requiredUnits: number;
  grantAmount: number;
  slotsAvailable: number;
  applicationOpenAt: string | null;
  applicationCloseAt: string | null;
  active: boolean;
}

interface Application { _id: string; program: string }

const fmt = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const period = (program: Program) => {
  const open = fmt(program.applicationOpenAt);
  const close = fmt(program.applicationCloseAt);
  if (open && close) return open + ' - ' + close;
  if (open) return 'Opens ' + open;
  if (close) return 'Closes ' + close;
  return 'Rolling applications';
};

const programStatus = (program: Program) => {
  if (program.active) return 'active';
  const close = program.applicationCloseAt ? new Date(program.applicationCloseAt).getTime() : 0;
  return close && close < Date.now() ? 'closed' : 'upcoming';
};

export default function CityPrograms() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([api<{ programs: Program[] }>('/programs'), api<{ applications: Application[] }>('/applications')])
      .then(([programResult, applicationResult]) => {
        if (cancelled) return;
        setPrograms(programResult.programs || []);
        setApplications(applicationResult.applications || []);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load programs.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const applicantCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const application of applications) {
      const key = (application.program || '').trim().toLowerCase();
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [applications]);

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading scholarship programs...</div>;

  return (
    <div>
      <PageHeader title="Scholarship Programs" subtitle="Program configuration maintained by the Super Admin in Program Config" breadcrumb={['City Office', 'Scholarship Programs']} />
      {error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}

      {programs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-10 text-center text-sm text-[#6B7280]">
          No scholarship programs configured yet. Programs are created by the Super Admin under Program Config.
        </div>
      ) : (
        <div className="space-y-4">
          {programs.map((program) => {
            const applicants = applicantCounts.get(program.programName.trim().toLowerCase()) || 0;
            return (
              <div key={program.id} className="bg-white rounded-2xl border border-[#E5E7EB] p-5 flex items-center gap-5">
                <div className="w-10 h-10 rounded-xl bg-[#F6F7F9] flex items-center justify-center flex-shrink-0">
                  <Icon name="award" size={18} className="text-[#163A63]" />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-[#1F2937]" style={{ fontWeight: 700 }}>{program.programName}</div>
                  {program.description && <div className="text-xs text-[#6B7280] mt-0.5">{program.description}</div>}
                  <div className="flex items-center gap-3 text-xs text-[#6B7280] mt-1 flex-wrap">
                    <span>{period(program)}</span>
                    <span>·</span>
                    <span>{program.academicYear} · {program.semester}</span>
                    {program.slotsAvailable > 0 && <span>· {program.slotsAvailable} slots</span>}
                    {program.grantAmount > 0 && <span>· P{program.grantAmount.toLocaleString()} grant</span>}
                    {applicants > 0 && <span>· {applicants} applicants</span>}
                  </div>
                </div>
                <StatusBadge status={programStatus(program)} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
`);
const usersA = `import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';

// Live account directory from GET /api/users (User collection). Account
// creation is NOT done here: students self-register, staff accounts are
// provisioned by the Super Admin, so this page is intentionally read-only.
interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  barangay: string;
  createdAt: string;
  lastLoginAt: string | null;
}

const roleLabels: Record<string, string> = {
  student: 'Student',
  barangay_staff: 'Barangay Staff',
  city_admin: 'City Administrator',
  admin_staff: 'Admin Staff',
  super_admin: 'Super Admin',
  superadmin: 'Super Admin',
};

const roleColors: Record<string, string> = {
  student: 'bg-blue-50 text-blue-700',
  barangay_staff: 'bg-purple-50 text-purple-700',
  city_admin: 'bg-amber-50 text-amber-700',
  admin_staff: 'bg-amber-50 text-amber-700',
  super_admin: 'bg-red-50 text-red-700',
  superadmin: 'bg-red-50 text-red-700',
};

const ROLE_FILTERS: { label: string; value: string }[] = [
  { label: 'All Roles', value: 'all' },
  { label: 'Students', value: 'student' },
  { label: 'Barangay Staff', value: 'barangay_staff' },
  { label: 'City Staff', value: 'city' },
  { label: 'Super Admins', value: 'superadmin' },
];

const matchesRoleFilter = (role: string, filter: string) => {
  if (filter === 'all') return true;
  if (filter === 'city') return role === 'city_admin' || role === 'admin_staff';
  if (filter === 'superadmin') return role === 'super_admin' || role === 'superadmin';
  return role === filter;
};

const date = (value: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
`;
const usersB = `
export default function CityUsers() {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api<{ users: DirectoryUser[] }>('/users')
      .then((result) => { if (!cancelled) setUsers(result.users || []); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load users.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const query = search.trim().toLowerCase();
  const filtered = users.filter((user) =>
    matchesRoleFilter(user.role, roleFilter) &&
    (user.name + ' ' + user.email + ' ' + user.barangay).toLowerCase().includes(query));

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading users...</div>;

  return (
    <div>
      <PageHeader title="User Management" subtitle="Every account in the system. Staff accounts are provisioned by the Super Admin." breadcrumb={['City Office', 'User Management']} />
      {error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Icon name="search" size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E5E7EB] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]" placeholder="Search by name, email or barangay..." />
        </div>
        <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="px-3 py-2.5 rounded-xl border border-[#E5E7EB] text-sm bg-white text-[#6B7280]">
          {ROLE_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F6F7F9]">
                {['User', 'Email', 'Role', 'Barangay', 'Account Status', 'Registered', 'Last Login'].map((header) => (
                  <th key={header} className="px-5 py-3 text-left text-xs font-600 text-[#6B7280]" style={{ fontWeight: 600 }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filtered.map((user) => (
                <tr key={user.id} className="hover:bg-[#F6F7F9]">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#163A63] flex items-center justify-center text-white text-xs font-700 flex-shrink-0" style={{ fontWeight: 700 }}>
                        {user.name.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{user.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{user.email}</td>
                  <td className="px-5 py-3.5">
                    <span className={'px-2 py-0.5 text-xs font-600 rounded-full ' + (roleColors[user.role] || 'bg-gray-100 text-gray-600')} style={{ fontWeight: 600 }}>
                      {roleLabels[user.role] || user.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{user.barangay || '—'}</td>
                  <td className="px-5 py-3.5">
                    <span className={'px-2 py-0.5 text-xs font-600 rounded-full ' + (user.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500')} style={{ fontWeight: 600 }}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{date(user.createdAt)}</td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{date(user.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-[#E5E7EB] text-xs text-[#6B7280]">Showing {filtered.length} of {users.length} accounts</div>
      </div>
    </div>
  );
}
`;

write('client/src/Pages/city/CityUsers.tsx', usersA + usersB);
const brgyA = `import { useEffect, useMemo, useState } from 'react';
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
`;
const brgyB = `
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
`;

write('client/src/Pages/city/CityBarangays.tsx', brgyA + brgyB);
const settingsA = `import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';

// System Settings - deliberately honest about what is real:
//   * Academic Year / Semester come from the live ProgramConfig collection
//     (GET /api/programs), the same values the Super Admin maintains.
//   * Notification toggles are browser-session preferences only - there is
//     no server-side settings storage yet.
//   * There are no editable "system settings" in the backend yet, so there
//     are no Save buttons and no invented values on this page.
interface Program { id: string; academicYear: string; semester: string; active: boolean }
`;
const settingsB = `
export default function CitySystemSettings() {
  const [tab, setTab] = useState<'general' | 'notifications' | 'access'>('general');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [notifications, setNotifications] = useState({ email: true, sms: false, portal: true, weekly: true, instant: true });

  useEffect(() => {
    let cancelled = false;
    api<{ programs: Program[] }>('/programs')
      .then((result) => { if (!cancelled) setPrograms(result.programs || []); })
      .catch(() => { /* the page still renders; values show as not configured */ });
    return () => { cancelled = true; };
  }, []);

  const activeProgram = programs.find((program) => program.active);

  return (
    <div>
      <PageHeader title="System Settings" subtitle="Read-only system information. No settings storage is wired to the backend yet." breadcrumb={['City Office', 'System Settings']} />

      <div className="flex gap-1 mb-6 bg-[#F6F7F9] rounded-xl p-1 w-fit">
        {(['general', 'notifications', 'access'] as const).map((tabKey) => (
          <button key={tabKey} onClick={() => setTab(tabKey)}
            className={'px-4 py-2 rounded-lg text-sm font-600 transition-all capitalize ' + (tab === tabKey ? 'bg-white shadow-sm text-[#0B1F3A]' : 'text-[#6B7280] hover:text-[#1F2937]')}
            style={{ fontWeight: 600 }}>
            {tabKey === 'access' ? 'Account & Access' : tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 space-y-4">
            <h3 className="text-[#1F2937]" style={{ fontWeight: 700 }}>Live Program Configuration</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-600 text-[#6B7280] mb-1" style={{ fontWeight: 600 }}>Current Academic Year</div>
                <div className="text-sm text-[#1F2937]">{activeProgram ? activeProgram.academicYear : 'Not configured - add a program in Super Admin > Program Config'}</div>
              </div>
              <div>
                <div className="text-xs font-600 text-[#6B7280] mb-1" style={{ fontWeight: 600 }}>Current Semester</div>
                <div className="text-sm text-[#1F2937]">{activeProgram ? activeProgram.semester : 'Not configured'}</div>
              </div>
              <div>
                <div className="text-xs font-600 text-[#6B7280] mb-1" style={{ fontWeight: 600 }}>Configured Programs</div>
                <div className="text-sm text-[#1F2937]">{programs.length ? programs.length + ' program' + (programs.length === 1 ? '' : 's') : 'None'}</div>
              </div>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
            This page is read-only for now: there is no settings storage in the backend yet. Office contact details and other editable system settings need a settings model before they can be changed here - no placeholder values are shown in the meantime.
          </div>
        </div>
      )}
`;
const settingsC = `
      {tab === 'notifications' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
            <h3 className="text-[#1F2937] mb-1" style={{ fontWeight: 700 }}>Notification Preferences</h3>
            <p className="text-xs text-[#6B7280] mb-4">Stored in this browser session only - server-side notification settings are not wired yet.</p>
            <div className="space-y-4">
              {Object.entries(notifications).map(([key, value]) => {
                const labels: Record<string, { title: string; desc: string }> = {
                  email: { title: 'Email Notifications', desc: 'Send notifications via email to scholars and officials' },
                  sms: { title: 'SMS Notifications', desc: 'Send SMS for urgent announcements and deadline reminders' },
                  portal: { title: 'In-Portal Notifications', desc: 'Show notifications inside the scholarship portal' },
                  weekly: { title: 'Weekly Digest', desc: 'Send weekly summary to administrators' },
                  instant: { title: 'Instant Notifications', desc: 'Real-time push notifications for status changes' },
                };
                return (
                  <div key={key} className="flex items-center justify-between py-3 border-b border-[#E5E7EB] last:border-0">
                    <div>
                      <div className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{labels[key]?.title}</div>
                      <div className="text-xs text-[#6B7280]">{labels[key]?.desc}</div>
                    </div>
                    <button
                      onClick={() => setNotifications((previous) => ({ ...previous, [key]: !value }))}
                      className={'w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ' + (value ? 'bg-[#0B1F3A]' : 'bg-[#E5E7EB]')}
                    >
                      <span className={'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ' + (value ? 'left-5' : 'left-0.5')} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'access' && (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 space-y-4">
          <h3 className="text-[#1F2937]" style={{ fontWeight: 700 }}>Account & Access - how it works today</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-[#6B7280]">Sign-in verification</span>
              <span className="text-[#1F2937] text-right">Every sign-in is confirmed with an emailed one-time code</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[#6B7280]">Password policy</span>
              <span className="text-[#1F2937] text-right">Enforced by the server password validation rules</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[#6B7280]">Account provisioning</span>
              <span className="text-[#1F2937] text-right">Students self-register; staff accounts are created by the Super Admin</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[#6B7280]">Portal access</span>
              <span className="text-[#1F2937] text-right">Determined by role - student, barangay, city and super admin portals are locked per account</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
`;

write('client/src/Pages/city/CitySystemSettings.tsx', settingsA + settingsB + settingsC);

console.log('PART 2 CITY FILES WRITTEN');











