import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import Icon from '../../components/Icon';
import StatusBadge from '../../components/StatusBadge';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';
import { docFileUrl, isImageMime } from '../../lib/docUrl';

type Application = { _id: string; student?: { name: string; email: string }; barangay?: { name: string }; program: string; school: string; status: string; remarks?: string; createdAt: string; submittedAt?: string };
type DocumentRecord = { _id: string; application?: string | { _id: string }; originalName: string; filename?: string; mimeType?: string; context?: string; status: string; type: string; remarks?: string };
const date = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export default function CityApplicationDetail() {
  const { id } = useParams(); const navigate = useNavigate();
  const [application, setApplication] = useState<Application | null>(null); const [documents, setDocuments] = useState<DocumentRecord[]>([]); const [status, setStatus] = useState(''); const [remarks, setRemarks] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    // Same Document collection both student flows write to. Scope by
    // application AND context so a renewal review shows only that renewal's
    // documents — and re-fetch whenever the page regains focus so a fresh
    // student re-upload shows up without a hard refresh.
    const loadAll = () => Promise.all([
      api<{ application: Application }>(`/applications/${id}`),
      api<{ documents: DocumentRecord[] }>(`/documents?application=${encodeURIComponent(id)}`),
    ]).then(([applicationResult, documentResult]) => {
      setApplication(applicationResult.application);
      setStatus(applicationResult.application.status);
      setRemarks(applicationResult.application.remarks || '');
      setDocuments(documentResult.documents);
    }).catch(requestError => setError(requestError instanceof Error ? requestError.message : 'Unable to load application.'));
    loadAll().finally(() => setLoading(false));
    const onFocus = () => { loadAll().catch(() => { /* keep stale view on transient failure */ }); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [id]);
  const save = async () => { if (!id) return; try { await api(`/applications/${id}`, { method: 'PATCH', body: JSON.stringify({ status, remarks }) }); setApplication(current => current ? { ...current, status, remarks } : current); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to update application.'); } };
  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading application...</div>;
  if (!application) return <div className="p-8 text-center text-sm text-red-700">{error || 'Application not found.'}</div>;
  // Same application record can hold both contexts (pre-fix uploads), so
  // filter by context too: renewal reviews show renewal docs, everything else
  // shows application docs. Application docs are the default for old rows
  // without a context value.
  const wantContext = application.status === 'renewal' ? 'renewal' : 'application';
  const applicationDocuments = documents.filter(document => (document.context || 'application') === wantContext);
  return <div><PageHeader title={`${application.status === 'renewal' ? 'Renewal' : 'Application'} ${application._id}`} breadcrumb={['City Office', application.status === 'renewal' ? 'Renewals' : 'Applications', application._id]} action={<Link to="/city/applications" className="text-sm text-[#163A63]">Back to applications</Link>} />{error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}<div className="bg-[#0B1F3A] rounded-2xl p-5 mb-5 text-white"><div className="font-700 text-lg">{application.student?.name || 'Unknown student'}</div><div className="text-white/60 text-sm mt-1">{application.student?.email} · {application.school}</div><div className="text-white/60 text-sm">{application.barangay?.name || 'Barangay not provided'} · Submitted {date(application.submittedAt || application.createdAt)}</div><div className="mt-3"><StatusBadge status={application.status.replace('_', '-')} /></div></div><div className="grid md:grid-cols-2 gap-5"><div className="bg-white rounded-2xl border border-[#E5E7EB] p-5"><h2 className="font-700 text-sm text-[#1F2937] mb-4">Application Details</h2><div className="space-y-3"><div className="flex justify-between"><span className="text-xs text-[#6B7280]">Program</span><span className="text-sm font-600">{application.program}</span></div><div className="flex justify-between"><span className="text-xs text-[#6B7280]">School</span><span className="text-sm font-600">{application.school}</span></div><div><label className="text-xs text-[#6B7280]">Review status<select value={status} onChange={event => setStatus(event.target.value)} className="mt-1 w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm"><option value="submitted">Submitted</option><option value="under_review">Under Review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="renewal">Renewal</option></select></label></div><textarea value={remarks} onChange={event => setRemarks(event.target.value)} rows={4} className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm" placeholder="Reviewer remarks" /><button onClick={save} className="w-full py-2.5 rounded-xl bg-[#0B1F3A] text-white text-sm font-700">Save review</button></div></div><div className="bg-white rounded-2xl border border-[#E5E7EB] p-5"><h2 className="font-700 text-sm text-[#1F2937] mb-4">Uploaded Documents</h2>{applicationDocuments.length === 0 ? <div className="text-sm text-[#6B7280]">No uploaded documents found.</div> : <div className="space-y-3">{applicationDocuments.map(document => {
        const imageUrl = isImageMime(document.mimeType) ? docFileUrl(document.filename) : null;
        return (
          <div key={document._id} className="flex items-center gap-3">
            {imageUrl ? (
              <a href={imageUrl} target="_blank" rel="noreferrer" title="Open full image" className="flex-shrink-0">
                <img src={imageUrl} alt={document.originalName} className="w-14 h-14 rounded-xl object-cover border border-[#E5E7EB]" />
              </a>
            ) : (
              <Icon name="file-text" size={16} className="text-[#2563EB] flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0"><div className="text-sm font-600 truncate">{document.originalName}</div><div className="text-xs text-[#6B7280]">{document.type}</div></div>
            <StatusBadge status={document.status} size="sm" />
          </div>
        );
      })}</div>}</div></div></div>;
}
