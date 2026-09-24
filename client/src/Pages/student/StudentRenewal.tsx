import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';
import { api } from '../../lib/api';
import { docFileUrl, isImageMime, friendlyErrorMessage } from '../../lib/docUrl';

// The five renewal slots — identical to the server's KNOWN_DOC_TYPES[0..4],
// so the upload endpoint stores them under the exact slot the student picked.
const RENEWAL_DOCS = [
  { docType: 'Certificate of Residency (Student)', note: 'Must be officially stamped and dry sealed' },
  { docType: 'Certificate of Indigency (Student)', note: 'Must be officially stamped and dry sealed' },
  { docType: 'Certificate of Residency (Parent/Guardian)', note: 'Must be officially stamped and dry sealed' },
  { docType: 'Certificate of Indigency (Parent/Guardian)', note: 'Must be officially stamped and dry sealed' },
  { docType: 'Certificate of Matriculation', note: 'Must be officially stamped and dry sealed' },
];

type UploadStatus = 'not-uploaded' | 'under-review' | 'verified' | 'rejected';

// Only "renewal"-context documents belong on this page. The same upload
// endpoint serves the Application page (default context "application"), so
// both the list and the upload must carry context=renewal or the two flows
// share rows on the same application record.
interface ServerDoc { _id?: string; type?: string; status?: string; filename?: string; mimeType?: string; createdAt?: string; updatedAt?: string }

interface DocRow {
  docType: string;
  note: string;
  status: UploadStatus;
  uploaded: string; // formatted date, '' when not uploaded
  documentId: string;
  filename: string;
  mimeType: string;
}

const mapServerStatus = (status?: string): UploadStatus => {
  if (status === 'verified' || status === 'approved') return 'verified';
  if (status === 'rejected') return 'rejected';
  if (status) return 'under-review';
  return 'not-uploaded';
};

const formatDate = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// The renewal period follows the academic calendar. Deadline is the end of
// the current semester (computed from today's date — no placeholder dates).
const getRenewalWindow = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  const academicYear = m >= 5 ? `AY ${y}–${y + 1}` : `AY ${y - 1}–${y}`;
  const deadline = m >= 5 && m <= 11 ? new Date(y, 11, 31) : new Date(y, 4, 31);
  const days = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 86400000));
  return { academicYear, days };
};

export default function StudentRenewal() {
  const [docs, setDocs] = useState<DocRow[]>(RENEWAL_DOCS.map(d => ({ ...d, status: 'not-uploaded' as const, uploaded: '', documentId: '', filename: '', mimeType: '' })));
  const [loading, setLoading] = useState(true);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const { academicYear, days } = getRenewalWindow();

  const refresh = useCallback(async () => {
    try {
      const result = await api<{ documents?: ServerDoc[] }>(
        '/student/application/documents?context=renewal'
      );
      const serverDocs = result.documents ?? [];
      setDocs(RENEWAL_DOCS.map(slot => {
        const found = serverDocs.find(d => d.type === slot.docType);
        return {
          docType: slot.docType,
          note: slot.note,
          status: mapServerStatus(found?.status),
          uploaded: formatDate(found?.updatedAt || found?.createdAt),
          documentId: found?._id || '',
          filename: found?.filename || '',
          mimeType: found?.mimeType || '',
        };
      }));
        } catch (err) {
      setNotice({ kind: 'error', text: friendlyErrorMessage(err instanceof Error ? err.message : 'Unable to load documents.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const uploadedCount = docs.filter(d => d.status !== 'not-uploaded').length;
  const progress = Math.round((uploadedCount / docs.length) * 100);
  const allUploaded = docs.length > 0 && docs.every(d => d.status !== 'not-uploaded');
  const anyRejected = docs.some(d => d.status === 'rejected');
  const allVerified = docs.length > 0 && docs.every(d => d.status === 'verified');
  const renewalStatus: UploadStatus = allVerified ? 'verified' : anyRejected ? 'rejected' : uploadedCount > 0 ? 'under-review' : 'not-uploaded';

  const openUpload = (docType: string) => {
    setUploadFor(docType);
    setFile(null);
    setUploadError('');
  };

  const closeUpload = () => {
    setUploadFor(null);
    setFile(null);
    setUploadError('');
  };

  const handleUploadSubmit = async () => {
    if (!file || !uploadFor) return;
    setUploading(true);
    setUploadError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('docType', uploadFor);
      form.append('originalName', uploadFor);
      form.append('context', 'renewal');
      await api('/student/application/documents', { method: 'POST', body: form });
      closeUpload();
      await refresh();
      setNotice({ kind: 'success', text: 'Document uploaded. It will be reviewed by the scholarship office.' });
        } catch (err) {
      setUploadError(friendlyErrorMessage(err instanceof Error ? err.message : 'Upload failed.'));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitRenewal = async () => {
    if (!allUploaded) return;
    setSubmitting(true);
    setNotice(null);
    try {
      // Same endpoint the application flow uses: only a draft can move to
      // "submitted", which is what puts the renewal in the City Office queue.
      await api('/student/application', { method: 'PATCH', body: JSON.stringify({ status: 'submitted' }) });
      setSubmitted(true);
      setNotice({ kind: 'success', text: 'Renewal submitted. Track its status on this page.' });
        } catch (err) {
      setNotice({ kind: 'error', text: friendlyErrorMessage(err instanceof Error ? err.message : 'Unable to submit your renewal.') });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Scholarship Renewal"
        subtitle="Submit your renewal documents every semester to continue receiving your grant"
        breadcrumb={['Student Portal', 'Renewal']}
      />

      {notice && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${notice.kind === 'success' ? 'bg-green-50 text-[#22A06B]' : 'bg-red-50 text-[#DC2626]'}`}>
          {notice.text}
        </div>
      )}

      {loading && (
        <div className="mb-4 text-sm text-[#6B7280]">Loading your renewal documents…</div>
      )}

      <div className="bg-[#F8E7A8] border border-[#D4A72C]/30 rounded-2xl p-4 mb-6 flex gap-3">
        <Icon name="alert-triangle" size={16} className="text-[#D97706] flex-shrink-0 mt-0.5" />
        <p className="text-sm text-[#92400E]">
          <span className="font-700" style={{ fontWeight: 700 }}>Renewal is required every semester. </span>
          All official documents must be officially stamped and dry sealed. Failure to renew on time will result in suspension of your grant.
        </p>
      </div>

      {/* Status cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="md:col-span-2 bg-[#0B1F3A] rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs text-white/40 mb-1">Renewal Status</div>
              <StatusBadge status="under-review" />
            </div>
            <div className="text-right">
              <div className="text-xs text-white/40 mb-1">Deadline</div>
              <div className="font-700 text-[#D4A72C]" style={{ fontWeight: 700 }}>July 31, 2025</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-white/60 mb-1.5">
              <span>Documents Progress</span>
              <span>{progress}% Complete ({uploadedCount}/{docs.length})</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#D4A72C] rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
          <Icon name="calendar" size={20} className="text-[#163A63] mb-2" />
          <div className="font-700 text-2xl text-[#0B1F3A]" style={{ fontWeight: 700 }}>54 days</div>
          <div className="text-xs text-[#6B7280]">Until renewal deadline</div>
          <div className="mt-3 text-xs text-[#6B7280]">
            <div className="font-600 text-[#1F2937] mb-1" style={{ fontWeight: 600 }}>Current Scholarship</div>
            City Scholarship Program<br />AY 2024–2025 · Active
          </div>
        </div>
      </div>

      {/* Renewal info */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 mb-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Icon name="info" size={15} className="text-[#2563EB]" />
          </div>
          <div>
            <div className="font-600 text-sm text-[#1F2937] mb-2" style={{ fontWeight: 600 }}>Renewal Policy</div>
            <ul className="space-y-1.5 text-xs text-[#6B7280]">
              <li className="flex items-start gap-2"><Icon name="check" size={11} className="text-[#22A06B] mt-0.5 flex-shrink-0" />All current scholars must submit renewal documents every semester to claim their grant.</li>
              <li className="flex items-start gap-2"><Icon name="check" size={11} className="text-[#22A06B] mt-0.5 flex-shrink-0" />Documents must be submitted within the renewal period. Late submissions will not be accepted.</li>
              <li className="flex items-start gap-2"><Icon name="check" size={11} className="text-[#22A06B] mt-0.5 flex-shrink-0" />All documents must bear the official stamp and dry seal of the issuing barangay office.</li>
              <li className="flex items-start gap-2"><Icon name="check" size={11} className="text-[#22A06B] mt-0.5 flex-shrink-0" />Scholars who fail to renew within the deadline will have their grant suspended for that semester.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Document upload */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden mb-5">
        <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
          <h2 className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>Renewal Documents</h2>
          <span className="text-xs text-[#6B7280]">{uploadedCount} of {docs.length} submitted</span>
        </div>
        <div className="divide-y divide-[#E5E7EB]">
          {docs.map(doc => (
            <div key={doc.docType} className="flex items-start gap-4 px-5 py-4">
              {doc.documentId && isImageMime(doc.mimeType) && docFileUrl(doc.documentId) ? (
                <a href={docFileUrl(doc.documentId) as string} target="_blank" rel="noreferrer" title="Open full image" className="flex-shrink-0 mt-0.5">
                  <img
                    src={docFileUrl(doc.documentId) as string}
                    alt={doc.docType}
                    className="w-14 h-14 rounded-xl object-cover border border-[#E5E7EB]"
                  />
                </a>
              ) : (
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                doc.status === 'verified' ? 'bg-green-50' :
                doc.status === 'under-review' ? 'bg-blue-50' : 'bg-gray-100'
              }`}>
                <Icon name="file-text" size={15} className={
                  doc.status === 'verified' ? 'text-[#22A06B]' :
                  doc.status === 'under-review' ? 'text-[#2563EB]' : 'text-[#9CA3AF]'
                } />
              </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-600 text-sm text-[#1F2937] mb-0.5" style={{ fontWeight: 600 }}>{doc.docType}</div>
                <p className="text-xs text-[#9CA3AF]">{doc.note}</p>
                {doc.uploaded && <p className="text-xs text-[#9CA3AF] mt-0.5">Submitted {doc.uploaded}</p>}
                {doc.status !== 'not-uploaded' && <div className="mt-1"><StatusBadge status={doc.status} size="sm" /></div>}
              </div>
              <button
                onClick={() => openUpload(doc.docType)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-600 transition-colors ${
                  doc.status === 'not-uploaded'
                    ? 'bg-[#0B1F3A] text-white hover:bg-[#163A63]'
                    : 'border border-[#E5E7EB] text-[#6B7280] hover:text-[#1F2937]'
                }`}
                style={{ fontWeight: 600 }}
              >
                {doc.status === 'not-uploaded' ? 'Upload' : 'Replace'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleSubmitRenewal}
        disabled={!allUploaded || submitting || submitted}
        className="w-full py-3 bg-[#0B1F3A] text-white font-700 rounded-xl hover:bg-[#163A63] transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ fontWeight: 700 }}
      >
        {submitted ? 'Renewal Submitted' : submitting ? 'Submitting…' : 'Submit Renewal'}
      </button>
      {!allUploaded && (
        <p className="text-xs text-center text-[#6B7280] mt-2">Upload all required documents before submitting</p>
      )}

      {uploadFor !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
              <h2 className="font-700 text-[#1F2937] text-sm" style={{ fontWeight: 700 }}>
                Upload: {docs.find(d => d.docType === uploadFor)?.docType}
              </h2>
              <button onClick={closeUpload} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#F6F7F9] text-[#6B7280]">
                <Icon name="x" size={15} />
              </button>
            </div>
            <div className="p-6">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={e => { setFile(e.target.files?.[0] ?? null); setUploadError(''); }}
              />
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(false);
                  setFile(e.dataTransfer.files?.[0] ?? null);
                  setUploadError('');
                }}
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer ${
                  dragOver ? 'border-[#163A63] bg-[#163A63]/5' : 'border-[#E5E7EB] hover:border-[#163A63]/50'
                }`}
              >
                <div className="w-12 h-12 bg-[#F6F7F9] rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Icon name="upload" size={22} className="text-[#163A63]" />
                </div>
                <p className="font-600 text-sm text-[#1F2937] mb-1" style={{ fontWeight: 600 }}>Drag and drop your file here</p>
                <p className="text-xs text-[#6B7280] mb-3">or click to browse files</p>
                <p className="text-xs text-[#9CA3AF]">PDF, JPG, PNG up to 5MB</p>
              </div>
              {file && (
                <p className="mt-3 text-xs text-[#1F2937] bg-[#F6F7F9] rounded-xl px-3 py-2 truncate">
                  Selected: <span style={{ fontWeight: 600 }}>{file.name}</span>
                </p>
              )}
              {uploadError && <p className="mt-2 text-xs text-[#DC2626]">{uploadError}</p>}
              <div className="mt-3 p-3 bg-amber-50 rounded-xl">
                <p className="text-xs text-[#92400E] flex items-start gap-2">
                  <Icon name="alert-triangle" size={12} className="flex-shrink-0 mt-0.5" />
                  Document must bear the official stamp and dry seal of the issuing barangay office.
                </p>
              </div>
              <div className="mt-4 flex gap-3">
                <button onClick={closeUpload} className="flex-1 py-2.5 border border-[#E5E7EB] rounded-xl text-sm text-[#6B7280] font-600 hover:bg-[#F6F7F9]" style={{ fontWeight: 600 }}>Cancel</button>
                <button
                  onClick={handleUploadSubmit}
                  disabled={!file || uploading}
                  className="flex-1 py-2.5 bg-[#0B1F3A] text-white rounded-xl text-sm font-700 hover:bg-[#163A63] disabled:opacity-50"
                  style={{ fontWeight: 700 }}
                >
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
