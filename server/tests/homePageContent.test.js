const PublicPageContent = require("../models/PublicPageContent");
const {
    PAGE_KEYS,
    getPublicPages,
    updatePublicPages,
    invalidatePublicPagesCache,
    normalizeHome,
    mergePage
} = require("../utils/publicPageContent");
const { DEFAULT_HOME_CONTENT } = require("../config/homePageDefaults");

// There is no database in unit tests: mongoose reports "disconnected", so the
// readers fall back to the shipped config and every write is stubbed here.
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

describe("home page content", () => {
    let pageWrite;

    beforeEach(() => {
        invalidatePublicPagesCache();
        pageWrite = stubPageWrite();
    });

    afterEach(() => jest.restoreAllMocks());

    it("serves the shipped landing page before anything is saved", async() => {
        const pages = await getPublicPages({ fresh: true });

        expect(PAGE_KEYS).toContain("home");
        expect(pages.home.hero.titleLine1).toBe(DEFAULT_HOME_CONTENT.hero.titleLine1);
        expect(pages.home.stats).toHaveLength(4);
        expect(pages.home.process.steps).toHaveLength(4);
        expect(pages.home.testimonials.items).toHaveLength(3);
        // Reading never writes: the saved document only appears on a save.
        expect(pageWrite()).toBeNull();
    });

    it("saves edited hero copy and leaves the other pages untouched", async() => {
        const current = await getPublicPages({ fresh: true });

        const result = await updatePublicPages({
            home: { ...current.home, hero: { ...current.home.hero, titleLine1: "New Title" } }
        });

        expect(result.errors).toEqual({});
        expect(result.pages.home.hero.titleLine1).toBe("New Title");
        // A section outside the edited one keeps the shipped copy.
        expect(result.pages.home.about.title).toBe(DEFAULT_HOME_CONTENT.about.title);
        expect(pageWrite().home.hero.titleLine1).toBe("New Title");
        // Pages that were not part of the payload are never written.
        expect(pageWrite().eligibility).toBeUndefined();
    });

    it("falls back to the shipped copy when a field is left blank", async() => {
        const current = await getPublicPages({ fresh: true });

        const result = await updatePublicPages({
            home: { ...current.home, hero: { ...current.home.hero, titleLine1: "   ", subtitle: null } }
        });

        expect(result.errors).toEqual({});
        expect(result.pages.home.hero.titleLine1).toBe(DEFAULT_HOME_CONTENT.hero.titleLine1);
        expect(result.pages.home.hero.subtitle).toBe(DEFAULT_HOME_CONTENT.hero.subtitle);
    });

    it("keeps a section that was cleared on purpose empty", async() => {
        const current = await getPublicPages({ fresh: true });

        const result = await updatePublicPages({
            home: { ...current.home, testimonials: { ...current.home.testimonials, items: [] } }
        });

        expect(result.errors).toEqual({});
        expect(result.pages.home.testimonials.items).toEqual([]);
        expect(result.pages.home.announcements.items).toHaveLength(3);
    });

    it("merges a partial section instead of replacing it", () => {
        const merged = mergePage("home", DEFAULT_HOME_CONTENT, { hero: { titleLine1: "Second pass" } });

        expect(merged.hero.titleLine1).toBe("Second pass");
        expect(merged.hero.subtitle).toBe(DEFAULT_HOME_CONTENT.hero.subtitle);
        expect(merged.about).toEqual(DEFAULT_HOME_CONTENT.about);
    });

    it("keeps the shallow merge for the flat pages", () => {
        const merged = mergePage("eligibility", { title: "Old", intro: "keep" }, { title: "New" });

        expect(merged).toEqual({ title: "New", intro: "keep" });
    });

    it("drops blank list entries, bad icons and blank fields", () => {
        const page = normalizeHome({
            hero: { badge: "", titleLine1: "Hero Line One" },
            stats: [
                { value: "10", label: "Scholars", icon: "rocket" },
                { value: "", label: "" }
            ],
            process: { steps: [{ title: "Keep" }] }
        });

        expect(page.hero.badge).toBe(DEFAULT_HOME_CONTENT.hero.badge);
        expect(page.hero.titleLine1).toBe("Hero Line One");
        expect(page.stats).toHaveLength(1);
        // An unknown icon falls back instead of rendering nothing.
        expect(page.stats[0].icon).toBe("award");
        expect(page.stats[0].key).toBe("stat-1");
        expect(page.process.steps).toHaveLength(1);
        expect(page.process.steps[0].num).toBe("01");
    });
});
