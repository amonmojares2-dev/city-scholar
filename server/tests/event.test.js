const Event = require("../models/Event");

jest.mock("../models/Notification", () => ({ create: jest.fn().mockResolvedValue({}) }));
jest.mock("../config/storage", () => ({
  persistUpload: jest.fn(),
  openStoredDownload: jest.fn(),
  removeStoredFileByFilename: jest.fn()
}));

const { listEvents } = require("../controllers/eventController");

function res() {
  const r = { statusCode: 200, body: null };
  r.status = jest.fn((code) => { r.statusCode = code; return r; });
  r.json = jest.fn((body) => { r.body = body; return r; });
  return r;
}

afterEach(() => jest.restoreAllMocks());

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function req(user) {
  return { user, params: {}, body: {}, query: {} };
}

// Minimal event document for listEvents: toObject() is all the controller
// reads off the document itself (attendees/proofs are handled separately).
function makeEvent(overrides = {}) {
  const now = Date.now();
  return {
    _id: "event-1",
    name: "Orientation",
    location: "Hall",
    required: true,
    startsAt: new Date(now - HOUR),
    endsAt: new Date(now - 30 * 60 * 1000),
    attendees: [],
    proofs: [],
    toObject() {
      const copy = { ...this };
      delete copy.toObject;
      return copy;
    },
    ...overrides
  };
}

function mockEvents(events) {
  jest.spyOn(Event, "find").mockReturnValue({ sort: jest.fn().mockResolvedValue(events) });
}

const approvedScholar = { id: "student-a", role: "student", account: { scholarType: "existing_scholar", scholarVerificationStatus: "approved" } };
const pendingScholar = { id: "student-a", role: "student", account: { scholarType: "existing_scholar", scholarVerificationStatus: "pending" } };
const newApplicant = { id: "student-a", role: "student", account: { scholarType: "new_applicant", scholarVerificationStatus: "not_required" } };
const approvedApplicant = { id: "student-a", role: "student", account: { scholarType: "new_applicant", scholarVerificationStatus: "not_required", applicationApproved: true } };

describe("listEvents", () => {
  it("returns the proof-window contract fields for an open window", async () => {
    const event = makeEvent();
    mockEvents([event]);
    const r = res();
    await listEvents(req(approvedScholar), r, () => {});
    const row = r.body.events[0];
    expect(r.body.success).toBe(true);
    expect(row.required).toBe(true);
    expect(row.startsAt).toBeDefined();
    expect(row.endsAt).toBeDefined();
    expect(row.approved).toBe(true);
    expect(row.canSubmit).toBe(true);
    // Deadline for an event with an endsAt is endsAt + 48h.
    expect(new Date(row.proofDeadline).getTime()).toBe(new Date(event.endsAt).getTime() + 48 * HOUR);
  });

  it("marks approved:false and canSubmit:false for a new applicant", async () => {
    mockEvents([makeEvent()]);
    const r = res();
    await listEvents(req(newApplicant), r, () => {});
    const row = r.body.events[0];
    expect(row.approved).toBe(false);
    expect(row.canSubmit).toBe(false);
  });

  it("allows an existing scholar with pending verification to submit because Events is accessible", async () => {
    mockEvents([makeEvent()]);
    const r = res();
    await listEvents(req(pendingScholar), r, () => {});
    const row = r.body.events[0];
    expect(row.approved).toBe(false);
    expect(row.canSubmit).toBe(true);
  });

  it("allows an approved applicant with Events page access to submit", async () => {
    mockEvents([makeEvent()]);
    const r = res();
    await listEvents(req(approvedApplicant), r, () => {});
    expect(r.body.events[0].canSubmit).toBe(true);
  });

  it("keeps canSubmit:false before the event starts even for an approved scholar", async () => {
    const startsAt = new Date(Date.now() + HOUR);
    mockEvents([makeEvent({ startsAt, endsAt: new Date(startsAt.getTime() + 2 * HOUR) })]);
    const r = res();
    await listEvents(req(approvedScholar), r, () => {});
    const row = r.body.events[0];
    expect(row.approved).toBe(true);
    expect(row.canSubmit).toBe(false);
  });

  it("keeps canSubmit:false once the proof deadline has passed", async () => {
    const startsAt = new Date(Date.now() - 10 * DAY);
    mockEvents([makeEvent({ startsAt, endsAt: new Date(startsAt.getTime() + HOUR) })]);
    const r = res();
    await listEvents(req(approvedScholar), r, () => {});
    expect(r.body.events[0].canSubmit).toBe(false);
  });

  it("falls back to startsAt + 7 days for proofDeadline when the event has no endsAt", async () => {
    const startsAt = new Date(Date.now() - DAY);
    mockEvents([makeEvent({ startsAt, endsAt: undefined })]);
    const r = res();
    await listEvents(req(approvedScholar), r, () => {});
    const row = r.body.events[0];
    expect(new Date(row.proofDeadline).getTime()).toBe(startsAt.getTime() + 7 * DAY);
    // Open: the event has started and the 7-day window is still open.
    expect(row.canSubmit).toBe(true);
  });
});
