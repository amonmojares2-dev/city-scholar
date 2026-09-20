import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';

// System Settings - deliberately honest about what is real:
//   * Academic Year / Semester come from the live ProgramConfig collection
//     (GET /api/programs), the same values the Super Admin maintains.
//   * Notification toggles are browser-session preferences only - there is
//     no server-side settings storage yet.
//   * There are no editable "system settings" in the backend yet, so there
//     are no Save buttons and no invented values on this page.
interface Program { id: string; academicYear: string; semester: string; active: boolean }

export default function CitySystemSettings() {
  const [tab, setTab] = useState<'general' | 'notifications' | 'access'>('general');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [notifications, setNotifications] = useState({ email: true, sms: false, portal: true, weekly: true, instant: true });

  useEffect(() => {
    let cancelled = false;
    api<{ programs: Program[] }>('/programs')
      .then((result) => { if (!cancelled) setPrograms(result.programs || []); })
      .catch(() => { /* the page still renders; values show as not configured */ });
    return () => { cancelled = true; };
  }, []);

  const activeProgram = programs.find((program) => program.active);

  return (
    <div>
      <PageHeader title="System Settings" subtitle="Read-only system information. No settings storage is wired to the backend yet." breadcrumb={['City Office', 'System Settings']} />

      <div className="flex gap-1 mb-6 bg-[#F6F7F9] rounded-xl p-1 w-fit">
        {(['general', 'notifications', 'access'] as const).map((tabKey) => (
          <button key={tabKey} onClick={() => setTab(tabKey)}
            className={'px-4 py-2 rounded-lg text-sm font-600 transition-all capitalize ' + (tab === tabKey ? 'bg-white shadow-sm text-[#0B1F3A]' : 'text-[#6B7280] hover:text-[#1F2937]')}
            style={{ fontWeight: 600 }}>
            {tabKey === 'access' ? 'Account & Access' : tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 space-y-4">
            <h3 className="text-[#1F2937]" style={{ fontWeight: 700 }}>Live Program Configuration</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-600 text-[#6B7280] mb-1" style={{ fontWeight: 600 }}>Current Academic Year</div>
                <div className="text-sm text-[#1F2937]">{activeProgram ? activeProgram.academicYear : 'Not configured - add a program in Super Admin > Program Config'}</div>
              </div>
              <div>
                <div className="text-xs font-600 text-[#6B7280] mb-1" style={{ fontWeight: 600 }}>Current Semester</div>
                <div className="text-sm text-[#1F2937]">{activeProgram ? activeProgram.semester : 'Not configured'}</div>
              </div>
              <div>
                <div className="text-xs font-600 text-[#6B7280] mb-1" style={{ fontWeight: 600 }}>Configured Programs</div>
                <div className="text-sm text-[#1F2937]">{programs.length ? programs.length + ' program' + (programs.length === 1 ? '' : 's') : 'None'}</div>
              </div>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
            This page is read-only for now: there is no settings storage in the backend yet. Office contact details and other editable system settings need a settings model before they can be changed here - no placeholder values are shown in the meantime.
          </div>
        </div>
      )}

      {tab === 'notifications' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
            <h3 className="text-[#1F2937] mb-1" style={{ fontWeight: 700 }}>Notification Preferences</h3>
            <p className="text-xs text-[#6B7280] mb-4">Stored in this browser session only - server-side notification settings are not wired yet.</p>
            <div className="space-y-4">
              {Object.entries(notifications).map(([key, value]) => {
                const labels: Record<string, { title: string; desc: string }> = {
                  email: { title: 'Email Notifications', desc: 'Send notifications via email to scholars and officials' },
                  sms: { title: 'SMS Notifications', desc: 'Send SMS for urgent announcements and deadline reminders' },
                  portal: { title: 'In-Portal Notifications', desc: 'Show notifications inside the scholarship portal' },
                  weekly: { title: 'Weekly Digest', desc: 'Send weekly summary to administrators' },
                  instant: { title: 'Instant Notifications', desc: 'Real-time push notifications for status changes' },
                };
                return (
                  <div key={key} className="flex items-center justify-between py-3 border-b border-[#E5E7EB] last:border-0">
                    <div>
                      <div className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{labels[key]?.title}</div>
                      <div className="text-xs text-[#6B7280]">{labels[key]?.desc}</div>
                    </div>
                    <button
                      onClick={() => setNotifications((previous) => ({ ...previous, [key]: !value }))}
                      className={'w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ' + (value ? 'bg-[#0B1F3A]' : 'bg-[#E5E7EB]')}
                    >
                      <span className={'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ' + (value ? 'left-5' : 'left-0.5')} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'access' && (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 space-y-4">
          <h3 className="text-[#1F2937]" style={{ fontWeight: 700 }}>Account & Access - how it works today</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-[#6B7280]">Sign-in verification</span>
              <span className="text-[#1F2937] text-right">Every sign-in is confirmed with an emailed one-time code</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[#6B7280]">Password policy</span>
              <span className="text-[#1F2937] text-right">Enforced by the server password validation rules</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[#6B7280]">Account provisioning</span>
              <span className="text-[#1F2937] text-right">Students self-register; staff accounts are created by the Super Admin</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[#6B7280]">Portal access</span>
              <span className="text-[#1F2937] text-right">Determined by role - student, barangay, city and super admin portals are locked per account</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
