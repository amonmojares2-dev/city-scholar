import { createContext, useContext } from 'react';
import type { ScholarType, ScholarVerificationStatus, SessionUser } from './auth';
import { studentSidebarItems, type SidebarItem } from '../data/sidebarItems';

// Derived access level shared by the sidebar and the route guards:
//   applicant       - new applicant (Application open, Renewal locked)
//   pending_scholar - existing scholar waiting on a City Office decision
//   scholar         - confirmed scholar (Renewal open)// Access level derived from the sidebar + this guard; kept in one place.
export type AccessLevel = 'applicant' | 'pending_scholar' | 'scholar';


// ==========================================
// Student portal access rules
//
// The student pages a sign-in can open depend on the account type chosen
// on the Create Account page and on the City Office's decisions:
//
// New Applicant
//   Dashboard · Scholar Profile · Documents · Application · Announcements
//   · Messages · Help Center · Settings
//   -> Event Attendance and Renewal unlock only once the City Office
//      approves the scholarship application.
//
// Existing Scholar
//   Dashboard · Scholar Profile · Documents · Event Attendance · Renewal
//   · Announcements · Messages · Help Center · Settings
//   -> Renewal is disabled until the City Office confirms the account as
//      an existing scholar on the Scholar Approval page. The Application
//      page is not part of this portal.
// ==========================================

export interface StudentAccess {
  scholarType: ScholarType;
  scholarVerificationStatus: ScholarVerificationStatus;
  // Client-facing aliases for the plan's field names. registrationType is the
  // DB column scholarType exposed under the plan's name; scholarStatus is
  // scholarVerificationStatus expressed in the plan's enum:
  //   pending_review / approved / rejected  (existing_scholar)
  //   null                                   (new_applicant — not applicable)
  registrationType: ScholarType;
  scholarStatus: 'pending_review' | 'approved' | 'rejected' | null;
  // Legacy access flags kept for sidebar/lock logic. applicationApproved is
  // true once the City Office approves a new-applicant application (or moves
  // it into renewal). scholarVerified is true once the City Office confirms
  // an existing-scholar claim on the Scholar Approval page.
  applicationApproved: boolean;
  scholarVerified: boolean;
  ready: boolean;
  // Derived access level. The plan uses scholarStatus to decide this; the
  // implementation derives it from scholarType + scholarVerificationStatus.
  accessLevel: AccessLevel;
}

export const StudentAccessContext = createContext<StudentAccess | null>(null);

export function useStudentAccess(): StudentAccess | null {
  return useContext(StudentAccessContext);
}

// Builds the access record. Pass `undefined` as the application status while
// it is still loading; pass the status (or null when the student has no
// application yet) once it is known.
export function buildStudentAccess(
  user: SessionUser | null,
  applicationStatus?: string | null,
): StudentAccess {
  const scholarType: ScholarType = user?.scholarType === 'existing_scholar'
    ? 'existing_scholar'
    : 'new_applicant';

  const scholarVerificationStatus: ScholarVerificationStatus =
    user?.scholarVerificationStatus ?? 'not_required';

  // === accessLevel (the single source of truth for sidebar + route guards) ===
  let accessLevel: AccessLevel = 'applicant';
  if (scholarType === 'existing_scholar') {
    if (scholarVerificationStatus === 'approved') {
      accessLevel = 'scholar';
    } else if (scholarVerificationStatus === 'pending') {
      accessLevel = 'pending_scholar';
    }
    // scholarVerificationStatus === 'rejected' falls through to applicant:
    // on reject the server converts the account to new_applicant, so by the
    // time the client sees it the accessLevel is applicant. We still handle
    // the stale 'rejected' value defensively here.
  }

  // === scholarStatus: plan's enum, derived from scholarVerificationStatus ===
  let scholarStatus: StudentAccess['scholarStatus'] = null;
  if (scholarType === 'existing_scholar') {
    if (scholarVerificationStatus === 'pending') {
      scholarStatus = 'pending_review';
    } else if (scholarVerificationStatus === 'approved') {
      scholarStatus = 'approved';
    } else if (scholarVerificationStatus === 'rejected') {
      scholarStatus = 'rejected';
    }
  }

  return {
    scholarType,
    scholarVerificationStatus,
    registrationType: scholarType,
    scholarStatus,
    applicationApproved: applicationStatus === 'approved' || applicationStatus === 'renewal',
    scholarVerified: scholarType === 'existing_scholar'
      && scholarVerificationStatus === 'approved',
    ready: applicationStatus !== undefined,
    accessLevel,
  };
}

// A student counts as a scholar once they are an approved applicant or a
// registered existing scholar (pending or approved).
export function isScholarAccess(access: StudentAccess): boolean {
  return access.scholarType === 'existing_scholar' || access.applicationApproved;
}

// Returns true for students who may use Renewal.
// Approved existing scholars only. New applicants need an approved application.
// Pending and rejected existing scholars do not get Renewal.
export function isRenewalAccess(access: StudentAccess): boolean {
  if (access.scholarType === 'existing_scholar') {
    return access.scholarVerificationStatus === 'approved';
  }
  return access.applicationApproved;
}

// Returns true for students who may use Event Attendance.
// Any existing scholar (pending or approved) can mark attendance once
// they're registered, plus approved new applicants.
export function isEventAttendanceAccess(access: StudentAccess): boolean {
  if (access.scholarType === 'existing_scholar') {
    return access.scholarVerificationStatus === 'pending'
      || access.scholarVerificationStatus === 'approved';
  }
  return access.applicationApproved;
}

// ------------------------------------------------------------------
// Does this page's access still depend on a value we have not read yet?
//
// Only a new applicant's Event Attendance / Renewal depend on the
// application decision, so only those wait for the server call.
// ------------------------------------------------------------------
export function studentPageNeedsApplicationStatus(access: StudentAccess, pathname: string): boolean {
  if (access.ready || access.scholarType !== 'new_applicant') return false;
  const path = normalizeStudentPath(pathname);
  return path === '/student/events' || path === '/student/renewal';
}

// ------------------------------------------------------------------
// Locked pages
//
// Returns the reason a page is unavailable, or null when it is open.
// ------------------------------------------------------------------
export function studentPageLock(access: StudentAccess, pathname: string): string | null {
  const path = normalizeStudentPath(pathname);

  // The application form belongs to first-time applicants only.
  if (path === '/student/application') {
    if (access.accessLevel === 'pending_scholar' || access.accessLevel === 'scholar') {
      return 'The Application page is for first-time applicants. As an existing scholar you continue through Renewal.';
    }
    return null;
  }

  if (path === '/student/events' && !isEventAttendanceAccess(access)) {
    if (access.scholarType === 'new_applicant') {
      return 'Event Attendance unlocks once the City Office approves your scholarship application.';
    }
    return 'Event Attendance is reserved for confirmed existing scholars until the City Office approves you on the Scholar Approval page.';
  }

  if (path === '/student/renewal') {
    // Renewal is only available to students with accessLevel === 'scholar'
    // (approved existing scholars). Everyone else is locked out.
    if (access.accessLevel !== 'scholar') {
      if (access.scholarType === 'existing_scholar') {
        if (access.scholarVerificationStatus === 'rejected') {
          return 'Your existing-scholar registration was not confirmed by the City Office. Renewal stays disabled until they approve it.';
        }
        return 'Renewal is disabled until the City Office confirms on the Scholar Approval page that you are an existing scholar.';
      }
      return 'Renewal is only available to confirmed existing scholars. As a new applicant you use the Application page to apply for the first time.';
    }
    return null;
  }

  return null;
}

// Which of the student sidebar entries this account can see, and which of
// the visible ones are still locked (shown disabled, with a lock icon).
export function studentSidebarFor(access: StudentAccess): {
  visible: SidebarItem[];
  locked: Record<string, string>;
} {
  const visible: SidebarItem[] = [];
  const locked: Record<string, string> = {};

  for (const item of studentSidebarItems) {
    // Hidden outright: not part of this access level's portal.
    // Application is only for applicants. Renewal is only for scholars.
    if (item.applicantOnly && access.accessLevel !== 'applicant') continue;
    if (item.path === '/student/renewal' && access.accessLevel !== 'scholar') continue;

    // Event Attendance stays visible for every access level in the plan, so we
    // never hide it here. studentPageLock still gates the page itself if needed.
    // (scholarOnly flag is ignored for visibility — Event Attendance is shown to
    // applicants, pending scholars, and scholars alike; access is gated by the
    // lock function + route guard instead.)
    //
    // NOTE: Renewal (scholarOnly: true) must NOT be hidden by a blanket
    // scholarOnly check — its visibility is already correctly gated by the
    // explicit renewal check on line 199 above. A blanket scholarOnly skip
    // would hide Renewal even for approved scholars.
    if (false && item.scholarOnly && item.path !== '/student/events') continue;

    // Visible but disabled: waiting on a City Office decision.
    const lock = studentPageLock(access, item.path);
    if (lock) locked[item.path] = lock;

    visible.push(item);
  }

  return { visible, locked };
}

// Strips query strings / trailing slashes so item paths compare cleanly.
export function normalizeStudentPath(pathname: string): string {
  const clean = pathname.split('?')[0].split('#')[0];
  return clean.length > 1 && clean.endsWith('/') ? clean.slice(0, -1) : clean;
}