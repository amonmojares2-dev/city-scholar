import { useCallback, useEffect, useState } from "react";
import Icon from "../../components/Icon";
import PageHeader from "../../components/PageHeader";
import EmptyState from "../../components/EmptyState";
import { api } from "../../lib/api";

// Mirrors superAdminController.listAuditLogs
interface AuditEntry {
  id: string;
  timestamp: string;
  date: string;
  time: string;
  user: string;
  email: string;
  role: string;
  dbRole: string;
  actionType: string;
  description: string;
  targetType: string;
  ip: string;
}

interface AuditResponse {
  success: boolean;
  logs: AuditEntry[];
  actionTypes: string[];
}

// Values are DB roles — the server filter expects actorRole values.
const ROLE_FILTERS = [
  { value: "all", label: "All Roles" },
  { value: "superadmin", label: "Super Admin" },
  { value: "city", label: "City Office" },
  { value: "barangay_staff", label: "Barangay" },
  { value: "student", label: "Student" },
];

const ACTION_BADGE: Record<string, string> = {
  Login: "bg-blue-50 text-blue-700",
  Logout: "bg-gray-100 text-gray-600",
  Create: "bg-green-50 text-green-700",
  Update: "bg-amber-50 text-amber-700",
  Delete: "bg-red-50 text-red-700",
  "Config Change": "bg-purple-50 text-purple-700",
  "Account Review": "bg-sky-50 text-sky-700",
  Export: "bg-emerald-50 text-emerald-700",
};

const ROLE_BADGE: Record<string, string> = {
  superadmin: "bg-[#0B1F3A] text-[#D4A72C]",
  city: "bg-indigo-50 text-indigo-700",
  barangay: "bg-teal-50 text-teal-700",
  student: "bg-orange-50 text-orange-700",
};

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  city: "City Office",
  barangay: "Barangay",
  student: "Student",
  system: "System",
};

function badge(map: Record<string, string>, key: string) {
  return map[key] || "bg-gray-100 text-gray-600";
}
export default function SuperAdminAuditLog() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [actionTypes, setActionTypes] = useState<string[]>([]);
  const [actionFilter, setActionFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Debounce the search box so typing does not spam the API.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (actionFilter !== "all") params.set("actionType", actionFilter);
      if (roleFilter !== "all") params.set("role", roleFilter);
      if (search) params.set("search", search);
      const data = await api<AuditResponse>(`/super-admin/audit?${params.toString()}`);
      setLogs(data.logs || []);
      setActionTypes(data.actionTypes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the audit trail.");
    } finally {
      setLoading(false);
    }
  }, [actionFilter, roleFilter, search, loading]);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toDateString();
  const todaysCount = logs.filter((l) => new Date(l.timestamp).toDateString() === today).length;
  const activeActors = new Set(logs.map((l) => l.email || l.user)).size;

  const stats = [
    { label: "Entries Shown", value: logs.length.toLocaleString(), icon: "lock" },
    { label: "Action Types", value: actionTypes.length.toLocaleString(), icon: "grid" },
    { label: "Today's Activity", value: todaysCount.toLocaleString(), icon: "calendar" },
    { label: "Actors In View", value: activeActors.toLocaleString(), icon: "users" },
  ];

  return (
    <div className="p-6 min-h-screen" style={{ background: "#F6F7F9" }}>
      <PageHeader
        title="Audit Log"
        subtitle="Every login, approval, rejection and configuration change recorded by the system."
        breadcrumb={["Super Admin", "Audit Log"]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-[#E5E7EB] p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[#163A63]"><Icon name={stat.icon} size={14} /></span>
              <p className="text-xs text-[#6B7280]">{stat.label}</p>
            </div>
            <p className="text-2xl font-bold" style={{ color: "#0B1F3A" }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl mb-6 border" style={{ background: "#fff", borderColor: "#E5E7EB" }}>
        <div className="flex items-center gap-2">
          <label className="text-sm text-[#374151]" style={{ fontWeight: 500 }}>Action:</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm bg-white"
          >
            <option value="all">All Actions</option>
            {actionTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-[#374151]" style={{ fontWeight: 500 }}>Role:</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm bg-white"
          >
            {ROLE_FILTERS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
          </select>
        </div>
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]">
            <Icon name="search" size={15} />
          </span>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search user, email or description…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#E5E7EB] text-sm outline-none focus:ring-2 focus:ring-[#163A63]/20"
          />
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm text-[#163A63] hover:bg-gray-50 transition-colors"
        >
          <Icon name="refresh" size={14} />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
        {loading ? (
          <div className="py-14 flex flex-col items-center gap-2 text-[#6B7280]">
            <Icon name="refresh" size={20} className="animate-spin" />
            <span className="text-sm">Loading audit trail…</span>
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon="lock"
            title="No audit entries found"
            description="System activity such as logins, approvals and configuration changes will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "#F6F7F9" }}>
                  <th className="text-left px-5 py-3 font-semibold text-[#374151]">Timestamp</th>
                  <th className="text-left px-5 py-3 font-semibold text-[#374151]">User</th>
                  <th className="text-left px-5 py-3 font-semibold text-[#374151]">Role</th>
                  <th className="text-left px-5 py-3 font-semibold text-[#374151]">Action</th>
                  <th className="text-left px-5 py-3 font-semibold text-[#374151]">Description</th>
                  <th className="text-left px-5 py-3 font-semibold text-[#374151]">IP Address</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry, idx) => (
                  <tr key={entry.id} className={idx % 2 === 0 ? "bg-white" : "bg-[#FAFAFA]"}>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <p className="font-medium text-[#0B1F3A]">{entry.date}</p>
                      <p className="text-xs text-[#6B7280]">{entry.time}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-[#1F2937]">{entry.user}</p>
                      {entry.email && <p className="text-xs text-[#6B7280]">{entry.email}</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${badge(ROLE_BADGE, entry.role)}`}>
                        {ROLE_LABEL[entry.role] || entry.role || "System"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${badge(ACTION_BADGE, entry.actionType)}`}>
                        {entry.actionType}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[#374151] max-w-md">{entry.description}</td>
                    <td className="px-5 py-3.5 text-[#6B7280] font-mono text-xs">{entry.ip || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

