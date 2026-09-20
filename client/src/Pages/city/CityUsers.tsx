import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';

// Live account directory from GET /api/users (User collection). Account
// creation is NOT done here: students self-register, staff accounts are
// provisioned by the Super Admin, so this page is intentionally read-only.
interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  barangay: string;
  createdAt: string;
  lastLoginAt: string | null;
}

const roleLabels: Record<string, string> = {
  student: 'Student',
  barangay_staff: 'Barangay Staff',
  city_admin: 'City Administrator',
  admin_staff: 'Admin Staff',
  super_admin: 'Super Admin',
  superadmin: 'Super Admin',
};

const roleColors: Record<string, string> = {
  student: 'bg-blue-50 text-blue-700',
  barangay_staff: 'bg-purple-50 text-purple-700',
  city_admin: 'bg-amber-50 text-amber-700',
  admin_staff: 'bg-amber-50 text-amber-700',
  super_admin: 'bg-red-50 text-red-700',
  superadmin: 'bg-red-50 text-red-700',
};

const ROLE_FILTERS: { label: string; value: string }[] = [
  { label: 'All Roles', value: 'all' },
  { label: 'Students', value: 'student' },
  { label: 'Barangay Staff', value: 'barangay_staff' },
  { label: 'City Staff', value: 'city' },
  { label: 'Super Admins', value: 'superadmin' },
];

const matchesRoleFilter = (role: string, filter: string) => {
  if (filter === 'all') return true;
  if (filter === 'city') return role === 'city_admin' || role === 'admin_staff';
  if (filter === 'superadmin') return role === 'super_admin' || role === 'superadmin';
  return role === filter;
};

const date = (value: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function CityUsers() {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api<{ users: DirectoryUser[] }>('/users')
      .then((result) => { if (!cancelled) setUsers(result.users || []); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load users.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const query = search.trim().toLowerCase();
  const filtered = users.filter((user) =>
    matchesRoleFilter(user.role, roleFilter) &&
    (user.name + ' ' + user.email + ' ' + user.barangay).toLowerCase().includes(query));

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading users...</div>;

  return (
    <div>
      <PageHeader title="User Management" subtitle="Every account in the system. Staff accounts are provisioned by the Super Admin." breadcrumb={['City Office', 'User Management']} />
      {error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Icon name="search" size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E5E7EB] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]" placeholder="Search by name, email or barangay..." />
        </div>
        <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="px-3 py-2.5 rounded-xl border border-[#E5E7EB] text-sm bg-white text-[#6B7280]">
          {ROLE_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F6F7F9]">
                {['User', 'Email', 'Role', 'Barangay', 'Account Status', 'Registered', 'Last Login'].map((header) => (
                  <th key={header} className="px-5 py-3 text-left text-xs font-600 text-[#6B7280]" style={{ fontWeight: 600 }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filtered.map((user) => (
                <tr key={user.id} className="hover:bg-[#F6F7F9]">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#163A63] flex items-center justify-center text-white text-xs font-700 flex-shrink-0" style={{ fontWeight: 700 }}>
                        {user.name.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{user.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{user.email}</td>
                  <td className="px-5 py-3.5">
                    <span className={'px-2 py-0.5 text-xs font-600 rounded-full ' + (roleColors[user.role] || 'bg-gray-100 text-gray-600')} style={{ fontWeight: 600 }}>
                      {roleLabels[user.role] || user.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{user.barangay || '—'}</td>
                  <td className="px-5 py-3.5">
                    <span className={'px-2 py-0.5 text-xs font-600 rounded-full ' + (user.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500')} style={{ fontWeight: 600 }}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{date(user.createdAt)}</td>
                  <td className="px-5 py-3.5 text-sm text-[#6B7280]">{date(user.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-[#E5E7EB] text-xs text-[#6B7280]">Showing {filtered.length} of {users.length} accounts</div>
      </div>
    </div>
  );
}
