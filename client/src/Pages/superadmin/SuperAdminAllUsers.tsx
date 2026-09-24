import { useState, useRef, useEffect } from "react";
import Icon from "../../components/Icon";
import PageHeader from "../../components/PageHeader";
import { api } from "../../lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

type UserRole = "student" | "barangay" | "city" | "superadmin";
type UserStatus = "active" | "suspended" | "deactivated" | "pending";

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  barangay?: string;
  barangayId?: string;
  school?: string;
  status: UserStatus;
  lastLogin: string;
}

type FilterRole = "all" | UserRole;

type ConfirmAction = "suspend" | "deactivate" | null;

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLE_TABS: { label: string; value: FilterRole }[] = [
  { label: "All", value: "all" },
  { label: "Student", value: "student" },
  { label: "Barangay Official", value: "barangay" },
  { label: "City Office", value: "city" },
  { label: "Super Admin", value: "superadmin" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function avatarColor(role: UserRole): string {
  switch (role) {
    case "student": return "bg-blue-100 text-blue-700";
    case "barangay": return "bg-purple-100 text-purple-700";
    case "city": return "bg-amber-100 text-amber-700";
    case "superadmin": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

function roleBadge(role: UserRole): { label: string; cls: string } {
  switch (role) {
    case "student": return { label: "Student", cls: "bg-blue-50 text-blue-700 border border-blue-200" };
    case "barangay": return { label: "Barangay Official", cls: "bg-purple-50 text-purple-700 border border-purple-200" };
    case "city": return { label: "City Office", cls: "bg-amber-50 text-amber-700 border border-amber-200" };
    case "superadmin": return { label: "Super Admin", cls: "bg-red-50 text-red-700 border border-red-200" };
  }
}

function statusBadge(status: UserStatus): { label: string; cls: string } {
  switch (status) {
    case "active": return { label: "Active", cls: "bg-green-50 text-green-700 border border-green-200" };
    case "suspended": return { label: "Suspended", cls: "bg-amber-50 text-amber-700 border border-amber-200" };
    case "deactivated": return { label: "Deactivated", cls: "bg-gray-100 text-gray-500 border border-gray-200" };
    default: return { label: "Pending", cls: "bg-blue-50 text-blue-700 border border-blue-200" };
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ActionMenuProps {
  user: User;
  onSuspend: () => void;
  onDeactivate: () => void;
  onResetPassword: () => void;
  onReassign: () => void;
}

function ActionMenu({ user, onSuspend, onDeactivate, onResetPassword, onReassign }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
        aria-label="Actions"
      >
        <Icon name="more-vertical" size={16} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 bg-white rounded-xl shadow-lg border border-[#E5E7EB] py-1 text-sm">
          {user.role === "barangay" && (
            <button
              onClick={() => { setOpen(false); onReassign(); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-[#163A63] hover:bg-blue-50 transition-colors"
            >
              <Icon name="map-pin" size={14} />
              Reassign Barangay
            </button>
          )}
          <button
            onClick={() => { setOpen(false); onResetPassword(); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Icon name="lock" size={14} />
            Reset Password
          </button>
          {user.status !== "suspended" && (
            <button
              onClick={() => { setOpen(false); onSuspend(); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-amber-600 hover:bg-amber-50 transition-colors"
            >
              <Icon name="alert-circle" size={14} />
              Suspend
            </button>
          )}
          {user.status !== "deactivated" && (
            <button
              onClick={() => { setOpen(false); onDeactivate(); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-red-600 hover:bg-red-50 transition-colors"
            >
              <Icon name="x-circle" size={14} />
              Deactivate
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SuperAdminAllUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [barangays, setBarangays] = useState<{ _id: string; name: string }[]>([]);
  const [schools, setSchools] = useState<{ _id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [roleFilter, setRoleFilter] = useState<FilterRole>("all");
  const [search, setSearch] = useState("");

  // Confirm modal state
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);

  // Reassign modal state
  const [reassignUserId, setReassignUserId] = useState<string | null>(null);
  // Always holds a barangay OBJECT ID: seeded from the user's current
  // barangayId and matching the option values in the dropdown. (The old bug
  // mixed names and ids here, so the Confirm button stayed disabled for
  // unassigned accounts and sent a name where the server expected an id.)
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [reassignError, setReassignError] = useState("");

  // Toast state
  const [toastUserId, setToastUserId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    async function loadUsers() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (roleFilter !== "all") params.set("role", roleFilter);
        const query = params.toString();
        const result = await api<{
          users: { id: string; name: string; email: string; role: string; barangay: string; barangayId: string; school: string; status: string; lastLogin: string }[];
          barangays: { _id: string; name: string }[];
          schools: { _id: string; name: string }[];
        }>(`/super-admin/users${query ? `?${query}` : ""}`);
        setUsers(
          (result.users || []).map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            role: (user.role || "student") as UserRole,
            barangay: user.barangay || undefined,
            barangayId: user.barangayId || undefined,
            school: user.school || undefined,
            status: (user.status || "active") as UserStatus,
            lastLogin: user.lastLogin || "",
          }))
        );
        setBarangays(result.barangays || []);
        setSchools(result.schools || []);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load users from the database.");
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, [roleFilter]);

  // ── Derived data
  const filtered = users.filter((u) => {
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.barangay?.toLowerCase().includes(q) ?? false) ||
      (u.school?.toLowerCase().includes(q) ?? false);
    return matchRole && matchSearch;
  });

  const targetUser = targetUserId !== null ? users.find((u) => u.id === targetUserId) : null;
  const reassignUser = reassignUserId !== null ? users.find((u) => u.id === reassignUserId) : null;

  // ── Handlers
  function openConfirm(action: ConfirmAction, userId: string) {
    setConfirmAction(action);
    setTargetUserId(userId);
  }

  function closeConfirm() {
    setConfirmAction(null);
    setTargetUserId(null);
  }

  async function applyConfirm() {
    if (!targetUserId || !confirmAction) return;
    setSaving(true);
    setError("");
    try {
      const result = await api<{ user: { id: string; status: string } }>(
        `/super-admin/users/${targetUserId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: confirmAction === "suspend" ? "suspended" : "deactivated",
          }),
        }
      );
      const nextStatus = result.user.status as UserStatus;
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUserId ? { ...u, status: nextStatus } : u))
      );
      closeConfirm();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update this user.");
    } finally {
      setSaving(false);
    }
  }

  function openReassign(userId: string) {
    const user = users.find((u) => u.id === userId);
    setReassignUserId(userId);
    // Seed with the current barangay OBJECT ID so it matches the dropdown's
    // option values (ids). Unassigned accounts get "" — the placeholder.
    setSelectedBarangay(user?.barangayId ?? "");
    setReassignError("");
  }

  function showToast(userId: string, message: string) {
    setToastUserId(userId);
    setToastMessage(message);
    setTimeout(() => {
      setToastUserId(null);
      setToastMessage("");
    }, 3000);
  }

  async function applyReassign() {
    if (!reassignUserId || !selectedBarangay || selectedBarangay === reassignUser?.barangayId) return;
    const reassignedId = reassignUserId;
    setSaving(true);
    setReassignError("");
    setError("");
    try {
      const result = await api<{ user: { barangay: string; barangayId?: string } }>(
        `/super-admin/users/${reassignedId}`,
        // barangayId is a real ObjectId (the dropdown's option value) — the
        // server resolves it with Barangay.findById and writes User.barangay.
        { method: "PATCH", body: JSON.stringify({ barangayId: selectedBarangay }) }
      );
      const updatedName = result.user.barangay;
      const updatedId = result.user.barangayId ?? selectedBarangay;
      setUsers((prev) =>
        prev.map((u) => (u.id === reassignedId ? { ...u, barangay: updatedName, barangayId: updatedId } : u))
      );
      showToast(reassignedId, "Barangay updated!");
      setReassignUserId(null);
      setSelectedBarangay("");
    } catch (requestError) {
      // Surface it BOTH inside the modal (the page banner sits behind the
      // z-50 overlay) and at page level — never fail silently again.
      const message = requestError instanceof Error ? requestError.message : "Unable to reassign this user.";
      setReassignError(message);
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword(userId: string) {
    setSaving(true);
    setError("");
    try {
      const result = await api<{ temporaryPassword: string }>(
        `/super-admin/users/${userId}/reset-password`,
        { method: "POST", body: JSON.stringify({}) }
      );
      window.alert(`Temporary password issued: ${result.temporaryPassword}\nShare it with the user. They must change it on the next sign-in.`);
      showToast(userId, "Password reset sent!");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to reset the password.");
    } finally {
      setSaving(false);
    }
  }

  // ── Role tab counts
  const counts: Record<FilterRole, number> = {
    all: users.length,
    student: users.filter((u) => u.role === "student").length,
    barangay: users.filter((u) => u.role === "barangay").length,
    city: users.filter((u) => u.role === "city").length,
    superadmin: users.filter((u) => u.role === "superadmin").length,
  };

  return (
    <div className="min-h-screen bg-[#F6F7F9] p-6">
      <div className="max-w-7xl mx-auto">
        <PageHeader
          title="All Users"
          subtitle="Manage every account across all access levels"
          breadcrumb={["Super Admin", "User Management", "All Users"]}
        />

        {/* Page-level errors (load / action failures) — this banner was
            missing entirely, which made failed reassignments invisible. */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* ── Filter bar */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Role tabs */}
          <div className="flex flex-wrap gap-1">
            {ROLE_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setRoleFilter(tab.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  roleFilter === tab.value
                    ? "bg-[#0B1F3A] text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {tab.label}
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    roleFilter === tab.value ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {counts[tab.value]}
                </span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search name, email, school..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]/30 focus:border-[#163A63] bg-[#F6F7F9] placeholder-gray-400"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ── Table */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F6F7F9]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Barangay</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">School</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Login</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                        <Icon name="users" size={32} className="text-gray-300" />
                        <p className="font-medium text-gray-500">No users found</p>
                        <p className="text-xs">Try adjusting your filters or search query.</p>
                      </div>
                    </td>
                  </tr>
                )}
                {filtered.map((user) => {
                  const rb = roleBadge(user.role);
                  const sb = statusBadge(user.status);
                  return (
                    <tr key={user.id} className="hover:bg-[#F6F7F9] transition-colors group">
                      {/* User */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${avatarColor(user.role)}`}
                          >
                            {getInitials(user.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-[#0B1F3A] truncate">{user.name}</p>
                            <p className="text-xs text-gray-400 truncate">{user.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${rb.cls}`}>
                          {rb.label}
                        </span>
                      </td>

                      {/* Barangay */}
                      <td className="px-4 py-3 text-gray-600">
                        {user.role === "barangay" ? (
                          <span className="flex items-center gap-1">
                            <Icon name="map-pin" size={12} className="text-purple-400 flex-shrink-0" />
                            {user.barangay}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* School */}
                      <td className="px-4 py-3 text-gray-600">
                        {user.role === "student" && user.school ? (
                          <span className="flex items-center gap-1">
                            <Icon name="book" size={12} className="text-blue-400 flex-shrink-0" />
                            {user.school}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sb.cls}`}>
                          {sb.label}
                        </span>
                        {toastUserId === user.id && (
                          <span className="ml-2 text-xs text-green-600 font-medium animate-pulse">
                            {toastMessage || "Password reset sent!"}
                          </span>
                        )}
                      </td>

                      {/* Last Login */}
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Icon name="clock" size={12} className="text-gray-300" />
                          {user.lastLogin}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <ActionMenu
                          user={user}
                          onSuspend={() => openConfirm("suspend", user.id)}
                          onDeactivate={() => openConfirm("deactivate", user.id)}
                          onResetPassword={() => handleResetPassword(user.id)}
                          onReassign={() => openReassign(user.id)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer count */}
          <div className="px-4 py-2.5 border-t border-[#E5E7EB] bg-[#F6F7F9] flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Showing <span className="font-semibold text-gray-600">{filtered.length}</span> of{" "}
              <span className="font-semibold text-gray-600">{users.length}</span> users
            </p>
          </div>
        </div>
      </div>

      {/* ── Confirm Modal (Suspend / Deactivate) */}
      {confirmAction && targetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-[#E5E7EB] overflow-hidden">
            {/* Header stripe */}
            <div
              className={`px-5 py-4 flex items-center gap-3 ${
                confirmAction === "suspend" ? "bg-amber-50 border-b border-amber-100" : "bg-red-50 border-b border-red-100"
              }`}
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  confirmAction === "suspend" ? "bg-amber-100 text-amber-600" : "bg-red-100 text-red-600"
                }`}
              >
                <Icon name={confirmAction === "suspend" ? "alert-triangle" : "x-circle"} size={18} />
              </div>
              <div>
                <p className={`font-semibold ${confirmAction === "suspend" ? "text-amber-800" : "text-red-800"}`}>
                  {confirmAction === "suspend" ? "Suspend User" : "Deactivate User"}
                </p>
                <p className={`text-xs ${confirmAction === "suspend" ? "text-amber-600" : "text-red-500"}`}>
                  This action will affect the user immediately.
                </p>
              </div>
            </div>

            <div className="px-5 py-4">
              <p className="text-sm text-gray-700">
                Are you sure you want to{" "}
                <span className="font-semibold">{confirmAction}</span>{" "}
                <span className="font-semibold text-[#0B1F3A]">{targetUser.name}</span>?
              </p>

              {confirmAction === "suspend" && (
                <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-100 text-xs text-amber-700">
                  <strong>Suspend</strong> temporarily prevents the user from logging in. You can reverse this action later.
                </div>
              )}
              {confirmAction === "deactivate" && (
                <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-100 text-xs text-red-600">
                  <strong>Deactivate</strong> permanently disables the account. The user will lose all access and must be reactivated by an admin.
                </div>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={closeConfirm}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-[#E5E7EB] hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={applyConfirm}
                  className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                    confirmAction === "suspend"
                      ? "bg-amber-500 hover:bg-amber-600"
                      : "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  {confirmAction === "suspend" ? "Yes, Suspend" : "Yes, Deactivate"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reassign Barangay Modal */}
      {reassignUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-[#E5E7EB] overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 bg-[#F6F7F9] border-b border-[#E5E7EB] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#163A63]/10 text-[#163A63] flex items-center justify-center flex-shrink-0">
                  <Icon name="map-pin" size={18} />
                </div>
                <div>
                  <p className="font-semibold text-[#0B1F3A]">Reassign Barangay</p>
                  <p className="text-xs text-gray-400">Change the barangay assignment for this official</p>
                </div>
              </div>
              <button
                onClick={() => setReassignUserId(null)}
                className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 transition-colors"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <div className="px-5 py-4">
              {/* Current user info */}
              <div className="flex items-center gap-3 mb-4 p-3 bg-[#F6F7F9] rounded-xl border border-[#E5E7EB]">
                <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {getInitials(reassignUser.name)}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-[#0B1F3A] text-sm truncate">{reassignUser.name}</p>
                  <p className="text-xs text-gray-400">
                    Current: <span className="text-purple-600 font-medium">{reassignUser.barangay}</span>
                  </p>
                </div>
              </div>

              {/* Barangay dropdown */}
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Select New Barangay
              </label>
              <div className="relative">
                <select
                  value={selectedBarangay}
                  onChange={(e) => { setSelectedBarangay(e.target.value); setReassignError(""); }}
                  className="w-full appearance-none border border-[#E5E7EB] rounded-lg px-3 py-2.5 pr-9 text-sm text-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#163A63]/30 focus:border-[#163A63] bg-white"
                >
                  {/* Placeholder so the controlled value ("") always matches
                      an option — the selection registers and Confirm enables
                      only after a real choice is made. Options come from the
                      DB-backed barangay list with OBJECT IDs as values, the
                      exact type the server's Barangay.findById expects. */}
                  <option value="">Select a barangay</option>
                  {barangays.map((b) => (
                    <option key={b._id} value={b._id}>{b.name}</option>
                  ))}
                </select>
                <Icon name="chevron-down" size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>

              {selectedBarangay && selectedBarangay !== reassignUser.barangayId && (
                <div className="mt-3 p-2.5 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-700 flex items-center gap-2">
                  <Icon name="info" size={13} />
                  Will be reassigned from <span className="font-semibold">{reassignUser.barangay || "no barangay"}</span> to{" "}
                  <span className="font-semibold">
                    {barangays.find((b) => b._id === selectedBarangay)?.name || "the selected barangay"}
                  </span>
                </div>
              )}

              {reassignError && (
                <div className="mt-3 p-2.5 bg-red-50 rounded-lg border border-red-100 text-xs text-red-700 flex items-center gap-2">
                  <Icon name="alert-circle" size={13} />
                  {reassignError}
                </div>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setReassignUserId(null)}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-[#E5E7EB] hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={applyReassign}
                  disabled={saving || !selectedBarangay || selectedBarangay === reassignUser.barangayId}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#163A63] hover:bg-[#0B1F3A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <Icon name="check" size={14} />
                  {saving ? "Saving…" : "Confirm Reassignment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
