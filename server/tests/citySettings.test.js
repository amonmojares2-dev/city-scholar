const CityProgramSettings = require("../models/CityProgramSettings");
const PublicPageContent = require("../models/PublicPageContent");
const {
    getProgramSettings,
    updateProgramSettings,
    publicProgramView,
    evaluatePeriod,
    invalidateProgramSettingsCache
} = require("../utils/cityProgramSettings");
const {
    getPublicPages,
    updatePublicPages,
    invalidatePublicPagesCache
} = require("../utils/publicPageContent");

// There is no database in unit tests: mongoose reports "disconnected", so the
// readers fall back to the shipped config and every write is stubbed here.
function stubProgramWrite() {
    let written = null;
    jest.spyOn(CityProgramSettings, "findOneAndUpdate").mockImplementation((filter, update) => ({
        lean: async() => {
            written = update.$set;
            return { ...update.$set, updatedAt: new Date() };
        }
    }));
    return () => written;
}

function stubPageWrite() {
    let written = null;
    jest.spyOn(PublicPageContent, "findOneAndUpdate").mockImplementation((filter, update) => ({
        lean: async() => {
            written = update.$set;
            return { ...update.$set, updatedAt: new Date() };
        }
    }));
    return () => written;
}

describe("city program settings", () => {
    let programWrite;

    beforeEach(() => {
        invalidateProgramSettingsCache();
        programWrite = stubProgramWrite();
    });

    afterEach(() => jest.restoreAllMocks());

    it("clears a filing window when the form sends an empty date", async() => {
        const current = await getProgramSettings({ fresh: true });
        expect(current.applicationPeriod.openDate).toBeNull();

        const result = await updateProgramSettings({
            applicationPeriod: { ...current.applicationPeriod, openDate: null, closeDate: null },
            renewalPeriod: { ...current.renewalPeriod, openDate: "", closeDate: "" }
        });

        // A null or "" date means "no limit on that side", not a broken date.
        expect(result.errors).toEqual({});
        expect(result.settings.applicationPeriod.openDate).toBeNull();
        expect(result.settings.renewalPeriod.closeDate).toBeNull();
    });

    it("saves a real window and reports it as closed or not yet open", async() => {
        const past = await updateProgramSettings({
            applicationPeriod: { enabled: true, openDate: "2026-06-01", closeDate: "2026-06-30", academicYear: "2026-2027" }
        });
        expect(past.errors).toEqual({});
        expect(past.settings.applicationPeriod.openDate.startsWith("2026-06-01")).toBe(true);
        expect(publicProgramView(past.settings).applicationWindow.open).toBe(false);

        const future = await updateProgramSettings({
            applicationPeriod: { enabled: true, openDate: "2099-06-01", closeDate: "2099-06-30", academicYear: "2099-2100" }
        });
        expect(future.errors).toEqual({});
        expect(publicProgramView(future.settings).applicationWindow.reason).toBe("not-open-yet");

        const closed = await updateProgramSettings({ renewalPeriod: { enabled: false, openDate: null, closeDate: null } });
        expect(publicProgramView(closed.settings).renewalWindow.reason).toBe("disabled");
    });

    it("treats a window without dates as always open", () => {
        expect(evaluatePeriod({ enabled: true, openDate: null, closeDate: null })).toMatchObject({ open: true, reason: "always" });
        expect(evaluatePeriod({ enabled: false, openDate: null, closeDate: null })).toMatchObject({ open: false, reason: "disabled" });
    });

    it("rejects unparseable and reversed window dates", async() => {
        const badDate = await updateProgramSettings({ applicationPeriod: { openDate: "not-a-date" } });
        expect(badDate.errors.applicationPeriod).toBeTruthy();

        const reversed = await updateProgramSettings({ applicationPeriod: { openDate: "2026-06-30", closeDate: "2026-06-01" } });
        expect(reversed.errors.applicationPeriod).toBeTruthy();
    });

    it("rejects duplicate and empty document slot lists", async() => {
        const duplicates = await updateProgramSettings({ applicationDocuments: [{ key: "Report Card" }, { key: "Report Card" }] });
        expect(duplicates.errors.applicationDocuments).toBeTruthy();

        const empty = await updateProgramSettings({ applicationDocuments: [] });
        expect(empty.errors.applicationDocuments).toBeTruthy();
    });

    it("keeps disabled document slots away from students", async() => {
        const result = await updateProgramSettings({
            applicationDocuments: [
                { key: "Report Card", enabled: true, required: true },
                { key: "Retired Slot", enabled: false }
            ]
        });

        expect(result.errors).toEqual({});
        // The label falls back to the key so a renamed slot is never blank.
        expect(result.settings.applicationDocuments[0].label).toBe("Report Card");
        expect(programWrite().applicationDocuments).toHaveLength(2);
        expect(publicProgramView(result.settings).applicationDocuments.map((slot) => slot.key)).toEqual(["Report Card"]);
    });
describe("public page content", () => {
    let pageWrite;

    beforeEach(() => {
        invalidatePublicPagesCache();
        pageWrite = stubPageWrite();
    });

    afterEach(() => jest.restoreAllMocks());

    it("reports a page payload that is not an object", async() => {
        const result = await updatePublicPages({ eligibility: "nope" });
        expect(result.errors.eligibility).toBeTruthy();
    });

    it("saves edited copy and leaves the other pages untouched", async() => {
        const current = await getPublicPages({ fresh: true });

        const result = await updatePublicPages({
            guidelines: {
                ...current.guidelines,
                title: "Scholarship Guidelines",
                sections: [{ id: "conduct", title: "Conduct", content: [{ heading: "4.1", text: "Be mindful of the rules." }] }]
            }
        });

        expect(result.errors).toEqual({});
        expect(result.pages.guidelines.title).toBe("Scholarship Guidelines");
        expect(result.pages.guidelines.sections).toHaveLength(1);
        expect(result.pages.guidelines.sections[0].content[0].heading).toBe("4.1");
        expect(pageWrite().guidelines.title).toBe("Scholarship Guidelines");
        // A page that was not part of the payload keeps its stored copy.
        expect(result.pages.eligibility.title).toBe(current.eligibility.title);
        expect(pageWrite().eligibility).toBeUndefined();
    });

    it("drops empty entries instead of publishing blank rows", async() => {
        const current = await getPublicPages({ fresh: true });

        const result = await updatePublicPages({
            eligibility: {
                ...current.eligibility,
                categories: [
                    { id: "kept", title: "Kept", items: ["One", "  ", "Two"] },
                    { id: "dropped", title: "", items: ["  "] }
                ]
            }
        });

        expect(result.errors).toEqual({});
        const categories = result.pages.eligibility.categories;
        expect(categories).toHaveLength(1);
        expect(categories[0].id).toBe("kept");
        expect(categories[0].items).toEqual(["One", "Two"]);
    });
});

});
