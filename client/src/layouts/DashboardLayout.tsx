import { Outlet, Link, useLocation, useNavigate } from 'react-router';
import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import type { SidebarItem } from '../data/sidebarItems';
import { clearSession, getSession } from '../lib/auth';
import { api } from '../lib/api';
import ConfirmDialog from '../components/ConfirmDialog';
import SessionAvatar from '../components/SessionAvatar';

interface DashboardLayoutProps {
  role: 'student' | 'barangay' | 'city' | 'superadmin';
  sidebarItems: SidebarItem[];
  userName: string;
  userRole: string;
  // Sidebar entries that are visible but not open yet (e.g. a student's
  // Renewal page before the City Office approves). Maps path -> reason.
  lockedItems?: Record<string, string>;
}

const roleColors = {
  student: { badge: 'bg-blue-50 text-blue-700', accent: '#2563EB' },
  barangay: { badge: 'bg-purple-50 text-purple-700', accent: '#7C3AED' },
  city: { badge: 'bg-amber-50 text-amber-700', accent: '#D97706' },
  superadmin: { badge: 'bg-slate-100 text-slate-700', accent: '#0B1F3A' },
};

export default function DashboardLayout({ role, sidebarItems, userName, userRole, lockedItems }: DashboardLayoutProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<{ _id: string; title: string; message: string; readAt?: string; createdAt: string; link?: string }[]>([]);
  const [signOutOpen, setSignOutOpen] = useState(false);

  useEffect(() => {
    api<{ notifications: typeof notifications }>('/notifications')
      .then(result => setNotifications(result.notifications || []))
      .catch(() => setNotifications([]));
  }, []);

  const colors = roleColors[role];
  const sessionUser = getSession()?.user;
  const displayName = sessionUser?.name || userName;
  const signOut = () => { clearSession(); navigate('/login'); };
  const requestSignOut = () => { setProfileOpen(false); setSignOutOpen(true); };

  const groupedItems: { group?: string; items: SidebarItem[] }[] = [];
  for (const item of sidebarItems) {
    const lastGroup = groupedItems[groupedItems.length - 1];
    if (!lastGroup || lastGroup.group !== item.group) {
      groupedItems.push({ group: item.group, items: [item] });
    } else {
      lastGroup.items.push(item);
    }
  }

  const isActive = (path: string) => {
    if (path === '/student' || path === '/barangay' || path === '/city') return pathname === path;
    return pathname.startsWith(path);
  };

  const SidebarContent = () => (
    <div className="h-full flex flex-col bg-[#0B1F3A] text-white">
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#D4A72C] rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-[#0B1F3A] font-800 text-sm" style={{ fontWeight: 800 }}>CS</span>
          </div>
          <div>
            <div className="font-700 text-sm leading-tight" style={{ fontWeight: 700 }}>City Scholarship</div>
            <div className="text-white/50 text-xs leading-tight">{
              role === 'student' ? 'Student Portal' :
              role === 'barangay' ? 'Barangay Official' :
              role === 'superadmin' ? 'Super Admin Console' : 'City Office'
            }</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {groupedItems.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'pt-4' : ''}>
            {group.group && (
              <div className="px-3 pb-1.5 text-[10px] font-700 text-white/40 tracking-wider uppercase" style={{ fontWeight: 700 }}>
                {group.group}
              </div>
            )}
            {group.items.map(item => {
              const active = isActive(item.path);
              const lockReason = lockedItems?.[item.path];

              // Disabled entry: the page exists for this account but the
              // City Office has not unlocked it yet.
              if (lockReason) {
                return (
                  <div
                    key={item.path}
                    title={lockReason}
                    aria-disabled="true"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/30 cursor-not-allowed select-none"
                  >
                    <Icon name={item.icon} size={16} />
                    <span className="flex-1">{item.label}</span>
                    <Icon name="lock" size={13} className="text-[#D4A72C]/70" />
                  </div>
                );
              }

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                    active
                      ? 'bg-white/15 text-white font-600'
                      : 'text-white/60 hover:text-white hover:bg-white/8'
                  }`}
                  style={{ fontWeight: active ? 600 : 400 }}
                >
                  <Icon name={item.icon} size={16} className={active ? 'text-[#D4A72C]' : ''} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-white/10">
        <button
          onClick={requestSignOut}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/8 transition-colors"
        >
          <Icon name="log-out" size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-full flex bg-[#F6F7F9]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 flex-shrink-0 border-r border-[#E5E7EB] overflow-hidden">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-60 flex-shrink-0 shadow-2xl">
            <SidebarContent />
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="h-14 bg-white border-b border-[#E5E7EB] flex items-center px-5 gap-4 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F6F7F9] text-[#1F2937]"
          >
            <Icon name="menu" size={20} />
          </button>

          <div className="flex-1 min-w-0" />

          <div className="flex items-center gap-2">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => { setNotifOpen(o => !o); setProfileOpen(false); }}
                className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F6F7F9] text-[#6B7280]"
              >
                <Icon name="bell" size={18} />
                {notifications.filter(notification => !notification.readAt).length > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#DC2626] rounded-full" />}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-[#E5E7EB] rounded-2xl shadow-xl overflow-hidden z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB]">
                    <span className="font-700 text-sm text-[#1F2937]" style={{ fontWeight: 700 }}>Notifications</span>
                    <span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 font-600 rounded-full" style={{ fontWeight: 600 }}>{notifications.filter(notification => !notification.readAt).length} new</span>
                  </div>
                  <div className="divide-y divide-[#E5E7EB] max-h-72 overflow-y-auto">
                    {notifications.length === 0 ? <div className="px-4 py-8 text-center text-sm text-[#6B7280]">No notifications yet.</div> : notifications.map(notification => (
                      <button key={notification._id} onClick={async () => { await api(`/notifications/${notification._id}/read`, { method: 'PATCH' }).catch(() => undefined); setNotifications(current => current.map(item => item._id === notification._id ? { ...item, readAt: new Date().toISOString() } : item)); if (notification.link) navigate(notification.link); }}
                        className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#F6F7F9] transition-colors ${!notification.readAt ? 'bg-blue-50/30' : ''}`}>
                        <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center flex-shrink-0 mt-0.5"><Icon name="bell" size={14} /></div>
                        <div className="flex-1 min-w-0"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-[#1F2937]">{notification.title}</span>{!notification.readAt && <span className="w-1.5 h-1.5 bg-[#2563EB] rounded-full flex-shrink-0" />}</div><p className="text-xs text-[#6B7280] mt-0.5 leading-relaxed">{notification.message}</p><p className="text-[10px] text-[#9CA3AF] mt-1">{new Date(notification.createdAt).toLocaleString()}</p></div>
                      </button>
                    ))}
                  </div>
                  <div className="px-4 py-2.5 border-t border-[#E5E7EB]">
                    <button
                      onClick={async () => { await Promise.all(notifications.filter(notification => !notification.readAt).map(notification => api(`/notifications/${notification._id}/read`, { method: 'PATCH' }).catch(() => undefined))); setNotifications(current => current.map(item => ({ ...item, readAt: item.readAt || new Date().toISOString() }))); }}
                      className="w-full text-xs font-600 text-[#163A63] hover:text-[#0B1F3A] text-center"
                      style={{ fontWeight: 600 }}
                    >
                      Mark all as read
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => { setProfileOpen(o => !o); setNotifOpen(false); }}
                className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-[#F6F7F9] transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-[#163A63] flex items-center justify-center text-white text-xs font-700 overflow-hidden" style={{ fontWeight: 700 }}>
                  <SessionAvatar name={displayName} className="w-full h-full" />
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-600 text-[#1F2937] leading-tight" style={{ fontWeight: 600 }}>{displayName}</div>
                  <div className="text-xs text-[#6B7280] leading-tight">{userRole}</div>
                </div>
                <Icon name="chevron-down" size={14} className="text-[#6B7280]" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-[#E5E7EB] rounded-xl shadow-lg overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-[#E5E7EB]">
                    <div className="text-sm font-600 text-[#1F2937]" style={{ fontWeight: 600 }}>{displayName}</div>
                    <div className="text-xs text-[#6B7280]">{userRole}</div>
                  </div>
                  <div className="py-1">
                    {role !== 'superadmin' && (
                      <Link to={role === 'student' ? '/student/settings' : `/${role}/settings`}
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-[#1F2937] hover:bg-[#F6F7F9]">
                        <Icon name="settings" size={14} className="text-[#6B7280]" />Settings
                      </Link>
                    )}
                    <button
                      onClick={requestSignOut}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-[#DC2626] hover:bg-[#F6F7F9] w-full text-left"
                    >
                      <Icon name="log-out" size={14} />Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1200px] mx-auto p-6">
            <Outlet />
          </div>
        </main>
      </div>
      <ConfirmDialog
        open={signOutOpen}
        title="Sign out?"
        message="Do you want to sign out of the City Scholar portal?"
        confirmLabel="Sign Out"
        cancelLabel="Stay signed in"
        danger
        onCancel={() => setSignOutOpen(false)}
        onConfirm={() => { setSignOutOpen(false); signOut(); }}
      />
    </div>
  );
}
