import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon';
import StatusBadge from '../../components/StatusBadge';
import PageHeader from '../../components/PageHeader';
import { api, validateDocumentFile } from '../../lib/api';

type DocumentRecord = { _id: string; type: string; originalName: string; status: string; remarks?: string; createdAt: string };
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

    <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden"><div className="px-5 py-4 border-b border-[#E5E7EB]"><h2 className="font-600 text-[#1F2937] text-sm">Uploaded documents</h2></div>{documents.length === 0 ? <div className="px-5 py-10 text-center text-sm text-[#6B7280]">No documents have been uploaded yet.</div> : <div className="divide-y divide-[#E5E7EB]">{documents.map(document => <div key={document._id} className="px-5 py-4 flex items-center gap-4"><div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center"><Icon name="file-text" size={16} className="text-[#2563EB]" /></div><div className="flex-1 min-w-0"><div className="font-600 text-sm text-[#1F2937]">{document.originalName}</div><div className="text-xs text-[#6B7280]">{label(document.type)} · Uploaded {formatDate(document.createdAt)}</div>{document.remarks && <div className="text-xs text-orange-700 mt-1">{document.remarks}</div>}</div><StatusBadge status={document.status} size="sm" /></div>)}</div>}</div>
  </div>;
}
