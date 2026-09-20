import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useEffect } from 'react';
import Icon from './Icon';
import {
  studentPageLock,
  studentPageNeedsApplicationStatus,
  useStudentAccess,
  normalizeStudentPath,
  type StudentAccess,
} from '../lib/studentAccess';

// ==========================================
// Student page guard
//
// Sits inside the student portal shell and blocks pages the signed-in
// student is not entitled to yet:
//   * a New Applicant cannot open Event Attendance / Renewal until the
//     City Office approves the application
//   * an Existing Scholar cannot open Renewal until the City Office
//     confirms the account on the Scholar Approval page
// The same rules drive the sidebar (see lib/studentAccess.ts), so a page
// hidden or disabled in the sidebar can never be reached by typing the URL.
// ==========================================
export default function RequireStudentAccess() {
  const access = useStudentAccess();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Access rules only apply to the student portal.
  const studentPath = normalizeStudentPath(pathname);

  // Pending scholars cannot use Renewal or Application at all — send them
  // back to the dashboard instead of showing the locked-page overlay. This
  // matches the plan: pending_scholar has neither Renewal nor Application in
  // their sidebar, and a direct URL hit should not leak the locked UI.
  //
  // Every hook runs on every render; only the redirect itself is conditional,
  // so react-router's Rules of Hooks stay satisfied.
  const pendingScholarRedirect = Boolean(access) &&
    access?.accessLevel === 'pending_scholar' &&
    (studentPath === '/student/renewal' || studentPath === '/student/application');

  useEffect(() => {
    if (pendingScholarRedirect) navigate('/student', { replace: true });
  }, [pendingScholarRedirect, navigate]);

  if (!access) return <Outlet />;

  if (pendingScholarRedirect) {
    // The effect above replaces the history entry, so the back button does not
    // return the student to the page they cannot open yet.
    return (
      <div className="py-16 text-center text-sm text-[#6B7280]">
        Taking you back to your dashboard…
      </div>
    );
  }

  if (studentPageNeedsApplicationStatus(access, pathname)) {
    return (
      <div className="py-16 text-center text-sm text-[#6B7280]">Checking your portal access…</div>
    );
  }

  const lockReason = studentPageLock(access, pathname);

  if (lockReason) {
    return (
      <div className="max-w-xl mx-auto mt-10 bg-white border border-[#E5E7EB] rounded-2xl p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#F6F7F9] flex items-center justify-center mx-auto mb-4">
          <Icon name="lock" size={22} className="text-[#D4A72C]" />
        </div>
        <h1 className="font-800 text-lg text-[#1F2937] mb-2" style={{ fontWeight: 800 }}>
          This page is locked
        </h1>
        <p className="text-sm text-[#6B7280] leading-relaxed mb-6">{lockReason}</p>
        <Navigate to="/student" replace />
      </div>
    );
  }

  return <Outlet />;
}