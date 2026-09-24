export interface SidebarItem {
  label: string;
  path: string;
  icon: string;
  group?: string;
  applicantOnly?: boolean;
  scholarOnly?: boolean;
}

export const studentSidebarItems: SidebarItem[] = [
  { label: 'Dashboard', path: '/student', icon: 'grid' },
  { label: 'Scholar Profile', path: '/student/profile', icon: 'user' },
  { label: 'Documents', path: '/student/documents', icon: 'file-text' },
  { label: 'Application', path: '/student/application', icon: 'clipboard', applicantOnly: true },
  { label: 'Event Attendance', path: '/student/events', icon: 'calendar', scholarOnly: true },
  { label: 'Renewal', path: '/student/renewal', icon: 'refresh' },
  { label: 'Announcements', path: '/student/announcements', icon: 'bell' },
  { label: 'Messages', path: '/student/messages', icon: 'message-square' },
  { label: 'Help Center', path: '/student/help', icon: 'help-circle' },
  { label: 'Settings', path: '/student/settings', icon: 'settings' },
];

export const barangaySidebarItems: SidebarItem[] = [
  { label: 'Dashboard', path: '/barangay', icon: 'grid' },
  { label: 'Scholars', path: '/barangay/scholars', icon: 'users' },
  // Applicants now covers residency review too (the old "Application Review"
  // page was merged into it), so there is no separate link for it.
  { label: 'Applicants', path: '/barangay/applicants', icon: 'user-plus' },
  { label: 'Announcements', path: '/barangay/announcements', icon: 'bell' },
  { label: 'Messages', path: '/barangay/messages', icon: 'message-square' },
  { label: 'Settings', path: '/barangay/settings', icon: 'settings' },
];

export const superAdminSidebarItems: SidebarItem[] = [
  { label: 'Dashboard',           path: '/superadmin',                    icon: 'grid',         group: 'OVERVIEW' },
  { label: 'Staff Accounts',      path: '/superadmin/accounts',           icon: 'user-check',   group: 'ACCOUNT MANAGEMENT' },
  { label: 'All Users',           path: '/superadmin/users',              icon: 'users',        group: 'ACCOUNT MANAGEMENT' },
  { label: 'Program Config',      path: '/superadmin/program',            icon: 'sliders',      group: 'SCHOLARSHIP MANAGEMENT' },
  { label: 'Schools & Barangays', path: '/superadmin/data',               icon: 'database',     group: 'SCHOLARSHIP MANAGEMENT' },
  { label: 'Archive',             path: '/superadmin/archive',            icon: 'archive',      group: 'SCHOLARSHIP MANAGEMENT' },
  { label: 'Audit Log',           path: '/superadmin/audit',              icon: 'file-bar-chart', group: 'REPORTS & COMPLIANCE' },
  { label: 'Export Reports',      path: '/superadmin/reports',            icon: 'download',     group: 'REPORTS & COMPLIANCE' },
  { label: 'Announcements',       path: '/superadmin/announcements',      icon: 'megaphone',    group: 'COMMUNICATION' },
  { label: 'Messages',            path: '/superadmin/messages',           icon: 'message-square', group: 'COMMUNICATION' },
];

export const citySidebarItems: SidebarItem[] = [
  { label: 'Dashboard', path: '/city', icon: 'grid', group: 'OVERVIEW' },
  { label: 'Applications', path: '/city/applications', icon: 'clipboard', group: 'APPLICATION MANAGEMENT' },
  { label: 'Scholar Approval', path: '/city/scholar-approval', icon: 'user-check', group: 'APPLICATION MANAGEMENT' },
  { label: 'Renewals', path: '/city/renewals', icon: 'refresh', group: 'APPLICATION MANAGEMENT' },
  { label: 'Scholars', path: '/city/scholars', icon: 'users', group: 'SCHOLAR MONITORING' },
  { label: 'Academic Monitoring', path: '/city/academic', icon: 'bar-chart-2', group: 'SCHOLAR MONITORING' },
  { label: 'Event Attendance', path: '/city/events', icon: 'calendar', group: 'SCHOLAR MONITORING' },
  { label: 'Messages', path: '/city/messages', icon: 'message-square', group: 'COMMUNICATION' },
  { label: 'Announcements', path: '/city/announcements', icon: 'megaphone', group: 'COMMUNICATION' },
  { label: 'Reports', path: '/city/reports', icon: 'file-bar-chart', group: 'MANAGEMENT' },
  { label: 'User Management', path: '/city/users', icon: 'user-cog', group: 'MANAGEMENT' },
  { label: 'Barangay Accounts', path: '/city/barangays', icon: 'map-pin', group: 'MANAGEMENT' },
  { label: 'System Settings', path: '/city/system-settings', icon: 'sliders', group: 'MANAGEMENT' },
];
