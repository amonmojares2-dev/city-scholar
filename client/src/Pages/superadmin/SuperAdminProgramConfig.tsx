import { useState, useRef } from "react";
import Icon from "../../components/Icon";
import PageHeader from "../../components/PageHeader";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocItem {
  id: string;
  name: string;
  note: string;
  enabled: boolean;
}

interface SemesterPeriod {
  openDate: string;
  closeDate: string;
  ay: string;
  active: boolean;
}

// ─── Toggle Switch ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#163A63] focus:ring-offset-1"
      style={{ backgroundColor: checked ? "#163A63" : "#D1D5DB" }}
    >
      <span
        className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200"
        style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }}
      />
    </button>
  );
}

// ─── SavedBadge ────────────────────────────────────────────────────────────────

function SavedBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-2.5 py-1">
      <Icon name="check" size={13} />
      Saved!
    </span>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────────

function Section({ id, title, icon, children }: { id: string; title: string; icon: string; children: React.ReactNode }) {
  return (
    <section id={id} className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center gap-2.5" style={{ backgroundColor: "#F6F7F9" }}>
        <span className="text-[#163A63]">
          <Icon name={icon} size={18} />
        </span>
        <h2 className="font-600 text-[#0B1F3A] text-base" style={{ fontWeight: 600 }}>{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

// ─── Label / Input helpers ─────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-500 text-[#374151] mb-1" style={{ fontWeight: 500 }}>{children}</label>;
}

function inputCls() {
  return "w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#163A63] focus:border-[#163A63] transition";
}

function SaveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-600 text-white transition hover:opacity-90 active:scale-95"
      style={{ backgroundColor: "#0B1F3A", fontWeight: 600 }}
    >
      <Icon name="check" size={14} />
      Save Changes
    </button>
  );
}

// ─── Section 1 — Eligibility Criteria ─────────────────────────────────────────

function EligibilitySection() {
  const [residency, setResidency] = useState(2);
  const [income, setIncome] = useState("below-5000");
  const [maxAge, setMaxAge] = useState(30);
  const [noOtherScholarship, setNoOtherScholarship] = useState(true);
  const [accreditedSchool, setAccreditedSchool] = useState(true);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <Section id="eligibility" title="Eligibility Criteria" icon="user-check">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <Label>Minimum Residency (years)</Label>
          <input
            type="number"
            min="0"
            value={residency}
            onChange={(e) => setResidency(Number(e.target.value))}
            className={inputCls()}
          />
        </div>
        <div>
          <Label>Monthly Family Income Threshold</Label>
          <select
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            className={inputCls()}
          >
            <option value="below-5000">Below ₱5,000</option>
            <option value="5000-10000">₱5,000 – ₱10,000</option>
            <option value="10001-15000">₱10,001 – ₱15,000</option>
            <option value="15001-20000">₱15,001 – ₱20,000</option>
          </select>
        </div>
        <div>
          <Label>Maximum Age</Label>
          <input
            type="number"
            min="1"
            value={maxAge}
            onChange={(e) => setMaxAge(Number(e.target.value))}
            className={inputCls()}
          />
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-[#E5E7EB] px-4 py-3">
          <span className="text-sm text-[#374151]">Must not be recipient of other government scholarship</span>
          <Toggle checked={noOtherScholarship} onChange={setNoOtherScholarship} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-[#E5E7EB] px-4 py-3">
          <span className="text-sm text-[#374151]">Must be enrolled in an accredited school</span>
          <Toggle checked={accreditedSchool} onChange={setAccreditedSchool} />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <SaveButton onClick={handleSave} />
        <SavedBadge show={saved} />
      </div>
    </Section>
  );
}

// ─── Section 2 — Required Documents ──────────────────────────────────────────

const DEFAULT_NEW_DOCS: DocItem[] = [
  { id: "n1", name: "Certificate of Matriculation", note: "Stamped & dry sealed", enabled: true },
  { id: "n2", name: "Student's Current School ID", note: "", enabled: true },
  { id: "n3", name: "Parent's Valid ID", note: "", enabled: true },
  { id: "n4", name: "Copy of Grades", note: "Official copy from school registrar", enabled: true },
];

const DEFAULT_RENEWAL_DOCS: DocItem[] = [
  { id: "r1", name: "Copy of Grades", note: "Official copy from school registrar", enabled: true },
  { id: "r2", name: "Certificate of Matriculation", note: "Stamped & dry sealed", enabled: true },
];

function DocRow({ doc, onToggle }: { doc: DocItem; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[#E5E7EB] last:border-b-0">
      <span className="text-[#163A63] flex-shrink-0">
        <Icon name="file-text" size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-500 text-[#0B1F3A]" style={{ fontWeight: 500 }}>{doc.name}</p>
        {doc.note && <p className="text-xs text-[#6B7280] mt-0.5">{doc.note}</p>}
      </div>
      <Toggle checked={doc.enabled} onChange={onToggle} />
    </div>
  );
}

function DocumentsSection() {
  const [activeTab, setActiveTab] = useState<"new" | "renewal">("new");
  const [newDocs, setNewDocs] = useState<DocItem[]>(DEFAULT_NEW_DOCS);
  const [renewalDocs, setRenewalDocs] = useState<DocItem[]>(DEFAULT_RENEWAL_DOCS);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocNote, setNewDocNote] = useState("");
  const [saved, setSaved] = useState(false);

  const docs = activeTab === "new" ? newDocs : renewalDocs;
  const setDocs = activeTab === "new" ? setNewDocs : setRenewalDocs;

  function toggleDoc(id: string) {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, enabled: !d.enabled } : d)));
  }

  function addDoc() {
    if (!newDocName.trim()) return;
    const id = `custom-${Date.now()}`;
    setDocs((prev) => [...prev, { id, name: newDocName.trim(), note: newDocNote.trim(), enabled: true }]);
    setNewDocName("");
    setNewDocNote("");
    setShowAddForm(false);
  }

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <Section id="documents" title="Required Documents" icon="clipboard">
      {/* Sub-tabs */}
      <div className="flex gap-1 mb-4 border-b border-[#E5E7EB]">
        {(["new", "renewal"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => { setActiveTab(tab); setShowAddForm(false); }}
            className="px-4 py-2 text-sm font-500 border-b-2 -mb-px transition"
            style={{
              fontWeight: 500,
              borderBottomColor: activeTab === tab ? "#163A63" : "transparent",
              color: activeTab === tab ? "#163A63" : "#6B7280",
            }}
          >
            {tab === "new" ? "New Applicant" : "Renewal"}
          </button>
        ))}
      </div>

      {/* Doc list */}
      <div className="rounded-lg border border-[#E5E7EB] px-4 divide-y divide-transparent">
        {docs.map((doc) => (
          <DocRow key={doc.id} doc={doc} onToggle={() => toggleDoc(doc.id)} />
        ))}
      </div>

      {/* Add document inline form */}
      {showAddForm ? (
        <div className="mt-4 rounded-lg border border-[#D4A72C] bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-600 text-[#0B1F3A]" style={{ fontWeight: 600 }}>Add New Document</p>
          <div>
            <Label>Document Name</Label>
            <input
              type="text"
              value={newDocName}
              onChange={(e) => setNewDocName(e.target.value)}
              placeholder="e.g. Barangay Clearance"
              className={inputCls()}
            />
          </div>
          <div>
            <Label>Note / Description (optional)</Label>
            <input
              type="text"
              value={newDocNote}
              onChange={(e) => setNewDocNote(e.target.value)}
              placeholder="e.g. Stamped & dry sealed"
              className={inputCls()}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addDoc}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-600 text-white transition hover:opacity-90"
              style={{ backgroundColor: "#163A63", fontWeight: 600 }}
            >
              <Icon name="plus" size={13} />
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-[#6B7280] border border-[#E5E7EB] hover:bg-[#F6F7F9] transition"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#163A63] hover:underline"
        >
          <Icon name="plus" size={14} />
          Add Document
        </button>
      )}

      <div className="mt-5 flex items-center gap-3">
        <SaveButton onClick={handleSave} />
        <SavedBadge show={saved} />
      </div>
    </Section>
  );
}

// ─── Section 3 — Application Periods ─────────────────────────────────────────

function SemesterCard({
  label,
  value,
  onChange,
  onSave,
  saved,
}: {
  label: string;
  value: SemesterPeriod;
  onChange: (v: SemesterPeriod) => void;
  onSave: () => void;
  saved: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-600 text-[#0B1F3A] text-sm" style={{ fontWeight: 600 }}>{label}</h3>
        <Toggle checked={value.active} onChange={(v) => onChange({ ...value, active: v })} />
      </div>

      <div className="space-y-3">
        <div>
          <Label>Academic Year</Label>
          <input
            type="text"
            value={value.ay}
            onChange={(e) => onChange({ ...value, ay: e.target.value })}
            placeholder="e.g. 2025–2026"
            className={inputCls()}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Open Date</Label>
            <input
              type="date"
              value={value.openDate}
              onChange={(e) => onChange({ ...value, openDate: e.target.value })}
              className={inputCls()}
            />
          </div>
          <div>
            <Label>Close Date</Label>
            <input
              type="date"
              value={value.closeDate}
              onChange={(e) => onChange({ ...value, closeDate: e.target.value })}
              className={inputCls()}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <SaveButton onClick={onSave} />
        <SavedBadge show={saved} />
      </div>
    </div>
  );
}

function PeriodsSection() {
  const [sem1, setSem1] = useState<SemesterPeriod>({
    openDate: "2025-06-01",
    closeDate: "2025-07-31",
    ay: "2025–2026",
    active: true,
  });
  const [sem2, setSem2] = useState<SemesterPeriod>({
    openDate: "2025-11-01",
    closeDate: "2025-12-31",
    ay: "2025–2026",
    active: false,
  });
  const [saved1, setSaved1] = useState(false);
  const [saved2, setSaved2] = useState(false);

  function save1() { setSaved1(true); setTimeout(() => setSaved1(false), 2500); }
  function save2() { setSaved2(true); setTimeout(() => setSaved2(false), 2500); }

  return (
    <Section id="periods" title="Application Periods" icon="calendar">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <SemesterCard label="1st Semester" value={sem1} onChange={setSem1} onSave={save1} saved={saved1} />
        <SemesterCard label="2nd Semester" value={sem2} onChange={setSem2} onSave={save2} saved={saved2} />
      </div>
    </Section>
  );
}

// ─── Section 4 — Grant & Disbursement ─────────────────────────────────────────

function DisbursementSection() {
  const [stipend, setStipend] = useState(3000);
  const [frequency, setFrequency] = useState("monthly");
  const [paymentMethod, setPaymentMethod] = useState("bank-transfer");
  const [maxScholars, setMaxScholars] = useState(500);
  const [autoNotify, setAutoNotify] = useState(true);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <Section id="disbursement" title="Grant & Disbursement" icon="award">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <Label>Monthly Stipend Amount</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#6B7280] pointer-events-none">₱</span>
            <input
              type="number"
              min="0"
              value={stipend}
              onChange={(e) => setStipend(Number(e.target.value))}
              className={`${inputCls()} pl-7`}
            />
          </div>
        </div>

        <div>
          <Label>Disbursement Frequency</Label>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={inputCls()}>
            <option value="monthly">Monthly</option>
            <option value="per-semester">Per Semester</option>
            <option value="annual">Annual</option>
          </select>
        </div>

        <div>
          <Label>Payment Method</Label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls()}>
            <option value="cash-pickup">Cash Pickup</option>
            <option value="bank-transfer">Bank Transfer</option>
            <option value="gcash">GCash</option>
          </select>
        </div>

        <div>
          <Label>Max Scholars per Semester</Label>
          <input
            type="number"
            min="1"
            value={maxScholars}
            onChange={(e) => setMaxScholars(Number(e.target.value))}
            className={inputCls()}
          />
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between rounded-lg border border-[#E5E7EB] px-4 py-3">
          <div>
            <p className="text-sm font-500 text-[#374151]" style={{ fontWeight: 500 }}>Auto-notify scholars on disbursement</p>
            <p className="text-xs text-[#6B7280] mt-0.5">Send automatic SMS/email notification when stipend is released</p>
          </div>
          <Toggle checked={autoNotify} onChange={setAutoNotify} />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <SaveButton onClick={handleSave} />
        <SavedBadge show={saved} />
      </div>
    </Section>
  );
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: "eligibility", label: "Eligibility Criteria", icon: "user-check" },
  { id: "documents", label: "Required Documents", icon: "clipboard" },
  { id: "periods", label: "Application Periods", icon: "calendar" },
  { id: "disbursement", label: "Grant & Disbursement", icon: "award" },
];

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SuperAdminProgramConfig() {
  const [activeSection, setActiveSection] = useState("eligibility");
  const contentRef = useRef<HTMLDivElement>(null);

  function scrollTo(id: string) {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F7F9" }}>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <PageHeader
          title="Program Configuration"
          subtitle="Configure scholarship eligibility, documents, application periods, and disbursement settings."
          breadcrumb={["Super Admin", "Program Configuration"]}
        />

        {/* Mobile: horizontal scrollable tab bar */}
        <div className="md:hidden mb-4 overflow-x-auto">
          <div className="flex gap-1 min-w-max pb-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollTo(item.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-500 whitespace-nowrap transition"
                style={{
                  fontWeight: 500,
                  backgroundColor: activeSection === item.id ? "#163A63" : "white",
                  color: activeSection === item.id ? "white" : "#374151",
                  border: "1px solid",
                  borderColor: activeSection === item.id ? "#163A63" : "#E5E7EB",
                }}
              >
                <Icon name={item.icon} size={14} />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-6 items-start">
          {/* Desktop: sticky left nav */}
          <aside className="hidden md:flex flex-col gap-1 w-56 flex-shrink-0 sticky top-6">
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-2">
              {NAV_ITEMS.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollTo(item.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left transition"
                    style={{
                      backgroundColor: isActive ? "#163A63" : "transparent",
                      color: isActive ? "white" : "#374151",
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    <Icon name={item.icon} size={15} />
                    <span>{item.label}</span>
                    {isActive && (
                      <span className="ml-auto">
                        <Icon name="chevron-right" size={13} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Info card */}
            <div
              className="mt-3 rounded-xl p-4"
              style={{ backgroundColor: "#0B1F3A" }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Icon name="info" size={14} className="text-[#D4A72C]" />
                <span className="text-xs font-600 text-white" style={{ fontWeight: 600 }}>Config Notice</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Changes take effect on the next open application period. Active applications are not retroactively affected.
              </p>
            </div>
          </aside>

          {/* Content */}
          <div ref={contentRef} className="flex-1 min-w-0 space-y-6">
            <EligibilitySection />
            <DocumentsSection />
            <PeriodsSection />
            <DisbursementSection />
          </div>
        </div>
      </div>
    </div>
  );
}
