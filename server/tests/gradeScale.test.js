// Grade documents in Dagupan colleges use one of TWO scales, and the AI has to
// detect which one a given document uses. These tests pin both directions so a
// regression cannot silently invert one of them:
//
//   Scale A — 1.00-5.00 INVERSE. 1.00 is the BEST possible grade (Excellent),
//             3.00 is the lowest passing grade, 5.00 means Failed. A LOWER
//             number is a BETTER grade.
//   Scale B — 0-100 percentage. 70 is the passing mark (equivalent to 3.00 on
//             Scale A). A HIGHER number is a BETTER grade.
const {
    normalizeExtraction,
    detectGradingScale,
    resolveScale,
    isFailingGrade,
    summarizeSubjects
} = require("../utils/aiVision");

describe("grading scale detection", () => {
    it("trusts the scale the model declared", () => {
        expect(detectGradingScale({ gradingScale: "A" }, [1.25])).toBe("A");
        expect(detectGradingScale({ gradingScale: "b" }, [95])).toBe("B");
    });

    it("infers Scale A from 1.00-5.00 decimal marks", () => {
        expect(detectGradingScale({}, [1.25, 1.75, 2.5])).toBe("A");
    });

    it("infers Scale B from 0-100 marks", () => {
        expect(detectGradingScale({}, [95, 88, 76])).toBe("B");
    });

    it("falls back to Scale B when there is nothing to infer from", () => {
        expect(detectGradingScale({}, [])).toBe("B");
    });

    it("keeps a reviewer override, else the stored scale, else Scale B", () => {
        expect(resolveScale("a")).toBe("A");
        expect(resolveScale(undefined, "A")).toBe("A");
        expect(resolveScale("nonsense", "A")).toBe("A");
        expect(resolveScale(undefined, undefined)).toBe("B");
    });
});

describe("pass/fail direction", () => {
    it("fails Scale A marks ABOVE the passing mark (inverse)", () => {
        expect(isFailingGrade(1.25, 3, "A")).toBe(false);
        expect(isFailingGrade(3, 3, "A")).toBe(false);   // 3.00 still passes
        expect(isFailingGrade(3.5, 3, "A")).toBe(true);
        expect(isFailingGrade(5, 3, "A")).toBe(true);
    });

    it("fails Scale B marks BELOW the passing mark", () => {
        expect(isFailingGrade(95, 70, "B")).toBe(false);
        expect(isFailingGrade(70, 70, "B")).toBe(false); // 70 still passes
        expect(isFailingGrade(69, 70, "B")).toBe(true);
        expect(isFailingGrade(0, 70, "B")).toBe(true);
    });
});
describe("new shared passing thresholds", () => {
    it("treats 70 as passing on the percentage scale", () => {
        expect(isFailingGrade(70, 70, "B")).toBe(false);
    });

    it("treats 69 as failed on the percentage scale", () => {
        expect(isFailingGrade(69, 70, "B")).toBe(true);
    });

    it("treats 69.5 as failed on the percentage scale", () => {
        expect(isFailingGrade(69.5, 70, "B")).toBe(true);
    });

    it("keeps 3.00 passing on the decimal scale", () => {
        expect(isFailingGrade(3.00, 3.00, "A")).toBe(false);
    });

    it("fails 3.25 on the decimal scale", () => {
        expect(isFailingGrade(3.25, 3.00, "A")).toBe(true);
    });

    it("fails 5.00 on the decimal scale", () => {
        expect(isFailingGrade(5.00, 3.00, "A")).toBe(true);
    });
});

describe("extraction from a 1.00-5.00 (Scale A) grade document", () => {
    // A typical Dagupan transcript: 1.25 is the BEST mark here, and 3.50 failed.
    const result = normalizeExtraction({
        readable: true,
        gradingScale: "A",
        studentName: "JUAN DELA CRUZ",
        subjects: [
            { name: "Mathematics", grade: 1.25 },
            { name: "English", grade: 1.75 },
            { name: "Science", grade: 2.5 },
            { name: "History", grade: 3.5 }
        ],
        passingMark: 3
    });

    it("detects Scale A and keeps the 3.00 passing mark", () => {
        expect(result.gradingScale).toBe("A");
        expect(result.passingMark).toBe(3);
    });

    it("reports the LOWEST number as the highest (best) grade", () => {
        // This is the inversion bug: 1.25 is the best mark, not 3.5.
        expect(result.highestGrade).toBe(1.25);
        expect(result.lowestGrade).toBe(3.5);
    });

    it("keeps the decimals instead of flattening them to whole numbers", () => {
        expect(result.subjects.find((s) => s.name === "Mathematics").grade).toBe(1.25);
        expect(result.subjects.find((s) => s.name === "Science").grade).toBe(2.5);
    });

    it("flags only the mark above 3.00 as failed", () => {
        expect(result.subjectsFailed).toEqual(["History"]);
        expect(result.overallStatus).toBe("Failed");
    });

    it("computes the GWA on 1.00-5.00 without converting anything", () => {
        expect(result.computedGwa).toBe(2.25);
        expect(result.averageGrade).toBe(2.25);
    });
});

describe("extraction from a 0-100 (Scale B) grade document", () => {
    const result = normalizeExtraction({
        readable: true,
        gradingScale: "B",
        studentName: "MARIA SANTOS",
        subjects: [
            { name: "Mathematics", grade: 98 },
            { name: "English", grade: 95 },
            { name: "Science", grade: 88 },
            { name: "History", grade: 69 }
        ],
        passingMark: 70
    });

    it("detects Scale B and keeps the 70 passing mark", () => {
        expect(result.gradingScale).toBe("B");
        expect(result.passingMark).toBe(70);
    });

    it("reports the HIGHEST number as the highest (best) grade", () => {
        expect(result.highestGrade).toBe(98);
        expect(result.lowestGrade).toBe(69);
    });

    it("flags only the mark below 70 as failed", () => {
        expect(result.subjectsFailed).toEqual(["History"]);
        expect(result.overallStatus).toBe("Failed");
    });

    it("converts the percentage average into a 1.00-5.00 GWA", () => {
        // 87.50 average -> 1 + (100 - 87.5) / 10 = 2.25
        expect(result.computedGwa).toBe(2.25);
    });
});

describe("a model that reports the pair the wrong way round", () => {
    it("corrects a reversed highest/lowest on Scale A", () => {
        // The model swapped them (highest 3.5, lowest 1.25) — impossible on an
        // inverse scale, so the marks on the page win.
        const result = normalizeExtraction({
            readable: true,
            gradingScale: "A",
            subjects: [{ name: "Math", grade: 1.25 }, { name: "English", grade: 3.5 }],
            highestGrade: 3.5,
            lowestGrade: 1.25
        });

        expect(result.highestGrade).toBe(1.25);
        expect(result.lowestGrade).toBe(3.5);
    });
});

describe("summarizeSubjects (reviewer corrections)", () => {
    it("keeps derived fields consistent with an edited Scale A subject list", () => {
        const summary = summarizeSubjects(
            [{ name: "Math", grade: 1.5 }, { name: "English", grade: 2.75 }],
            "A",
            3
        );

        expect(summary.highestGrade).toBe(1.5);
        expect(summary.lowestGrade).toBe(2.75);
        expect(summary.subjectsFailed).toEqual([]);
        expect(summary.computedGwa).toBe(2.13);
    });

    it("flags a Scale A mark above the passing mark", () => {
        expect(summarizeSubjects([{ name: "History", grade: 4 }], "A", 3).subjectsFailed)
            .toEqual(["History"]);
    });

    it("flags a Scale B mark below the passing mark", () => {
        expect(summarizeSubjects([{ name: "History", grade: 69 }], "B", 70).subjectsFailed)
            .toEqual(["History"]);
    });

    it("does not flag a Scale B mark at the passing mark", () => {
        expect(summarizeSubjects([{ name: "Math", grade: 70 }], "B", 70).subjectsFailed)
            .toEqual([]);
    });
});