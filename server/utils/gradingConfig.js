// ==========================================
// Shared grading configuration (backend)
// ==========================================
// Every pass/fail threshold lives in ONE place so the backend and the
// frontend can never drift apart. Never hardcode 70, 75, 80, or 3.00
// anywhere else in the codebase.
//
//   percentage — 0-100, higher is better. 70 and above passed, 69 and below
//                failed.
//   decimal    — 1.00-5.00 INVERSE, 1.00 is best, 3.00 is the lowest passing
//                mark, anything above 3.00 failed. "highest grade" = the
//                LOWEST number on this scale.
const GRADING = {
    percentage: { passingMark: 70 },
    decimal: { passingMark: 3.00 }
};

// Human readable labels for the two scales.
const SCALE_LABELS = {
    A: '1.00-5.00 (inverse)',
    B: '0-100 (percentage)'
};

// Which config key each scale uses.
const SCALE_KEY = {
    A: 'decimal',
    B: 'percentage'
};

// The passing mark for each scale, shared by the model prompt and the UI.
const SCALE_PASSING_MARKS = {
    A: GRADING.decimal.passingMark,
    B: GRADING.percentage.passingMark
};

// The shared pass/fail decision: one function, used by the Analyze result,
// the Academic Monitoring table, Request Resubmission, and the Failed
// Students section. Scale A is inverse (fails ABOVE the passing mark);
// Scale B fails BELOW it.
function isFailingGrade(grade, passingMark, scale) {
    const g = typeof grade === 'number' ? grade : parseFloat(grade);
    const m = typeof passingMark === 'number' ? passingMark : parseFloat(passingMark);
    if (!Number.isFinite(g) || !Number.isFinite(m)) return false;
    return scale === 'A' ? g > m : g < m;
}

// The passing mark for a scale when the record does not store one.
function defaultPassingMark(scale) {
    return scale === 'A' ? SCALE_PASSING_MARKS.A : SCALE_PASSING_MARKS.B;
}

module.exports = {
    GRADING,
    SCALE_LABELS,
    SCALE_PASSING_MARKS,
    SCALE_KEY,
    defaultPassingMark,
    isFailingGrade
};
