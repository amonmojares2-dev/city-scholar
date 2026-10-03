import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Icon from '../../components/Icon';
import PageHeader from '../../components/PageHeader';
import GradeRecordPanel from '../../components/GradeRecordPanel';
import EmptyState from '../../components/EmptyState';
import { api, ApiError } from '../../lib/api';
import {
  AcademicRecord,
  PendingDocument,
  displayName,
  formatGwa,
  needsReview,
  passedStatus,
  verificationBadge,
} from '../../lib/academicRecords';

// Academic monitoring is computed from the verified scholars' real GWA
// values (User.profile.gwa) returned by GET /api/scholars. No scholars with
// GWA records means an honest empty state - never invented numbers.
//
// On top of that aggregate view, this page now lists the full academic
// records extracted by AI from uploaded grade documents
// (GET /api/academic-records). Those rows are explicitly unverified until a
// City reviewer confirms them, and are always badged as such.
interface ApprovedScholar {
  id: string;
  name: string;
  email: string;
  scholarId?: string;
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

type SortKey = 'name' | 'gwa' | 'school' | 'status' | 'recent';
type StatusFilter = 'all' | 'pending' | 'verified' | 'failed';

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
  const [records, setRecords] = useState<AcademicRecord[]>([]);
  const [pendingDocs, setPendingDocs] = useState<PendingDocument[]>([]);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [analyzingId, setAnalyzingId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recent');

  // Both lists are needed on this page: the aggregate chart needs /scholars,
  // the table needs the extracted records and the not-yet-analyzed documents.
  const loadRecords = useCallback(async () => {
    const [recordResult, pendingResult] = await Promise.all([
      api<{ records: AcademicRecord[]; aiConfigured: boolean }>('/academic-records'),
      api<{ documents: PendingDocument[]; aiConfigured: boolean }>('/academic-records/pending'),
    ]);
    setRecords(recordResult.records || []);
    setPendingDocs(pendingResult.documents || []);
    setAiConfigured(recordResult.aiConfigured !== false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ scholars: ApprovedScholar[] }>('/scholars'),
      loadRecords(),
    ])
      .then(([scholarResult]) => { if (!cancelled) setScholars(scholarResult.scholars || []); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load academic data.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadRecords]);

  // Manual "Analyze": this is the only place a paid provider call is made.
  // Nothing runs on upload — City decides when a document is worth paying for.
  const analyze = async (documentId: string) => {
    setAnalyzingId(documentId);
    setError('');
    setNotice('');
    try {
      const result = await api<{ record: AcademicRecord; message: string }>(
        `/documents/${documentId}/analyze`,
        { method: 'POST' },
      );
      setNotice(result.message);
      await loadRecords();
      // Open the fresh record so the reviewer sees exactly what was read.
      setSelectedId(result.record.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Analysis failed. Please try again.');
      // A failed run still writes a "needs manual review" row server-side,
      // so refresh to surface it rather than leaving City with a blank.
      try { await loadRecords(); } catch { /* keep the original error visible */ }
    } finally {
      setAnalyzingId('');
    }
  };

  // Merge a saved record back into the list so the table updates in place.
  const handleSaved = (updated: AcademicRecord) => {
    setRecords((current) => current.map((record) => (record.id === updated.id ? updated : record)));
  };

  const graded: GradedScholar[] = scholars
    .map((scholar) => ({ ...scholar, gwaValue: parseGwa(scholar.gwa) }))
    .filter((scholar): scholar is GradedScholar => scholar.gwaValue !== null);

  // --- Filtering and sorting for the extracted-records table ---
  const schoolOptions = useMemo(() => {
    const names = new Set<string>();
    for (const record of records) if (record.school) names.add(record.school);
    return Array.from(names).sort();
  }, [records]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = records.filter((record) => {
      const haystack = [displayName(record), record.school, record.gradeLevel, record.term]
        .join(' ')
        .toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (schoolFilter && record.school !== schoolFilter) return false;
      if (statusFilter === 'pending' && !needsReview(record)) return false;
      if (statusFilter === 'verified' && !record.verifiedByCity) return false;
      if (statusFilter === 'failed' && record.extractionStatus !== 'failed') return false;
      return true;
    });

    // GWA sorts low-to-high (1.00 is the best mark in the PH system), so
    // ascending order puts the strongest scholars first.
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortKey === 'name') return displayName(a).localeCompare(displayName(b));
      if (sortKey === 'school') return (a.school || '').localeCompare(b.school || '');
      if (sortKey === 'status') return passedStatus(a).localeCompare(passedStatus(b));
      if (sortKey === 'gwa') {
        // Records with no GWA sink to the bottom rather than sorting as 0.
        if (a.computedGwa === null && b.computedGwa === null) return 0;
        if (a.computedGwa === null) return 1;
        if (b.computedGwa === null) return -1;
        return a.computedGwa - b.computedGwa;
      }
      return new Date(b.extractedAt || 0).getTime() - new Date(a.extractedAt || 0).getTime();
    });
    return sorted;
  }, [records, search, schoolFilter, statusFilter, sortKey]);

  const pendingReview = records.filter(needsReview).length;
  const verifiedCount = records.filter((record) => record.verifiedByCity).length;
  const failedCount = records.filter((record) => record.extractionStatus === 'failed').length;
  const notAnalyzed = pendingDocs.filter((doc) => !doc.hasRecord).length;

  // Only offer "Analyze" for documents that have never been run, plus any
  // failed/needs-review row so City can retry a blurry scan.
  const analyzable = pendingDocs.filter((doc) => !doc.hasRecord || doc.extractionStatus !== 'extracted');

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

  const selectedRecord = records.find((record) => record.id === selectedId) || null;

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading academic data...</div>;

  const selectCls = 'px-3 py-2 rounded-xl border border-[#E5E7EB] text-sm bg-white text-[#1F2937]';

  return (
    <div>
      <PageHeader
        title="Academic Monitoring"
        subtitle="GWA distribution of City Office-verified scholars, plus AI-extracted grade records awaiting review"
        breadcrumb={['City Office', 'Academic Monitoring']}
      />
      {error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}
      {notice && <div className="mb-4 bg-green-50 rounded-xl p-4 text-sm text-green-700">{notice}</div>}

      {!aiConfigured && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <strong style={{ fontWeight: 600 }}>AI extraction is not configured. </strong>
          Set the <code className="px-1 bg-amber-100 rounded">OPENAI_API_KEY</code> environment variable on the
          server to enable the Analyze action. Everything else on this page still works.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Average GWA', value: average === null ? '—' : average, color: 'text-[#22A06B]' },
          { label: 'Exceptional (≤1.50)', value: String(exceptional), color: 'text-[#22A06B]' },
          { label: 'At Risk (>2.25)', value: String(atRisk.length), color: 'text-[#D97706]' },
          { label: 'Above 2.50', value: String(belowThreshold.length), color: 'text-[#DC2626]' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-center">
            <div className="text-2xl text-[#1F2937]" style={{ fontWeight: 800 }}>{stat.value}</div>
            <div className="text-xs text-[#6B7280] mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* ---- Grade documents awaiting analysis ---- */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] mb-5 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <div>
            <h3 className="text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>Grade documents ready to analyze</h3>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Analyzing sends the file to the AI provider and costs a small fee per document, so it only runs when you click Analyze.
            </p>
          </div>
          <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-full shrink-0" style={{ fontWeight: 600 }}>
            {notAnalyzed} not analyzed
          </span>
        </div>

        {analyzable.length === 0 ? (
          <p className="p-8 text-center text-sm text-[#6B7280]">
            No grade documents are waiting to be analyzed.
          </p>
        ) : (
          <div className="divide-y divide-[#E5E7EB] max-h-96 overflow-y-auto">
            {analyzable.map((doc) => (
              <div key={doc.documentId} className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#F6F7F9] flex items-center justify-center flex-shrink-0">
                  <Icon name="file-text" size={16} className="text-[#163A63]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#1F2937] truncate" style={{ fontWeight: 600 }}>
                    {doc.studentName || doc.studentEmail || 'Unknown student'}
                  </div>
                  <div className="text-xs text-[#6B7280] truncate">
                    {doc.documentType} · {doc.documentName}
                    {doc.context === 'renewal' ? ' · Renewal' : ''}
                    {doc.hasRecord ? ' · previously analyzed' : ''}
                  </div>
                </div>
                <button
                  onClick={() => analyze(doc.documentId)}
                  disabled={!aiConfigured || analyzingId === doc.documentId}
                  className="px-3 py-2 rounded-lg bg-[#163A63] text-white text-xs hover:bg-[#0B1F3A] disabled:opacity-50 shrink-0"
                  style={{ fontWeight: 600 }}
                  title={!aiConfigured ? 'AI extraction is not configured on the server.' : 'Read this document with AI'}
                >
                  {analyzingId === doc.documentId ? 'Analyzing…' : doc.hasRecord ? 'Re-analyze' : 'Analyze'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Extracted academic records table ---- */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>Extracted Academic Records</h3>
            <p className="text-xs text-[#6B7280] mt-0.5">
              {records.length} record{records.length === 1 ? '' : 's'} · {pendingReview} awaiting review · {verifiedCount} verified
              {failedCount > 0 ? ` · ${failedCount} failed` : ''}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 bg-[#F9FAFB] border-b border-[#E5E7EB] flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Icon name="search" size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-[#E5E7EB] text-sm bg-white"
              placeholder="Search by student, school, or term..."
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className={selectCls} aria-label="Filter by review status">
            <option value="all">All statuses</option>
            <option value="pending">Pending review</option>
            <option value="verified">Verified</option>
            <option value="failed">Extraction failed</option>
          </select>
          <select value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)} className={selectCls} aria-label="Filter by school">
            <option value="">All schools</option>
            {schoolOptions.map((school) => <option key={school} value={school}>{school}</option>)}
          </select>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className={selectCls} aria-label="Sort records">
            <option value="recent">Newest first</option>
            <option value="name">Name (A–Z)</option>
            <option value="gwa">GWA (best first)</option>
            <option value="school">School (A–Z)</option>
            <option value="status">Pass/Fail</option>
          </select>
        </div>

        {filteredRecords.length === 0 ? (
          <EmptyState
            icon="file-bar-chart"
            title={records.length === 0 ? 'No academic records yet' : 'No records match these filters'}
            description={records.length === 0
              ? 'Analyze a grade document above to extract a student\'s full subject record. Extracted data appears here flagged as pending review until the City Office verifies it.'
              : 'Try clearing the search or changing the filters.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F6F7F9]">
                  {['Student', 'School', 'Subjects', 'Highest', 'GWA', 'Status', 'Review', ''].map((header, i) => (
                    <th key={header + i} className="px-4 py-3 text-left text-xs text-[#6B7280]" style={{ fontWeight: 600 }}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {filteredRecords.map((record) => {
                  const badge = verificationBadge(record);
                  const status = passedStatus(record);
                  return (
                    <tr key={record.id} onClick={() => setSelectedId(record.id)} className="cursor-pointer hover:bg-[#F9FAFB]">
                      <td className="px-4 py-3.5">
                        <div className="text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{displayName(record)}</div>
                        <div className="text-xs text-[#6B7280]">
                          {record.studentName && record.studentNameOnAccount && record.studentName !== record.studentNameOnAccount
                            ? `Account: ${record.studentNameOnAccount}`
                            : record.gradeLevel || record.term || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-[#6B7280]">{record.school || '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-[#6B7280]">{record.subjects.length}</td>
                      <td className="px-4 py-3.5 text-sm text-[#1F2937]">
                        {record.highestGrade === null ? '—' : Math.round(record.highestGrade)}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-[#1F2937]" style={{ fontWeight: 700 }}>{formatGwa(record.computedGwa)}</td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          status === 'Passed' ? 'bg-green-50 text-green-700' :
                          status === 'Failed' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Icon name="chevron-right" size={15} className="text-[#9CA3AF] inline" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

      {/* Drill-down: full subject breakdown, editing, and the Verify action. */}
      {selectedRecord && (
        <GradeRecordPanel
          record={selectedRecord}
          onClose={() => setSelectedId(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
