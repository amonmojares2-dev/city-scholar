// Temporary offline check of the city settings validators (no database needed:
// the stubs stand in for the two writes, so only validation/normalisation runs).
const assert = require("assert");
const CityProgramSettings = require("./server/models/CityProgramSettings");
const PublicPageContent = require("./server/models/PublicPageContent");
const {
    getProgramSettings,
    updateProgramSettings,
    publicProgramView
} = require("./server/utils/cityProgramSettings");
const {
    getPublicPages,
    updatePublicPages
} = require("./server/utils/publicPageContent");

let programWrite = null;
let pageWrite = null;

CityProgramSettings.findOneAndUpdate = (filter, update) => ({
    lean: async () => {
        programWrite = update.$set;
        return { ...update.$set, updatedAt: new Date() };
    }
});
PublicPageContent.findOneAndUpdate = (filter, update) => ({
    lean: async () => {
        pageWrite = update.$set;
        return { ...update.$set, updatedAt: new Date() };
    }
});

(async () => {
    const current = await getProgramSettings({ fresh: true });
    console.log("shipped period:", JSON.stringify(current.applicationPeriod));

    // 1. Saving the untouched form (dates null) must not raise a date error.
    const cleared = await updateProgramSettings({
        applicationPeriod: { ...current.applicationPeriod, openDate: null, closeDate: null },
        renewalPeriod: { ...current.renewalPeriod, openDate: null, closeDate: "" }
    });
    assert.deepStrictEqual(cleared.errors, {}, "null dates must clear the field, not fail validation");
    assert.strictEqual(cleared.settings.applicationPeriod.openDate, null);

    // 2. A real window round-trips and turns into an ISO timestamp. The dates
    //    are in the past relative to "today", so the window reads as closed;
    //    a future opening date reads as not-open-yet.
    const windowed = await updateProgramSettings({
        applicationPeriod: { enabled: true, openDate: "2026-06-01", closeDate: "2026-06-30", academicYear: "2026-2027" }
    });
    assert.deepStrictEqual(windowed.errors, {});
    assert.ok(windowed.settings.applicationPeriod.openDate.startsWith("2026-06-01"));
    const view = publicProgramView(windowed.settings);
    assert.strictEqual(view.applicationWindow.reason, "closed");
    assert.strictEqual(view.applicationWindow.open, false);

    const upcoming = await updateProgramSettings({
        applicationPeriod: { enabled: true, openDate: "2099-06-01", closeDate: "2099-06-30", academicYear: "2099-2100" }
    });
    assert.deepStrictEqual(upcoming.errors, {});
    assert.strictEqual(publicProgramView(upcoming.settings).applicationWindow.reason, "not-open-yet");
    const disabled = await updateProgramSettings({ renewalPeriod: { enabled: false, openDate: null, closeDate: null } });
    assert.strictEqual(publicProgramView(disabled.settings).renewalWindow.reason, "disabled");

    // 3. Bad input is still rejected.
    const badDate = await updateProgramSettings({ applicationPeriod: { openDate: "not-a-date" } });
    assert.ok(badDate.errors.applicationPeriod, "an unparseable date must be reported");
    const reversed = await updateProgramSettings({ applicationPeriod: { openDate: "2026-06-30", closeDate: "2026-06-01" } });
    assert.ok(reversed.errors.applicationPeriod, "a closing date before the opening date must be reported");

    // 4. Document slots: duplicates rejected, labels default to the key, and
    //    disabled slots stay out of the public view.
    const duplicates = await updateProgramSettings({ applicationDocuments: [{ key: "A" }, { key: "A" }] });
    assert.ok(duplicates.errors.applicationDocuments, "duplicate slot keys must be reported");
    const emptyList = await updateProgramSettings({ applicationDocuments: [] });
    assert.ok(emptyList.errors.applicationDocuments, "an empty slot list must be reported");
    const slots = await updateProgramSettings({
        applicationDocuments: [
            { key: "Report Card", enabled: true, required: true },
            { key: "Retired Slot", enabled: false }
        ]
    });
    assert.deepStrictEqual(slots.errors, {});
    assert.strictEqual(slots.settings.applicationDocuments[0].label, "Report Card");
    assert.strictEqual(slots.settings.applicationDocuments[1].enabled, false);
    assert.strictEqual(programWrite.applicationDocuments.length, 2);
    assert.deepStrictEqual(
        publicProgramView(slots.settings).applicationDocuments.map((item) => item.key),
        ["Report Card"],
        "disabled slots must not reach students"
    );

    // 5. Public page copy: a bad payload is reported, a good one is normalised.
    const badPage = await updatePublicPages({ eligibility: "nope" });
    assert.ok(badPage.errors.eligibility);
    const pages = await getPublicPages({ fresh: true });
    const savedPages = await updatePublicPages({
        guidelines: { ...pages.guidelines, title: "Scholarship Guidelines", sections: [{ id: "conduct", title: "Conduct", content: [{ heading: "4.1", text: "Be nice" }] }] }
    });
    assert.deepStrictEqual(savedPages.errors, {});
    assert.strictEqual(savedPages.pages.guidelines.title, "Scholarship Guidelines");
    assert.strictEqual(savedPages.pages.guidelines.sections.length, 1);
    assert.strictEqual(savedPages.pages.guidelines.sections[0].content[0].heading, "4.1");
    assert.strictEqual(pageWrite.guidelines.title, "Scholarship Guidelines");
    // An untouched page in the same payload keeps its stored copy.
    assert.strictEqual(savedPages.pages.eligibility.title, pages.eligibility.title);

    console.log("ALL SETTINGS CHECKS PASSED");
})().catch((error) => {
    console.error("SETTINGS CHECK FAILED:", error.message);
    process.exit(1);
});
