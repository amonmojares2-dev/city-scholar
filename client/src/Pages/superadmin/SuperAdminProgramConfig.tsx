import { useCallback, useEffect, useState } from "react";
import Icon from "../../components/Icon";
import PageHeader from "../../components/PageHeader";
import { api } from "../../lib/api";

// ─── Types (match server superAdminController.serializeProgram) ───────────────

interface ProgramDto {
  id: string;
  programName: string;
  description: string;
  academicYear: string;
  semester: string;
  minGwa: number;
  requiredUnits: number;
  grantAmount: number;
  slotsAvailable: number;
  applicationOpenAt: string | null;
  applicationCloseAt: string | null;
  requiredDocuments: string[];
  eligibleSchools: string[];
  active: boolean;
  updatedAt: string;
}

interface ProgramListResponse {
  success: boolean;
  programs: ProgramDto[];
  academicYears: string[];
  schools: { _id: string; name: string }[];
  requiredDocumentOptions: string[];
}

interface ProgramForm {
  id: string;
  programName: string;
  description: string;
  academicYear: string;
  semester: string;
  minGwa: string;
  requiredUnits: string;
  grantAmount: string;
  slotsAvailable: string;
  openAt: string; // datetime-local value
  closeAt: string;
  requiredDocuments: string[];
  eligibleSchools: string[];
  active: boolean;
}

const BLANK_FORM: ProgramForm = {
  id: "",
  programName: "",
  description: "",
  academicYear: "2025-2026",
  semester: "1st Semester",
  minGwa: "2.00",
  requiredUnits: "15",
  grantAmount: "5000",
  slotsAvailable: "100",
  openAt: "",
  closeAt: "",
  requiredDocuments: [],
  eligibleSchools: [],
  active: true,
};

interface SaveProgramResponse {
  success: boolean;
  message: string;
  program: ProgramDto;
}

const SEMESTERS = ["1st Semester", "2nd Semester", "Summer"];

function SavedBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-2.5 py-1">
      <Icon name="check" size={13} />
      Saved!
    </span>
  );
}

// ISO date -> datetime-local input value (yyyy-MM-ddTHH:mm, local time)
function toInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "Not set";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm text-[#374151] mb-1" style={{ fontWeight: 500 }}>{children}</label>;
}

function inputCls() {
  return "w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#163A63] focus:border-[#163A63] transition";
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#163A63] focus:ring-offset-1 disabled:opacity-50"
      style={{ backgroundColor: checked ? "#163A63" : "#D1D5DB" }}
    >
      <span
        className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200"
        style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }}
      />
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SuperAdminProgramConfig() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [programs, setPrograms] = useState<ProgramDto[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [schoolOptions, setSchoolOptions] = useState<string[]>([]);
  const [docOptions, setDocOptions] = useState<string[]>([]);
  const [form, setForm] = useState<ProgramForm>(BLANK_FORM);
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [customDoc, setCustomDoc] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<ProgramListResponse>("/super-admin/program");
      setPrograms(data.programs || []);
      setYears(data.academicYears || []);
      setSchoolOptions((data.schools || []).map((s) => s.name));
      setDocOptions(data.requiredDocumentOptions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the program configuration.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function applyProgram(program: ProgramDto | null) {
    if (!program) {
      setForm(BLANK_FORM);
      setSelectedId("");
      return;
    }
    setSelectedId(program.id);
    setForm({
      id: program.id,
      programName: program.programName,
      description: program.description || "",
      academicYear: program.academicYear,
      semester: program.semester,
      minGwa: String(program.minGwa),
      requiredUnits: String(program.requiredUnits),
      grantAmount: String(program.grantAmount),
      slotsAvailable: String(program.slotsAvailable),
      openAt: toInputValue(program.applicationOpenAt),
      closeAt: toInputValue(program.applicationCloseAt),
      requiredDocuments: [...(program.requiredDocuments || [])],
      eligibleSchools: [...(program.eligibleSchools || [])],
      active: program.active,
    });
    setSaved(false);
    setSaveError("");
  }

  function set<K extends keyof ProgramForm>(key: K, value: ProgramForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function toggleInList(key: "requiredDocuments" | "eligibleSchools", item: string) {
    setForm((prev) => {
      const list = prev[key];
      return { ...prev, [key]: list.includes(item) ? list.filter((x) => x !== item) : [...list, item] };
    });
    setSaved(false);
  }

  async function handleSave() {
    if (!form.programName.trim() || !form.academicYear.trim() || !form.semester.trim()) {
      setSaveError("Program name, academic year and semester are required.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const data = await api<SaveProgramResponse>("/super-admin/program", {
        method: "PUT",
        body: JSON.stringify({
          id: form.id || undefined,
          programName: form.programName.trim(),
          description: form.description,
          academicYear: form.academicYear.trim(),
          semester: form.semester,
          minGwa: Number(form.minGwa) || 0,
          requiredUnits: Number(form.requiredUnits) || 0,
          grantAmount: Number(form.grantAmount) || 0,
          slotsAvailable: Number(form.slotsAvailable) || 0,
          applicationOpenAt: form.openAt || null,
          applicationCloseAt: form.closeAt || null,
          requiredDocuments: form.requiredDocuments,
          eligibleSchools: form.eligibleSchools,
          active: form.active,
        }),
      });
      setSaved(true);
      if (data.program) applyProgram(data.program);
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unable to save the program.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 min-h-screen" style={{ background: "#F6F7F9" }}>
      <PageHeader
        title="Program Configuration"
        subtitle="Configure the scholarship program, eligibility, application period and requirements."
        breadcrumb={["Super Admin", "Program Configuration"]}
        action={
          <button
            onClick={() => applyProgram(null)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: "#163A63" }}
          >
            <Icon name="plus" size={15} />
            New Program
          </button>
        }
      />

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-24 flex flex-col items-center gap-3 text-[#6B7280]">
          <Icon name="refresh" size={22} className="animate-spin" />
          <span className="text-sm">Loading configuration…</span>
        </div>
      ) : (
        <>
          {/* Program selector + save bar */}
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 mb-6 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[240px]">
              <Label>Edit existing program</Label>
              <select
                value={selectedId}
                onChange={(e) => {
                  const program = programs.find((p) => p.id === e.target.value) || null;
                  applyProgram(program);
                }}
                className={inputCls()}
              >
                <option value="">— Create a new program —</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.programName} · AY {p.academicYear} · {p.semester}{p.active ? "" : " (inactive)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3 pt-5">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: "#163A63" }}
              >
                <Icon name={saving ? "refresh" : "check"} size={15} className={saving ? "animate-spin" : ""} />
                {saving ? "Saving…" : selectedId ? "Save Changes" : "Create Program"}
              </button>
              <SavedBadge show={saved} />
            </div>
          </div>

          {saveError && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {saveError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

            {/* Program details */}
            <section className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden lg:col-span-2">
              <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center gap-2.5" style={{ backgroundColor: "#F6F7F9" }}>
                <span className="text-[#163A63]"><Icon name="book" size={18} /></span>
                <h2 className="text-[#0B1F3A] text-base" style={{ fontWeight: 600 }}>Program Details</h2>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Program name *</Label>
                    <input value={form.programName} onChange={(e) => set("programName", e.target.value)} placeholder="e.g. City Scholar Program" className={inputCls()} />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <div className="flex items-center justify-between rounded-lg border border-[#E5E7EB] px-4 py-2">
                      <span className="text-sm text-[#374151]">{form.active ? "Active" : "Inactive"}</span>
                      <Toggle checked={form.active} onChange={(v) => set("active", v)} />
                    </div>
                  </div>
                  <div>
                    <Label>Academic year *</Label>
                    <input list="program-years" value={form.academicYear} onChange={(e) => set("academicYear", e.target.value)} placeholder="e.g. 2025-2026" className={inputCls()} />
                    <datalist id="program-years">
                      {years.map((y) => <option key={y} value={y} />)}
                    </datalist>
                  </div>
                  <div>
                    <Label>Semester *</Label>
                    <select value={form.semester} onChange={(e) => set("semester", e.target.value)} className={inputCls()}>
                      {SEMESTERS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="Short description shown to applicants…" className={inputCls()} />
                </div>
              </div>
            </section>

            {/* Eligibility & slots */}
            <section className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center gap-2.5" style={{ backgroundColor: "#F6F7F9" }}>
                <span className="text-[#163A63]"><Icon name="user-plus" size={18} /></span>
                <h2 className="text-[#0B1F3A] text-base" style={{ fontWeight: 600 }}>Eligibility &amp; Slots</h2>
              </div>
              <div className="p-6 grid grid-cols-2 gap-4">
                <div>
                  <Label>Minimum GWA</Label>
                  <input type="number" step="0.01" min="0" value={form.minGwa} onChange={(e) => set("minGwa", e.target.value)} className={inputCls()} />
                </div>
                <div>
                  <Label>Required units</Label>
                  <input type="number" min="0" value={form.requiredUnits} onChange={(e) => set("requiredUnits", e.target.value)} className={inputCls()} />
                </div>
                <div>
                  <Label>Grant amount (₱)</Label>
                  <input type="number" min="0" value={form.grantAmount} onChange={(e) => set("grantAmount", e.target.value)} className={inputCls()} />
                </div>
                <div>
                  <Label>Slots available</Label>
                  <input type="number" min="0" value={form.slotsAvailable} onChange={(e) => set("slotsAvailable", e.target.value)} className={inputCls()} />
                </div>
              </div>
            </section>

            {/* Application period */}
            <section className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center gap-2.5" style={{ backgroundColor: "#F6F7F9" }}>
                <span className="text-[#163A63]"><Icon name="calendar" size={18} /></span>
                <h2 className="text-[#0B1F3A] text-base" style={{ fontWeight: 600 }}>Application Period</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <Label>Applications open at</Label>
                  <input type="datetime-local" value={form.openAt} onChange={(e) => set("openAt", e.target.value)} className={inputCls()} />
                  <p className="text-xs text-[#9CA3AF] mt-1">Currently: {fmtDateTime(form.openAt || null)}</p>
                </div>
                <div>
                  <Label>Applications close at</Label>
                  <input type="datetime-local" value={form.closeAt} onChange={(e) => set("closeAt", e.target.value)} className={inputCls()} />
                  <p className="text-xs text-[#9CA3AF] mt-1">Currently: {fmtDateTime(form.closeAt || null)}</p>
                </div>
              </div>
            </section>

            {/* Requirements */}
            <section className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center gap-2.5" style={{ backgroundColor: "#F6F7F9" }}>
                <span className="text-[#163A63]"><Icon name="file-text" size={18} /></span>
                <h2 className="text-[#0B1F3A] text-base" style={{ fontWeight: 600 }}>Required Documents</h2>
              </div>
              <div className="p-6 space-y-2 max-h-72 overflow-y-auto">
                {docOptions.map((doc) => (
                  <label key={doc} className="flex items-center gap-3 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.requiredDocuments.includes(doc)}
                      onChange={() => toggleInList("requiredDocuments", doc)}
                      className="h-4 w-4 rounded border-[#D1D5DB] text-[#163A63] focus:ring-[#163A63]"
                    />
                    <span className="text-sm text-[#374151]">{doc}</span>
                  </label>
                ))}
                <div className="flex items-center gap-2 pt-3 border-t border-[#E5E7EB]">
                  <input
                    value={customDoc}
                    onChange={(e) => setCustomDoc(e.target.value)}
                    placeholder="Add a custom document…"
                    className={inputCls()}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const name = customDoc.trim();
                      if (name && !form.requiredDocuments.includes(name)) toggleInList("requiredDocuments", name);
                      setCustomDoc("");
                    }}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-white flex-shrink-0"
                    style={{ backgroundColor: "#163A63" }}
                  >
                    <Icon name="plus" size={14} />
                  </button>
                </div>
                {form.requiredDocuments.filter((d) => !docOptions.includes(d)).length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs text-[#6B7280] mb-1">Custom documents:</p>
                    <div className="flex flex-wrap gap-2">
                      {form.requiredDocuments.filter((d) => !docOptions.includes(d)).map((d) => (
                        <span key={d} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#F0F4FA] text-xs text-[#163A63]">
                          {d}
                          <button type="button" onClick={() => toggleInList("requiredDocuments", d)}>
                            <Icon name="x" size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Eligible schools */}
            <section className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center gap-2.5" style={{ backgroundColor: "#F6F7F9" }}>
                <span className="text-[#163A63]"><Icon name="map-pin" size={18} /></span>
                <h2 className="text-[#0B1F3A] text-base" style={{ fontWeight: 600 }}>Eligible Schools</h2>
              </div>
              <div className="p-6 space-y-2 max-h-72 overflow-y-auto">
                {schoolOptions.length === 0 && (
                  <p className="text-sm text-[#6B7280]">No accredited schools yet — add them in Data Management.</p>
                )}
                {schoolOptions.map((school) => (
                  <label key={school} className="flex items-center gap-3 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.eligibleSchools.includes(school)}
                      onChange={() => toggleInList("eligibleSchools", school)}
                      className="h-4 w-4 rounded border-[#D1D5DB] text-[#163A63] focus:ring-[#163A63]"
                    />
                    <span className="text-sm text-[#374151]">{school}</span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}