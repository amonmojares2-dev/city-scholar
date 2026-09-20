// Patch SuperAdminAllUsers.tsx (BARANGAYS import) + StudentApplication.tsx (Icon style prop)
const fs = require('fs');

// ---- SuperAdminAllUsers.tsx ----
const su = 'c:/Users/amonm/city-scholar/client/src/Pages/superadmin/SuperAdminAllUsers.tsx';
let suText = fs.readFileSync(su, 'utf8');
if (!suText.includes("from '../../data/barangays'")) {
  suText = suText.replace(
    /from '\.\.\/\.\.\/data\/schools';/,
    "from '../../data/schools';\nimport { BARANGAYS } from '../../data/barangays';"
  );
  fs.writeFileSync(su, suText, 'utf8');
  console.log('patched SuperAdminAllUsers.tsx — added BARANGAYS import');
} else {
  console.log('SuperAdminAllUsers.tsx already has BARANGAYS import');
}

// ---- StudentApplication.tsx ----
const st = 'c:/Users/amonm/city-scholar/client/src/Pages/student/StudentApplication.tsx';
let stText = fs.readFileSync(st, 'utf8');
const before = stText;
stText = stText.replace(
  /<Icon name="check-circle" size={20} style={{ color: "#22A06B" }} \/>/g,
  '<Icon name="check-circle" size={20} className="text-[#22A06B]" />'
);
stText = stText.replace(
  /<Icon name="check-circle" size={40} style={{ color: "#22A06B" }} \/>/g,
  '<Icon name="check-circle" size={40} className="text-[#22A06B]" />'
);
if (stText !== before) {
  fs.writeFileSync(st, stText, 'utf8');
  console.log('patched StudentApplication.tsx — replaced Icon style prop with className');
} else {
  console.log('StudentApplication.tsx already clean');
}

console.log('done');
