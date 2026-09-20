import { useCallback, useEffect, useState } from "react";
import Icon from "../../components/Icon";
import PageHeader from "../../components/PageHeader";
import EmptyState from "../../components/EmptyState";
import { api } from "../../lib/api";

// ─── Types (match server superAdminController.getReports / exportReport) ──────

interface ReportsSummary {
  totalApplications: number;
  pendingApplications: number;
  approvedApplications: number;
  rejectedApplications: number;
  totalDocuments: number;
  verifiedDocuments: number;
  pendingDocuments: number;
  totalBarangays: number;
  totalSchools: number;
  grantAmount: number;
  academicYear: string;
  semester: string;
  disbursedTotal: number;
}

interface RecentExport {
  id: string;
  reportName: string;
  generatedBy: string;
  date: string;
  format: string;
}

interface ReportsResponse {
  success: boolean;
  summary: ReportsSummary;
  recentExports: RecentExport[];
}

interface ReportData {
  id: string;
  title: string;
  format: string;
  generatedAt: string;
  columns: string[];
  rows: (string | number)[][];
  rowCount: number;
}

interface ExportReportResponse {
  success: boolean;
  report: ReportData;
}

interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: string;
}

// The report catalog mirrors the server's REPORT_DEFINITIONS — every number
// shown on this page (summary strip + report contents) comes from the database.
const REPORT_CARDS: ReportCard[] = [
  { id: "scholar-master", title: "Scholar Master List", description: "Full list of all active scholars with details", icon: "users" },
  { id: "applicant-summary", title: "Applicant Summary", description: "All applications by status for the selected period", icon: "clipboard" },
  { id: "renewal-report", title: "Renewal Report", description: "Scholars who submitted/missed renewal per semester", icon: "refresh" },
  { id: "disbursement-report", title: "Disbursement Report", description: "Grant amounts disbursed per scholar per semester", icon: "bar-chart-2" },
  { id: "document-compliance", title: "Document Compliance", description: "Document submission status across all scholars", icon: "file-text" },
  { id: "barangay-breakdown", title: "Barangay Breakdown", description: "Scholar count and status breakdown per barangay", icon: "map-pin" },
  { id: "school-enrollment", title: "School Enrollment", description: "Scholars enrolled per accredited school", icon: "book" },
  { id: "audit-trail", title: "Audit Trail Export", description: "Full system audit log for the selected period", icon: "lock" },
];

const TITLE_TO_ID: Record<string, string> = Object.fromEntries(REPORT_CARDS.map((card) => [card.title, card.id]));

const FORMAT_BADGE: Record<string, string> = {
  PDF: "bg-red-100 text-red-700",
  CSV: "bg-green-100 text-green-700",
};

// ─── Download helpers (report data arrives inline from the API) ───────────────

function downloadCsv(report: ReportData) {
  const escape = (value: string | number) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [report.columns.map(escape).join(","), ...report.rows.map((row) => row.map(escape).join(","))].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${report.title.replace(/\s+/g, "-").toLowerCase()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function printReport(report: ReportData) {
  const escapeHtml = (value: string | number) =>
    String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const head = report.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const body = report.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  const win = window.open("", "_blank", "width=900,height=650");
  if (!win) {
    alert("Please allow pop-ups to export the PDF report.");
    return;
  }
  win.document.write(`<!doctype html><html><head><title>${escapeHtml(report.title)}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #0B1F3A; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      p.meta { color: #6B7280; font-size: 12px; margin: 0 0 16px; }
      table { border-collapse: collapse; width: 100%; font-size: 12px; }
      th { background: #F0F4FA; text-align: left; padding: 8px; border: 1px solid #E5E7EB; }
      td { padding: 8px; border: 1px solid #E5E7EB; }
      tr:nth-child(even) td { background: #FAFAFA; }
    </style></head><body>
    <h1>${escapeHtml(report.title)}</h1>
    <p class="meta">Generated ${new Date(report.generatedAt).toLocaleString()} &middot; ${report.rowCount} rows</p>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

function CardGenerateButton({ card, format, onExported }: { card: ReportCard; format: string; onExported: () => void }) {
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const data = await api<ExportReportResponse>(`/super-admin/reports/${card.id}/export`, {
        method: "POST",
        body: JSON.stringify({ format }),
      });
      if (data.report.format === "CSV") downloadCsv(data.report);
      else printReport(data.report);
      onExported();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unable to generate the report.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={generate}
      disabled={loading}
      className="mt-auto w-full text-sm font-medium py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
      style={{ background: "#163A63", color: "#fff" }}
    >
      {loading ? (
        <>
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Generating…</span>
        </>
      ) : (
        <>
          <Icon name="file-bar-chart" size={14} />
          <span>Generate</span>
        </>
      )}
    </button>
  );
}

export default function SuperAdminReports() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [exports, setExports] = useState<RecentExport[]>([]);
  const [format, setFormat] = useState("PDF");
  const [exportingId, setExportingId] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api<ReportsResponse>("/super-admin/reports");
      setSummary(data.summary);
      setExports(data.recentExports || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load report data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Re-run a report from the export history and deliver it immediately.
  async function reExport(row: RecentExport) {
    const reportId = TITLE_TO_ID[row.reportName];
    if (!reportId) {
      alert("This report is no longer available.");
      return;
    }
    setExportingId(row.id);
    try {
      const data = await api<ExportReportResponse>(`/super-admin/reports/${reportId}/export`, {
        method: "POST",
        body: JSON.stringify({ format: row.format }),
      });
      if (data.report.format === "CSV") downloadCsv(data.report);
      else printReport(data.report);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unable to generate the report.");
    } finally {
      setExportingId("");
    }
  }

  const summaryCards = summary
    ? [
        { label: "Approved Applications", value: summary.approvedApplications.toLocaleString(), icon: "clipboard" },
        { label: "Total Applications", value: summary.totalApplications.toLocaleString(), icon: "clipboard" },
        { label: "Pending Review", value: summary.pendingApplications.toLocaleString(), icon: "help-circle" },
        { label: "Rejected", value: summary.rejectedApplications.toLocaleString(), icon: "alert-circle" },
        { label: "Documents Verified", value: `${summary.verifiedDocuments.toLocaleString()} / ${summary.totalDocuments.toLocaleString()}`, icon: "file-text" },
        { label: "Active Barangays", value: summary.totalBarangays.toLocaleString(), icon: "map-pin" },
        { label: "Accredited Schools", value: summary.totalSchools.toLocaleString(), icon: "book" },
        {
          label: "Disbursed Total",
          value: `₱${summary.disbursedTotal.toLocaleString()}`,
          icon: "bar-chart-2",
          note: summary.academicYear ? `${summary.semester} · AY ${summary.academicYear}` : "",
        },
      ]
    : [];

  return (
    <div className="p-6 min-h-screen" style={{ background: "#F6F7F9" }}>
      <PageHeader
        title="Reports"
        subtitle="Generate and download scholarship program reports"
        breadcrumb={["Super Admin", "Reports"]}
      />

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      {/* Live summary strip — every figure is counted from the database */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        {loading && summaryCards.length === 0
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-[#E5E7EB] p-4 animate-pulse">
                <div className="h-3 w-20 bg-gray-200 rounded mb-2" />
                <div className="h-6 w-14 bg-gray-200 rounded" />
              </div>
            ))
          : summaryCards.map((card) => (
              <div key={card.label} className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon name={card.icon} size={13} className="text-[#163A63]" />
                  <p className="text-xs text-[#6B7280]">{card.label}</p>
                </div>
                <p className="text-xl font-bold" style={{ color: "#0B1F3A" }}>{card.value}</p>
                {"note" in card && card.note && <p className="text-[11px] text-[#9CA3AF] mt-0.5">{card.note}</p>}
              </div>
            ))}
      </div>

      {/* Export format selector */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl mb-6 border" style={{ background: "#fff", borderColor: "#E5E7EB" }}>
        <div className="flex items-center gap-2">
          <label className="text-sm text-[#374151]" style={{ fontWeight: 500 }}>Export format:</label>
          <select value={format} onChange={(e) => setFormat(e.target.value)} className="px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm bg-white">
            <option value="PDF">PDF (print view)</option>
            <option value="CSV">CSV (spreadsheet)</option>
          </select>
        </div>
        <p className="text-xs text-[#9CA3AF] ml-auto">
          {format === "CSV"
            ? "CSV files download directly with all rows from the database."
            : "PDF opens a print-ready view — use your browser's \"Save as PDF\"."}
        </p>
      </div>

      {/* Report cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {REPORT_CARDS.map((card) => (
          <div key={card.id} className="rounded-xl border p-5 flex flex-col" style={{ background: "#fff", borderColor: "#E5E7EB" }}>
            <div className="flex items-center gap-2.5 mb-2.5">
              <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#F0F4FA", color: "#163A63" }}>
                <Icon name={card.icon} size={17} />
              </span>
              <div className="text-sm font-semibold" style={{ color: "#0B1F3A" }}>{card.title}</div>
            </div>
            <p className="text-xs text-[#6B7280] mb-4 leading-relaxed">{card.description}</p>
            <CardGenerateButton card={card} format={format} onExported={load} />
          </div>
        ))}
      </div>

      {/* Recent Exports — real audit-log records of every past export */}
      <div className="rounded-xl border overflow-hidden" style={{ background: "#fff", borderColor: "#E5E7EB" }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "#E5E7EB" }}>
          <div className="text-sm" style={{ fontWeight: 600, color: "#0B1F3A" }}>Recent Exports</div>
        </div>
        {loading ? (
          <div className="py-12 flex flex-col items-center gap-2 text-[#6B7280]">
            <Icon name="refresh" size={20} className="animate-spin" />
            <span className="text-sm">Loading export history…</span>
          </div>
        ) : exports.length === 0 ? (
          <EmptyState
            icon="file-bar-chart"
            title="No exports yet"
            description="Generate a report above and it will be recorded here with its details."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#F6F7F9" }}>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: "#6B7280" }}>Report</th>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: "#6B7280" }}>Generated By</th>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: "#6B7280" }}>Date</th>
                <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: "#6B7280" }}>Format</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {exports.map((row, i) => (
                <tr key={row.id} style={{ borderTop: i > 0 ? "1px solid #E5E7EB" : undefined }}>
                  <td className="px-5 py-3 font-medium" style={{ color: "#0B1F3A" }}>{row.reportName}</td>
                  <td className="px-5 py-3" style={{ color: "#374151" }}>{row.generatedBy}</td>
                  <td className="px-5 py-3" style={{ color: "#6B7280" }}>{row.date}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${FORMAT_BADGE[row.format] || "bg-gray-100 text-gray-600"}`}>
                      {row.format}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => reExport(row)}
                      disabled={exportingId === row.id}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-50"
                      style={{ borderColor: "#E5E7EB", color: "#163A63" }}
                    >
                      {exportingId === row.id ? (
                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <Icon name="download" size={12} />
                      )}
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}