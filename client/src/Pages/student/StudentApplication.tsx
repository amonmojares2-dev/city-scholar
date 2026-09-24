import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Icon from "../../components/Icon";
import PageHeader from "../../components/PageHeader";
import { ApiError, api, uploadWithProgress, validateDocumentFile } from "../../lib/api";
import { isImageMime, friendlyErrorMessage } from "../../lib/docUrl";
import { APPLICATION_DOCUMENT_TYPES } from "../../data/documentTypes";
import ConfirmDialog from "../../components/ConfirmDialog";
import UploadModal from "../../components/UploadModal";
import { PrivateDocumentImage, PrivateFileLink } from "../../components/PrivateFile";
import { validateGwa, validateMobile as validateMobileNumber, validateOptionalEmail, validateStudentNumber, validateUnitsEnrolled } from "../../lib/validation";
import { studentApplicationStatus } from "../../lib/applicationStatus";

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
    rejectionReason?: string;
    barangayVerificationStatus?: string;
    school: string;
    university?: string;
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
        houseNo?: string;
        streetName?: string;
        city?: string;
        zipCode?: string;
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

const FIELD_LABELS: Record<string, string> = {
    fullName: "Full Name", studentId: "Student Number", mobileNumber: "Mobile Number",
    email: "Email", dateOfBirth: "Birth Date", houseNo: "House No.", streetName: "Street Name",
    course: "Course", yearLevel: "Year Level", academicTerm: "Academic Term",
    gwa: "GWA", unitsEnrolled: "Units Enrolled", documents: "Required Documents", university: "University",
};

function formatErrorBanner(errors: Record<string, string>, fallback: string): string {
    const renderedFields = new Set([
        "fullName", "studentId", "mobileNumber", "email", "dateOfBirth", "houseNo", "streetName",
        "course", "yearLevel", "academicTerm", "gwa", "unitsEnrolled", "university", "documents",
    ]);
    const unknownReason = Object.entries(errors).find(([field]) => !renderedFields.has(field))?.[1];
    if (unknownReason) return unknownReason;
    const names = Object.keys(errors).map(field => FIELD_LABELS[field] || field).filter(Boolean);
    return names.length ? `Please fix: ${names.join(", ")}` : fallback;
}

const inputErrorCls = " border-[#DC2626] focus:ring-[#DC2626] focus:border-[#DC2626]";

// Student Number: two digits - two digits - four digits - six digits,
// e.g. "03-01-2425-041702". Digits and dashes only.
const STUDENT_NO_RE = /^\d{2}-\d{2}-\d{4}-\d{6}$/;
// PH mobile: 11 digits starting with 09, e.g. 09XXXXXXXXX.
const MOBILE_RE = /^(?:09\d{9}|\+639\d{9})$/;

function validateStudentId(v: string): string {
    return validateStudentNumber(v) || "";
}

function validateMobile(v: string): string {
    return validateMobileNumber(v) || "";
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

function applicationPayload(form: Record<string, string>, extra: Record<string, unknown> = {}) {
    const value = (field: string) => {
        const trimmed = (form[field] || '').trim();
        if (!trimmed) return undefined;
        if (field === 'mobile') return trimmed.replace(/[\s-]/g, '');
        if (field === 'gwa' || field === 'unitsEnrolled') return trimmed;
        return trimmed;
    };
    return {
        fullName: value('fullName'),
        applicant: {
            studentId: value('studentId'),
            dateOfBirth: value('birthDate'),
            sex: value('sex'),
            civilStatus: value('civilStatus'),
            mobileNumber: value('mobile'),
            houseNo: value('houseNo'),
            streetName: value('streetName'),
            course: value('course'),
            yearLevel: value('yearLevel'),
            academicTerm: value('academicTerm'),
            gwa: value('gwa'),
            unitsEnrolled: value('unitsEnrolled'),
            schoolType: value('schoolType'),
            schoolYear: value('schoolYear'),
        },
        ...extra,
    };
}

function getClientSubmitErrors(form: Record<string, string>): Record<string, string> {
    const errors: Record<string, string> = {};
    const add = (field: string, message: string) => { if (message) errors[field] = message; };
    add("fullName", (form.fullName || "").trim() ? "" : "Full Name is required.");
    add("studentId", validateStudentId(form.studentId || ""));
    add("mobileNumber", validateMobile(form.mobile || ""));
    add("course", (form.course || "").trim() ? "" : "Course is required.");
    add("yearLevel", (form.yearLevel || "").trim() ? "" : "Year Level is required.");
    add("academicTerm", (form.academicTerm || "").trim() ? "" : "Academic Term is required.");
    add("houseNo", (form.houseNo || "").trim() ? "" : "House No. is required.");
    add("streetName", (form.streetName || "").trim() ? "" : "Street Name is required.");
    add("gwa", validateGwa(form.gwa || "") || "");
    add("unitsEnrolled", validateUnitsEnrolled(form.unitsEnrolled || "") || "");
    add("email", validateOptionalEmail(form.email || "") || "");
    return errors;
}

function documentMatchesSlot(documentType: string, slotKey: string): boolean {
    if (documentType === slotKey) return true;
    // Historical Grade 12 report-card rows remain visible/required for old
    // applications, but the removed label is no longer offered to new users.
    return slotKey === "Report Card" && documentType === "Report Card (Grade 12)";
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
    const [uploadMessage, setUploadMessage] = useState("");
    const [openModalFor, setOpenModalFor] = useState<string | null>(null);
    // Tracks which fields the user has interacted with so live (as-you-type)
    // errors never flash on initial load — only after the first keystroke /
    // blur, or after a submit attempt.
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [submitAttempted, setSubmitAttempted] = useState(false);
    const [confirmSubmit, setConfirmSubmit] = useState(false);
    // Transient "blocked keystroke" errors: shown IMMEDIATELY when the user
    // types (or pastes) a disallowed character that we refuse to store, e.g.
    // a letter in a numbers-only field. Rendered directly below the field
    // via the Field `error` prop so the student knows exactly what happened
    // and how to fix it.
    const [studentIdBlockedErr, setStudentIdBlockedErr] = useState("");
    const [mobileBlockedErr, setMobileBlockedErr] = useState("");
    const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
    const [university, setUniversity] = useState("");

    

    const refresh = useCallback(async () => {
        setLoading(true);
        setErr("");
        try {
            const [data, currentUser] = await Promise.all([
                api<{ success: boolean; application: App | null; documents: AppDoc[] }>("/student/application/documents?context=application"),
                api<{ user: { university?: string; name: string; email: string } }>("/auth/me"),
            ]);
            setApp(data.application ?? null);
            setDocs(data.documents ?? []);
            const savedUniversity = currentUser.user.university || "";
            setUniversity(savedUniversity);
            if (data.application) {
                const p = data.application.applicant ?? {};
                setForm({
                    studentId: p.studentId ?? "",
                    parentName: p.parentName ?? "",
                    parentRelationship: p.parentRelationship ?? "",
                    parentMobile: p.parentMobile ?? "",
                    fullName: currentUser.user.name || data.application.student?.name || "",
                    email: currentUser.user.email || data.application.student?.email || "",
                    mobile: p.mobileNumber ?? "",
                    birthDate: p.dateOfBirth ?? "",
                    sex: p.sex ?? "",
                    civilStatus: p.civilStatus ?? "",
                    houseNo: p.houseNo ?? "",
                    streetName: p.streetName ?? "",
                    university: savedUniversity,
                    schoolType: p.schoolType ?? "",
                    course: p.course ?? "",
                    yearLevel: p.yearLevel ?? "",
                    academicTerm: p.academicTerm ?? "",
                    schoolYear: p.schoolYear ?? "",
                    gwa: p.gwa ?? "",
                    unitsEnrolled: p.unitsEnrolled ?? "",
                });
            } else {
                setForm({ university: savedUniversity });
                if (savedUniversity) {
                    try {
                        const created = await api<{ success: boolean; application: App }>("/student/application", {
                            method: "POST",
                            body: JSON.stringify({}),
                        });
                        setApp(created.application);
                    } catch (createErr) {
                        const msg = createErr instanceof Error ? createErr.message : "Unable to create application.";
                        if (msg.includes("already have a draft")) {
                            await refresh();
                            return;
                        }
                        setErr(friendlyErrorMessage(msg));
                        setApp(null);
                        setDocs([]);
                    }
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

    const set = (f: string, v: string) => {
        setForm(p => ({ ...p, [f]: v }));
        setSaved(false);
        setServerErrors(current => {
            if (!current[f]) return current;
            const next = { ...current };
            delete next[f];
            return next;
        });
    };

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
        const normalized = String(raw || '').replace(/[^\d+]/g, '').slice(0, 13);
        if (normalized && !/^\+?[\d\s-]+$/.test(raw)) {
            setMobileBlockedErr("Use a Philippine mobile number beginning with 09 or +639.");
        } else {
            setMobileBlockedErr("");
        }
        set("mobile", normalized);
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
        : validateStudentId(studentIdValue);
    const mobileFormatErr = !mobileValue
        ? (submitAttempted ? "Mobile Number is required." : "")
        : (!MOBILE_RE.test(mobileValue.replace(/[\s-]/g, ''))
            ? "Mobile Number must be 09XXXXXXXXX or +639XXXXXXXXX."
            : "");
    const studentIdErr = studentIdBlockedErr || serverErrors.studentId || (showStudentIdErr ? studentIdFormatErr : "");
    const mobileErr = mobileBlockedErr || serverErrors.mobileNumber || (showMobileErr ? mobileFormatErr : "");
    const emailErr = serverErrors.email || validateOptionalEmail(form.email || "") || "";
    const gwaErr = serverErrors.gwa || validateGwa(form.gwa || "") || "";
    const unitsErr = serverErrors.unitsEnrolled || validateUnitsEnrolled(form.unitsEnrolled || "") || "";

    const requiredDocs = DOC_TYPES.filter(d => d.required);
    const missingRequiredDocs = requiredDocs.filter(d => !docs.some(doc => documentMatchesSlot(doc.type, d.key)));
    const submitted = app && app.status !== "draft";

    const requestSubmit = () => {
        setSubmitAttempted(true);
        if (missingRequiredDocs.length) {
            setConfirmSubmit(false);
            setSaved(false);
            setSavedMsg("Please upload all required documents before submitting.");
            requestAnimationFrame(() => {
                document.getElementById(`${documentInputId(missingRequiredDocs[0].key)}-row`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            });
            return;
        }
        setConfirmSubmit(true);
    };

    const doSave = useCallback(async () => {
        if (!app) return;
        setServerErrors({});
        setSaving(true);
        setSaved(false);
        setSavedMsg("");
        try {
            const body = applicationPayload(form);
                        const data = await api<{ success: boolean; application: App }>("/student/application", { method: "PATCH", body: JSON.stringify(body) });
            setApp(data.application);
            setSaved(true);
            setSavedMsg("Application saved.");
        } catch (e) {
            if (e instanceof ApiError) {
                setServerErrors(e.errors || {});
                setSavedMsg(e.message);
                const firstField = Object.keys(e.errors || {})[0];
                if (firstField) requestAnimationFrame(() => document.getElementById(`application-${firstField}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
            } else {
                setSavedMsg(e instanceof Error ? e.message : "Unable to save.");
            }
        } finally {
            setSaving(false);
        }
    }, [app, form]);

    const doSubmit = useCallback(async () => {
        if (!app) return;
        if (missingRequiredDocs.length) {
            setConfirmSubmit(false);
            setSubmitAttempted(true);
            setSaved(false);
            setSavedMsg("Please upload all required documents before submitting.");
            return;
        }
        // Mark all validated fields touched so submit also reveals any
        // outstanding inline errors directly below each field.
        setSubmitAttempted(true);
        setTouched(p => ({ ...p, studentId: true, mobile: true, course: true }));
        const clientErrors = getClientSubmitErrors(form);
        if (Object.keys(clientErrors).length) {
            setStudentIdBlockedErr("");
            setMobileBlockedErr("");
            setSaved(false);
            setServerErrors(clientErrors);
            setSavedMsg(formatErrorBanner(clientErrors, "Please correct the highlighted fields before submitting."));
            const firstField = Object.keys(clientErrors)[0];
            requestAnimationFrame(() => document.getElementById(`application-${firstField}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
            return;
        }
        setServerErrors({});
        setSaving(true);
        setSaved(false);
        setSavedMsg("");
        try {
            const data = await api<{ success: boolean; application: App }>("/student/application", {
                method: "PATCH",
                body: JSON.stringify(applicationPayload(form, { status: "submitted", submittedAt: new Date().toISOString() })),
            });
            setApp(data.application);
            setSaved(true);
            setSavedMsg("Your application has been submitted for review.");
        } catch (e) {
            if (e instanceof ApiError) {
                setServerErrors(e.errors || {});
                setSavedMsg(formatErrorBanner(e.errors || {}, e.status === 409 ? e.message : "Please correct the highlighted fields before submitting."));
                const firstField = Object.keys(e.errors || {})[0];
                if (firstField) requestAnimationFrame(() => document.getElementById(`application-${firstField}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
            } else {
                setSavedMsg(e instanceof Error ? e.message : "Unable to submit.");
            }
        } finally {
            setSaving(false);
        }
        }, [app, form]);

    const doc = (key: string) => docs.find(d => documentMatchesSlot(d.type, key));

  const studentStatus = studentApplicationStatus(app);
  const isRejected = studentStatus.badgeKey === 'rejected';
  const isBarangayApproved = studentStatus.badgeKey === 'barangay-approved';
  if (submitted && app) {
        return (
            <div className="max-w-4xl mx-auto p-6" style={{ minHeight: "100vh", background: "#F6F7F9" }}>
                <PageHeader title="Application" subtitle="City Scholarship Program Application" breadcrumb={["Student Portal", "Application"]} />

                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-5">
                        <Icon name="check-circle" size={40} className="text-[#22A06B]" />
                    </div>
                    <h2 className="text-xl font-800 text-[#0B1F3A] mb-2" style={{ fontWeight: 800 }}>{isRejected ? 'Application Rejected' : isBarangayApproved ? 'Approved by Barangay' : 'Application Submitted'}</h2>
                    <p className="text-sm text-[#6B7280] max-w-sm mb-6">
                        {isRejected ? 'Your application was rejected during the Barangay review.' : isBarangayApproved ? 'Your Barangay approved your application and forwarded it to the City Scholarship Office for review.' : 'Your application has been received and is pending Barangay review.'}
                    </p>

                    <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 text-left max-w-lg w-full shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-600 text-[#6B7280] uppercase tracking-wide">Summary</span>
                            <span className="text-xs text-[#22A06B] font-semibold">{studentStatus.label}</span>
                        </div>
                        <div className="space-y-3 text-sm">
                            <div>
                                <span className="text-[#6B7280]">Applicant</span>
                                <p className="font-semibold text-[#1F2937]">{app.student?.name}</p>
                                <p className="text-[#6B7280]">{app.student?.email}</p>
                            </div>
                            <div>
                                <span className="text-[#6B7280]">Course</span>
                                <p className="font-semibold text-[#1F2937]">{app.applicant?.course || "\u2014"}</p>
                            </div>
                            <div>
                                <span className="text-[#6B7280]">University</span>
                                <p className="font-semibold text-[#1F2937]">{app.school || "\u2014"}</p>
                            </div>
                            <div>
                                <span className="text-[#6B7280]">Submitted</span>
                                <p className="font-semibold text-[#1F2937]">{fmt(app.submittedAt)}</p>
                            </div>
                        </div>
                        <div className="mt-5 border-t border-[#E5E7EB] pt-4">
                            {isRejected && app.rejectionReason && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><strong>Reason:</strong> {app.rejectionReason}</div>}
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

function documentInputId(type: string): string {
    return `application-document-${type.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function DocumentUploadButton({
    existing,
    onOpen,
}: {
    existing?: AppDoc;
    onOpen: () => void;
}) {
    return (
        <button
            type="button"
            onClick={event => {
                event.stopPropagation();
                onOpen();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-medium text-[#163A63] transition-colors hover:bg-[#F0F4FA]"
        >
            <Icon name="upload" size={13} />
            {existing ? "Replace" : "Upload"}
        </button>
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

            {uploadMessage && (
                <div className="mb-5 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
                    {uploadMessage}
                </div>
            )}

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
                        <Field label="Full Name" required error={serverErrors.fullName}>
                            <input id="application-fullName" className={inputCls + (serverErrors.fullName ? inputErrorCls : "")} value={form.fullName || ""} onChange={(e) => set("fullName", e.target.value)} placeholder="e.g. Juan Dela Cruz" aria-invalid={Boolean(serverErrors.fullName)} required />
                        </Field>
                        <Field label="Student Number / ID" required error={studentIdErr}>
                            <input
                                id="application-studentId"
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
        <Field label="Email Address" error={emailErr}>
                            <input id="application-email" className={inputCls + (emailErr ? inputErrorCls : "")} type="email" value={form.email || ""} readOnly aria-invalid={Boolean(emailErr)} />
                        </Field>
                        <Field label="Mobile Number" required error={mobileErr}>
                            <input
                                id="application-mobileNumber"
                                className={inputCls + (mobileErr ? inputErrorCls : "")}
                                value={form.mobile || ""}
                                onChange={(e) => onMobileChange(e.target.value)}
                                onBlur={() => touch("mobile")}
                                placeholder="e.g. 09XXXXXXXXX"
                                inputMode="numeric"
                                aria-invalid={Boolean(mobileErr)}
                            />
                        </Field>
                        <Field label="Birth Date" error={serverErrors.dateOfBirth}>
                            <input id="application-dateOfBirth" className={inputCls + (serverErrors.dateOfBirth ? inputErrorCls : "")} type="date" value={form.birthDate || ""} onChange={(e) => set("birthDate", e.target.value)} aria-invalid={Boolean(serverErrors.dateOfBirth)} />
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
                        <Field label="House No." required error={serverErrors.houseNo}>
                            <input id="application-houseNo" className={inputCls + (serverErrors.houseNo ? inputErrorCls : "")} value={form.houseNo || ""} onChange={(e) => set("houseNo", e.target.value)} placeholder="e.g. 123" aria-invalid={Boolean(serverErrors.houseNo)} required />
                        </Field>
                        <Field label="Street Name" required error={serverErrors.streetName}>
                            <input id="application-streetName" className={inputCls + (serverErrors.streetName ? inputErrorCls : "")} value={form.streetName || ""} onChange={(e) => set("streetName", e.target.value)} placeholder="e.g. Rizal Street" aria-invalid={Boolean(serverErrors.streetName)} required />
                        </Field>
                    </Grid>
                </section>

                {/* ── School Information ── */}
                <section>
                    <h3 className="text-lg font-bold text-[#0B1F3A] mb-4">School Information</h3>
                    <Grid>
                        <Field label="University" error={serverErrors.university}>
                            <input
                                id="application-university"
                                className={`${inputCls} bg-[#F3F4F6] text-[#4B5563] cursor-not-allowed`}
                                value={university}
                                readOnly
                                aria-readonly="true"
                                tabIndex={-1}
                            />
                            <p className={`text-xs mt-1 ${university ? 'text-[#6B7280]' : 'text-amber-700'}`}>
                                {university
                                    ? 'Auto-filled from your student account.'
                                    : 'No university found on your account. Please contact the scholarship office to have it corrected.'}
                            </p>
                        </Field>
                        <Field label="School Type">
                            <select className={inputCls} value={form.schoolType || ""} onChange={(e) => set("schoolType", e.target.value)}>
                                <option value="">Select…</option>
                                <option value="Public">Public</option>
                                <option value="Private">Private</option>
                                <option value="State University">State University</option>
                            </select>
                        </Field>
                        <Field label="Course" required error={serverErrors.course}>
                            <select
                                id="application-course"
                                className={inputCls + (serverErrors.course || (submitAttempted && !form.course) ? inputErrorCls : "")}
                                value={form.course || ""}
                                onChange={(e) => set("course", e.target.value)}
                                onBlur={() => touch("course")}
                                aria-invalid={Boolean(serverErrors.course || (submitAttempted && !form.course))}
                                required
                            >
                                <option value="">Select…</option>
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
                            {!serverErrors.course && submitAttempted && !form.course && (
                                <p className={errorCls} role="alert">
                                    <span aria-hidden="true">⚠</span> Course is required.
                                </p>
                            )}
                        </Field>
                        <Field label="Year Level" required error={serverErrors.yearLevel}>
                            <select id="application-yearLevel" className={inputCls + (serverErrors.yearLevel ? inputErrorCls : "")} value={form.yearLevel || ""} onChange={(e) => set("yearLevel", e.target.value)} aria-invalid={Boolean(serverErrors.yearLevel)} required>
                                <option value="">Select…</option>
                                <option value="1st Year">1st Year</option>
                                <option value="2nd Year">2nd Year</option>
                                <option value="3rd Year">3rd Year</option>
                                <option value="4th Year">4th Year</option>
                            </select>
                        </Field>
                        <Field label="Academic Term" required error={serverErrors.academicTerm || (submitAttempted && !form.academicTerm ? "Academic Term is required." : "")}>
                            <select id="application-academicTerm" className={inputCls + (serverErrors.academicTerm || (submitAttempted && !form.academicTerm) ? inputErrorCls : "")} value={form.academicTerm || ""} onChange={(e) => set("academicTerm", e.target.value)} aria-invalid={Boolean(serverErrors.academicTerm || (submitAttempted && !form.academicTerm))} required>
                                <option value="">Select…</option>
                                <option value="1st Semester">1st Semester</option>
                                <option value="2nd Semester">2nd Semester</option>
                                <option value="Summer">Summer</option>
                            </select>
                        </Field>
                        <Field label="School Year">
                            <input className={inputCls} value={form.schoolYear || ""} onChange={(e) => set("schoolYear", e.target.value)} placeholder="e.g. 2024-2025" />
                        </Field>
                        <Field label="Current GWA" error={gwaErr}>
                            <input id="application-gwa" className={inputCls + (gwaErr ? inputErrorCls : "")} type="number" min="1" max="5" step="0.01" value={form.gwa || ""} onChange={(e) => set("gwa", e.target.value)} placeholder="e.g. 1.75" aria-invalid={Boolean(gwaErr)} />
                        </Field>
                        <Field label="Units Enrolled" error={unitsErr}>
                            <input id="application-unitsEnrolled" className={inputCls + (unitsErr ? inputErrorCls : "")} type="number" min="1" step="1" value={form.unitsEnrolled || ""} onChange={(e) => set("unitsEnrolled", e.target.value)} placeholder="e.g. 24" aria-invalid={Boolean(unitsErr)} />
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
                            <div
                                key={d.key}
                                id={`${documentInputId(d.key)}-row`}
                                className="flex flex-col gap-3 p-4 rounded-lg border border-[#E5E7EB] sm:flex-row sm:items-center sm:justify-between"
                            >
                                    <div className="flex items-center gap-3">
                                        <Icon name="file-text" size={18} className="text-[#9CA3AF]" />
                                        <div>
                                            <p className="font-500 text-[#0B1F3A]" style={{ fontWeight: 500 }}>{d.label}</p>
                                            <p className="text-xs text-[#6B7280]">{d.required ? "Required" : "Optional"}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {existing && (
                                            <>
                                                {isImageMime(existing.mimeType) && (
                                                    <PrivateDocumentImage
                                                        documentId={existing._id}
                                                        alt={existing.originalName}
                                                        className="w-12 h-12 rounded-lg object-cover border border-[#E5E7EB]"
                                                    />
                                                )}
                                                <span className="text-xs text-[#6B7280] truncate max-w-[180px]">{existing.originalName}</span>
                                                <DocStatus doc={existing} />
                                            </>
                                        )}
                                        {submitAttempted && d.required && !existing && (
                                            <p className="text-xs text-[#DC2626]" role="alert">Please upload {d.label}.</p>
                                        )}
                                    </div>

                                    <DocumentUploadButton
                                        existing={existing}
                                        onOpen={() => setOpenModalFor(d.key)}
                                    />
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
                            <button type="button" onClick={doSave} disabled={saving || !app || !university} className={outlineBtnCls}>
                                {saving ? "Saving…" : "Save Draft"}
                            </button>
                            <button
                                type="button"
                                onClick={requestSubmit}
                                disabled={saving || !app}
                                className={primaryBtnCls}
                            >
                                {saving ? "Submitting…" : "Submit Application"}
                            </button>
                        </div>
                    </div>
                </section>
            </div>

            {openModalFor && (() => {
                const slot = DOC_TYPES.find(documentType => documentType.key === openModalFor);
                if (!slot) return null;
                return (
                    <UploadModal
                        isOpen
                        documentName={slot.label}
                        validateFile={validateDocumentFile}
                        onClose={() => setOpenModalFor(null)}
                        onUpload={async (file, onProgress, signal) => {
                            const body = new FormData();
                            body.append("file", file);
                            body.append("docType", slot.key);
                            body.append("context", "application");
                            try {
                                const result = await uploadWithProgress<{ success: boolean; message: string; documents: AppDoc[] }>(
                                    "/student/application/documents",
                                    body,
                                    onProgress,
                                    signal,
                                );
                                setUploadMessage(result.message || `${slot.label} uploaded successfully.`);
                                setDocs(result.documents || []);
                                setSubmitAttempted(false);
                            } catch (requestError) {
                                throw new Error(friendlyErrorMessage(requestError instanceof Error ? requestError.message : "Upload failed."));
                            }
                        }}
                    />
                );
            })()}

            <ConfirmDialog
                open={confirmSubmit}
                title="Submit application?"
                message="Do you want to submit this application for review? You will not be able to edit it after submission."
                confirmLabel="Submit Application"
                onCancel={() => setConfirmSubmit(false)}
                onConfirm={() => doSubmit()}
            />
        </div>
    );
}