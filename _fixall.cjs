// Fix the client-side TypeScript errors in one pass.
// 1) AccessLevel type missing from lib/studentAccess.ts (lines 44, 68 reference it)
// 2) Navigate missing from RequireStudentAccess.tsx import
// 3) SuperAdminAllUsers.tsx: missing default case in avatarColor AND statusBadge (line 66 error), BARANGAYS import (line 611)
// 4) StudentApplication.tsx: Icon style prop is invalid
const fs = require('fs');

// ---------- 1) studentAccess.ts ----------
const sa = 'c:/Users/amonm/city-scholar/client/src/lib/studentAccess.ts';
let saText = fs.readFileSync(sa, 'utf8');
// Insert the AccessLevel type right before the first module-level statement that references it,
// anchored after the last `import` line so it lands at the top of the module body.
const saImpEnd = saText.search(/\n(?:export|const|function|type|interface|enum)\b/);
if (saImpEnd < 0) throw new Error('could not locate studentAccess.ts module start');
const saInsert = `// Access level derived from the sidebar + this guard; kept in one place.\nexport type AccessLevel = 'applicant' | 'pending_scholar' | 'scholar';\n\n`;
saText = saText.slice(0, saImpEnd) + saInsert + saText.slice(saImpEnd);
fs.writeFileSync(sa, saText, 'utf8');
console.log('patched', sa.split('/').slice(-1)[0]);

// ---------- 2) RequireStudentAccess.tsx ----------
const ra = 'c:/Users/amonm/city-scholar/client/src/components/RequireStudentAccess.tsx';
let raText = fs.readFileSync(ra, 'utf8');
raText = raText.replace(
  /from 'react-router-dom';/,
  "from 'react-router-dom';\n\nimport { Navigate } from 'react-router-dom';"
);
// Also fix the hook-rules violation: useEffect was inside a conditional branch.
// Replace the problematic section with an unconditional useEffect that conditionally navigates.
const raOld = `  useEffect(() => {
    // Only run the access rules on the student portal.
    const studentPath = normalizeStudentPath(pathname);
    if (studentPageNeedsApplicationStatus(access, pathname)) {
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
    }
  }, [access, pathname, navigate]);`;
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
if (!raText.includes(raOld))
  throw new Error('RequireStudentAccess.tsx target block not found');
raText = raText.replace(raOld, raNew);
fs.writeFileSync(ra, raText, 'utf8');
console.log('patched', ra.split('/').slice(-1)[0]);

// ---------- 3) SuperAdminAllUsers.tsx ----------
const su = 'c:/Users/amonm/city-scholar/client/src/Pages/superadmin/SuperAdminAllUsers.tsx';
let suText = fs.readFileSync(su, 'utf8');

// 3a) Pull BARANGAYS import next to the existing data imports.
if (!suText.includes("from '../../data/barangays'")) {
  suText = suText.replace(
    /from '\.\.\/\.\.\/data\/schools';/,
    "from '../../data/schools';\nimport { BARANGAYS } from '../../data/barangays';"
  );
}

// 3b) avatarColor: add a default case so the switch is exhaustive.
if (!suText.includes('default: return "bg-gray-100 text-gray-600";')) {
  suText = suText.replace(
    /case "superadmin": return "bg-red-100 text-red-700";\s*\n(\s*\}\s*\n)/,
    'case "superadmin": return "bg-red-100 text-red-700";\n    default: return "bg-gray-100 text-gray-600";\n$1'
  );
}

// 3c) statusBadge: add a default case so the switch is exhaustive.
if (!suText.includes('default: return { label: "Unknown", cls: "bg-gray-100 text-gray-700 border border-gray-200" }')) {
  suText = suText.replace(
    /case "deactivated": return \{ label: "Deactivated", cls: "bg-gray-100 text-gray-600 border border-gray-200" \};\s*\n(\s*\}\s*\n)/,
    'case "deactivated": return { label: "Deactivated", cls: "bg-gray-100 text-gray-600 border border-gray-200" };\n    default: return { label: "Unknown", cls: "bg-gray-100 text-gray-700 border border-gray-200" };\n$1'
  );
}

fs.writeFileSync(su, suText, 'utf8');
console.log('patched', su.split('/').slice(-1)[0]);

// ---------- 4) StudentApplication.tsx ----------
const st = 'c:/Users/amonm/city-scholar/client/src/Pages/student/StudentApplication.tsx';
let stText = fs.readFileSync(st, 'utf8');
stText = stText.replace(
  /<Icon name="check-circle" size={20} style={{ color: "#22A06B" }} \/>/,
  '<Icon name="check-circle" size={20} className="text-[#22A06B]" />'
);
stText = stText.replace(
  /<Icon name="check-circle" size={40} style={{ color: "#22A06B" }} \/>/,
  '<Icon name="check-circle" size={40} className="text-[#22A06B]" />'
);
fs.writeFileSync(st, stText, 'utf8');
console.log('patched', st.split('/').slice(-1)[0]);

console.log('done');
