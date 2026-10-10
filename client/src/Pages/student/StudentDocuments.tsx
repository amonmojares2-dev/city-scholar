import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon';
import StatusBadge from '../../components/StatusBadge';
import PageHeader from '../../components/PageHeader';
import { api, ApiError, validateDocumentFile } from '../../lib/api';

type DocumentRecord = {
  _id: string;
  type: string;
  originalName: string;
  status: string;
  remarks?: string;
  createdAt: string;
  // City's replacement request (failed-grade appeal flow): an open request
  // (requestedReissue, no appealStatus yet) asks the student for a new copy.
  requestedReissue?: boolean;
  requestExplanation?: string;
  requestDeadline?: string | null;
  appealStatus?: string | null;
  replacementDate?: string | null;
};
type Application = { _id: string; program?: string; school: string; status: string };

const formatDate = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const label = (value: string) => value.replace(/[-_]/g, ' ').replace(/\b\w/g, character => character.toUpperCase());

export default function StudentDocuments() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedApplication, setSelectedApplication] = useState('');
  const [documentType, setDocumentType] = useState('other');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // The Replace popup: one popup serves rejected documents and City-requested
  // resubmissions (failed-grade appeal flow).
  const [replaceTarget, setReplaceTarget] = useState<DocumentRecord | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replaceError, setReplaceError] = useState('');
  const [replacing, setReplacing] = useState(false);
  const replaceFileRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    const [documentResult, applicationResult] = await Promise.all([
      api<{ documents: DocumentRecord[] }>('/documents'),
      api<{ applications: Application[] }>('/applications'),
    ]);
    setDocuments(documentResult.documents);
    setApplications(applicationResult.applications);
    if (!selectedApplication && applicationResult.applications[0]) setSelectedApplication(applicationResult.applications[0]._id);
  };

  useEffect(() => { loadData().catch(requestError => setError(requestError instanceof Error ? requestError.message : 'Unable to load documents.')).finally(() => setLoading(false)); }, []);

  const upload = async () => {
    if (!selectedFile || !selectedApplication) { setError('Select an application and a file before uploading.'); return; }
    const validationError = validateDocumentFile(selectedFile);
    if (validationError) { setError(validationError); return; }
    setUploading(true); setError(''); setMessage('');
    const body = new FormData();
    body.append('file', selectedFile);
    body.append('application', selectedApplication);
    body.append('type', documentType);
    try {
      await api('/documents', { method: 'POST', body });
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await loadData();
      setMessage('Document uploaded successfully and is pending review.');
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to upload document.'); }
    finally { setUploading(false); }
  };

  const verified = documents.filter(document => document.status === 'verified').length;

  // A document needs a replacement when City rejected it or opened a
  // resubmission request the student has not answered yet.
  const needsReplacement = (doc: DocumentRecord): boolean =>
    doc.status === 'rejected' || Boolean(doc.requestedReissue && !doc.appealStatus);

  const requestDeadlinePassed = (doc: DocumentRecord): boolean =>
    Boolean(doc.requestedReissue && !doc.appealStatus && doc.requestDeadline && new Date(doc.requestDeadline).getTime() < Date.now());

  const openReplace = (doc: DocumentRecord) => {
    setReplaceTarget(doc);
    setReplaceFile(null);
    setReplaceError('');
    if (replaceFileRef.current) replaceFileRef.current.value = '';
  };

  const closeReplace = () => {
    setReplaceTarget(null);
    setReplaceFile(null);
    setReplaceError('');
  };

  const submitReplace = async () => {
    if (!replaceTarget || !replaceFile) return;
    const validationError = validateDocumentFile(replaceFile);
    if (validationError) { setReplaceError(validationError); return; }
    setReplacing(true);
    setReplaceError('');
    const body = new FormData();
    body.append('file', replaceFile);
    try {
      await api(`/documents/${replaceTarget._id}/replace`, { method: 'POST', body });
      closeReplace();
      await loadData();
      setMessage('Replacement uploaded. It is pending review again.');
    } catch (requestError) {
      // 403 = not yours, 409 = nothing to replace / already answered,
      // 410 = the City deadline passed — the server message explains each.
      setReplaceError(requestError instanceof Error ? requestError.message : 'Unable to replace the document.');
      if (requestError instanceof ApiError && requestError.status !== 400) {
        // The document state may have changed server-side (e.g. someone else
        // answered the request) — refresh so the row shows the truth.
        try { await loadData(); } catch { /* keep the visible error */ }
      }
    } finally {
      setReplacing(false);
    }
  };
  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading your documents...</div>;

  return <div>
    <PageHeader title="Documents" subtitle="Upload and track the documents attached to your applications" breadcrumb={['Student Portal', 'Documents']} />
    {error && <div className="mb-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}
    {message && <div className="mb-4 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm text-green-700">{message}</div>}

    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-center"><div className="text-2xl font-800 text-[#0B1F3A]">{documents.length}</div><div className="text-xs text-[#6B7280] mt-1">Documents Uploaded</div></div>
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-center"><div className="text-2xl font-800 text-[#22A06B]">{verified}</div><div className="text-xs text-[#6B7280] mt-1">Verified</div></div>
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-center"><div className="text-2xl font-800 text-[#D97706]">{documents.length - verified}</div><div className="text-xs text-[#6B7280] mt-1">Pending Review</div></div>
    </div>

    <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 mb-5">
      <h2 className="font-600 text-[#1F2937] text-sm mb-4">Upload a document</h2>
      {applications.length === 0 ? <p className="text-sm text-[#6B7280]">Submit an application before attaching documents.</p> : <div className="grid md:grid-cols-3 gap-3 items-end">
        <label className="text-xs text-[#6B7280]">Application<select value={selectedApplication} onChange={event => setSelectedApplication(event.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-lg border border-[#E5E7EB] text-sm text-[#1F2937]">{applications.map(application => <option key={application._id} value={application._id}>{application.program || application.school} · {application.school}</option>)}</select></label>
        <label className="text-xs text-[#6B7280]">Document type<select value={documentType} onChange={event => setDocumentType(event.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-lg border border-[#E5E7EB] text-sm text-[#1F2937]">{['birth_certificate', 'residency', 'transcript', 'enrollment', 'income', 'school_id', 'other'].map(type => <option key={type} value={type}>{label(type)}</option>)}</select></label>
        <div><input ref={fileRef} type="file" accept="image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf" onChange={event => { const file = event.target.files?.[0] || null; event.target.value = ''; setSelectedFile(file); setError(file ? validateDocumentFile(file) : ''); }} className="w-full text-xs text-[#6B7280] mb-2" /><button onClick={upload} disabled={uploading || !selectedFile} className="w-full px-4 py-2.5 rounded-lg bg-[#0B1F3A] text-white text-sm font-600 disabled:opacity-40">{uploading ? 'Uploading...' : 'Upload document'}</button></div>
      </div>}
      <p className="text-xs text-[#9CA3AF] mt-3">Accepted formats: PDF, JPG, PNG. Maximum size: 5 MB.</p>
    </div>

    <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden"><div className="px-5 py-4 border-b border-[#E5E7EB]"><h2 className="font-600 text-[#1F2937] text-sm">Uploaded documents</h2></div>{documents.length === 0 ? <div className="px-5 py-10 text-center text-sm text-[#6B7280]">No documents have been uploaded yet.</div> : <div className="divide-y divide-[#E5E7EB]">{documents.map(document => {
          const requestOpen = Boolean(document.requestedReissue && !document.appealStatus);
          const deadlinePassed = requestOpen && Boolean(document.requestDeadline && new Date(document.requestDeadline).getTime() < Date.now());
          return (
          <div key={document._id} className="px-5 py-4 flex items-start gap-4 flex-wrap"><div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center"><Icon name="file-text" size={16} className="text-[#2563EB]" /></div><div className="flex-1 min-w-0"><div className="font-600 text-sm text-[#1F2937]">{document.originalName}</div><div className="text-xs text-[#6B7280]">{label(document.type)} · Uploaded {formatDate(document.createdAt)}</div>{document.remarks && <div className="text-xs text-orange-700 mt-1">{document.remarks}</div>}
        {requestOpen && (
          <div className={`mt-2 text-xs rounded-lg px-3 py-2 max-w-xl ${deadlinePassed ? 'bg-red-50 text-[#DC2626]' : 'bg-amber-50 text-[#92400E]'}`}>
            <span style={{ fontWeight: 600 }}>
              {deadlinePassed ? 'Replacement deadline passed' : 'Resubmission requested by the City Scholarship Office'}
              {document.requestDeadline ? (deadlinePassed ? ` (${formatDate(document.requestDeadline)})` : ` — due ${formatDate(document.requestDeadline)}`) : ''}.
            </span>
            {document.requestExplanation ? ` ${document.requestExplanation}` : ''}
          </div>
        )}
        {document.requestedReissue && document.appealStatus === 'resubmitted' && (
          <div className="mt-2 text-xs rounded-lg px-3 py-2 bg-blue-50 text-[#1D4ED8]">Replacement submitted — awaiting review.</div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge status={document.status} size="sm" />
        {needsReplacement(document) && (
          <button
            onClick={() => openReplace(document)}
            disabled={deadlinePassed}
            className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] text-xs text-[#6B7280] hover:text-[#1F2937] hover:bg-[#F6F7F9] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontWeight: 600 }}
            title={deadlinePassed ? 'The replacement deadline has passed. Contact the City Scholarship Office.' : 'Upload a new copy of this document'}
          >
            Replace
          </button>
        )}
      </div>
          </div>
          );
        })}
      </div>}</div>
    {/* Replace popup — shared by rejected documents and City-requested
        resubmissions; shows the City explanation and deadline when present. */}
    {replaceTarget && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
            <h2 className="text-sm text-[#1F2937]" style={{ fontWeight: 700 }}>Replace: {replaceTarget.originalName}</h2>
            <button onClick={closeReplace} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#F6F7F9] text-[#6B7280]" aria-label="Close">
              <Icon name="x" size={15} />
            </button>
          </div>
          <div className="p-6">
            {replaceTarget.requestedReissue && !replaceTarget.appealStatus && (
              <div className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-[#92400E]">
                <span style={{ fontWeight: 600 }}>Why: </span>
                {replaceTarget.requestExplanation || 'The City Scholarship Office asked for a new copy of this document.'}
                {replaceTarget.requestDeadline && (
                  <div className="mt-1">Deadline: {formatDate(replaceTarget.requestDeadline)}</div>
                )}
              </div>
            )}
            <input
              ref={replaceFileRef}
              type="file"
              accept="image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf"
              className="hidden"
              onChange={event => {
                const selected = event.target.files?.[0] || null;
                event.target.value = '';
                setReplaceFile(selected);
                setReplaceError(selected ? validateDocumentFile(selected) : '');
              }}
            />
            <div
              onClick={() => replaceFileRef.current?.click()}
              className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer border-[#E5E7EB] hover:border-[#163A63]/50 transition-colors"
            >
              <div className="w-12 h-12 bg-[#F6F7F9] rounded-xl flex items-center justify-center mx-auto mb-3">
                <Icon name="upload" size={22} className="text-[#163A63]" />
              </div>
              <p className="text-sm text-[#1F2937] mb-1" style={{ fontWeight: 600 }}>
                {replaceFile ? replaceFile.name : 'Click to choose the new file'}
              </p>
              <p className="text-xs text-[#9CA3AF]">PDF, JPG, or PNG up to 5 MB</p>
            </div>
            {replaceError && <p className="mt-2 text-xs text-[#DC2626]">{replaceError}</p>}
            <div className="mt-4 flex gap-3">
              <button onClick={closeReplace} className="flex-1 py-2.5 border border-[#E5E7EB] rounded-xl text-sm text-[#6B7280] hover:bg-[#F6F7F9]" style={{ fontWeight: 600 }}>
                Cancel
              </button>
              <button
                onClick={submitReplace}
                disabled={!replaceFile || replacing}
                className="flex-1 py-2.5 bg-[#0B1F3A] text-white rounded-xl text-sm hover:bg-[#163A63] disabled:opacity-50"
                style={{ fontWeight: 700 }}
              >
                {replacing ? 'Uploading…' : 'Replace document'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>;
}
