const Event = require("../models/Event");

jest.mock("../models/Notification", () => ({ create: jest.fn().mockResolvedValue({}) }));
jest.mock("../config/storage", () => ({
  // GridFS reads/writes need a live DB. Uploads are stubbed to succeed so the
  // controller proceeds to the DB write the tests assert on; downloads return a
  // fake stream so the image endpoint can be exercised without a real bucket.
  persistUpload: jest.fn().mockResolvedValue("gridfs-file-id"),
  openStoredDownload: jest.fn().mockResolvedValue(null),
  removeStoredFileByFilename: jest.fn()
}));

const storage = require("../config/storage");
const Notification = require("../models/Notification");
const {
  listEvents,
  markAttendance,
  uploadProof,
  removeProof,
  verifyProof,
  rejectProof,
  serveProofFile
} = require("../controllers/eventController");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function res() {
  const r = { statusCode: 200, body: null };
  r.status = jest.fn((code) => { r.statusCode = code; return r; });
  r.json = jest.fn((body) => { r.body = body; return r; });
  r.setHeader = jest.fn();
  r.sendFile = jest.fn();
  return r;
}

function req(user, params = {}, extra = {}) {
  return { user, params, body: {}, query: {}, ...extra };
}

// A fake event document. proofs is an array carrying a mongoose-style .id()
// lookup so verify/reject/serveProof work the same as the real subdoc.
function makeEvent(overrides = {}) {
  const now = Date.now();
  const event = {
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
      delete copy.save;
      return copy;
    },
    save: jest.fn(),
    ...overrides
  };
  const withId = (items) => {
    const arr = items.slice();
    arr.id = (pid) => arr.find((p) => String(p._id) === String(pid));
    return arr;
  };
  event.proofs = withId(overrides.proofs || []);
  event.save = jest.fn().mockResolvedValue(event);
  return event;
}

const approvedScholar = { id: "student-a", role: "student", account: { scholarType: "existing_scholar", scholarVerificationStatus: "approved" } };
const pendingScholar = { id: "student-a", role: "student", account: { scholarType: "existing_scholar", scholarVerificationStatus: "pending" } };
const newApplicant = { id: "student-a", role: "student", account: { scholarType: "new_applicant", scholarVerificationStatus: "not_required" } };
const cityAdmin = { id: "city-1", role: "city_admin", account: {} };
const otherStudent = { id: "student-b", role: "student", account: { scholarType: "existing_scholar", scholarVerificationStatus: "approved" } };

afterEach(() => jest.restoreAllMocks());

describe("listEvents — no leak of other students' data", () => {
  it("strips proofs and attendees and returns only the caller's own proof", async () => {
    const event = makeEvent({
      attendees: ["student-a", "student-b"],
      proofs: [{ _id: "p1", student: "student-a", status: "pending", proof: "aaaa.png", submittedAt: new Date() }]
    });
    jest.spyOn(Event, "find").mockReturnValue({ sort: jest.fn().mockResolvedValue([event]) });
    const r = res();
    await listEvents(req(approvedScholar), r, () => {});
    const row = r.body.events[0];
    expect(row.ownProof).toEqual(expect.objectContaining({ _id: "p1", status: "pending" }));
    expect(row).not.toHaveProperty("proofs");
    expect(row).not.toHaveProperty("attendees");
  });

  it("returns ownProof null when the caller has not submitted", async () => {
    const event = makeEvent({ proofs: [{ _id: "p1", student: "student-b", status: "pending" }] });
    jest.spyOn(Event, "find").mockReturnValue({ sort: jest.fn().mockResolvedValue([event]) });
    const r = res();
    await listEvents(req(approvedScholar), r, () => {});
    expect(r.body.events[0].ownProof).toBeNull();
  });
});

describe("markAttendance — required events reject the old toggle", () => {
  it("returns 409 for a required event", async () => {
    const event = makeEvent({ required: true });
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    const r = res();
    await markAttendance(req(approvedScholar, { id: "event-1" }), r, () => {});
    expect(r.status).toHaveBeenCalledWith(409);
  });

  it("keeps the old self-marked behaviour for a non-required event", async () => {
    const event = makeEvent({ required: false });
    const spy = jest.spyOn(Event, "findById").mockResolvedValue(event);
    jest.spyOn(Event, "findByIdAndUpdate").mockResolvedValue(event);
    const r = res();
    await markAttendance(req(approvedScholar, { id: "event-1" }), r, () => {});
    expect(Event.findByIdAndUpdate).toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    expect(r.body.success).toBe(true);
  });
});


describe("uploadProof — deadline window", () => {
  it("allows a submission inside the window (approved scholar)", async () => {
    const event = makeEvent();
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    const r = res();
    await uploadProof(req(approvedScholar, { id: "event-1" }, { file: { filename: "abc123.png", originalname: "me.png", mimetype: "image/png" } }), r, () => {});
    expect(r.statusCode).toBe(201);
    expect(event.proofs.length).toBe(1);
    expect(event.proofs[0].status).toBe("pending");
    expect(event.proofs[0].proof).toBe("abc123.png");
  });

  it("does not delete the new proof if response handling fails after the event save", async () => {
    const event = makeEvent();
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    const r = res();
    r.json.mockImplementation(() => { throw new Error("response failure"); });
    const next = jest.fn();

    await uploadProof(
      req(approvedScholar, { id: "event-1" }, { file: { filename: "abc123.png", originalname: "me.png", mimetype: "image/png" } }),
      r,
      next
    );

    expect(event.save).toHaveBeenCalled();
    expect(storage.removeStoredFileByFilename).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "response failure" }));
  });

  it("blocks before the event starts (422)", async () => {
    const event = makeEvent({ startsAt: new Date(Date.now() + DAY) });
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    const r = res();
    await uploadProof(req(approvedScholar, { id: "event-1" }, { file: { filename: "abc123.png", originalname: "me.png", mimetype: "image/png" } }), r, () => {});
    expect(r.status).toHaveBeenCalledWith(422);
    expect(event.proofs.length).toBe(0);
  });

  it("blocks after endsAt + 48h (410)", async () => {
    const event = makeEvent({ startsAt: new Date(Date.now() - 10 * DAY), endsAt: new Date(Date.now() - 3 * DAY) });
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    const r = res();
    await uploadProof(req(approvedScholar, { id: "event-1" }, { file: { filename: "abc123.png", originalname: "me.png", mimetype: "image/png" } }), r, () => {});
    expect(r.status).toHaveBeenCalledWith(410);
    expect(event.proofs.length).toBe(0);
  });
});

describe("uploadProof — only approved existing scholars", () => {
  const file = { filename: "abc123.png", originalname: "me.png", mimetype: "image/png" };
  it("refuses a pending scholar (403)", async () => {
    const event = makeEvent();
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    const r = res();
    await uploadProof(req(pendingScholar, { id: "event-1" }, { file }), r, () => {});
    expect(r.status).toHaveBeenCalledWith(403);
    expect(event.proofs.length).toBe(0);
  });

  it("refuses a new applicant (403)", async () => {
    const event = makeEvent();
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    const r = res();
    await uploadProof(req(newApplicant, { id: "event-1" }, { file }), r, () => {});
    expect(r.status).toHaveBeenCalledWith(403);
    expect(event.proofs.length).toBe(0);
  });

  it("refuses when proof is not required for the event (400)", async () => {
    const event = makeEvent({ required: false });
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    const r = res();
    await uploadProof(req(approvedScholar, { id: "event-1" }, { file }), r, () => {});
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it("refuses when no file is attached (400)", async () => {
    const event = makeEvent();
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    const r = res();
    await uploadProof(req(approvedScholar, { id: "event-1" }), r, () => {});
    expect(r.status).toHaveBeenCalledWith(400);
  });
});

describe("uploadProof — replace before the deadline resets to pending and deletes the old file", () => {
  it("replaces the caller's existing proof, removing the previous image", async () => {
    const event = makeEvent({
      proofs: [{ _id: "p1", student: "student-a", status: "verified", proof: "old.png", originalName: "old.png", mimeType: "image/png", submittedAt: new Date(), reason: "", reviewedAt: new Date(), reviewedBy: "city-1" }]
    });
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    const r = res();
    await uploadProof(req(approvedScholar, { id: "event-1" }, { file: { filename: "new.png", originalname: "new.png", mimetype: "image/png" } }), r, () => {});
    expect(r.statusCode).toBe(200);
    expect(event.proofs.length).toBe(1);
    expect(event.proofs[0].proof).toBe("new.png");
    expect(event.proofs[0].status).toBe("pending");
    expect(storage.removeStoredFileByFilename).toHaveBeenCalledWith("old.png");
  });
});

describe("verify / reject a proof (city office)", () => {
  it("verify marks the proof verified and notifies the student", async () => {
    const event = makeEvent({ proofs: [{ _id: "p1", student: "student-a", status: "pending", proof: "a.png" }] });
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    const r = res();
    await verifyProof(req(cityAdmin, { id: "event-1", proofId: "p1" }), r, () => {});
    expect(r.body.success).toBe(true);
    expect(event.proofs.id("p1").status).toBe("verified");
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({ recipient: "student-a", title: "Proof verified" }));
  });

  it("reject requires a reason (400)", async () => {
    const event = makeEvent({ proofs: [{ _id: "p1", student: "student-a", status: "pending" }] });
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    const r = res();
    await rejectProof(req(cityAdmin, { id: "event-1", proofId: "p1" }, { body: {} }), r, () => {});
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it("reject with a reason marks rejected and notifies the student", async () => {
    const event = makeEvent({ proofs: [{ _id: "p1", student: "student-a", status: "pending" }] });
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    const r = res();
    await rejectProof(req(cityAdmin, { id: "event-1", proofId: "p1" }, { body: { reason: "blurry" } }), r, () => {});
    expect(r.body.success).toBe(true);
    expect(event.proofs.id("p1").status).toBe("rejected");
    expect(event.proofs.id("p1").reason).toBe("blurry");
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({ recipient: "student-a", title: "Proof rejected" }));
  });
});

describe("serveProofFile — authenticated and scoped", () => {
  const fakeStream = () => ({ on: jest.fn(), pipe: jest.fn() });

  beforeEach(() => {
    // Reset the module-level download mock so a call in one test never leaks
    // into the call-count assertions of another.
    storage.openStoredDownload.mockReset();
    storage.openStoredDownload.mockResolvedValue(null);
  });

  it("lets the owning student view the image", async () => {
    const event = makeEvent({ proofs: [{ _id: "p1", student: "student-a", status: "pending", proof: "abc123.png", mimeType: "image/png" }] });
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    storage.openStoredDownload.mockResolvedValue(fakeStream());
    const r = res();
    await serveProofFile(req(approvedScholar, { id: "event-1", proofId: "p1" }), r, () => {});
    expect(storage.openStoredDownload).toHaveBeenCalledWith("abc123.png");
    expect(r.statusCode).toBe(200);
  });

  it("returns 403 for a different student", async () => {
    const event = makeEvent({ proofs: [{ _id: "p1", student: "student-a", status: "pending", proof: "abc123.png" }] });
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    const r = res();
    await serveProofFile(req(otherStudent, { id: "event-1", proofId: "p1" }), r, () => {});
    expect(r.status).toHaveBeenCalledWith(403);
    expect(storage.openStoredDownload).not.toHaveBeenCalled();
  });

  it("lets the city office view the image", async () => {
    const event = makeEvent({ proofs: [{ _id: "p1", student: "student-a", status: "pending", proof: "abc123.png", mimeType: "image/png" }] });
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    storage.openStoredDownload.mockResolvedValue(fakeStream());
    const r = res();
    await serveProofFile(req(cityAdmin, { id: "event-1", proofId: "p1" }), r, () => {});
    expect(storage.openStoredDownload).toHaveBeenCalledWith("abc123.png");
  });

  it("returns 404 when the stored image is missing", async () => {
    const event = makeEvent({ proofs: [{ _id: "p1", student: "student-a", status: "pending", proof: "abc123.png" }] });
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    storage.openStoredDownload.mockResolvedValue(null);
    const r = res();
    await serveProofFile(req(approvedScholar, { id: "event-1", proofId: "p1" }), r, () => {});
    expect(r.status).toHaveBeenCalledWith(404);
    expect(r.body?.message || "").toMatch(/re-upload/i);
  });
});

describe("removeProof", () => {
  it("removes the caller's pending proof and deletes the image", async () => {
    const event = makeEvent({ proofs: [{ _id: "p1", student: "student-a", status: "pending", proof: "abc123.png" }] });
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    const r = res();
    await removeProof(req(approvedScholar, { id: "event-1", proofId: "p1" }), r, () => {});
    expect(r.body.success).toBe(true);
    expect(event.proofs.id("p1").proof).toBeNull();
    expect(storage.removeStoredFileByFilename).toHaveBeenCalledWith("abc123.png");
  });

  it("refuses to remove a proof that is already reviewed (409)", async () => {
    const event = makeEvent({ proofs: [{ _id: "p1", student: "student-a", status: "verified", proof: "abc123.png" }] });
    jest.spyOn(Event, "findById").mockResolvedValue(event);
    const r = res();
    await removeProof(req(approvedScholar, { id: "event-1", proofId: "p1" }), r, () => {});
    expect(r.status).toHaveBeenCalledWith(409);
  });
});
