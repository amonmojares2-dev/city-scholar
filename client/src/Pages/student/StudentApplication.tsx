import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Icon from "../../components/Icon";
import PageHeader from "../../components/PageHeader";
import { api } from "../../lib/api";
import { docFileUrl, isImageMime } from "../../lib/docUrl";

interface AppDoc {
    _id: string;
    type: string;
    originalName: string;
    filename?: string;
    mimeType?: string;
    path: string;
    status: "pending" | "verified" | "rejected";
}

interface App {
    _id: string;
    status: string;
    program: string;
    school: string;
    applicant: {
        studentId?: string;
        parentName?: string;
        parentRelationship?: string;
        parentMobile?: string;
        dateOfBirth?: string;
        sex?: string;
        civilStatus?: string;
        nationality?: string;
        mobileNumber?: string;
        address?: string;
        city?: string;
        zipCode?: string;
        course?: string;
        yearLevel?: string;
        academicTerm?: string;
        gwa?: string;
        unitsEnrolled?: string;
        schoolAddress?: string;
        schoolType?: string;
        schoolYear?: string;
    };
    submittedAt: string | null;
    student: { _id: string; name: string; email: string } | null;
}

const DOC_TYPES = [
    { key: "Certificate of Residency (Student)", label: "Certificate of Residency (Student)", required: true },
    { key: "Certificate of Indigency (Student)", label: "Certificate of Indigency (Student)", required: true },
    { key: "Certificate of Residency (Parent/Guardian)", label: "Certificate of Residency (Parent/Guardian)", required: true },
    { key: "Certificate of Indigency (Parent/Guardian)", label: "Certificate of Indigency (Parent/Guardian)", required: true },
    { key: "Certificate of Matriculation", label: "Certificate of Matriculation", required: true },
    { key: "Report Card (Grade 12)", label: "Grade 12 Report Card", required: true },
    { key: "School ID (Current)", label: "Current School ID", required: true },
    { key: "Parent Valid ID", label: "Parent's Valid ID", required: true },
];

const fmt = (iso: string | null | undefined) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
};

export default function StudentApplication() {
        const [app, setApp] = useState<App | null>(null);
    const [docs, setDocs] = useState<AppDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [form, setForm] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [savedMsg, setSavedMsg] = useState("");
    const [uploadFor, setUploadFor] = useState<string | null>(null);


    const refresh = useCallback(async () => {
        setLoading(true);
        setErr("");
        try {
            const data = await api<{ success: boolean; application: App | null; documents: AppDoc[] }>("/student/application/documents");
            setApp(data.application ?? null);
            setDocs(data.documents ?? []);
            if (data.application) {
                const p = data.application.applicant ?? {};
                setForm({
                    studentId: p.studentId ?? "",
                    parentName: p.parentName ?? "",
                    parentRelationship: p.parentRelationship ?? "",
                    parentMobile: p.parentMobile ?? "",
                    fullName: data.application.student?.name ?? "",
                    email: data.application.student?.email ?? "",
                    mobile: p.mobileNumber ?? "",
                    birthDate: p.dateOfBirth ?? "",
                    sex: p.sex ?? "",
                    civilStatus: p.civilStatus ?? "",
                    nationality: p.nationality ?? "",
                    address: p.address ?? "",
                    city: p.city ?? "",
                    zipCode: p.zipCode ?? "",
                    schoolName: data.application.school ?? "",
                    schoolAddress: p.schoolAddress ?? "",
                    schoolType: p.schoolType ?? "",
                    course: p.course ?? "",
                    yearLevel: p.yearLevel ?? "",
                    academicTerm: p.academicTerm ?? "",
                    schoolYear: p.schoolYear ?? "",
                    gwa: p.gwa ?? "",
                    unitsEnrolled: p.unitsEnrolled ?? "",
                    program: data.application.program ?? "",
                });
            } else {
                setForm({});
            }
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Unable to load your application.");
            setApp(null);
            setDocs([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const set = (f: string, v: string) => { setForm(p => ({ ...p, [f]: v })); setSaved(false); };

    const requiredDocs = DOC_TYPES.filter(d => d.required);
    const allRequiredPresent = requiredDocs.every(d => docs.some(doc => doc.type === d.key));
    const submitted = app && app.status !== "draft";

    const doSave = useCallback(async () => {
        if (!app) return;
        setSaving(true);
        setSaved(false);
        setSavedMsg("");
        try {
            const body = {
                fullName: form.fullName || undefined,
                applicant: {
                                        studentId: form.studentId || undefined,
                    dateOfBirth: form.birthDate || undefined,
                    sex: form.sex || undefined,
                    civilStatus: form.civilStatus || undefined,
                    nationality: form.nationality || undefined,
                    mobileNumber: form.mobile || undefined,
                    address: form.address || undefined,
                    city: form.city || undefined,
                    zipCode: form.zipCode || undefined,
                    course: form.course || undefined,
                    yearLevel: form.yearLevel || undefined,
                    academicTerm: form.academicTerm || undefined,
                    gwa: form.gwa || undefined,
                    unitsEnrolled: form.unitsEnrolled || undefined,
                    schoolAddress: form.schoolAddress || undefined,
                    schoolType: form.schoolType || undefined,
                    schoolYear: form.schoolYear || undefined,
                },
                school: form.schoolName || undefined,
                program: form.program || undefined,
            };
                        const data = await api<{ success: boolean; application: App }>("/student/application", { method: "PATCH", body: JSON.stringify(body) });
            setApp(data.application);
            setSaved(true);
            setSavedMsg("Application saved.");
        } catch (e) {
            setSavedMsg(e instanceof Error ? e.message : "Unable to save.");
        } finally {
            setSaving(false);
        }
    }, [app, form]);

    const doSubmit = useCallback(async () => {
        if (!app) return;
        setSaving(true);
        setSaved(false);
        setSavedMsg("");
        try {
                        const data = await api<{ success: boolean; application: App }>("/student/application", {
                method: "PATCH",
                body: JSON.stringify({ status: "submitted", submittedAt: new Date().toISOString() }),
            });
            setApp(data.application);
            setSaved(true);
            setSavedMsg("Your application has been submitted for review.");
        } catch (e) {
            setSavedMsg(e instanceof Error ? e.message : "Unable to submit.");
        } finally {
            setSaving(false);
        }
        }, [app]);

    const doc = (key: string) => docs.find(d => d.type === key);

    if (submitted && app) {
        return (
            <div className="max-w-4xl mx-auto p-6" style={{ minHeight: "100vh", background: "#F6F7F9" }}>
                <PageHeader title="Application" subtitle="City Scholarship Program Application" breadcrumb={["Student Portal", "Application"]} />

                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-5">
                        <Icon name="check-circle" size={40} className="text-[#22A06B]" />
                    </div>
                    <h2 className="text-xl font-800 text-[#0B1F3A] mb-2" style={{ fontWeight: 800 }}>Application Submitted</h2>
                    <p className="text-sm text-[#6B7280] max-w-sm mb-6">
                        Your application has been received. The City Scholarship Office will review your documents and notify you of the outcome.
                    </p>

                    <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 text-left max-w-lg w-full shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-600 text-[#6B7280] uppercase tracking-wide">Summary</span>
                            <span className="text-xs text-[#22A06B] font-semibold">{app.status}</span>
                        </div>
                        <div className="space-y-3 text-sm">
                            <div>
                                <span className="text-[#6B7280]">Applicant</span>
                                <p className="font-semibold text-[#1F2937]">{app.student?.name}</p>
                                <p className="text-[#6B7280]">{app.student?.email}</p>
                            </div>
                            <div>
                                <span className="text-[#6B7280]">Program</span>
                                <p className="font-semibold text-[#1F2937]">{app.program || "\u2014"}</p>
                            </div>
                            <div>
                                <span className="text-[#6B7280]">School</span>
                                <p className="font-semibold text-[#1F2937]">{app.school || "\u2014"}</p>
                            </div>
                            <div>
                                <span className="text-[#6B7280]">Submitted</span>
                                <p className="font-semibold text-[#1F2937]">{fmt(app.submittedAt)}</p>
                            </div>
                        </div>
                        <div className="mt-5 border-t border-[#E5E7EB] pt-4">
                            <p className="text-xs text-[#6B7280] mb-2">Uploaded documents ({docs.length})</p>
                            {docs.length === 0 ? (
                                <p className="text-xs text-[#9CA3AF]">No documents uploaded yet.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {docs.map(d => (
                                        <li key={d._id} className="flex items-center justify-between text-xs">
                                            <span className="text-[#374151] truncate max-w-[240px]">{d.originalName}</span>
                                            <span className="text-[#6B7280] flex-shrink-0">{d.status}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="mt-5">
                            <a
                                href="/student/documents"
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                                style={{ background: "#F6F7F9", color: "#0B1F3A" }}
                            >
                                <Icon name="file-text" size={15} />
                                Manage Documents
                            </a>
                        </div>
                    </div>

                    <div className="mt-6 bg-[#F6F7F9] rounded-2xl p-5 text-sm text-[#6B7280] max-w-sm w-full text-left">
                        <div className="font-600 text-[#1F2937] mb-2" style={{ fontWeight: 600 }}>What happens next?</div>
                        <ol className="space-y-2 list-decimal list-inside">
                            <li>Barangay office verifies your residency documents</li>
                            <li>City office reviews your complete application</li>
                            <li>You will be notified of the decision via message</li>
                        </ol>
                    </div>
                </div>
            </div>
        );
    }

// ============================================================
// Student Application Page
// Reads / writes a real Application document. The form state is
// a flat Record<string,string> keyed by Applicant subdocument
// field names (see interface App above). When no application
// exists, the student can create one here; when it exists as a
// draft, they can edit it; once submitted, the view switches to
// the read-only submitted state (rendered below this marker).
// ============================================================

const inputCls =
    "w-full rounded-lg border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-sm text-[#0B1F3A] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#163A63] focus:border-[#163A63] transition";

const labelCls = "block text-sm font-medium text-[#374151] mb-1.5";

const btnBaseCls =
    "inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#163A63] focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed";

const primaryBtnCls = `${btnBaseCls} bg-[#163A63] text-white hover:bg-[#0B1F3A]`;
const outlineBtnCls = `${btnBaseCls} border border-[#E5E7EB] text-[#163A63] bg-white hover:bg-[#F0F4FA]`;

const LEFT_DOCS = DOC_TYPES.slice(0, 4);
const RIGHT_DOCS = DOC_TYPES.slice(4);

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="mb-5">
            <label className={labelCls}>{label}</label>
            {children}
        </div>
    );
}

function Grid({ children }: { children: ReactNode }) {
    return <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">{children}</div>;
}

function DocStatus({ doc }: { doc: AppDoc }) {
    const style =
        doc.status === "verified"
            ? "bg-green-100 text-green-700"
            : doc.status === "rejected"
            ? "bg-red-100 text-red-700"
            : "bg-amber-100 text-amber-700";
    return (
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${style}`}>
            {doc.status}
        </span>
    );
}

// Upload modal — fires on the real endpoint. File chosen here is
// stored on disk via multer and linked to the student's application.
function UploadModal({
    isOpen,
    docType,
    onClose,
    onUploaded,
}: {
    isOpen: boolean;
    docType: string | null;
    onClose: () => void;
    onUploaded: () => void;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!isOpen) {
            setFile(null);
            setError("");
        }
    }, [isOpen]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!file || !docType) return;
        setUploading(true);
        setError("");
        try {
            const form = new FormData();
            form.append("file", file);
            form.append("docType", docType);
            form.append("originalName", docType);
            await api<{ success: boolean; message: string; document: AppDoc }>(
                "/student/application/documents",
                { method: "POST", body: form }
            );
            onUploaded();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed.");
            setUploading(false);
        }
    };

    if (!isOpen || !docType) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-[#0B1F3A]">Upload: {docType}</h3>
                    <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#374151]">
                        <Icon name="x" size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div
                        onClick={() => fileRef.current?.click()}
                        className="border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition border-[#D1D5DB] hover:border-[#163A63] hover:bg-[#F0F4FA]"
                    >
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".jpg,.jpeg,.png"
                            hidden
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                            required
                        />
                        <Icon name="upload" size={28} className="mx-auto text-[#9CA3AF]" />
                        <p className="mt-2 text-sm text-[#6B7280]">
                            {file ? file.name : "Click to select (JPG or PNG)"}
                        </p>
                    </div>

                    {error && (
                        <div className="text-sm text-red-600 flex items-center gap-2">
                            <Icon name="alert-circle" size={14} />
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button type="button" onClick={onClose} className={outlineBtnCls}>
                            Cancel
                        </button>
                        <button type="submit" disabled={!file || uploading} className={primaryBtnCls}>
                            {uploading ? "Uploading…" : "Upload"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ============================================================
// FORM VIEW — renders when the application is not yet submitted.
// This is the editable application form + document upload modal.
// The submitted-state view lives above this point
// (if (submitted && app) { return ( ... ) }).
// ============================================================

    // Loading overlay while we fetch the student's application.
    if (loading) {
        return (
            <div className="max-w-4xl mx-auto p-6" style={{ minHeight: "100vh", background: "#F6F7F9" }}>
                <PageHeader title="Application" subtitle="City Scholarship Program Application" breadcrumb={["Student Portal", "Application"]} />
                <div className="bg-white rounded-2xl border border-[#E5E7EB] p-10 text-center">
                    <div className="flex flex-col items-center gap-3 text-[#6B7280]">
                        <Icon name="refresh" size={24} className="animate-spin" />
                        <span className="text-sm">Loading your application…</span>
                    </div>
                </div>
            </div>
        );
    }

    if (err) {
        return (
            <div className="max-w-4xl mx-auto p-6" style={{ minHeight: "100vh", background: "#F6F7F9" }}>
                <PageHeader title="Application" subtitle="City Scholarship Program Application" breadcrumb={["Student Portal", "Application"]} />
                <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 text-center">
                    <Icon name="alert-circle" size={32} className="mx-auto text-red-500 mb-3" />
                    <p className="text-sm text-[#6B7280] mb-4">{err}</p>
                    <button onClick={() => window.location.reload()} className={primaryBtnCls}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6" style={{ minHeight: "100vh", background: "#F6F7F9" }}>
            <PageHeader
                title="Application"
                subtitle="City Scholarship Program Application"
                breadcrumb={["Student Portal", "Application"]}
            />

            {/* Save / Submit status banner */}
            {savedMsg && (
                <div
                    className="mb-5 rounded-xl border px-4 py-3 text-sm flex items-center gap-2"
                    style={{
                        backgroundColor: saved ? "#ECFDF5" : "#FEF2F2",
                        borderColor: saved ? "#6EE7B7" : "#FECACA",
                        color: saved ? "#065F46" : "#991B1B",
                    }}
                >
                    <Icon name={saved ? "check-circle" : "alert-circle"} size={16} />
                    {savedMsg}
                </div>
            )}

            {/* Progress indicator */}
            <div className="mb-6">
                <div className="text-sm text-[#6B7280]">
                    Required documents uploaded: {docs.length}/{requiredDocs.length}
                </div>
            </div>

            <div className="space-y-8">
                {/* ── Personal Information ── */}
                <section>
                    <h3 className="text-lg font-bold text-[#0B1F3A] mb-4">Personal Information</h3>
                    <Grid>
                        <Field label="Full Name">
                            <input className={inputCls} value={form.fullName || ""} onChange={(e) => set("fullName", e.target.value)} placeholder="e.g. Juan Dela Cruz" required />
                        </Field>
                        <Field label="Student Number / ID">
                            <input className={inputCls} value={form.studentId || ""} onChange={(e) => set("studentId", e.target.value)} placeholder="e.g. 2024-000123" required />
                        </Field>
                        <Field label="Email Address">
                            <input className={inputCls} type="email" value={form.email || ""} readOnly required />
                        </Field>
                        <Field label="Mobile Number">
                            <input className={inputCls} value={form.mobile || ""} onChange={(e) => set("mobile", e.target.value)} placeholder="e.g. 09XXXXXXXXX" />
                        </Field>
                        <Field label="Birth Date">
                            <input className={inputCls} type="date" value={form.birthDate || ""} onChange={(e) => set("birthDate", e.target.value)} />
                        </Field>
                        <Field label="Sex">
                            <select className={inputCls} value={form.sex || ""} onChange={(e) => set("sex", e.target.value)}>
                                <option value="">Select…</option>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Other">Other</option>
                            </select>
                        </Field>
                        <Field label="Civil Status">
                            <select className={inputCls} value={form.civilStatus || ""} onChange={(e) => set("civilStatus", e.target.value)}>
                                <option value="">Select…</option>
                                <option value="Single">Single</option>
                                <option value="Married">Married</option>
                                <option value="Widowed">Widowed</option>
                                <option value="Divorced">Divorced</option>
                            </select>
                        </Field>
                        <Field label="Nationality">
                            <input className={inputCls} value={form.nationality || ""} onChange={(e) => set("nationality", e.target.value)} placeholder="e.g. Filipino" />
                        </Field>
                        <Field label="Complete Address">
                            <input className={inputCls} value={form.address || ""} onChange={(e) => set("address", e.target.value)} placeholder="House no., street, barangay" />
                        </Field>
                        <Field label="City / Municipality">
                            <input className={inputCls} value={form.city || ""} onChange={(e) => set("city", e.target.value)} />
                        </Field>
                        <Field label="Zip / Postal Code">
                            <input className={inputCls} value={form.zipCode || ""} onChange={(e) => set("zipCode", e.target.value)} />
                        </Field>
                                        </Grid>
                </section>

                {/* ── School Information ── */}
                <section>
                    <h3 className="text-lg font-bold text-[#0B1F3A] mb-4">School Information</h3>
                    <Grid>
                        <Field label="School Name">
                            <input className={inputCls} value={form.schoolName || ""} onChange={(e) => set("schoolName", e.target.value)} required />
                        </Field>
                        <Field label="School Address">
                            <input className={inputCls} value={form.schoolAddress || ""} onChange={(e) => set("schoolAddress", e.target.value)} />
                        </Field>
                        <Field label="School Type">
                            <select className={inputCls} value={form.schoolType || ""} onChange={(e) => set("schoolType", e.target.value)}>
                                <option value="">Select…</option>
                                <option value="Public">Public</option>
                                <option value="Private">Private</option>
                                <option value="State University">State University</option>
                            </select>
                        </Field>
                        <Field label="Course / Strand">
                            <input className={inputCls} value={form.course || ""} onChange={(e) => set("course", e.target.value)} placeholder="e.g. HUMSS, STEM, AB Communications" />
                        </Field>
                        <Field label="Year Level">
                            <select className={inputCls} value={form.yearLevel || ""} onChange={(e) => set("yearLevel", e.target.value)}>
                                <option value="">Select…</option>
                                <option value="Grade 11">Grade 11</option>
                                <option value="Grade 12">Grade 12</option>
                                <option value="1st Year">1st Year</option>
                                <option value="2nd Year">2nd Year</option>
                                <option value="3rd Year">3rd Year</option>
                                <option value="4th Year">4th Year</option>
                            </select>
                        </Field>
                        <Field label="Academic Term">
                            <select className={inputCls} value={form.academicTerm || ""} onChange={(e) => set("academicTerm", e.target.value)}>
                                <option value="">Select…</option>
                                <option value="1st Semester">1st Semester</option>
                                <option value="2nd Semester">2nd Semester</option>
                                <option value="Summer">Summer</option>
                            </select>
                        </Field>
                        <Field label="School Year">
                            <input className={inputCls} value={form.schoolYear || ""} onChange={(e) => set("schoolYear", e.target.value)} placeholder="e.g. 2024-2025" />
                        </Field>
                        <Field label="Current GWA">
                            <input className={inputCls} type="number" min="0" max="4" step="0.01" value={form.gwa || ""} onChange={(e) => set("gwa", e.target.value)} placeholder="e.g. 1.75" />
                        </Field>
                        <Field label="Units Enrolled">
                            <input className={inputCls} type="number" min="0" value={form.unitsEnrolled || ""} onChange={(e) => set("unitsEnrolled", e.target.value)} placeholder="e.g. 24" />
                        </Field>
                    </Grid>
                </section>
                                {/* ── Program Selection ── */}
                <section>
                    <h3 className="text-lg font-bold text-[#0B1F3A] mb-4">Program Selection</h3>
                    <Field label="Scholarship Program">
                        <input className={inputCls} value={form.program || ""} onChange={(e) => set("program", e.target.value)} placeholder="e.g. City Scholar Program" required />
                    </Field>
                </section>

                {/* ── Required Documents ── */}
                <section>
                    <h3 className="text-lg font-bold text-[#0B1F3A] mb-4">Required Documents</h3>
                    <p className="text-sm text-[#6B7280] mb-4">
                        Upload your documents. You must complete all required documents before submitting.
                    </p>

                    <div className="space-y-3">
                        {DOC_TYPES.map((d) => {
                            const existing = doc(d.key);
                            return (
                                <div key={d.key} className="flex items-center justify-between p-4 rounded-lg border border-[#E5E7EB]">
                                    <div className="flex items-center gap-3">
                                        <Icon name="file-text" size={18} className="text-[#9CA3AF]" />
                                        <div>
                                            <p className="font-500 text-[#0B1F3A]" style={{ fontWeight: 500 }}>{d.label}</p>
                                            <p className="text-xs text-[#6B7280]">{d.required ? "Required" : "Optional"}</p>
                                        </div>
                                    </div>

                                    {existing ? (
                                        <div className="flex items-center gap-3">
                                            {isImageMime(existing.mimeType) && docFileUrl(existing.filename) && (
                                                <a href={docFileUrl(existing.filename) as string} target="_blank" rel="noreferrer" title="Open full image">
                                                    <img
                                                        src={docFileUrl(existing.filename) as string}
                                                        alt={existing.originalName}
                                                        className="w-12 h-12 rounded-lg object-cover border border-[#E5E7EB]"
                                                    />
                                                </a>
                                            )}
                                            <span className="text-xs text-[#6B7280] truncate max-w-[180px]">{existing.originalName}</span>
                                            <DocStatus doc={existing} />
                                            <button
                                                onClick={() => setUploadFor(d.key)}
                                                className="text-xs text-[#163A63] font-medium hover:underline"
                                            >
                                                Replace
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setUploadFor(d.key)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#E5E7EB] text-[#163A63] hover:bg-[#F0F4FA] transition"
                                        >
                                            <Icon name="upload" size={13} />
                                            Upload
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* ── Action Buttons ── */}
                <section>
                    <div className="flex items-center justify-between pt-6 border-t border-[#E5E7EB]">
                        <div className="text-sm text-[#6B7280]">
                            {saved && <span className="text-green-600 font-medium">Saved</span>}
                        </div>
                        <div className="flex gap-3">
                            <button onClick={doSave} disabled={saving} className={outlineBtnCls}>
                                {saving ? "Saving…" : "Save Draft"}
                            </button>
                            <button
                                onClick={doSubmit}
                                disabled={saving || !allRequiredPresent}
                                className={primaryBtnCls}
                                style={{ backgroundColor: !allRequiredPresent ? "#9CA3AF" : "#163A63" }}
                            >
                                {saving ? "Submitting…" : "Submit Application"}
                            </button>
                        </div>
                    </div>
                </section>
            </div>

            {/* Upload Modal */}
            <UploadModal
                isOpen={uploadFor !== null}
                docType={uploadFor}
                onClose={() => setUploadFor(null)}
                onUploaded={refresh}
            />
        </div>
    );
}