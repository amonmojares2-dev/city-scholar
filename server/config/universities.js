// Canonical University options shared by the public Create Account UI and
// registration validation. Names are persisted exactly as listed.
const UNIVERSITY_OPTIONS = Object.freeze([
    { id: "lyceum-northwestern-university", name: "Lyceum Northwestern University" },
    { id: "phinma-university-of-pangasinan", name: "PHINMA University of Pangasinan" },
    { id: "systems-technology-institute-college", name: "Systems Technology Institute College" },
    { id: "universidad-de-dagupan", name: "Universidad de Dagupan" },
    { id: "university-of-luzon", name: "University of Luzon" }
].sort((left, right) => left.name.localeCompare(right.name)));

const UNIVERSITIES = Object.freeze(UNIVERSITY_OPTIONS.map(option => option.name));
const UNIVERSITY_SET = new Set(UNIVERSITIES);

module.exports = { UNIVERSITY_OPTIONS, UNIVERSITIES, UNIVERSITY_SET };
