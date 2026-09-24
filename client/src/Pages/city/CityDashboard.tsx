import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import Icon from '../../components/Icon';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import { api } from '../../lib/api';

// ==========================================
// Types
//
// Optional fields are marked `?` because different pieces of the
// dashboard degrade gracefully if the backend doesn't send them yet —
// see the notes above each derived section below.
// ==========================================
type Application = {
  _id: string;
  student?: { name: string };
  school: string;
  status: string;
  createdAt: string;
};

type Document = { _id: string; status: string };

type Scholar = {
  _id: string;
  name?: string;
  school?: string;
  barangay?: { _id: string; name: string } | string | null;
};

type AuditEntry = {
  _id: string;
  description: string;
  actionType: string;
  createdAt: string;
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BARANGAY_COLORS = ['#0B1F3A', '#163A63', '#D4A72C', '#22A06B', '#2563EB', '#DC2626', '#6B7280'];

const date = (value: string) =>
  new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const daysAgo = (value: string) => Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);

const barangayName = (b: Scholar['barangay']) =>
  typeof b === 'string' ? b : b?.name || 'Unspecified barangay';

const initials = (name: string) =>
  name.split(' ').map(word => word[0]).join('').slice(0, 3).toUpperCase();

export default function CityDashboard() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [scholars, setScholars] = useState<Scholar[]>([]);
  const [activity, setActivity] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api<{ applications: Application[] }>('/applications'),
      api<{ documents: Document[] }>('/documents'),
      // Scholars: fetched as a full list so this page can group by
      // barangay and school. If your /scholars endpoint currently only
      // returns { count }, switch it to also return { scholars: [...] }.
      api<{ scholars: Scholar[] }>('/scholars'),
    ])
      .then(([applicationResult, documentResult, scholarResult]) => {
        setApplications(applicationResult.applications);
        setDocuments(documentResult.documents);
        setScholars(scholarResult.scholars || []);
      })
      .catch(requestError =>
        setError(requestError instanceof Error ? requestError.message : 'Unable to load city data.')
      )
      .finally(() => setLoading(false));

    // Recent Activity is optional: if there's no city-scoped audit
    // endpoint yet, the feed just stays empty instead of showing fake
    // entries. Swap the path below once that route exists.
    api<{ logs: AuditEntry[] }>('/audit?scope=city&limit=6')
      .then(result => setActivity(result.logs || []))
      .catch(() => setActivity([]));
  }, []);

  const approved = applications.filter(a => a.status === 'approved').length;
  const pending = applications.filter(a => ['submitted', 'under_review'].includes(a.status)).length;

  // ---- Applications vs Approvals, last 6 months ----
  const monthlyData = useMemo(() => {
    const now = new Date();
    const buckets: { month: string; applications: number; approved: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ month: MONTH_LABELS[d.getMonth()], applications: 0, approved: 0 });
    }
    applications.forEach(a => {
      const created = new Date(a.createdAt);
      const monthsBack =
        (now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth());
      if (monthsBack < 0 || monthsBack > 5) return;
      const bucket = buckets[5 - monthsBack];
      bucket.applications += 1;
      if (a.status === 'approved') bucket.approved += 1;
    });
    return buckets;
  }, [applications]);

  // ---- Scholars by barangay ----
  const pieData = useMemo(() => {
    const counts = new Map<string, number>();
    scholars.forEach(s => {
      const name = barangayName(s.barangay);
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 4);
    const rest = sorted.slice(4).reduce((sum, [, count]) => sum + count, 0);
    const entries = rest > 0 ? [...top, ['All others', rest] as const] : top;
    return entries.map(([name, value], i) => ({
      name,
      value,
      color: BARANGAY_COLORS[i % BARANGAY_COLORS.length],
    }));
  }, [scholars]);

  // ---- Scholars by university ----
  const schoolData = useMemo(() => {
    const counts = new Map<string, number>();
    scholars.forEach(s => {
      const name = s.school || 'Unspecified school';
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    const total = scholars.length || 1;
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([school, count]) => ({ school, count, pct: Math.round((count / total) * 100) }));
  }, [scholars]);

  // ---- Requires attention: pending applications, oldest first ----
  const attentionItems = useMemo(() => {
    return applications
      .filter(a => ['submitted', 'under_review'].includes(a.status))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(0, 5)
      .map(a => {
        const age = daysAgo(a.createdAt);
        const urgency = age >= 14 ? 'high' : age >= 7 ? 'medium' : 'low';
        return {
          id: a._id,
          applicant: a.student?.name || 'Unknown student',
          school: a.school,
          issue:
            a.status === 'submitted'
              ? `Submitted ${age} day${age === 1 ? '' : 's'} ago, not yet reviewed`
              : `Under review for ${age} day${age === 1 ? '' : 's'}`,
          urgency,
          status: a.status,
        };
      });
  }, [applications]);

  if (loading) {
    return <div className="py-16 text-center text-sm text-[#6B7280]">Loading city scholarship data...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-700 text-[#1F2937]" style={{ fontWeight: 700 }}>City Scholarship Office Dashboard</h1>
        <p className="text-sm text-[#6B7280]">Live overview based on student-submitted applications, documents, and verified scholars.</p>
      </div>

      {error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total Applications" value={String(applications.length)} icon="clipboard" change="From student submissions" changeType="neutral" accent />
        <StatCard label="Approved" value={String(approved)} icon="check-circle" change={applications.length ? `${Math.round((approved / applications.length) * 100)}% of applications` : 'No records'} changeType="neutral" />
        <StatCard label="Pending Review" value={String(pending)} icon="eye" change="Submitted or under review" changeType="neutral" />
        <StatCard label="Active Scholars" value={String(scholars.length)} icon="users" change="Verified by this office" changeType="neutral" />
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        {/* Monthly Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E5E7EB] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>Applications vs Approvals</h2>
            <span className="text-xs text-[#6B7280]">Last 6 months</span>
          </div>
          {applications.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#6B7280]">No application data yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthlyData} barGap={4}>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }} />
                <Bar dataKey="applications" fill="#163A63" radius={[4, 4, 0, 0]} name="Applications" />
                <Bar dataKey="approved" fill="#D4A72C" radius={[4, 4, 0, 0]} name="Approved" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Distribution */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
          <h2 className="font-600 text-sm text-[#1F2937] mb-4" style={{ fontWeight: 600 }}>Scholars by Barangay</h2>
          {scholars.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#6B7280]">No verified scholars yet.</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" stroke="none">
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-3">
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                      <span className="text-[#6B7280] truncate max-w-[140px]">{d.name}</span>
                    </div>
                    <span className="font-600 text-[#1F2937]" style={{ fontWeight: 600 }}>{d.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Scholars by School */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden mb-5">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <h2 className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>Scholars by University</h2>
          <span className="text-xs text-[#6B7280]">{scholars.length.toLocaleString()} total</span>
        </div>
        {schoolData.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#6B7280]">No verified scholars yet.</div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {schoolData.map(s => (
              <div key={s.school} className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-8 h-8 rounded-xl bg-[#F6F7F9] flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-800 text-[#163A63]" style={{ fontWeight: 800 }}>{initials(s.school)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-500 text-[#1F2937] truncate" style={{ fontWeight: 500 }}>{s.school}</span>
                    <span className="text-sm font-700 text-[#1F2937] ml-4 flex-shrink-0" style={{ fontWeight: 700 }}>{s.count.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 bg-[#F6F7F9] rounded-full overflow-hidden">
                    <div className="h-full bg-[#163A63] rounded-full" style={{ width: `${s.pct}%` }} />
                  </div>
                </div>
                <span className="text-xs text-[#6B7280] w-8 text-right flex-shrink-0">{s.pct}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Attention Required */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
            <div className="flex items-center gap-2">
              {attentionItems.length > 0 && <span className="w-2 h-2 bg-[#DC2626] rounded-full animate-pulse" />}
              <h2 className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>Requires Attention</h2>
            </div>
            <Link to="/city/applications" className="text-xs font-600 text-[#163A63]" style={{ fontWeight: 600 }}>View all</Link>
          </div>
          {attentionItems.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#6B7280]">Nothing pending right now.</div>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {attentionItems.map(item => (
                <Link key={item.id} to={`/city/applications/${item.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#F6F7F9] transition-colors">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    item.urgency === 'high' ? 'bg-[#DC2626]' : item.urgency === 'medium' ? 'bg-[#D97706]' : 'bg-[#6B7280]'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{item.applicant}</div>
                    <div className="text-xs text-[#6B7280]">{item.issue} · {item.school}</div>
                  </div>
                  <StatusBadge status={item.status.replace('_', '-')} size="sm" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <h2 className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>Recent Activity</h2>
          </div>
          {activity.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#6B7280]">No recent activity logged.</div>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {activity.map(entry => (
                <div key={entry._id} className="flex items-start gap-4 px-5 py-3.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Icon name="activity" size={14} className="text-[#2563EB]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#1F2937]">{entry.description}</p>
                    <p className="text-xs text-[#9CA3AF] mt-0.5">{date(entry.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}