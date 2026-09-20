import { createBrowserRouter, Navigate, Outlet, useNavigate } from 'react-router';
import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { clearSession, getSessionUser, portalForRole, roleLabel, type PortalRole, type SessionUser } from './lib/auth';
import PublicLayout from './layouts/PublicLayout';
import DashboardLayout from './layouts/DashboardLayout';
import RequireAuth from './components/RequireAuth';
import RequireStudentAccess from './components/RequireStudentAccess';
import { StudentAccessContext, buildStudentAccess, studentSidebarFor, type StudentAccess } from './lib/studentAccess';
import HomePage from './Pages/public/HomePage';
import EligibilityPage from './Pages/public/EligibilityPage';
import HowToApplyPage from './Pages/public/HowToApplyPage';
import GuidelinesPage from './Pages/public/GuidelinesPage';
import AIAssistantPage from './Pages/public/AIAssistantPage';
import LoginPage from './Pages/public/LoginPage';
import StudentDashboard from './Pages/student/StudentDashboard';
import StudentProfile from './Pages/student/StudentProfile';
import StudentDocuments from './Pages/student/StudentDocuments';
import StudentApplication from './Pages/student/StudentApplication';
import StudentEvents from './Pages/student/StudentEvents';
import StudentRenewal from './Pages/student/StudentRenewal';
import StudentAnnouncements from './Pages/student/StudentAnnouncements';
import StudentMessages from './Pages/student/StudentMessages';
import StudentHelp from './Pages/student/StudentHelp';
import StudentSettings from './Pages/student/StudentSettings';
import BarangayDashboard from './Pages/barangay/BarangayDashboard';
import BarangayScholars from './Pages/barangay/BarangayScholars';
import BarangayApplicants from './Pages/barangay/BarangayApplicants';
import BarangayMessages from './Pages/barangay/BarangayMessages';
import BarangaySettings from './Pages/barangay/BarangaySettings';
import CityDashboard from './Pages/city/CityDashboard';
import CityApplications from './Pages/city/CityApplications';
import CityApplicationDetail from './Pages/city/CityApplicationDetail';
import CityScholarApproval from './Pages/city/CityScholarApproval';
import CityScholars from './Pages/city/CityScholars';
import CityAcademic from './Pages/city/CityAcademic';
import CityEvents from './Pages/city/CityEvents';
import CityRenewals from './Pages/city/CityRenewals';
import CityMessages from './Pages/city/CityMessages';
import CityAnnouncements from './Pages/city/CityAnnouncements';
import CityReports from './Pages/city/CityReports';
import CityUsers from './Pages/city/CityUsers';
import CityBarangays from './Pages/city/CityBarangays';
import CitySystemSettings from './Pages/city/CitySystemSettings';
import SuperAdminDashboard from './Pages/superadmin/SuperAdminDashboard';
import SuperAdminScholars from './Pages/superadmin/SuperAdminScholars';
import SuperAdminAccounts from './Pages/superadmin/SuperAdminAccounts';
import SuperAdminAllUsers from './Pages/superadmin/SuperAdminAllUsers';
import SuperAdminProgramConfig from './Pages/superadmin/SuperAdminProgramConfig';
import SuperAdminAuditLog from './Pages/superadmin/SuperAdminAuditLog';
import SuperAdminReports from './Pages/superadmin/SuperAdminReports';
import SuperAdminAnnouncements from './Pages/superadmin/SuperAdminAnnouncements';
import SuperAdminMessages from './Pages/superadmin/SuperAdminMessages';
import SuperAdminDataManagement from './Pages/superadmin/SuperAdminDataManagement';
import SuperAdminArchive from './Pages/superadmin/SuperAdminArchive';
import { studentSidebarItems, barangaySidebarItems, citySidebarItems, superAdminSidebarItems } from './data/sidebarItems';

// Every /login visit from an already-signed-in user goes to that user's
// own portal, so there is no way to sit on the login page with a session.
function LoginRoute() {
  const navigate = useNavigate();
  const user = getSessionUser();
  const [portal, setPortal] = useState<PortalRole | null>(null);

  useEffect(() => {
    if (!user) return;
    const p = portalForRole(user.role);
    if (p && p !== portal) setPortal(p);
  }, [user, portal]);

  useEffect(() => {
    if (portal) navigate(`/${portal}`, { replace: true });
  }, [portal, navigate]);

  if (portal) return null;

  return <LoginPage />;
}

// Header name/role come from the session rather than being hardcoded.
// This is a component (not a helper call) so it re-reads the session when
// the route renders, not once when this module is first imported.
function Shell({ role, sidebarItems }: { role: string; sidebarItems: unknown }) {
  const navigate = useNavigate();
  const user = getSessionUser();
  const [confirmedUser, setConfirmedUser] = useState<SessionUser | null>(user ?? null);
  const [verified, setVerified] = useState(false);
  // Which student pages are open depends on the account type chosen on the
  // Create Account page and on the City Office's decisions. Seeded from the
  // local session; refreshed from the server below.
  const [studentAccess, setStudentAccess] = useState<StudentAccess | null>(() =>
    role === 'student' && user ? buildStudentAccess(user, undefined) : null
  );
  const userId = user?.id;

  // Students: an approved application (new applicants) or a confirmed
  // existing-scholar registration (existing scholars) is what unlocks the
  // Event Attendance and Renewal pages.
  useEffect(() => {
    if (role !== 'student') return;

    const current = getSessionUser();
    if (!current) return;

    let cancelled = false;

    api<{ user: SessionUser; latestApplication?: { status?: string } | null }>('/auth/me')
      .then(result => {
        if (cancelled) return;
        // Read-only: the local session comes from the login response, which
        // already carries the account type. This call only adds the City
        // Office's application decision.
        setStudentAccess(buildStudentAccess(result.user, result.latestApplication?.status ?? null));
      })
      .catch(() => {
        if (cancelled) return;
        setStudentAccess(buildStudentAccess(current, null));
      });

    return () => { cancelled = true; };
  }, [role, userId]);

  // Only attempt server verification once, after the first render.
  useEffect(() => {
    if (verified) return;
    setVerified(true);

    if (user) {
      // We already have a local session; treat it as unverified until the
      // server confirms it. Keep rendering the portal shell while we check.
      return;
    }

    // No local session at all: nothing to verify.
    setConfirmedUser(null);
  }, [user, verified]);

  // If there is a local session but it has not been server-verified yet,
  // verify it once.
  useEffect(() => {
    if (!user || confirmedUser || verified) return;

    api<{ user: SessionUser }>('/auth/me')
      .then(result => setConfirmedUser(result.user))
      .catch(() => {
        clearSession();
        setConfirmedUser(null);
        navigate('/login', { replace: true });
      });
  }, [user, confirmedUser, verified, navigate]);

  // If the server-verified user belongs to a different portal, redirect once.
  const confirmedPortal = confirmedUser ? portalForRole(confirmedUser.role) : null;
  useEffect(() => {
    if (!confirmedPortal || confirmedPortal === role) return;
    clearSession();
    setConfirmedUser(null);
    navigate(`/${confirmedPortal}`, { replace: true });
  }, [confirmedPortal, role, navigate]);

  if (!confirmedUser && !user) {
    return (
      <div className="flex items-center justify-center min-h-[20vh] text-sm text-[#6B7280]">
        Verifying your session…
      </div>
    );
  }

  const studentSidebar = role === 'student' && studentAccess ? studentSidebarFor(studentAccess) : null;

  return (
    <StudentAccessContext.Provider value={studentAccess}>
      <DashboardLayout
        role={role as never}
        sidebarItems={(studentSidebar ? studentSidebar.visible : sidebarItems) as never}
        lockedItems={studentSidebar?.locked}
        userName={confirmedUser?.name ?? user?.name ?? ''}
        userRole={confirmedUser?.role ? roleLabel(confirmedUser.role) : user?.role ? roleLabel(user.role) : ''}
      />
    </StudentAccessContext.Provider>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    Component: PublicLayout,
    children: [
      { index: true, Component: HomePage },
      { path: 'eligibility', Component: EligibilityPage },
      { path: 'how-to-apply', Component: HowToApplyPage },
      { path: 'guidelines', Component: GuidelinesPage },
      { path: 'ai-assistant', Component: AIAssistantPage },
    ],
  },
  { path: '/login', Component: LoginRoute },

  // ---------------- Student ----------------
  {
    path: '/student',
    element: <RequireAuth portal="student" />,
    children: [
      {
        element: <Shell role="student" sidebarItems={studentSidebarItems} />,
        children: [
          {
            // Blocks pages this account type has not unlocked yet.
            element: <RequireStudentAccess />,
            children: [
              { index: true, Component: StudentDashboard },
              { path: 'application', Component: StudentApplication },
              { path: 'profile', Component: StudentProfile },
              { path: 'documents', Component: StudentDocuments },
              { path: 'events', Component: StudentEvents },
              { path: 'renewal', Component: StudentRenewal },
              { path: 'announcements', Component: StudentAnnouncements },
              { path: 'messages', Component: StudentMessages },
              { path: 'help', Component: StudentHelp },
              { path: 'settings', Component: StudentSettings },
            ],
          },
        ],
      },
    ],
  },

  // ---------------- Barangay ----------------
  {
    path: '/barangay',
    element: <RequireAuth portal="barangay" />,
    children: [
      {
        element: <Shell role="barangay" sidebarItems={barangaySidebarItems} />,
        children: [
          { index: true, Component: BarangayDashboard },
          { path: 'scholars', Component: BarangayScholars },
          { path: 'applicants', Component: BarangayApplicants },
          { path: 'announcements', Component: StudentAnnouncements },
          { path: 'messages', Component: BarangayMessages },
          { path: 'settings', Component: BarangaySettings },
        ],
      },
    ],
  },

  // ---------------- City Office ----------------
  {
    path: '/city',
    element: <RequireAuth portal="city" />,
    children: [
      {
        element: <Shell role="city" sidebarItems={citySidebarItems} />,
        children: [
          { index: true, Component: CityDashboard },
          { path: 'applications', Component: CityApplications },
          { path: 'applications/:id', Component: CityApplicationDetail },
          { path: 'scholar-approval', Component: CityScholarApproval },
          { path: 'scholars', Component: CityScholars },
          { path: 'academic', Component: CityAcademic },
          { path: 'events', Component: CityEvents },
          { path: 'renewals', Component: CityRenewals },
          { path: 'messages', Component: CityMessages },
          { path: 'announcements', Component: CityAnnouncements },
          { path: 'reports', Component: CityReports },
          { path: 'users', Component: CityUsers },
          { path: 'barangays', Component: CityBarangays },
          { path: 'system-settings', Component: CitySystemSettings },
        ],
      },
    ],
  },

  // ---------------- Super Admin ----------------
  {
    path: '/superadmin',
    element: <RequireAuth portal="superadmin" />,
    children: [
      {
        element: <Shell role="superadmin" sidebarItems={superAdminSidebarItems} />,
        children: [
          { index: true, Component: SuperAdminDashboard },
          { path: 'accounts', Component: SuperAdminAccounts },
          { path: 'users', Component: SuperAdminAllUsers },
          { path: 'program', Component: SuperAdminProgramConfig },
          { path: 'audit', Component: SuperAdminAuditLog },
          { path: 'reports', Component: SuperAdminReports },
          { path: 'announcements', Component: SuperAdminAnnouncements },
          { path: 'messages', Component: SuperAdminMessages },
          { path: 'data', Component: SuperAdminDataManagement },
          { path: 'archive', Component: SuperAdminArchive },
          { path: 'scholars', Component: SuperAdminScholars },
        ],
      },
    ],
  },

  // Anything else goes home.
  { path: '*', element: <Navigate to="/" replace /> },
]);