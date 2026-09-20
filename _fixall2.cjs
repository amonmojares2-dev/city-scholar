// Fix the remaining client TypeScript errors (Part 2 attempt).
const fs = require('fs');

// ---------- RequireStudentAccess.tsx ----------
// The earlier patch already moved Navigate import + the pending-scholar useEffect.
// What remains: the hook-rules violation where useEffect sat inside a conditional branch
// (studentPageNeedsApplicationStatus). Replace that block with an unconditional useEffect.
const ra = 'c:/Users/amonm/city-scholar/client/src/components/RequireStudentAccess.tsx';
let raText = fs.readFileSync(ra, 'utf8');

const raOld = `  if (studentPageNeedsApplicationStatus(access, pathname)) {
    useEffect(() => {
      // During onboarding and renewal windows the student still behaves like an applicant:
      // show the application flow, block the rest of the portal, and redirect back when the
      // user tries to reach the dashboard or any other protected route.
      if (studentPath === '/student' || studentPath === '/student/dashboard') {
        navigate('/student/application', { replace: true });
        return;
      }
      if (!isOnApplicationPage(studentPath)) {
        navigate('/student/application', { replace: false });
        return;
      }
    }, [access, pathname, navigate]);
  }`;

// The file may have been patched already by _fix4.cjs; if so, the conditional useEffect is
// already gone. Only patch if the bad block is still present.
if (raText.includes(raOld)) {
  const raNew = `  // Access rules only apply to the student portal.
  const studentPath = normalizeStudentPath(pathname);

  // During onboarding and renewal windows the student still behaves like an applicant:
  // show the application flow, block the rest of the portal, and redirect back when the
  // user tries to reach the dashboard or any other protected route.
  const redirectToApp = Boolean(access) && studentPageNeedsApplicationStatus(access, pathname)
    && (studentPath === '/student' || studentPath === '/student/dashboard' || !isOnApplicationPage(studentPath));

  useEffect(() => {
    if (redirectToApp) navigate('/student/application', { replace: true });
  }, [redirectToApp, navigate]);`;

  raText = raText.replace(raOld, raNew);
  fs.writeFileSync(ra, raText, 'utf8');
  console.log('patched RequireStudentAccess.tsx (conditional useEffect removed)');
} else {
  console.log('RequireStudentAccess.tsx already clean (no conditional useEffect)');
}

console.log('done');
