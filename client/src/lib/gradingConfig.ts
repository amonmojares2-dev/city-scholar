// ==========================================
// Shared grading configuration (frontend)
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

export const GRADING = {
    percentage: { passingMark: 70 },
    decimal: { passingMark: 3.00 }
} as const;

export type GradingScale = 'A' | 'B';

// Human readable labels for the two scales, used by the AI prompt and the UI.
export const SCALE_LABELS: Record<GradingScale, string> = {
    A: '1.00-5.00 (inverse)',
    B: '0-100 (percentage)'
};

export function defaultPassingMark(scale: GradingScale): number {
    return scale === 'A' ? GRADING.decimal.passingMark : GRADING.percentage.passingMark;
}

// The single scale-aware pass/fail decision on the frontend. Scale A is
// inverse (fails ABOVE the passing mark); Scale B fails BELOW it.
export function isFailingGrade(grade: number, scale: GradingScale, passingMark: number): boolean {
    return scale === 'A' ? grade > passingMark : grade < passingMark;
}
