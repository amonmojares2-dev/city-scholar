import { useEffect, useState } from "react";
import Icon from "../../components/Icon";
import PageHeader from "../../components/PageHeader";
import StatusBadge from "../../components/StatusBadge";
import { api } from "../../lib/api";
// Same barangay list the student sign-up / Application flow uses.
import { BARANGAYS } from "../../data/barangays";

type AccountStatus = "pending" | "approved" | "rejected";
type AccountType = "city" | "barangay";

interface BaseAccount {
  id: string;
  name: string;
  email: string;
  employeeNumber: string;
  registeredDate: string;
  status: AccountStatus;
  type: AccountType;
  reviewNotes?: string;
  role?: string;
}

interface CityAccount extends BaseAccount {
  type: "city";
}

interface BarangayAccount extends BaseAccount {
  type: "barangay";
  barangay: string;
}

type Account = CityAccount | BarangayAccount;

interface ChecklistState {
  employeeValid: boolean;
  emailDomain: boolean;
  positionConfirmed: boolean;
}

interface ReviewModalProps {
  account: Account;
  onClose: () => void;
  onApprove: (id: string, notes: string) => Promise<void>;
  onReject: (id: string, notes: string) => Promise<void>;
  // Assign / reassign the barangay of a Barangay Official. Separate from
  // approve / reject so it also works for already-approved accounts (e.g.
  // ones created before the Add User barangay dropdown existed).
  onBarangayChange: (id: string, barangay: string) => Promise<void>;
}

function ReviewModal({ account, onClose, onApprove, onReject, onBarangayChange }: ReviewModalProps) {
  const [checklist, setChecklist] = useState<ChecklistState>({
    employeeValid: false,
    emailDomain: false,
    positionConfirmed: false,
  });
  const [notes, setNotes] = useState(account.reviewNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  // Barangay assignment edit — usable for every status so the Super Admin
  // can fix accounts created without one or reassign a transferred official.
  const [editBarangay, setEditBarangay] = useState(
    account.type === "barangay" ? (account as BarangayAccount).barangay : ""
  );
  const [barangaySaving, setBarangaySaving] = useState(false);
  const [barangaySaved, setBarangaySaved] = useState(false);

  const isPending = account.status === "pending";

  const toggleCheck = (key: keyof ChecklistState) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleApprove = async () => {
    setSaving(true);
    setModalError("");
    try {
      await onApprove(account.id, notes);
    } catch (requestError) {
      setModalError(requestError instanceof Error ? requestError.message : "Unable to approve this account.");
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    setSaving(true);
    setModalError("");
    try {
      await onReject(account.id, notes);
    } catch (requestError) {
      setModalError(requestError instanceof Error ? requestError.message : "Unable to reject this account.");
    } finally {
      setSaving(false);
    }
  };

  // Save the barangay assignment on its own — independent of the approve /
  // reject workflow, so it works for already-approved accounts too.
  const handleBarangaySave = async () => {
    if (!editBarangay.trim()) {
      setModalError("Please select a barangay.");
      return;
    }
    setBarangaySaving(true);
    setModalError("");
    setBarangaySaved(false);
    try {
      await onBarangayChange(account.id, editBarangay.trim());
      setBarangaySaved(true);
    } catch (requestError) {
      setModalError(requestError instanceof Error ? requestError.message : "Unable to update the barangay assignment.");
    } finally {
      setBarangaySaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: "#ffffff" }}
      >
        {/* Modal Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ backgroundColor: "#0B1F3A" }}
        >
          <div>
            <h2 className="text-lg font-semibold text-white">Account Review</h2>
            <p className="text-sm mt-0.5" style={{ color: "#94a3b8" }}>
              {account.type === "city" ? "City Office Staff" : "Barangay Official"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
          >
            <Icon name="x" size={20} className="text-white" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(100vh-200px)]">
          {/* Account Details */}
          <div className="mb-6">
            <h3
              className="text-sm font-semibold uppercase tracking-wider mb-3"
              style={{ color: "#163A63" }}
            >
              Account Details
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <DetailField label="Full Name" value={account.name} />
              <DetailField label="Email Address" value={account.email} />
              <DetailField label="Employee Number" value={account.employeeNumber} />
              <DetailField label="Registered Date" value={account.registeredDate} />
              {account.type === "barangay" && (
                <DetailField label="Barangay Assignment" value={(account as BarangayAccount).barangay} />
              )}
              <DetailField
                label="Current Status"
                value={
                  <span className="capitalize font-medium" style={{
                    color: account.status === "approved" ? "#16a34a" : account.status === "rejected" ? "#dc2626" : "#d97706"
                  }}>
                    {account.status}
                  </span>
                }
              />
            </div>
          </div>

          {/* Barangay assignment — editable for every status so the Super
              Admin can fix accounts created without one (before this field
              existed) or reassign an official who transferred. */}
          {account.type === "barangay" && (
            <div className="mb-6">
              <h3
                className="text-sm font-semibold uppercase tracking-wider mb-3"
                style={{ color: "#163A63" }}
              >
                Barangay Assignment
              </h3>
              <div className="flex items-end gap-2">
                <select
                  value={editBarangay}
                  onChange={(event) => { setEditBarangay(event.target.value); setBarangaySaved(false); setModalError(""); }}
                  className="flex-1 rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors"
                  style={{ border: "1px solid #E5E7EB", backgroundColor: "#ffffff", color: "#0B1F3A" }}
                >
                  <option value="">Select a barangay</option>
                  {BARANGAYS.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <button
                  onClick={handleBarangaySave}
                  disabled={barangaySaving || !editBarangay.trim()}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: "#163A63" }}
                >
                  {barangaySaving ? "Saving…" : "Save"}
                </button>
              </div>
              <p className="mt-1.5 text-xs" style={{ color: barangaySaved ? "#16a34a" : "#6b7280" }}>
                {barangaySaved
                  ? "Saved — this account is now scoped to the selected barangay."
                  : "Which barangay this official serves. Barangay portal queues only show this barangay's records."}
              </p>
            </div>
          )}

          {/* Verification Checklist */}
          <div className="mb-6">
            <h3
              className="text-sm font-semibold uppercase tracking-wider mb-3"
              style={{ color: "#163A63" }}
            >
              Verification Checklist
            </h3>
            <div
              className="rounded-lg p-4 space-y-3"
              style={{ backgroundColor: "#F6F7F9", border: "1px solid #E5E7EB" }}
            >
              <ChecklistItem
                checked={checklist.employeeValid}
                label="Employee number is valid and matches HR records"
                disabled={!isPending}
                onChange={() => toggleCheck("employeeValid")}
              />
              <ChecklistItem
                checked={checklist.emailDomain}
                label={`Email domain is verified (${account.type === "city" ? "@dagupan.gov.ph" : "@brg.gov.ph"})`}
                disabled={!isPending}
                onChange={() => toggleCheck("emailDomain")}
              />
              <ChecklistItem
                checked={checklist.positionConfirmed}
                label={
                  account.type === "barangay"
                    ? `Barangay assignment confirmed (${(account as BarangayAccount).barangay})`
                    : "Position and department assignment confirmed"
                }
                disabled={!isPending}
                onChange={() => toggleCheck("positionConfirmed")}
              />
            </div>
          </div>

          {/* Review Notes */}
          <div className="mb-6">
            <label
              className="block text-sm font-semibold mb-2"
              style={{ color: "#163A63" }}
            >
              Review Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!isPending}
              rows={3}
              placeholder={isPending ? "Add notes about this account review..." : "No notes added."}
              className="w-full rounded-lg px-3 py-2.5 text-sm resize-none transition-colors focus:outline-none"
              style={{
                border: "1px solid #E5E7EB",
                backgroundColor: isPending ? "#ffffff" : "#F6F7F9",
                color: "#0B1F3A",
              }}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            {isPending ? (
              <>
                <button
                  onClick={onClose}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100"
                  style={{ border: "1px solid #E5E7EB", color: "#374151" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: "#dc2626" }}
                >
                  {saving ? "Rejecting…" : "Reject Account"}
                </button>
                <button
                  onClick={handleApprove}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: "#16a34a" }}
                >
                  {saving ? "Approving…" : "Approve Account"}
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#163A63" }}
              >
                Close
              </button>
            )}
          </div>
          {modalError && (
            <p className="mt-3 text-xs font-medium" style={{ color: "#dc2626" }}>
              {modalError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface DetailFieldProps {
  label: string;
  value: React.ReactNode;
}

function DetailField({ label, value }: DetailFieldProps) {
  return (
    <div>
      <p className="text-xs font-medium mb-1" style={{ color: "#6b7280" }}>
        {label}
      </p>
      <p className="text-sm font-medium" style={{ color: "#0B1F3A" }}>
        {value}
      </p>
    </div>
  );
}

interface ChecklistItemProps {
  checked: boolean;
  label: string;
  disabled: boolean;
  onChange: () => void;
}

function ChecklistItem({ checked, label, disabled, onChange }: ChecklistItemProps) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? "cursor-default" : "cursor-pointer"}`}>
      <div className="mt-0.5 flex-shrink-0">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="w-4 h-4 rounded accent-[#163A63]"
        />
      </div>
      <span className="text-sm" style={{ color: "#374151" }}>
        {label}
      </span>
    </label>
  );
}

function StatusDot({ status }: { status: AccountStatus }) {
  const colors: Record<AccountStatus, string> = {
    pending: "#d97706",
    approved: "#16a34a",
    rejected: "#dc2626",
  };
  const labels: Record<AccountStatus, string> = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: colors[status] }}
      />
      <span className="text-sm font-medium" style={{ color: colors[status] }}>
        {labels[status]}
      </span>
    </span>
  );
}

// Barangay column (replaces the old Status column):
//   • Barangay Official → the barangay assigned on the account (set by the
//     Add User dropdown, or by the Review modal's "Save" / the All Users
//     "Reassign Barangay" action). Blank means the account predates the
//     fix — flagged as "Not assigned" because every Barangay portal page
//     then shows "not assigned to a barangay yet".
//   • City Office Staff → "City-wide" — the City portal is not scoped to a
//     single barangay.
//   • Anything else (e.g. a Super Admin, if ever listed here) → "—".
function BarangayCell({ account }: { account: Account }) {
  // Widened to string so the fallback branch stays meaningful if another
  // account type is ever listed in this table.
  const type: string = account.type;
  const assigned = (account as BarangayAccount).barangay || "";

  if (type === "barangay") {
    if (!assigned) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: "#b45309" }}>
          <Icon name="alert-circle" size={13} className="flex-shrink-0" />
          Not assigned
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5" style={{ color: "#374151" }}>
        <Icon name="map-pin" size={13} className="text-purple-400 flex-shrink-0" />
        {assigned}
      </span>
    );
  }

  if (type === "city") {
    return <span style={{ color: "#6b7280" }}>City-wide</span>;
  }

  return <span style={{ color: "#9ca3af" }}>—</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD USER MODAL (Super Admin only)
//
// Provisions a Barangay Admin or City Admin account straight into the
// database. The Super Admin is the trusted source, so there is NO email
// verification / OTP step and NO password at creation time: the new user sets
// their own password through the standard Forgot Password flow on the login
// page, using the email entered here.
// ─────────────────────────────────────────────────────────────────────────────

// Same shape the server validates with (see server/utils/validation.js).
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPLOYEE_FORMAT: Record<"barangay_admin" | "city_admin", RegExp> = {
  barangay_admin: /^BRG-\d{4}-\d{4}$/,
  city_admin: /^CSO-\d{4}-\d{4}$/,
};

const STAFF_ROLE_OPTIONS = [
  { value: "barangay_admin", label: "Barangay Admin" },
  { value: "city_admin", label: "City Admin" },
] as const;

type StaffRoleValue = (typeof STAFF_ROLE_OPTIONS)[number]["value"];

interface CreatedAccount {
  message: string;
  type: AccountType;
  email: string;
}

interface AddUserModalProps {
  onClose: () => void;
  onCreated: (account: CreatedAccount) => void;
}

function AddUserModal({ onClose, onCreated }: AddUserModalProps) {
  const [email, setEmail] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [role, setRole] = useState<StaffRoleValue>("barangay_admin");
  // Required when role is Barangay Admin — the account is scoped to exactly
  // one barangay (User.barangay), without which every Barangay portal page
  // shows "Your account is not assigned to a barangay yet."
  const [barangay, setBarangay] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");

  const roleIsBarangay = role === "barangay_admin";
  const employeeExample = roleIsBarangay ? "BRG-2026-0001" : "CSO-2026-0001";

  // Runs before the request goes out. The server repeats every one of these
  // checks and additionally enforces email / employee-number uniqueness.
  const validate = () => {
    if (!email.trim()) return "Email address is required.";
    if (!EMAIL_FORMAT.test(email.trim())) return "Enter a valid email address.";
    if (!employeeNumber.trim()) return "Employee number is required.";
    if (!EMPLOYEE_FORMAT[role].test(employeeNumber.trim().toUpperCase())) {
      return `Employee number must follow the ${roleIsBarangay ? "BRG" : "CSO"}-YYYY-0000 format.`;
    }
    if (roleIsBarangay && !barangay.trim()) {
      return "Please select a barangay for this Barangay Admin.";
    }
    return "";
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalError("");

    const validationError = validate();
    if (validationError) {
      setModalError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const result = await api<{
        message: string;
        user: { email: string; role: string; type: AccountType };
      }>("/auth/super-admin/create-user", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          employeeNumber: employeeNumber.trim().toUpperCase(),
          role,
          // Sent only for Barangay Admin — the server resolves the name to a
          // Barangay record and stores it on User.barangay.
          ...(roleIsBarangay ? { barangay: barangay.trim() } : {}),
        }),
      });

      onCreated({
        message: result.message || "Account created.",
        type: result.user?.type ?? (roleIsBarangay ? "barangay" : "city"),
        email: result.user?.email ?? email.trim(),
      });
    } catch (requestError) {
      setModalError(requestError instanceof Error ? requestError.message : "Unable to create this account.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full px-3.5 py-2.5 rounded-lg text-sm focus:outline-none transition-colors";
  const inputStyle = { border: "1px solid #E5E7EB", color: "#0B1F3A" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: "#ffffff" }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ backgroundColor: "#0B1F3A" }}>
          <div>
            <h2 className="text-lg font-semibold text-white">Add User</h2>
            <p className="text-sm mt-0.5" style={{ color: "#94a3b8" }}>
              Create a staff account — no password is set here
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-white/10">
            <Icon name="x" size={20} className="text-white" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="add-user-email" className="block text-xs mb-1.5" style={{ color: "#374151", fontWeight: 600 }}>
              Email Address <span className="text-[#DC2626]">*</span>
            </label>
            <input
              id="add-user-email"
              name="email"
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(event) => { setEmail(event.target.value); setModalError(""); }}
              placeholder="name@city.gov.ph"
              className={inputClass}
              style={inputStyle}
            />
            <p className="text-xs mt-1" style={{ color: "#9ca3af" }}>
              The password-reset code is sent to this address, so it must be correct.
            </p>
          </div>

          {/* Employee Number */}
          <div>
            <label htmlFor="add-user-employee" className="block text-xs mb-1.5" style={{ color: "#374151", fontWeight: 600 }}>
              Employee Number <span className="text-[#DC2626]">*</span>
            </label>
            <input
              id="add-user-employee"
              name="employeeNumber"
              type="text"
              required
              autoComplete="off"
              value={employeeNumber}
              onChange={(event) => { setEmployeeNumber(event.target.value); setModalError(""); }}
              placeholder={`e.g. ${employeeExample}`}
              className={`${inputClass} uppercase`}
              style={inputStyle}
            />
            <p className="text-xs mt-1" style={{ color: "#9ca3af" }}>
              {roleIsBarangay ? "As issued by the Barangay office" : "As issued by the City Government"}
            </p>
          </div>

          {/* Role */}
          <div>
            <label htmlFor="add-user-role" className="block text-xs mb-1.5" style={{ color: "#374151", fontWeight: 600 }}>
              Role <span className="text-[#DC2626]">*</span>
            </label>
            <select
              id="add-user-role"
              name="role"
              required
              value={role}
              onChange={(event) => { setRole(event.target.value as StaffRoleValue); setModalError(""); }}
              className={inputClass}
              style={inputStyle}
            >
              {STAFF_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="text-xs mt-1" style={{ color: "#9ca3af" }}>
              {roleIsBarangay
                ? "Gives access to the Barangay portal only."
                : "Gives access to the City Office portal only."}
            </p>
          </div>

          {/* Barangay — required for Barangay Admin so the account is scoped
              to one barangay from creation. Same list the student sign-up /
              Application flow uses (data/barangays.ts). */}
          {roleIsBarangay && (
            <div>
              <label htmlFor="add-user-barangay" className="block text-xs mb-1.5" style={{ color: "#374151", fontWeight: 600 }}>
                Barangay <span className="text-[#DC2626]">*</span>
              </label>
              <select
                id="add-user-barangay"
                name="barangay"
                required
                value={barangay}
                onChange={(event) => { setBarangay(event.target.value); setModalError(""); }}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">Select a barangay</option>
                {BARANGAYS.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <p className="text-xs mt-1" style={{ color: "#9ca3af" }}>
                The Barangay portal only shows records from this barangay.
              </p>
            </div>
          )}

          <div
            className="rounded-lg px-3.5 py-2.5 text-xs"
            style={{ backgroundColor: "#F6F7F9", color: "#6b7280", border: "1px solid #E5E7EB" }}
          >
            No password is set at creation. The new user signs in with{' '}
            <span style={{ color: "#0B1F3A", fontWeight: 600 }}>Forgot Password</span> using this email to set their own
            password for the first time.
          </div>

          {modalError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              {modalError}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-lg text-sm transition-colors"
              style={{ backgroundColor: "#F6F7F9", color: "#374151", border: "1px solid #E5E7EB", fontWeight: 600 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-white transition-all hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: "#0B1F3A", fontWeight: 600 }}
            >
              <Icon name="user-plus" size={15} className="text-[#D4A72C]" />
              {submitting ? "Creating account…" : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SuperAdminAccounts() {
  const [activeTab, setActiveTab] = useState<"city" | "barangay">("city");
  const [cityAccounts, setCityAccounts] = useState<CityAccount[]>([]);
  const [barangayAccounts, setBarangayAccounts] = useState<BarangayAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  // Super Admin "Add User": the modal that provisions a staff account and the
  // confirmation shown after one is created.
  const [showAddUser, setShowAddUser] = useState(false);
  const [notice, setNotice] = useState("");

  const loadAccounts = async (tab: "city" | "barangay") => {
    setLoading(true);
    setError("");
    try {
      const result = await api<{
        accounts: { id: string; name: string; email: string; employeeNumber: string; type: string; role: string; barangay: string; registeredDate: string; status: AccountStatus; reviewNotes: string }[];
      }>(`/super-admin/accounts?type=${tab}`);
      const mapped = (result.accounts || []).map((account) =>
        tab === "city"
          ? ({
              id: account.id,
              name: account.name,
              email: account.email,
              employeeNumber: account.employeeNumber,
              registeredDate: account.registeredDate,
              status: account.status,
              type: "city",
              reviewNotes: account.reviewNotes,
            } as CityAccount)
          : ({
              id: account.id,
              name: account.name,
              email: account.email,
              employeeNumber: account.employeeNumber,
              barangay: account.barangay,
              registeredDate: account.registeredDate,
              status: account.status,
              type: "barangay",
              reviewNotes: account.reviewNotes,
            } as BarangayAccount)
      );
      if (tab === "city") setCityAccounts(mapped as CityAccount[]);
      else setBarangayAccounts(mapped as BarangayAccount[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load staff accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Super Admin "Add User" → the account now exists in the database. Show the
  // confirmation, then reload the Staff Account list so the new user appears.
  const handleCreated = (created: CreatedAccount) => {
    setShowAddUser(false);
    setNotice(`${created.message} New account: ${created.email}.`);
    setSearchQuery("");
    if (created.type === activeTab) {
      // Same tab: the loader effect below does not re-run, so reload directly.
      loadAccounts(activeTab);
    } else {
      // Switching tab re-runs the loader through the effect below.
      setActiveTab(created.type);
    }
  };

  const handleApprove = async (id: string, notes: string) => {
    setSaving(true);
    setError("");
    try {
      const result = await api<{ account: BaseAccount & { barangay?: string; type: AccountType } }>(
        `/super-admin/accounts/${id}`,
        { method: "PATCH", body: JSON.stringify({ status: "approved", reviewNotes: notes }) }
      );
      const updated = result.account;
      if (updated.type === "city") {
        setCityAccounts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: "approved", reviewNotes: updated.reviewNotes ?? notes } : a))
        );
      } else {
        setBarangayAccounts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: "approved", reviewNotes: updated.reviewNotes ?? notes } : a))
        );
      }
      setSelectedAccount((prev) => (prev && prev.id === id ? { ...prev, status: "approved", reviewNotes: updated.reviewNotes ?? notes } as Account : prev));
      setSelectedAccount(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to approve this account.");
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (id: string, notes: string) => {
    setSaving(true);
    setError("");
    try {
      const result = await api<{ account: BaseAccount & { barangay?: string; type: AccountType } }>(
        `/super-admin/accounts/${id}`,
        { method: "PATCH", body: JSON.stringify({ status: "rejected", reviewNotes: notes }) }
      );
      const updated = result.account;
      if (updated.type === "city") {
        setCityAccounts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: "rejected", reviewNotes: updated.reviewNotes ?? notes } : a))
        );
      } else {
        setBarangayAccounts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: "rejected", reviewNotes: updated.reviewNotes ?? notes } : a))
        );
      }
      setSelectedAccount((prev) => (prev && prev.id === id ? { ...prev, status: "rejected", reviewNotes: updated.reviewNotes ?? notes } as Account : prev));
      setSelectedAccount(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to reject this account.");
    } finally {
      setSaving(false);
    }
  };

  // Super Admin "Edit": assign or reassign the barangay of an existing
  // Barangay Official — fixes accounts created before the Add User dropdown
  // existed and officials transferred to another barangay. Errors throw so
  // the modal can surface them inline.
  const handleBarangayChange = async (id: string, barangay: string) => {
    const result = await api<{ account: BaseAccount & { barangay?: string } }>(
      `/super-admin/accounts/${id}`,
      { method: "PATCH", body: JSON.stringify({ barangay }) }
    );
    const updatedName = result.account?.barangay ?? barangay;
    setBarangayAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, barangay: updatedName } : a)));
    setSelectedAccount((prev) =>
      prev && prev.id === id && prev.type === "barangay"
        ? { ...(prev as BarangayAccount), barangay: updatedName }
        : prev
    );
  };

  const filteredCity = cityAccounts.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.employeeNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredBarangay = barangayAccounts.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.employeeNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.barangay.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentAccounts = activeTab === "city" ? filteredCity : filteredBarangay;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F7F9" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title="Staff Accounts"
          subtitle="Create City Admin and Barangay Admin accounts, and review existing staff records"
          action={
            <button
              type="button"
              onClick={() => { setShowAddUser(true); setNotice(""); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-white transition-all hover:opacity-90"
              style={{ backgroundColor: "#0B1F3A", fontWeight: 600 }}
            >
              <Icon name="user-plus" size={16} className="text-[#D4A72C]" />
              Add User
            </button>
          }
        />

        {/* Card Container */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: "#ffffff", border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}
        >
          {/* Tabs + Search Row */}
          <div
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 py-4"
            style={{ borderBottom: "1px solid #E5E7EB" }}
          >
            {/* Pill Tabs */}
            <div
              className="inline-flex rounded-full p-1 gap-1"
              style={{ backgroundColor: "#F6F7F9", border: "1px solid #E5E7EB" }}
            >
              <TabButton
                label={`City Office Staff (${cityAccounts.length})`}
                active={activeTab === "city"}
                onClick={() => { setActiveTab("city"); setSearchQuery(""); }}
              />
              <TabButton
                label={`Barangay Officials (${barangayAccounts.length})`}
                active={activeTab === "barangay"}
                onClick={() => { setActiveTab("barangay"); setSearchQuery(""); }}
              />
            </div>

            {/* Search Bar */}
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Icon name="search" size={16} className="text-[#9CA3AF]" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, or ID..."
                className="pl-9 pr-4 py-2 rounded-lg text-sm w-72 focus:outline-none transition-colors"
                style={{
                  border: "1px solid #E5E7EB",
                  backgroundColor: "#ffffff",
                  color: "#0B1F3A",
                }}
              />
            </div>
          </div>

          {/* Request Status */}
          {notice && (
            <div className="mx-6 mt-4 flex items-start justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
              <span className="flex items-start gap-2">
                <Icon name="check-circle" size={16} className="mt-0.5 flex-shrink-0" />
                <span>{notice}</span>
              </span>
              <button
                type="button"
                onClick={() => setNotice("")}
                className="flex-shrink-0 text-green-700 transition-colors hover:text-green-900"
                aria-label="Dismiss confirmation"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          )}
          {error && (
            <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}
          {loading && (
            <div className="mx-6 mt-4 rounded-lg border border-[#E5E7EB] bg-[#F6F7F9] px-4 py-2.5 text-sm text-[#6b7280]">
              Loading staff accounts from the database…
            </div>
          )}
          {saving && (
            <div className="mx-6 mt-4 rounded-lg border border-[#E5E7EB] bg-[#F6F7F9] px-4 py-2.5 text-sm text-[#6b7280]">
              Saving review decision…
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "#F6F7F9", borderBottom: "1px solid #E5E7EB" }}>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Email</TableHeader>
                  <TableHeader>Employee Number</TableHeader>
                  <TableHeader>Registered Date</TableHeader>
                  {/* This column used to be headed "Status" — it now shows the
                      account's barangay assignment for every account type (see
                      BarangayCell): barangay name for a Barangay Admin,
                      "City-wide" for a City Admin. */}
                  <TableHeader>Barangay</TableHeader>
                  {/* User.status is still needed elsewhere on this page (the
                      Review/View button and the "pending review" footer count),
                      so it keeps its own column instead of being dropped. */}
                  <TableHeader>Status</TableHeader>
                  <TableHeader align="center">Action</TableHeader>
                </tr>
              </thead>
              <tbody>
                {currentAccounts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center py-12 text-sm"
                      style={{ color: "#9ca3af" }}
                    >
                      No accounts match your search.
                    </td>
                  </tr>
                ) : (
                  currentAccounts.map((account, idx) => (
                    <tr
                      key={account.id}
                      style={{
                        borderBottom: idx < currentAccounts.length - 1 ? "1px solid #E5E7EB" : "none",
                        backgroundColor: "#ffffff",
                      }}
                      className="hover:bg-[#F6F7F9] transition-colors"
                    >
                      <td className="px-6 py-4 font-medium whitespace-nowrap" style={{ color: "#0B1F3A" }}>
                        {account.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap" style={{ color: "#374151" }}>
                        {account.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-xs" style={{ color: "#374151" }}>
                        {account.employeeNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap" style={{ color: "#6b7280" }}>
                        {account.registeredDate}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <BarangayCell account={account} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusDot status={account.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => setSelectedAccount(account)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
                          style={
                            account.status === "pending"
                              ? { backgroundColor: "#163A63", color: "#ffffff" }
                              : { backgroundColor: "#F6F7F9", color: "#374151", border: "1px solid #E5E7EB" }
                          }
                        >
                          <Icon
                            name={account.status === "pending" ? "clipboard" : "eye"}
                            size={13}
                            className={account.status === "pending" ? "text-white" : "text-[#374151]"}
                          />
                          {account.status === "pending" ? "Review" : "View"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div
            className="px-6 py-3 flex items-center justify-between"
            style={{ borderTop: "1px solid #E5E7EB", backgroundColor: "#F6F7F9" }}
          >
            <span className="text-xs" style={{ color: "#9ca3af" }}>
              Showing {currentAccounts.length} of{" "}
              {activeTab === "city" ? cityAccounts.length : barangayAccounts.length} records
            </span>
            <span className="text-xs" style={{ color: "#9ca3af" }}>
              {activeTab === "city"
                ? `${cityAccounts.filter((a) => a.status === "pending").length} pending review`
                : `${barangayAccounts.filter((a) => a.status === "pending").length} pending review`}
            </span>
          </div>
        </div>
      </div>

      {/* Modal */}
      {selectedAccount && (
        <ReviewModal
          account={selectedAccount}
          onClose={() => setSelectedAccount(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onBarangayChange={handleBarangayChange}
        />
      )}

      {/* Super Admin "Add User" — provision a staff account */}
      {showAddUser && (
        <AddUserModal
          onClose={() => setShowAddUser(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all whitespace-nowrap"
      style={
        active
          ? { backgroundColor: "#0B1F3A", color: "#D4A72C" }
          : { color: "#6b7280" }
      }
    >
      {label}
    </button>
  );
}

function TableHeader({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
}) {
  return (
    <th
      className={`px-6 py-3 text-xs font-semibold uppercase tracking-wider text-${align}`}
      style={{ color: "#6b7280" }}
    >
      {children}
    </th>
  );
}
