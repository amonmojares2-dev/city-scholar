import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import Icon from '../../components/Icon';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import { api } from '../../lib/api';

// ── Types ───────────────────────────────────────────────────────────────────

interface DashboardStats {
  totalUsers: number;
  totalStudents: number;
  totalBarangayStaff: number;
  totalCityStaff: number;
  totalSuperAdmins: number;
  pendingAccounts: number;
  pendingCityStaff: number;
  pendingBarangayStaff: number;
  totalApplications: number;
  approvedApplications: number;
  pendingApplications: number;
  rejectedApplications: number;
  totalBarangays: number;
  totalSchools: number;
  totalAnnouncements: number;
  totalEvents: number;
  totalDocuments: number;
}

interface SchoolDatum {
  school: string;
  scholars: number;
}

interface TrendDatum {
  month: string;
  applications: number;
  approvals: number;
}

interface ActivityEntry {
  id: string;
  time: string;
  createdAt: string;
  user: string;
  action: string;
  type: string;
}

interface DashboardResponse {
  stats: DashboardStats;
  schoolData: SchoolDatum[];
  trendData: TrendDatum[];
  activityFeed: ActivityEntry[];
}

interface ProgramOption {
  programName: string;
  academicYear: string;
  semester: string;
  active: boolean;
}

interface ProgramResponse {
  programs: ProgramOption[];
  academicYears: string[];
  semesters: string[];
}

// Approved scholar from GET /api/scholars (User collection:
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

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function activityDotColor(actionType: string): string {
  const value = String(actionType || '').toLowerCase();
  if (value.includes('approv')) return 'bg-green-500';
  if (value.includes('reject') || value.includes('suspend')) return 'bg-red-500';
  if (value.includes('login') || value.includes('auth')) return 'bg-blue-500';
  if (value.includes('document') || value.includes('upload')) return 'bg-amber-500';
  if (value.includes('config') || value.includes('program')) return 'bg-purple-500';
  return 'bg-gray-400';
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function CustomBarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-[#1F2937] mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SuperAdminDashboard() {
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [academicYears, setAcademicYears] = useState<string[]>([]);
  const [semesters, setSemesters] = useState<string[]>([]);
  const [semester, setSemester] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [approvedScholars, setApprovedScholars] = useState<ApprovedScholar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadPrograms() {
      try {
        const response = await api<ProgramResponse>('/super-admin/program');
        if (cancelled) return;
        setPrograms(response.programs || []);
        setAcademicYears(response.academicYears || []);
        setSemesters(response.semesters || []);
        const active = (response.programs || []).find((program) => program.active);
        setSemester((current) => current || active?.semester || response.semesters?.[0] || '');
        setAcademicYear((current) => current || active?.academicYear || response.academicYears?.[0] || '');
      } catch {
        if (!cancelled) {
          setPrograms([]);
          setAcademicYears([]);
          setSemesters([]);
        }
      }
    }

    loadPrograms();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    async function loadDashboard() {
      try {
        const params = new URLSearchParams();
        if (academicYear) params.set('academicYear', academicYear);
        if (semester) params.set('semester', semester);
        const query = params.toString();
        const response = await api<DashboardResponse>(`/super-admin/dashboard${query ? `?${query}` : ''}`);
        if (!cancelled) setData(response);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load the dashboard.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();
    return () => { cancelled = true; };
  }, [academicYear, semester]);

  // Approved scholars come straight from the User collection
  // (existing_scholar + scholarVerificationStatus=approved), NOT from the
  // Application records the dashboard stats above are built on.
  useEffect(() => {
    let cancelled = false;
    api<{ scholars: ApprovedScholar[] }>('/scholars')
      .then((response) => { if (!cancelled) setApprovedScholars(response.scholars || []); })
      .catch(() => { if (!cancelled) setApprovedScholars([]); });
    return () => { cancelled = true; };
  }, []);

  const stats = data?.stats;
  const schoolData = useMemo(() => data?.schoolData || [], [data]);
  const trendData = useMemo(() => data?.trendData || [], [data]);
  const activityFeed = useMemo(() => data?.activityFeed || [], [data]);
  // Approved-scholar breakdown by barangay, computed client-side from the
  // verified User records (top 8 barangays).
  const scholarBarangayBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const scholar of approvedScholars) {
      const key = scholar.barangay || 'Unassigned';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [approvedScholars]);
  const maxScholarBarangayCount = useMemo(
    () => Math.max(1, ...scholarBarangayBreakdown.map((entry) => entry.count)),
    [scholarBarangayBreakdown],
  );

  return (
    <div className="min-h-screen bg-[#F6F7F9]">
      {/* ── Main Content ── */}
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ── Page Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-600 text-[#D4A72C] uppercase tracking-widest mb-1" style={{ fontWeight: 600 }}>Super Admin Portal</div>
            <h1 className="text-xl font-700 text-[#1F2937]" style={{ fontWeight: 700 }}>System Dashboard</h1>
            <p className="text-sm text-[#6B7280] mt-0.5">Dagupan City — Analytics &amp; Administration Overview</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-xl px-3 py-2">
              <Icon name="calendar" size={14} className="text-[#6B7280]" />
              <label className="text-[#6B7280] text-xs mr-1">Semester</label>
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="bg-transparent text-[#1F2937] text-xs font-600 focus:outline-none cursor-pointer"
                style={{ fontWeight: 600 }}
              >
                {semesters.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-xl px-3 py-2">
              <Icon name="sliders" size={14} className="text-[#6B7280]" />
              <label className="text-[#6B7280] text-xs mr-1">Academic Year</label>
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="bg-transparent text-[#1F2937] text-xs font-600 focus:outline-none cursor-pointer"
                style={{ fontWeight: 600 }}
              >
                {academicYears.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-700 text-xs font-600" style={{ fontWeight: 600 }}>
                {programs.length ? `${programs.length} program${programs.length === 1 ? '' : 's'}` : 'System Online'}
              </span>
            </div>
          </div>
        </div>

        {loading && (
          <div className="bg-white rounded-xl border border-[#E5E7EB] px-5 py-4 text-sm text-[#6B7280]">
            Loading dashboard data from the database…
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 rounded-xl border border-red-200 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Stat Tiles ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Scholars"
            value={approvedScholars.length.toLocaleString()}
            icon="award"
            change="Verified existing scholars"
            changeType="up"
            accent
          />
          <StatCard
            label="Active Applicants"
            value={(stats?.pendingApplications ?? 0).toLocaleString()}
            icon="users"
            change={`${(stats?.totalApplications ?? 0).toLocaleString()} total applications`}
            changeType="up"
          />
          <div className="rounded-xl border border-red-200 bg-white p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-red-50">
                <Icon name="clock" size={18} className="text-red-600" />
              </div>
              <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                Needs Action
              </span>
            </div>
            <div className="text-2xl font-bold text-[#1F2937] mb-1">{(stats?.pendingAccounts ?? 0).toLocaleString()}</div>
            <div className="text-sm text-[#6B7280]">Pending Staff Approvals</div>
          </div>
          <StatCard
            label="Registered Barangays"
            value={(stats?.totalBarangays ?? 0).toLocaleString()}
            icon="map-pin"
            change={`${(stats?.totalSchools ?? 0).toLocaleString()} partner schools`}
            changeType="neutral"
          />
        </div>

        {/* ── Pending Approvals Alert ── */}
        <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 bg-amber-50 border-b border-amber-100">
            <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Icon name="alert-triangle" size={17} className="text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1F2937]">
                {(stats?.pendingAccounts ?? 0).toLocaleString()} accounts awaiting approval
              </p>
              <p className="text-xs text-[#6B7280]">
                These accounts cannot access the system until approved
              </p>
            </div>
            <Link
              to="/superadmin/accounts"
              className="ml-auto flex-shrink-0 text-xs font-semibold text-[#163A63] hover:text-[#D4A72C] flex items-center gap-1 transition-colors"
            >
              View all <Icon name="arrow-right" size={12} className="inline" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#E5E7EB]">
            {/* City Office Staff */}
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#163A63]/10 flex items-center justify-center">
                  <Icon name="user" size={15} className="text-[#163A63]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">City Office Staff</p>
                  <p className="text-xs text-[#6B7280]">{(stats?.pendingCityStaff ?? 0).toLocaleString()} pending accounts</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold text-[#163A63]">{(stats?.pendingCityStaff ?? 0).toLocaleString()}</span>
                <Link
                  to="/superadmin/accounts"
                  className="text-xs bg-[#163A63] text-white px-3 py-1.5 rounded-lg font-medium hover:bg-[#0B1F3A] transition-colors"
                >
                  Review
                </Link>
              </div>
            </div>
            {/* Barangay Officials */}
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                  <Icon name="users" size={15} className="text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">Barangay Officials</p>
                  <p className="text-xs text-[#6B7280]">{(stats?.pendingBarangayStaff ?? 0).toLocaleString()} pending accounts</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold text-purple-600">{(stats?.pendingBarangayStaff ?? 0).toLocaleString()}</span>
                <Link
                  to="/superadmin/accounts"
                  className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-purple-700 transition-colors"
                >
                  Review
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── Charts Row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Scholars by School */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-[#1F2937]">Scholars by School</h2>
                <p className="text-xs text-[#6B7280] mt-0.5">Distribution across partner universities</p>
              </div>
              <Icon name="bar-chart-2" size={16} className="text-[#6B7280]" />
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={schoolData}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
              >
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  dataKey="school"
                  type="category"
                  width={150}
                  tick={{ fontSize: 11, fill: '#1F2937' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomBarTooltip />} />
                <Bar dataKey="scholars" fill="#163A63" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Application Trend */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-[#1F2937]">Application Trend</h2>
                <p className="text-xs text-[#6B7280] mt-0.5">Jan – Jun 2025</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-[#6B7280]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#2563EB] inline-block" />
                  Applications
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#22A06B] inline-block" />
                  Approvals
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={trendData}
                margin={{ top: 0, right: 4, left: -20, bottom: 0 }}
                barCategoryGap="30%"
                barGap={3}
              >
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomBarTooltip />} />
                <Bar dataKey="applications" name="Applications" fill="#2563EB" radius={[3, 3, 0, 0]} />
                <Bar dataKey="approvals" name="Approvals" fill="#22A06B" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Activity Feed + Barangay Breakdown ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* System Activity Feed */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-[#1F2937]">System Activity</h2>
                <p className="text-xs text-[#6B7280] mt-0.5">Recent audit log events</p>
              </div>
              <Link
                to="/superadmin/audit"
                className="text-xs text-[#163A63] hover:text-[#D4A72C] font-medium transition-colors flex items-center gap-1"
              >
                Full log <Icon name="arrow-right" size={11} className="inline" />
              </Link>
            </div>

            <ul className="space-y-3">
              {activityFeed.length === 0 && !loading && !error && (
                <li className="text-xs text-[#6B7280]">No recent activity recorded yet.</li>
              )}
              {activityFeed.map((event) => (
                <li key={event.id} className="flex items-start gap-3">
                  {/* Icon dot */}
                  <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full bg-[#F6F7F9] flex items-center justify-center">
                    <span className={`w-2 h-2 rounded-full ${activityDotColor(event.type)}`} />
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#1F2937] leading-snug truncate">
                      {event.action}
                    </p>
                    <p className="text-xs text-[#6B7280] mt-0.5 truncate">{event.user}</p>
                  </div>
                  {/* Time */}
                  <span className="text-xs text-[#9CA3AF] flex-shrink-0 mt-0.5 whitespace-nowrap">
                    {formatClock(event.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Approved Scholars (verified existing scholars, by barangay) */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-[#1F2937]">Approved Scholars</h2>
                <p className="text-xs text-[#6B7280] mt-0.5">Verified by the City Office · by barangay</p>
              </div>
              <Link
                to="/superadmin/scholars"
                className="text-xs text-[#163A63] hover:text-[#D4A72C] font-medium transition-colors flex items-center gap-1"
              >
                View all <Icon name="arrow-right" size={11} className="inline" />
              </Link>
            </div>

            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-3xl text-[#163A63]" style={{ fontWeight: 700 }}>
                {approvedScholars.length.toLocaleString()}
              </span>
              <span className="text-xs text-[#6B7280]">verified scholars</span>
            </div>

            <ul className="space-y-3">
              {scholarBarangayBreakdown.length === 0 && (
                <li className="text-xs text-[#6B7280]">No approved scholars yet.</li>
              )}
              {scholarBarangayBreakdown.map((b) => {
                const pct = Math.round((b.count / maxScholarBarangayCount) * 100);
                return (
                  <li key={b.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-[#1F2937]">{b.name}</span>
                      <span className="text-xs font-semibold text-[#163A63]">
                        {b.count.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-[#F6F7F9] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#163A63] transition-all duration-500"
                        style={{ width: pct + '%' }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
