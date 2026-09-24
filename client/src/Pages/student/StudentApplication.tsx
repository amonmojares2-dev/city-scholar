import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Icon from "../../components/Icon";
import PageHeader from "../../components/PageHeader";
import { api } from "../../lib/api";
import { docFileUrl, isImageMime, friendlyErrorMessage } from "../../lib/docUrl";
import { APPLICATION_DOCUMENT_TYPES } from "../../data/documentTypes";

// Document slots come from the shared list (Certificates of Residency /
// Indigency were removed from the application flow — see documentTypes.ts).
const DOC_TYPES = APPLICATION_DOCUMENT_TYPES;

interface AppDoc {
    _id: string;
    type: string;
    originalName: string;
    filename?: string;
    mimeType?: string;
    status: "pending" | "verified" | "rejected";
}

interface App {
    _id: string;
    status: string;
    school: string;
    // NOTE: `program` was removed from the Application form but is kept here
    // (optional, historical) so previously submitted applications still read.
    program?: string;
    applicant: {
        studentId?: string;
        parentName?: string;
        parentRelationship?: string;
        parentMobile?: string;
        dateOfBirth?: string;
        sex?: string;
        civilStatus?: string;
        // NOTE: `nationality`, `city`, `zipCode` were removed from the form
        // (kept optional for historical reads only — nothing new is written).
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

const fmt = (iso: string | null | undefined) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
};

// ============================================================
// Form helpers — module scope on purpose.
// These were previously declared INSIDE StudentApplication's body,
// which recreated them on every keystroke and forced React to
// remount each <Field>-wrapped <input>, stealing focus after a
// single character. Keep them here so their identity is stable.
// ============================================================

const inputCls =
    "w-full rounded-lg border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-sm text-[#0B1F3A] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#163A63] focus:border-[#163A63] transition";

const labelCls = "block text-sm font-medium text-[#374151] mb-1.5";

const errorCls = "mt-1.5 text-xs text-[#DC2626] flex items-center gap-1";

const inputErrorCls = " border-[#DC2626] focus:ring-[#DC2626] focus:border-[#DC2626]";

// Student Number: two digits - two digits - four digits - six digits,
// e.g. "03-01-2425-041702". Digits and dashes only.
const STUDENT_NO_RE = /^\d{2}-\d{2}-\d{4}-\d{6}$/;
// PH mobile: 11 digits starting with 09, e.g. 09XXXXXXXXX.
const MOBILE_RE = /^09\d{9}$/;

function validateStudentId(v: string): string {
    const t = (v || "").trim();
    if (!t) return "Student Number is required.";
    if (!STUDENT_NO_RE.test(t)) return "Format must be XX-XX-XXXX-XXXXXX (e.g. 03-01-2425-041702).";
    return "";
}

function validateMobile(v: string): string {
    const t = (v || "").trim();
    if (!t) return "Mobile Number is required.";
    if (!/^\d+$/.test(t)) return "Mobile Number must contain numbers only.";
    if (!MOBILE_RE.test(t)) return "Mobile Number must be 11 digits starting with 09 (e.g. 09XXXXXXXXX).";
    return "";
}

// Strip anything that is not a digit. Used for mobile onChange so letters /
// symbols can never be typed or pasted in. Pure function — no component
// identity involved, so it cannot reintroduce the focus-loss bug.
function digitsOnly(v: string): string {
    return (v || "").replace(/\D/g, "");
}

// Student Number may only contain digits and dashes. Everything else is
// blocked at the keystroke (see onStudentIdChange below) and surfaced
// immediately via blockedErr — never stored in form state.
function sanitizeStudentId(v: string): string {
    return (v || "").replace(/[^0-9-]/g, "").slice(0, 17);
}

const btnBaseCls =
    "inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#163A63] focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed";

const primaryBtnCls = `${btnBaseCls} bg-[#163A63] text-white hover:bg-[#0B1F3A]`;
const outlineBtnCls = `${btnBaseCls} border border-[#E5E7EB] text-[#163A63] bg-white hover:bg-[#F0F4FA]`;

function Field({ label, children, required, error }: { label: string; children: ReactNode; required?: boolean; error?: string }) {
    return (
        <div className="mb-5">
            <label className={labelCls}>
                {label}
                {required && <span className="text-[#DC2626] ml-1">*</span>}
            </label>
            {children}
            {error && (
                <p className={errorCls} role="alert">
                    <span aria-hidden="true">⚠</span> {error}
                </p>
            )}
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
    const [uploadError, setUploadError] = useState("");
    // Tracks which fields the user has interacted with so live (as-you-type)
    // errors never flash on initial load — only after the first keystroke /
    // blur, or after a submit attempt.
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [submitAttempted, setSubmitAttempted] = useState(false);
    // Transient "blocked keystroke" errors: shown IMMEDIATELY when the user
    // types (or pastes) a disallowed character that we refuse to store, e.g.
    // a letter in a numbers-only field. Rendered directly below the field
    // via the Field `error` prop so the student knows exactly what happened
    // and how to fix it.
    const [studentIdBlockedErr, setStudentIdBlockedErr] = useState("");
    const [mobileBlockedErr, setMobileBlockedErr] = useState("");

    

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
                    address: p.address ?? "",
                    schoolName: data.application.school ?? "",
                    schoolAddress: p.schoolAddress ?? "",
                    schoolType: p.schoolType ?? "",
                    course: p.course ?? "",
                    yearLevel: p.yearLevel ?? "",
                    academicTerm: p.academicTerm ?? "",
                    schoolYear: p.schoolYear ?? "",
                    gwa: p.gwa ?? "",
                    unitsEnrolled: p.unitsEnrolled ?? "",
                });
            } else {
                setForm({});
                // No application yet: auto-create an empty draft so the student
                // can start uploading documents immediately without first having
                // to fill in the School. School is only enforced at submission
                // time, not for drafts (see Application model).
                try {
                    const created = await api<{ success: boolean; application: App }>("/student/application", {
                        method: "POST",
                        body: JSON.stringify({}),
                    });
                    setApp(created.application);
                } catch (createErr) {
                    const msg = createErr instanceof Error ? createErr.message : "Unable to create application.";
                    // If the server already reports a draft exists (race condition),
                    // that's fine — retry the fetch.
                    if (msg.includes("already have a draft")) {
                        await refresh();
                        return;
                    }
                    setErr(friendlyErrorMessage(msg));
                    setApp(null);
                    setDocs([]);
                }
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : "Unable to load your application.";
            setErr(friendlyErrorMessage(message));
            setApp(null);
            setDocs([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const set = (f: string, v: string) => { setForm(p => ({ ...p, [f]: v })); setSaved(false); };

    const touch = (f: string) => setTouched(p => (p[f] ? p : { ...p, [f]: true }));

    // ── Immediate (as-you-type) validation wiring ──────────────────────
    // Student Number: allow only digits + dashes; block everything else at
    // the keystroke and show "Numbers only" style feedback immediately.
    // Mobile Number: digits only; block everything else and show the error
    // immediately. Both handlers mark the field touched so the derived
    // format error below the field also appears as they type.
    const onStudentIdChange = (raw: string) => {
        touch("studentId");
        if (/[^0-9-]/.test(raw)) {
            setStudentIdBlockedErr("Numbers only — Student Number may contain digits and dashes only.");
        } else {
            setStudentIdBlockedErr("");
        }
        set("studentId", sanitizeStudentId(raw));
    };

    const onMobileChange = (raw: string) => {
        touch("mobile");
        if (/[^0-9]/.test(raw)) {
            setMobileBlockedErr("Numbers only.");
        } else {
            setMobileBlockedErr("");
        }
        // Strip letters/symbols so they can never appear; cap at 11 digits.
        set("mobile", digitsOnly(raw).slice(0, 11));
    };

    // Derived live errors: shown once the field is touched (first keystroke)
    // or after a submit attempt — never on pristine initial load.
    const studentIdValue = form.studentId || "";
    const mobileValue = form.mobile || "";
    const showStudentIdErr = touched.studentId || submitAttempted;
    const showMobileErr = touched.mobile || submitAttempted;
    // Format error for Student Number: empty value defers to the "required"
    // message only after submit; while typing, show the dash-pattern hint so
    // the student sees the expected XX-XX-XXXX-XXXXXX format break/fix live.
    const studentIdFormatErr = !studentIdValue
        ? (submitAttempted ? "Student Number is required." : "")
        : (!STUDENT_NO_RE.test(studentIdValue.trim())
            ? "Format must be XX-XX-XXXX-XXXXXX (e.g. 03-01-2425-041702)."
            : "");
    const mobileFormatErr = !mobileValue
        ? (submitAttempted ? "Mobile Number is required." : "")
        : (!MOBILE_RE.test(mobileValue.trim())
            ? "Mobile Number must be 11 digits starting with 09 (e.g. 09XXXXXXXXX)."
            : "");
    const studentIdErr = studentIdBlockedErr || (showStudentIdErr ? studentIdFormatErr : "");
    const mobileErr = mobileBlockedErr || (showMobileErr ? mobileFormatErr : "");

    const requiredDocs = DOC_TYPES.filter(d => d.required);
    const allRequiredPresent = requiredDocs.every(d => docs.some(doc => doc.type === d.key));
    // Course / Strand is required client-side too (server enforces it as
    // well) so the submit button stays disabled until a value is picked.
    const coursePresent = Boolean((form.course || "").trim());
    const canSubmit = allRequiredPresent && coursePresent;
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
                    mobileNumber: form.mobile || undefined,
                    address: form.address || undefined,
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
        // Mark all validated fields touched so submit also reveals any
        // outstanding inline errors directly below each field.
        setSubmitAttempted(true);
        setTouched(p => ({ ...p, studentId: true, mobile: true, course: true }));
        const sidErr = validateStudentId(form.studentId || "");
        const mobErr = validateMobile(form.mobile || "");
        const courseErr = (form.course || "").trim() ? "" : "Course / Strand is required.";
        if (sidErr || mobErr || courseErr) {
            setStudentIdBlockedErr("");
            setMobileBlockedErr("");
            setSaved(false);
            setSavedMsg([sidErr, mobErr, courseErr].filter(Boolean).join(" "));
            return;
        }
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
        }, [app, form]);

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
                                <span className="text-[#6B7280]">Course / Strand</span>
                                <p className="font-semibold text-[#1F2937]">{app.applicant?.course || "\u2014"}</p>
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
// FORM VIEW — renders when the application is not yet submitted.
// Field/Grid/DocStatus helpers live at module scope above so their
// component identity stays stable while typing (see note there).
// ============================================================

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
            form.append("context", "application");
            await api<{ success: boolean; message: string; document: AppDoc }>(
                "/student/application/documents",
                { method: "POST", body: form }
            );
            onUploaded();
            onClose();
        } catch (err) {
            setError(friendlyErrorMessage(err instanceof Error ? err.message : "Upload failed."));
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
                        <Field label="Student Number / ID" required error={studentIdErr}>
                            <input
                                className={inputCls + (studentIdErr ? inputErrorCls : "")}
                                value={form.studentId || ""}
                                onChange={(e) => onStudentIdChange(e.target.value)}
                                onBlur={() => touch("studentId")}
                                placeholder="e.g. 03-01-2425-041702"
                                inputMode="text"
                                aria-invalid={Boolean(studentIdErr)}
                                required
                            />
                        </Field>
                        <Field label="Email Address">
                            <input className={inputCls} type="email" value={form.email || ""} readOnly required />
                        </Field>
                        <Field label="Mobile Number" required error={mobileErr}>
                            <input
                                className={inputCls + (mobileErr ? inputErrorCls : "")}
                                value={form.mobile || ""}
                                onChange={(e) => onMobileChange(e.target.value)}
                                onBlur={() => touch("mobile")}
                                placeholder="e.g. 09XXXXXXXXX"
                                inputMode="numeric"
                                aria-invalid={Boolean(mobileErr)}
                            />
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
                        <Field label="Complete Address">
                            <input className={inputCls} value={form.address || ""} onChange={(e) => set("address", e.target.value)} placeholder="House no., street, barangay" />
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
                        <Field label="Course / Strand" required>
                            <select
                                className={inputCls + (submitAttempted && !form.course ? inputErrorCls : "")}
                                value={form.course || ""}
                                onChange={(e) => set("course", e.target.value)}
                                onBlur={() => touch("course")}
                                aria-invalid={Boolean(submitAttempted && !form.course)}
                                required
                            >
                                <option value="">Select…</option>
                                {/* Senior High strands */}
                                <option value="STEM">STEM</option>
                                <option value="HUMSS">HUMSS</option>
                                <option value="ABM">ABM</option>
                                <option value="GAS">GAS</option>
                                <option value="TVL">TVL</option>
                                {/* College courses */}
                                <option value="BS Information Technology">BS Information Technology</option>
                                <option value="BS Computer Science">BS Computer Science</option>
                                <option value="BS Business Administration">BS Business Administration</option>
                                <option value="BS Accountancy">BS Accountancy</option>
                                <option value="BS Nursing">BS Nursing</option>
                                <option value="BS Education">BS Education</option>
                                <option value="BS Criminology">BS Criminology</option>
                                <option value="BS Psychology">BS Psychology</option>
                                <option value="BA Communication">BA Communication</option>
                                <option value="BEEd / BSEd">BEEd / BSEd</option>
                                <option value="BS Hospitality Management">BS Hospitality Management</option>
                                <option value="BS Tourism Management">BS Tourism Management</option>
                            </select>
                            {submitAttempted && !form.course && (
                                <p className={errorCls} role="alert">
                                    <span aria-hidden="true">⚠</span> Course / Strand is required.
                                </p>
                            )}
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
                                            {isImageMime(existing.mimeType) && docFileUrl(existing._id) && (
                                                <a href={docFileUrl(existing._id) as string} target="_blank" rel="noreferrer" title="Open full image">
                                                    <img
                                                        src={docFileUrl(existing._id) as string}
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
                                disabled={saving || !canSubmit}
                                className={primaryBtnCls}
                                style={{ backgroundColor: !canSubmit ? "#9CA3AF" : "#163A63" }}
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