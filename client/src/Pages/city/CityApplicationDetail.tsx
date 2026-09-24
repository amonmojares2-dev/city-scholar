/* ============================================================
   City Office — Application review page   (/city/applications/:id)

   Everything shown here comes from real records — nothing is invented:
     GET   /api/applications/:id            application + student + barangay
     GET   /api/documents?application=:id   the uploaded documents
     GET   /api/programs                    program rules (min GWA, required docs)
     PATCH /api/applications/:id/review     approve / reject / request documents
     PATCH /api/documents/:id               verify a document / ask for a replacement

   The three header actions are the only workflow controls:
     Approve       -> status approved, student notified
     Reject        -> status rejected (reason required)
     Request Docs  -> status additional_requirements + the flagged documents are
                      marked for replacement, so the student sees exactly which
                      files to re-upload in their own portal.

   Tabs: Overview (profile + academics), Documents (per-document review),
   Eligibility (checks computed from the data on record), Activity (timeline
   built from the record's own timestamps).
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import Icon from '../../components/Icon';
import { api } from '../../lib/api';
import { isImageMime } from '../../lib/docUrl';
import { applicationDisplayId } from '../../lib/applicationId';
import { APPLICATION_DOCUMENT_TYPES } from '../../data/documentTypes';
import ConfirmDialog from '../../components/ConfirmDialog';
import { PrivateDocumentImage, PrivateFileLink } from '../../components/PrivateFile';

function displayYearLevel(value?: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'grade 11' || normalized === 'grade 12' ? '' : String(value || '');
}

interface ApplicantProfile {
  dateOfBirth?: string;
  sex?: string;
  civilStatus?: string;
  // `nationality`, `city`, `zipCode` were removed from the Application form
  // (kept optional here for historical reads — older records may carry them).
  nationality?: string;
  mobileNumber?: string;
  address?: string;
  city?: string;
  zipCode?: string;
  studentId?: string;
  course?: string;
  yearLevel?: string;
  academicTerm?: string;
  gwa?: string;
  unitsEnrolled?: string;
  // Optional historical field retained so old applications still load.
  schoolAddress?: string;
  strand?: string;
  schoolType?: string;
  schoolYear?: string;
  parentName?: string;
  parentRelationship?: string;
  parentMobile?: string;
}

interface Application {
  _id: string;
  student?: { _id: string; name: string; email: string } | null;
  barangay?: { _id: string; name: string } | null;
  // `program` was removed from the Application form (kept optional for
  // historical reads — older submitted applications may still carry it).
  program?: string;
  school: string;
  university?: string;
  applicant?: ApplicantProfile;
  status: string;
  remarks?: string;
  submittedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  reviewedAt?: string | null;
  reviewedBy?: { name: string } | null;
}

interface DocumentRecord {
  _id: string;
  type: string;
  originalName: string;
  filename?: string;
  mimeType?: string;
  context?: string;
  status: string;
  remarks?: string;
  createdAt: string;
  updatedAt?: string;
}

interface ProgramConfig {
  id: string;
  programName: string;
  minGwa: number;
  requiredDocuments: string[];
  eligibleSchools: string[];
}

type TabKey = 'overview' | 'documents' | 'eligibility' | 'activity';
type Decision = 'approved' | 'rejected' | 'additional_requirements';
type DocViewStatus = 'not-uploaded' | 'under-review' | 'verified' | 'needs-replacement';
type CheckState = 'pass' | 'fail' | 'unknown';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'documents', label: 'Documents' },
  { key: 'eligibility', label: 'Eligibility' },
  { key: 'activity', label: 'Activity' },
];

// Status styling for the navy hero card (white-on-navy variants).
const HERO_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-white/10 text-white/70 border-white/20' },
  submitted: { label: 'Submitted', className: 'bg-[#2563EB]/25 text-[#BFDBFE] border-[#2563EB]/40' },
  under_review: { label: 'Under Review', className: 'bg-[#D4A72C]/20 text-[#F8E7A8] border-[#D4A72C]/40' },
  additional_requirements: { label: 'Additional Requirements', className: 'bg-[#EA580C]/25 text-[#FED7AA] border-[#EA580C]/40' },
  approved: { label: 'Approved', className: 'bg-[#22A06B]/25 text-[#BBF7D0] border-[#22A06B]/40' },
  rejected: { label: 'Rejected', className: 'bg-[#DC2626]/25 text-[#FECACA] border-[#DC2626]/40' },
  renewal: { label: 'Renewal', className: 'bg-[#D4A72C]/20 text-[#F8E7A8] border-[#D4A72C]/40' },
};

const DOC_STATUS: Record<DocViewStatus, { label: string; text: string; dot: string }> = {
  'not-uploaded': { label: 'Not Uploaded', text: 'text-[#6B7280]', dot: 'bg-[#9CA3AF]' },
  'under-review': { label: 'Under Review', text: 'text-[#D97706]', dot: 'bg-[#D97706]' },
  verified: { label: 'Verified', text: 'text-[#22A06B]', dot: 'bg-[#22A06B]' },
  'needs-replacement': { label: 'Needs Replacement', text: 'text-[#EA580C]', dot: 'bg-[#EA580C]' },
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  additional_requirements: 'Additional Requirements',
  approved: 'Approved',
  rejected: 'Rejected',
  renewal: 'Renewal',
};

const formatDay = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Dates captured through <input type="date"> are plain "YYYY-MM-DD" strings.
// Parsing those through Date() pulls the value through UTC and can render the
// previous day, so date-only values are built in local time instead.
const formatLongDay = (value?: string | null) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const initialsOf = (name: string) =>
  name.split(' ').filter(Boolean).map(word => word[0]).join('').slice(0, 2).toUpperCase() || '?';

const normalizeText = (value?: string) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

interface DocRow {
  key: string;
  label: string;
  document: DocumentRecord | null;
}

const documentViewStatus = (document: DocumentRecord | null): DocViewStatus => {
  if (!document) return 'not-uploaded';
  if (document.status === 'verified') return 'verified';
  if (document.status === 'rejected') return 'needs-replacement';
  return 'under-review';
};

// An uploaded row belongs to a slot when the names match or one contains the
// other (legacy uploads use short labels like "residency" or "birth
// certificate"). Anything left over is still listed, never hidden.
const namesMatch = (slot: string, documentType: string) => {
  if (slot === 'Report Card' && documentType === 'Report Card (Grade 12)') return true;
  const slotName = normalizeText(slot);
  const docName = normalizeText(documentType);
  if (!slotName || !docName) return false;
  return slotName === docName || slotName.includes(docName) || docName.includes(slotName);
};

const buildDocRows = (slots: string[], documents: DocumentRecord[]): DocRow[] => {
  const claimed = new Set<string>();
  const rows: DocRow[] = slots.map(slot => {
    const match = documents.find(document => !claimed.has(document._id) && namesMatch(slot, document.type));
    if (match) claimed.add(match._id);
    return { key: slot, label: slot, document: match || null };
  });
  documents.forEach(document => {
    if (!claimed.has(document._id)) rows.push({ key: document._id, label: document.type, document });
  });
  return rows;
};

interface EligibilityCheck {
  key: string;
  label: string;
  detail: string;
  state: CheckState;
}

const CHECK_ICON: Record<CheckState, { name: string; className: string; wrap: string }> = {
  pass: { name: 'check-circle', className: 'text-[#22A06B]', wrap: 'bg-green-50' },
  fail: { name: 'x-circle', className: 'text-[#DC2626]', wrap: 'bg-red-50' },
  unknown: { name: 'clock', className: 'text-[#D97706]', wrap: 'bg-amber-50' },
};

interface ActivityEntry {
  key: string;
  icon: string;
  title: string;
  detail: string;
  date: string;
}

function ActivityStart({ icon }: { icon: string }) {
  return (
    <span className="w-8 h-8 rounded-xl bg-[#F0F4FA] text-[#163A63] flex items-center justify-center flex-shrink-0">
      <Icon name={icon} size={15} />
    </span>
  );
}

function InfoCard({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] px-6 py-5">
      <h2 className="text-sm font-700 text-[#1F2937] mb-2" style={{ fontWeight: 700 }}>{title}</h2>
      <div className="divide-y divide-[#F3F4F6]">
        {rows.map(row => (
          <div key={row.label} className="flex items-start justify-between gap-6 py-3">
            <span className="text-xs text-[#6B7280] pt-0.5">{row.label}</span>
            <span className={`text-sm text-right ${row.value ? 'font-600 text-[#1F2937]' : 'text-[#9CA3AF]'}`} style={row.value ? { fontWeight: 600 } : undefined}>
              {row.value || 'Not provided'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocStatusLabel({ status }: { status: DocViewStatus }) {
  const style = DOC_STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

// null = the check can't be answered from the record (shown as "waiting")
const stateFrom = (value: boolean | null): CheckState => (value === null ? 'unknown' : value ? 'pass' : 'fail');

export default function CityApplicationDetail() {
  const { id } = useParams();
  const [application, setApplication] = useState<Application | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [programs, setPrograms] = useState<ProgramConfig[]>([]);
  const [tab, setTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'warning' | 'danger'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  // Decision modal (Approve / Reject / Request Docs)
  const [decision, setDecision] = useState<Decision | null>(null);
  const [confirmDecisionOpen, setConfirmDecisionOpen] = useState(false);
  const [remarkText, setRemarkText] = useState('');
  const [flagged, setFlagged] = useState<string[]>([]);
  // Document preview + review modal
  const [preview, setPreview] = useState<DocRow | null>(null);
  const [previewRemarks, setPreviewRemarks] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    // Program rules support the review (min GWA + required document slots).
    // A failure there must never blank out the application itself, so it falls
    // back to an empty list and the default document slots.
    const [applicationResult, documentResult, programResult] = await Promise.all([
      api<{ application: Application }>(`/applications/${id}`),
      api<{ documents: DocumentRecord[] }>(`/documents?application=${encodeURIComponent(id)}`),
      api<{ programs: ProgramConfig[] }>('/programs').catch(() => ({ programs: [] as ProgramConfig[] })),
    ]);
    setApplication(applicationResult.application);
    setDocuments(documentResult.documents || []);
    setPrograms(programResult.programs || []);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    load()
      .catch(requestError => setError(requestError instanceof Error ? requestError.message : 'Unable to load application.'))
      .finally(() => setLoading(false));
    // Re-fetch when the page regains focus so a document the student just
    // re-uploaded appears without a hard refresh.
    const onFocus = () => { load().catch(() => { /* keep the last good view */ }); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [id, load]);

  // A record can hold both an application and a renewal submission (the
  // upload endpoint writes a `context`). Review whichever flow this record is.
  const context = application?.status === 'renewal' ? 'renewal' : 'application';
  const scopedDocuments = useMemo(
    () => documents.filter(document => (document.context || 'application') === context),
    [documents, context]
  );

  const programConfig = useMemo(() => {
    if (!application || !application.program) return null;
    return programs.find(program => namesMatch(program.programName, application.program as string)) || null;
  }, [programs, application]);

  const slots = useMemo(
    () => (programConfig?.requiredDocuments?.length ? programConfig.requiredDocuments : APPLICATION_DOCUMENT_TYPES.map(slot => slot.key)),
    [programConfig]
  );

  const docRows = useMemo(() => buildDocRows(slots, scopedDocuments), [slots, scopedDocuments]);
  const uploadedCount = docRows.filter(row => row.document).length;
  const verifiedCount = docRows.filter(row => documentViewStatus(row.document) === 'verified').length;

  // Eligibility checks are computed from what is actually on the record.
  // Anything the record does not answer stays "unknown" instead of guessing.
  const checks = useMemo<EligibilityCheck[]>(() => {
    if (!application) return [];
    const profile = application.applicant || {};
    const yearLevel = displayYearLevel(profile.yearLevel);
    const gwaValue = Number.parseFloat(String(profile.gwa ?? ''));
    const hasGwa = !Number.isNaN(gwaValue);
    const minGwa = programConfig ? programConfig.minGwa : null;
    const eligibleSchools = programConfig?.eligibleSchools?.length ? programConfig.eligibleSchools : [];
    const schoolListed = eligibleSchools.length ? eligibleSchools.some(school => namesMatch(school, application.school)) : null;

    return [
      {
        key: 'residency',
        label: 'City residency on record',
        detail: application.barangay?.name
          ? `Registered under Barangay ${application.barangay.name}`
          : 'No barangay is linked to this application.',
        state: stateFrom(Boolean(application.barangay?.name)),
      },
      {
        key: 'nationality',
        label: 'Filipino citizenship',
        detail: profile.nationality ? `Declared nationality: ${profile.nationality}` : 'No nationality declared on the application.',
        state: profile.nationality ? stateFrom(normalizeText(profile.nationality) === 'filipino') : 'unknown',
      },
      {
        key: 'birthdate',
        label: 'Date of birth on record',
        detail: profile.dateOfBirth ? formatLongDay(profile.dateOfBirth) : 'No date of birth declared.',
        state: stateFrom(Boolean(profile.dateOfBirth)),
      },
      {
        key: 'contact',
        label: 'Contact details on record',
        detail: profile.mobileNumber ? `Mobile number: ${profile.mobileNumber}` : 'No mobile number declared.',
        state: stateFrom(Boolean(profile.mobileNumber)),
      },
      {
        key: 'academics',
        label: 'Course and year level declared',
        detail: profile.course || yearLevel
          ? `${profile.course || 'Course not set'} · ${yearLevel || 'Year level not set'}`
          : 'No academic details declared.',
        state: stateFrom(Boolean(profile.course && yearLevel)),
      },
      {
        key: 'gwa',
        label: minGwa === null ? 'General weighted average on record' : `GWA meets the ${minGwa.toFixed(2)} program requirement`,
        detail: hasGwa
          ? `Declared GWA: ${profile.gwa}${minGwa === null ? '' : gwaValue <= minGwa ? ' — within the allowed range' : ' — higher than the allowed maximum'}`
          : 'No GWA declared on the application.',
        state: hasGwa ? (minGwa === null ? 'pass' : stateFrom(gwaValue <= minGwa)) : 'unknown',
      },
      {
        key: 'school',
        label: 'School eligibility',
        detail: eligibleSchools.length
          ? schoolListed
            ? `${application.school} is on the eligible school list`
            : `${application.school || 'School not set'} is not on the eligible school list`
          : 'No eligible school list is configured for this program.',
        state: schoolListed === null ? 'unknown' : stateFrom(schoolListed),
      },
      {
        key: 'documents-uploaded',
        label: 'All required documents uploaded',
        detail: `${uploadedCount} of ${docRows.length} document slots have a file`,
        state: stateFrom(docRows.length > 0 && uploadedCount === docRows.length),
      },
      {
        key: 'documents-verified',
        label: 'All uploaded documents verified',
        detail: `${verifiedCount} of ${uploadedCount} uploaded documents verified`,
        state: uploadedCount === 0 ? 'unknown' : stateFrom(verifiedCount === uploadedCount),
      },
    ];
  }, [application, programConfig, uploadedCount, verifiedCount, docRows.length]);

  // The activity feed is built from the record's own timestamps — no events
  // are stored separately, so nothing is shown that didn't happen.
  const activity = useMemo<ActivityEntry[]>(() => {
    if (!application) return [];
    const entries: ActivityEntry[] = [{
      key: 'created',
      icon: 'plus',
      title: 'Application created',
      detail: `${application.student?.name || 'The student'} started this application.`,
      date: application.createdAt,
    }];

    if (application.submittedAt) {
      entries.push({
        key: 'submitted',
        icon: 'send',
        title: 'Submitted for review',
        detail: 'The application entered the City Office review queue.',
        date: application.submittedAt,
      });
    }

    scopedDocuments.forEach(document => {
      const replaced = Boolean(document.updatedAt) && document.updatedAt !== document.createdAt;
      entries.push({
        key: `document-${document._id}`,
        icon: 'file-text',
        title: `${replaced ? 'Document re-uploaded' : 'Document uploaded'}: ${document.type}`,
        detail: `${document.originalName} — ${DOC_STATUS[documentViewStatus(document)].label}`,
        date: (replaced ? document.updatedAt : document.createdAt) as string,
      });
    });

    if (application.reviewedAt) {
      entries.push({
        key: 'reviewed',
        icon: application.status === 'approved' ? 'check-circle' : application.status === 'rejected' ? 'x-circle' : 'clock',
        title: `Marked as ${STATUS_LABEL[application.status] || application.status}`,
        detail: `${application.reviewedBy?.name ? `Decided by ${application.reviewedBy.name}` : 'Decided by the City Office'}${application.remarks ? ` — ${application.remarks}` : ''}`,
        date: application.reviewedAt,
      });
    }

    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [application, scopedDocuments]);

  const passedChecks = checks.filter(check => check.state === 'pass').length;
  const attentionChecks = checks.filter(check => check.state === 'fail').length;

  const openDecision = (kind: Decision) => {
    setDecision(kind);
    setRemarkText('');
    setFlagged([]);
    setModalError('');
  };

  const toggleFlagged = (documentId: string) => {
    setFlagged(current => current.includes(documentId) ? current.filter(item => item !== documentId) : [...current, documentId]);
  };

  const submitDecision = async () => {
    if (!id || !decision) return;
    const note = remarkText.trim();
    if (decision === 'rejected' && !note) {
      setModalError('Add a reason so the student knows why the application was rejected.');
      return;
    }
    if (decision === 'additional_requirements' && !note) {
      setModalError('Describe which documents are missing or need to be replaced.');
      return;
    }

    setSaving(true);
    setModalError('');
    try {
      const result = await api<{ flaggedDocuments: number }>(`/applications/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          decision,
          remarks: note,
          documentIds: decision === 'additional_requirements' ? flagged : undefined,
        }),
      });
      const name = application?.student?.name || 'The student';
      setNotice(decision === 'approved'
        ? { kind: 'success', text: `${name}'s application is approved. The decision is now visible in the student portal.` }
        : decision === 'rejected'
          ? { kind: 'danger', text: `${name}'s application is rejected and the reason was sent to the student portal.` }
          : { kind: 'warning', text: `A request for additional documents was sent to ${name}${result.flaggedDocuments ? ` with ${result.flaggedDocuments} document${result.flaggedDocuments === 1 ? '' : 's'} marked for replacement` : ''}.` });
      setDecision(null);
      await load();
    } catch (requestError) {
      setModalError(requestError instanceof Error ? requestError.message : 'Unable to save the decision.');
    } finally {
      setSaving(false);
    }
  };

  const openPreview = (row: DocRow) => {
    if (!row.document) return;
    setPreview(row);
    setPreviewRemarks(row.document.remarks || '');
    setModalError('');
  };

  const reviewDocument = async (nextStatus: 'verified' | 'rejected') => {
    const document = preview?.document;
    if (!document) return;
    setSaving(true);
    setModalError('');
    try {
      const result = await api<{ document: DocumentRecord }>(`/documents/${document._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, remarks: previewRemarks.trim() }),
      });
      setDocuments(current => current.map(item => (item._id === document._id ? { ...item, ...result.document } : item)));
      setNotice(nextStatus === 'verified'
        ? { kind: 'success', text: `${document.type} is marked as verified.` }
        : { kind: 'warning', text: `${document.type} is marked as needing a replacement. Send the student instructions with “Request Docs” so they are notified.` });
      setPreview(null);
    } catch (requestError) {
      setModalError(requestError instanceof Error ? requestError.message : 'Unable to update the document.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading application…</div>;

  if (!application) {
    return (
      <div className="py-16 text-center">
        <div className="text-sm text-red-700">{error || 'Application not found.'}</div>
        <Link to="/city/applications" className="inline-block mt-4 text-sm text-[#163A63] hover:underline">Back to applications</Link>
      </div>
    );
  }

  // A draft is the student's unfinished work — the City Office reviews an
  // application only after it has been submitted. The Applications list hides
  // drafts, so this covers a direct visit to the URL (or an old bookmark): the
  // record's data is not rendered and no decision can be made from here.
  if (application.status === 'draft') {
    return (
      <div className="py-16 text-center">
        <span className="mx-auto w-12 h-12 rounded-2xl bg-[#F6F7F9] flex items-center justify-center mb-3 text-[#9CA3AF]">
          <Icon name="clock" size={20} />
        </span>
        <h1 className="text-lg text-[#1F2937]" style={{ fontWeight: 700 }}>Application not submitted yet</h1>
        <p className="text-sm text-[#6B7280] mt-1.5 max-w-md mx-auto">
          {application.student?.name || 'This student'} is still working on this application. It enters the review queue the moment the student submits it.
        </p>
        <Link to="/city/applications" className="inline-block mt-4 text-sm text-[#163A63] hover:underline">Back to applications</Link>
      </div>
    );
  }

  const studentName = application.student?.name || 'Unknown student';
  const displayId = applicationDisplayId(application);
  const isRenewal = application.status === 'renewal';
  const heroStatus = HERO_STATUS[application.status] || { label: STATUS_LABEL[application.status] || application.status, className: 'bg-white/10 text-white/70 border-white/20' };
  const decided = application.status === 'approved' || application.status === 'rejected';
  const programLine = [
    programConfig?.programName || application.program,
    application.barangay?.name ? `Brgy. ${application.barangay.name}` : '',
    application.school,
  ].filter(Boolean).join(' · ') || 'School not provided';

  const heroFields = [
    { label: 'App. Date', value: formatDay(application.submittedAt || application.createdAt) },
    { label: 'App. ID', value: displayId },
    { label: 'School', value: application.school || 'Not provided' },
    { label: 'GWA', value: application.applicant?.gwa || 'Not provided' },
  ];

  const personalRows = [
    { label: 'Full Name', value: studentName === 'Unknown student' ? '' : studentName },
    { label: 'Date of Birth', value: formatLongDay(application.applicant?.dateOfBirth) },
    { label: 'Barangay', value: application.barangay?.name || '' },
    { label: 'City', value: application.applicant?.city || '' },
  ];

  const academicRows = [
    { label: 'University', value: application.university || application.school || '' },
    { label: 'Course', value: application.applicant?.course || '' },
    { label: 'Year Level', value: displayYearLevel(application.applicant?.yearLevel) },
    { label: 'GWA', value: application.applicant?.gwa || '' },
  ];

  const noticeStyle = notice?.kind === 'success'
    ? 'bg-green-50 border-green-100 text-[#22A06B]'
    : notice?.kind === 'danger'
      ? 'bg-red-50 border-red-100 text-[#DC2626]'
      : 'bg-amber-50 border-amber-100 text-[#92400E]';

  const decisionTitle: Record<Decision, string> = {
    approved: 'Approve application',
    rejected: 'Reject application',
    additional_requirements: 'Request additional documents',
  };

  return (
    <div>
      {/* Header — breadcrumb, title and the three review actions */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav className="flex items-center gap-1.5 text-xs text-[#6B7280] mb-1">
            <span>City Office</span>
            <span>/</span>
            <Link to={isRenewal ? '/city/renewals' : '/city/applications'} className="hover:text-[#163A63]">
              {isRenewal ? 'Renewals' : 'Applications'}
            </Link>
            <span>/</span>
            <span className="text-[#1F2937]">#{displayId}</span>
          </nav>
          <h1 className="text-xl font-700 text-[#1F2937]" style={{ fontWeight: 700 }}>
            {isRenewal ? 'Renewal' : 'Application'} #{displayId}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => openDecision('rejected')}
            disabled={saving || decided}
            title={decided ? 'This application already has a final decision. Use “Request Docs” to reopen it.' : 'Reject this application'}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#FCA5A5] bg-white text-sm text-[#DC2626] hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontWeight: 600 }}
          >
            <Icon name="x" size={14} /> Reject
          </button>
          <button
            onClick={() => openDecision('additional_requirements')}
            disabled={saving}
            title="Ask the student for missing or replacement documents"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#FCD34D] bg-white text-sm text-[#D97706] hover:bg-amber-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontWeight: 600 }}
          >
            <Icon name="clock" size={14} /> Request Docs
          </button>
          <button
            onClick={() => openDecision('approved')}
            disabled={saving || decided}
            title={decided ? 'This application already has a final decision.' : 'Approve this application'}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#22A06B] text-sm text-white hover:bg-[#1B8457] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontWeight: 600 }}
          >
            <Icon name="check" size={15} /> Approve
          </button>
        </div>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className={`mb-4 rounded-xl px-4 py-3 text-sm border ${noticeStyle}`}>{notice.text}</div>}

      {/* Applicant hero */}
      <div className="bg-[#0B1F3A] rounded-2xl px-6 py-5 mb-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-full bg-[#163A63] border border-white/20 flex items-center justify-center flex-shrink-0 text-lg" style={{ fontWeight: 700 }}>
              {initialsOf(studentName)}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl leading-tight" style={{ fontWeight: 700 }}>{studentName}</h2>
              <p className="text-white/60 text-sm mt-1">{programLine}</p>
              <span className={`inline-flex items-center gap-1.5 mt-2.5 px-3 py-1 rounded-full border text-xs font-medium ${heroStatus.className}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {heroStatus.label}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-3">
            {heroFields.map(field => (
              <div key={field.label} className="min-w-[110px]">
                <div className="text-xs text-white/50">{field.label}</div>
                <div className="text-sm mt-0.5" style={{ fontWeight: 600 }}>{field.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-[#F6F7F9] rounded-xl p-1 w-fit overflow-x-auto">
        {TABS.map(item => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`px-4 py-2 rounded-lg text-sm transition-all whitespace-nowrap capitalize ${
              tab === item.key
                ? 'bg-white shadow-sm text-[#0B1F3A]'
                : 'text-[#6B7280] hover:text-[#1F2937]'
            }`}
            style={{ fontWeight: tab === item.key ? 600 : 500 }}
          >
            {item.label}
            {item.key === 'documents' && uploadedCount < docRows.length && (
              <span className="ml-2 text-xs text-[#D97706]">{uploadedCount}/{docRows.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div>
          <div className="grid md:grid-cols-2 gap-5">
            <InfoCard title="Personal Information" rows={personalRows} />
            <InfoCard title="Academic Information" rows={academicRows} />
          </div>
          {application.remarks && (
            <div className="mt-5 bg-white rounded-2xl border border-[#E5E7EB] px-6 py-5">
              <h2 className="text-sm font-700 text-[#1F2937] mb-1.5" style={{ fontWeight: 700 }}>Latest Review Remarks</h2>
              <p className="text-sm text-[#6B7280]">{application.remarks}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-700 text-[#1F2937]" style={{ fontWeight: 700 }}>Required Documents</h2>
            <span className="text-xs text-[#6B7280]">
              {uploadedCount} of {docRows.length} uploaded · {verifiedCount} verified
            </span>
          </div>
          <div className="divide-y divide-[#E5E7EB]">
            {docRows.map(row => (
              <div key={row.key} className="flex items-center gap-4 px-5 py-4">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${row.document ? 'bg-[#F0F4FA] text-[#163A63]' : 'bg-[#F6F7F9] text-[#9CA3AF]'}`}>
                  <Icon name="file-text" size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#1F2937] truncate" style={{ fontWeight: 600 }}>{row.label}</div>
                  <div className="text-xs text-[#9CA3AF] truncate">
                    {row.document
                      ? `${row.document.originalName} · Uploaded ${formatDay(row.document.createdAt)}`
                      : 'No file submitted for this document'}
                  </div>
                </div>
                <div className="flex items-center gap-5 flex-shrink-0">
                  <DocStatusLabel status={documentViewStatus(row.document)} />
                  <button
                    onClick={() => openPreview(row)}
                    disabled={!row.document || saving}
                    title={row.document ? 'Open and review this document' : 'No document uploaded yet'}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[#6B7280] hover:bg-[#F6F7F9] hover:text-[#163A63] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Icon name="eye" size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'eligibility' && (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB] flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-700 text-[#1F2937]" style={{ fontWeight: 700 }}>Eligibility Checks</h2>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                Computed from the details recorded on this application{programConfig ? ` and the “${programConfig.programName}” program rules` : ''}.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-[#22A06B]" style={{ fontWeight: 600 }}>{passedChecks} met</span>
              {attentionChecks > 0 && <span className="text-[#DC2626]" style={{ fontWeight: 600 }}>{attentionChecks} need attention</span>}
            </div>
          </div>
          <div className="divide-y divide-[#E5E7EB]">
            {checks.map(check => {
              const style = CHECK_ICON[check.state];
              return (
                <div key={check.key} className="flex items-start gap-4 px-5 py-4">
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${style.wrap}`}>
                    <Icon name={style.name} size={16} className={style.className} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{check.label}</div>
                    <div className="text-xs text-[#6B7280] mt-0.5">{check.detail}</div>
                  </div>
                  <span
                    className={`text-xs flex-shrink-0 ${check.state === 'pass' ? 'text-[#22A06B]' : check.state === 'fail' ? 'text-[#DC2626]' : 'text-[#D97706]'}`}
                    style={{ fontWeight: 600 }}
                  >
                    {check.state === 'pass' ? 'Met' : check.state === 'fail' ? 'Needs attention' : 'Waiting'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <h2 className="text-sm font-700 text-[#1F2937]" style={{ fontWeight: 700 }}>Activity</h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">Events recorded on this application, newest first.</p>
          </div>
          <div className="divide-y divide-[#E5E7EB]">
            {activity.map(entry => (
              <div key={entry.key} className="flex items-start gap-3 px-5 py-4">
                <ActivityStart icon={entry.icon} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{entry.title}</div>
                  <div className="text-xs text-[#6B7280] mt-0.5">{entry.detail}</div>
                </div>
                <span className="text-xs text-[#9CA3AF] flex-shrink-0">{formatDay(entry.date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decision modal — Approve / Reject / Request Docs */}
      {decision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] sticky top-0 bg-white">
              <h2 className="text-sm font-700 text-[#1F2937]" style={{ fontWeight: 700 }}>{decisionTitle[decision]}</h2>
              <button onClick={() => setDecision(null)} disabled={saving} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#F6F7F9] text-[#6B7280]">
                <Icon name="x" size={15} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-[#6B7280]">
                {decision === 'approved'
                  ? `Approving records the decision on application #${displayId} and notifies ${studentName} in the student portal.`
                  : decision === 'rejected'
                    ? `Rejecting closes application #${displayId}. ${studentName} is notified with the reason you write below.`
                    : `The application returns to review and ${studentName} is asked for the documents you flag.`}
              </p>

              {decision === 'additional_requirements' && (
                <div>
                  <div className="text-xs text-[#6B7280] mb-1.5">Documents to flag as needing a replacement</div>
                  <div className="border border-[#E5E7EB] rounded-xl divide-y divide-[#E5E7EB] max-h-56 overflow-y-auto">
                    {docRows.map(row => (
                      <label
                        key={row.key}
                        className={`flex items-center gap-3 px-3.5 py-2.5 ${row.document ? 'cursor-pointer hover:bg-[#F6F7F9]' : 'opacity-60'}`}
                      >
                        <input
                          type="checkbox"
                          disabled={!row.document}
                          checked={Boolean(row.document) && flagged.includes(row.document?._id || '')}
                          onChange={() => { if (row.document) toggleFlagged(row.document._id); }}
                          className="h-4 w-4 rounded border-[#D1D5DB] text-[#163A63] focus:ring-[#163A63]"
                        />
                        <span className="flex-1 min-w-0 text-xs text-[#1F2937] truncate">{row.label}</span>
                        <DocStatusLabel status={documentViewStatus(row.document)} />
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-[#9CA3AF] mt-1.5">
                    A slot with no file cannot be flagged — mention it in the remarks instead so the student knows to upload it.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs text-[#6B7280] mb-1.5">
                  {decision === 'approved' ? 'Remarks (optional)' : 'Remarks (sent to the student)'}
                </label>
                <textarea
                  value={remarkText}
                  onChange={event => setRemarkText(event.target.value)}
                  rows={3}
                  placeholder={
                    decision === 'approved'
                      ? 'Anything the student should know about their approval'
                      : decision === 'rejected'
                        ? 'Reason for the rejection'
                        : 'Which documents are missing and what to resubmit'
                  }
                  className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]"
                />
              </div>

              {modalError && (
                <div className="text-sm text-red-600 flex items-center gap-2">
                  <Icon name="alert-circle" size={14} />{modalError}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDecision(null)}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl border border-[#E5E7EB] text-sm text-[#6B7280] hover:bg-[#F6F7F9] disabled:opacity-40"
                  style={{ fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => setConfirmDecisionOpen(true)}
                  disabled={saving}
                  className={`px-4 py-2.5 rounded-xl text-sm text-white disabled:opacity-40 ${
                    decision === 'approved' ? 'bg-[#22A06B] hover:bg-[#1B8457]'
                      : decision === 'rejected' ? 'bg-[#DC2626] hover:bg-[#B91C1C]'
                        : 'bg-[#D97706] hover:bg-[#B45309]'
                  }`}
                  style={{ fontWeight: 600 }}
                >
                  {saving ? 'Saving…' : decision === 'approved' ? 'Approve application' : decision === 'rejected' ? 'Reject application' : 'Send request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document preview + review modal */}
      {preview?.document && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#E5E7EB] sticky top-0 bg-white">
              <div className="min-w-0">
                <h2 className="text-sm font-700 text-[#1F2937] truncate" style={{ fontWeight: 700 }}>{preview.label}</h2>
                <p className="text-xs text-[#9CA3AF] truncate">
                  {preview.document.originalName} · Uploaded {formatDay(preview.document.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <DocStatusLabel status={documentViewStatus(preview.document)} />
                <button onClick={() => setPreview(null)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#F6F7F9] text-[#6B7280]">
                  <Icon name="x" size={15} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {isImageMime(preview.document.mimeType) ? (
                <PrivateDocumentImage
                  documentId={preview.document._id}
                  alt={preview.document.originalName}
                  className="w-full max-h-[30vh] object-contain rounded-xl border border-[#E5E7EB] bg-[#F6F7F9]"
                />
              ) : (
                <div className="rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] p-8 text-center">
                  <Icon name="file-text" size={26} className="mx-auto text-[#9CA3AF]" />
                  <p className="text-xs text-[#6B7280] mt-2">This file type cannot be previewed inline.</p>
                </div>
              )}

              <PrivateFileLink
                documentId={preview.document._id}
                className="inline-flex items-center gap-2 text-sm text-[#163A63] hover:underline"
              >
                <Icon name="external-link" size={14} /> Open the uploaded file in a new tab
              </PrivateFileLink>

              <div>
                <label className="block text-xs text-[#6B7280] mb-1.5">Remarks for the student</label>
                <textarea
                  value={previewRemarks}
                  onChange={event => setPreviewRemarks(event.target.value)}
                  rows={2}
                  placeholder="Optional — saved on the document and shown in the student portal"
                  className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2.5 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]"
                />
              </div>

              {modalError && (
                <div className="text-sm text-red-600 flex items-center gap-2">
                  <Icon name="alert-circle" size={14} />{modalError}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  onClick={() => reviewDocument('rejected')}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl border border-[#FDBA74] text-sm text-[#EA580C] hover:bg-orange-50 disabled:opacity-40"
                  style={{ fontWeight: 600 }}
                >
                  Needs replacement
                </button>
                <button
                  onClick={() => reviewDocument('verified')}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl bg-[#22A06B] text-sm text-white hover:bg-[#1B8457] disabled:opacity-40"
                  style={{ fontWeight: 600 }}
                >
                  {saving ? 'Saving…' : 'Verify document'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmDecisionOpen && decision !== null}
        title={decision === 'approved' ? 'Approve application?' : decision === 'rejected' ? 'Reject application?' : 'Request additional documents?'}
        message={decision === 'approved' ? 'Do you want to approve this application and notify the student?' : decision === 'rejected' ? 'Do you want to reject this application? The student will receive the reason you entered.' : 'Do you want to send this request to the student?'}
        confirmLabel={decision === 'approved' ? 'Approve' : decision === 'rejected' ? 'Reject' : 'Send Request'}
        danger={decision === 'rejected'}
        loading={saving}
        onCancel={() => setConfirmDecisionOpen(false)}
        onConfirm={() => { setConfirmDecisionOpen(false); return submitDecision(); }}
      />
    </div>
  );
}