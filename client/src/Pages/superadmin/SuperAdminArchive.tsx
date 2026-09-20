import { useCallback, useEffect, useState } from "react";
import Icon from "../../components/Icon";
import PageHeader from "../../components/PageHeader";
import EmptyState from "../../components/EmptyState";
import { api } from "../../lib/api";

// Mirrors superAdminController.listArchive
interface ArchiveRecord {
  id: string;
  type: "application" | "user" | "document";
  title: string;
  subtitle: string;
  detail: string;
  status: string;
  archivedAt: string;
  archivedDate: string;
}

interface ArchiveResponse {
  success: boolean;
  records: ArchiveRecord[];
  counts: { all: number; application: number; user: number; document: number };
}

const TYPE_TABS = [
  { value: "all", label: "All Records" },
  { value: "application", label: "Applications" },
  { value: "user", label: "User Accounts" },
  { value: "document", label: "Documents" },
];

const TYPE_BADGE: Record<string, string> = {
  application: "bg-blue-50 text-blue-700",
  user: "bg-purple-50 text-purple-700",
  document: "bg-amber-50 text-amber-700",
};

const TYPE_LABEL: Record<string, string> = {
  application: "Application",
  user: "User Account",
  document: "Document",
};

const STATUS_BADGE: Record<string, string> = {
  rejected: "bg-red-50 text-red-700",
  suspended: "bg-amber-50 text-amber-700",
  deactivated: "bg-gray-100 text-gray-600",
  archived: "bg-gray-100 text-gray-600",
};

const TYPE_ICON: Record<string, string> = {
  application: "clipboard",
  user: "user",
  document: "file-text",
};

function badge(map: Record<string, string>, key: string) {
  return map[key] || "bg-gray-100 text-gray-600";
}

export default function SuperAdminArchive() {
  const [records, setRecords] = useState<ArchiveRecord[]>([]);
  const [counts, setCounts] = useState<ArchiveResponse["counts"]>({ all: 0, application: 0, user: 0, document: 0 });
  const [type, setType] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      params.set("type", type);
      if (search) params.set("search", search);
      const data = await api<ArchiveResponse>(`/super-admin/archive?${params.toString()}`);
      setRecords(data.records || []);
      setCounts(data.counts || { all: 0, application: 0, user: 0, document: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load archived records.");
    } finally {
      setLoading(false);
    }
  }, [type, search, loading]);

  useEffect(() => { load(); }, [load]);

  const countCards = [
    { label: "All Archived", value: counts.all, icon: "lock" },
    { label: "Applications", value: counts.application, icon: "clipboard" },
    { label: "User Accounts", value: counts.user, icon: "user" },
    { label: "Documents", value: counts.document, icon: "file-text" },
  ];

  return (
    <div className="p-6 min-h-screen" style={{ background: "#F6F7F9" }}>
      <PageHeader
        title="Archive"
        subtitle="Rejected applications, deactivated accounts and removed documents — kept out of the live queues but never lost."
        breadcrumb={["Super Admin", "Archive"]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {countCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-[#E5E7EB] p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[#163A63]"><Icon name={card.icon} size={14} /></span>
              <p className="text-xs text-[#6B7280]">{card.label}</p>
            </div>
            <p className="text-2xl font-bold" style={{ color: "#0B1F3A" }}>{card.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      {/* Type tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setType(tab.value)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={type === tab.value
              ? { background: "#163A63", color: "#fff" }
              : { background: "#fff", color: "#374151", border: "1px solid #E5E7EB" }}
          >
            {tab.label}
            <span className="ml-1.5 opacity-70">
              ({(counts as Record<string, number>)[tab.value] ?? 0})
            </span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
        {loading ? (
          <div className="py-14 flex flex-col items-center gap-2 text-[#6B7280]">
            <Icon name="refresh" size={20} className="animate-spin" />
            <span className="text-sm">Loading archived records…</span>
          </div>
        ) : records.length === 0 ? (
          <EmptyState
            icon="lock"
            title="Nothing archived here yet"
            description="Rejected applications, suspended or deactivated accounts and rejected documents will appear here automatically."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#F6F7F9" }}>
                <th className="text-left px-5 py-3 font-semibold text-[#374151]">Record</th>
                <th className="text-left px-5 py-3 font-semibold text-[#374151]">Type</th>
                <th className="text-left px-5 py-3 font-semibold text-[#374151]">Detail</th>
                <th className="text-left px-5 py-3 font-semibold text-[#374151]">Status</th>
                <th className="text-left px-5 py-3 font-semibold text-[#374151]">Archived</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record, idx) => (
                <tr key={`${record.type}-${record.id}`} className={idx % 2 === 0 ? "bg-white" : "bg-[#FAFAFA]"}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#F0F4FA", color: "#163A63" }}>
                        <Icon name={TYPE_ICON[record.type] || "file-text"} size={14} />
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-[#1F2937] truncate">{record.title}</p>
                        <p className="text-xs text-[#6B7280] truncate">{record.subtitle}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${badge(TYPE_BADGE, record.type)}`}>
                      {TYPE_LABEL[record.type] || record.type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[#6B7280] max-w-xs truncate">{record.detail}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${badge(STATUS_BADGE, record.status)}`}>
                      {record.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[#6B7280] whitespace-nowrap">{record.archivedDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
