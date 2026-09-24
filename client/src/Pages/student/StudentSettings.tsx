import { useState } from 'react';
import PageHeader from '../../components/PageHeader';
import PasswordInput from '../../components/PasswordInput';
import DeleteAccountSection from '../../components/DeleteAccountSection';
import SessionAvatar from '../../components/SessionAvatar';
import { getSessionUser } from '../../lib/auth';

export default function StudentSettings() {
  const [tab, setTab] = useState<'profile' | 'security' | 'notifications'>('profile');
  const [notifications, setNotifications] = useState({
    applicationUpdates: true,
    documentUpdates: true,
    renewalReminders: true,
    announcements: true,
    messages: true,
    emailDigest: false,
  });
  const user = getSessionUser();

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your account preferences and security" breadcrumb={['Student Portal', 'Settings']} />

      <div className="flex gap-1 mb-6 bg-[#F6F7F9] rounded-xl p-1 w-fit">
        {(['profile', 'security', 'notifications'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-600 transition-all capitalize ${tab === t ? 'bg-white shadow-sm text-[#0B1F3A]' : 'text-[#6B7280] hover:text-[#1F2937]'}`}
            style={{ fontWeight: 600 }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
          <h3 className="font-700 text-[#1F2937] mb-5" style={{ fontWeight: 700 }}>Profile Settings</h3>
          {user && (
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-[#E5E7EB]">
              <SessionAvatar name={user.name} className="w-14 h-14 rounded-full bg-[#163A63] text-white text-lg font-800 overflow-hidden" imageClassName="rounded-full" />
              <div>
                <div className="text-sm font-600 text-[#1F2937]" style={{ fontWeight: 600 }}>{user.name}</div>
                <div className="text-xs text-[#6B7280]">Manage your photo from Scholar Profile.</div>
              </div>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { label: 'Display Name', value: user?.name || '' },
              { label: 'Email Address', value: user?.email || '' }
            ].map(f => (
              <div key={f.label}>
                <label className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>{f.label}</label>
                <input defaultValue={f.value} className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]" />
              </div>
            ))}
          </div>
          <button className="mt-5 px-4 py-2.5 bg-[#0B1F3A] text-white font-700 rounded-xl text-sm hover:bg-[#163A63]" style={{ fontWeight: 700 }}>Save Changes</button>
        </div>
      )}

      {tab === 'security' && (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
          <h3 className="font-700 text-[#1F2937] mb-5" style={{ fontWeight: 700 }}>Change Password</h3>
          <div className="space-y-4 max-w-sm">
            {['Current Password', 'New Password', 'Confirm New Password'].map(label => (
              <div key={label}>
                <PasswordInput label={label} autoComplete={label === 'Current Password' ? 'current-password' : 'new-password'} />
              </div>
            ))}
            <button className="px-4 py-2.5 bg-[#0B1F3A] text-white font-700 rounded-xl text-sm hover:bg-[#163A63]" style={{ fontWeight: 700 }}>Update Password</button>
          </div>
        </div>
      )}

      {tab === 'notifications' && (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
          <h3 className="font-700 text-[#1F2937] mb-5" style={{ fontWeight: 700 }}>Notification Preferences</h3>
          <div className="space-y-4">
            {Object.entries(notifications).map(([key, val]) => {
              const labels: Record<string, string> = {
                applicationUpdates: 'Application Status Updates',
                documentUpdates: 'Document Verification Updates',
                renewalReminders: 'Renewal Period Reminders',
                announcements: 'New Announcements',
                messages: 'New Messages',
                emailDigest: 'Weekly Email Digest',
              };
              return (
                <div key={key} className="flex items-center justify-between py-3 border-b border-[#E5E7EB] last:border-0">
                  <div>
                    <div className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{labels[key]}</div>
                    <div className="text-xs text-[#6B7280]">Via portal and email</div>
                  </div>
                  <button
                    onClick={() => setNotifications(prev => ({ ...prev, [key]: !val }))}
                    className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${val ? 'bg-[#0B1F3A]' : 'bg-[#E5E7EB]'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${val ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <DeleteAccountSection />
    </div>
  );
}
