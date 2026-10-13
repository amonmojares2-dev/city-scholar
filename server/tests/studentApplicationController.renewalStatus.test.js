const Application = require("../models/Application");
const User = require("../models/User");
jest.mock("../utils/cityProgramSettings", () => ({
  getProgramSettings: jest.fn().mockResolvedValue({
    applicationPeriod: { enabled: true, openDate: null, closeDate: null }
  })
}));
jest.mock("../controllers/studentDocController", () => ({
  missingRequiredApplicationDocuments: jest.fn().mockResolvedValue([])
}));
const {
  updateStudentApplication,
  submitStudentApplication
} = require("../controllers/studentApplicationController");

function response() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

// Applicant fields that pass submissionErrors validation.
function validApplicant() {
  return {
    course: "BS Information Technology",
    yearLevel: "1st Year",
    academicTerm: "1st Semester",
    studentId: "12-34-5678-901234",
    mobileNumber: "09123456789",
    houseNo: "123",
    streetName: "Main St"
  };
}

// A plain object that stands in for a real mongoose row (populate is only
// chained by the controller).
function applicationDoc(overrides = {}) {
  return {
    _id: "app-1",
    student: "student-1",
    status: "draft",
    submittedAt: null,
    applicant: validApplicant(),
    university: "Test Univ",
    school: "Test Univ",
    populate: jest.fn().mockReturnThis(),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

// Application.findOne(...).sort(...) chain used by both submit paths.
function mockFindOne(doc) {
  return jest.spyOn(Application, "findOne").mockReturnValue({
    sort: jest.fn().mockResolvedValue(doc)
  });
}

// User.findById(...).select(...).lean() chain (barangay + university reads)
// plus the Full Name account update.
function mockUserReads() {
  jest.spyOn(User, "findByIdAndUpdate").mockResolvedValue({});
  return jest.spyOn(User, "findById").mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnValue({ university: "Test Univ", barangay: "Bonuan Boquig" })
  });
}

// Application.findOneAndUpdate(...) used by the atomic approved -> renewal write.
// Returns a spy that resolves to the given doc (or null to simulate the filter
// matching no row, e.g. a lost double-click race).
function mockFindOneAndUpdate(doc) {
  return jest.spyOn(Application, "findOneAndUpdate").mockResolvedValue(doc);
}

// Application.findById(...) fallback used when the atomic write's filter matches
// nothing (the loser of a double-click race re-reads the already-renewed row).
function mockFindById(doc) {
  return jest.spyOn(Application, "findById").mockResolvedValue(doc);
}

const studentUser = {
  id: "student-1",
  name: "Jane Doe",
  email: "jane@example.com",
  role: "student",
  // An existing scholar whose City Office claim has been approved. Both fields
  // are required for an approved application to be allowed to move to
  // 'renewal' (see the isApprovedRenewal gate in updateStudentApplication).
  account: { scholarType: "existing_scholar", scholarVerificationStatus: "approved", name: "Jane Doe", email: "jane@example.com" }
};

// An existing scholar whose City Office claim is still pending verification.
const studentUserPendingScholar = {
  ...studentUser,
  account: { scholarType: "existing_scholar", scholarVerificationStatus: "pending", name: "Jane Doe", email: "jane@example.com" }
};

const studentUserNewApplicant = {
  ...studentUser,
  account: { scholarType: "new_applicant", scholarVerificationStatus: "not_required", name: "Jane Doe", email: "jane@example.com" }
};

describe("renewal submit path - status becomes 'renewal' for existing scholars", () => {
  afterEach(() => jest.restoreAllMocks());

  it("updateStudentApplication: existing scholar submitting renews -> status 'renewal'", async() => {
    const findOne = mockFindOne(applicationDoc());
    const findById = mockUserReads();

    const res = response();
    await updateStudentApplication(
      {
        params: {},
        body: { status: "renewal", fullName: "Jane Doe", email: "jane@example.com", submittedAt: "2026-01-01" },
        user: studentUser
      },
      res,
      jest.fn()
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        application: expect.objectContaining({
          status: "renewal",
          submittedAt: expect.any(Date)
        })
      })
    );
    expect(findOne).toHaveBeenCalledWith({ student: "student-1" });
    expect(findById).toHaveBeenCalledWith("student-1");
  });

  it("updateStudentApplication: new applicant still gets status 'submitted'", async() => {
    mockFindOne(applicationDoc());
    mockUserReads();

    const res = response();
    await updateStudentApplication(
      {
        params: {},
        body: { status: "renewal", fullName: "Jane Doe", email: "jane@example.com" },
        user: studentUserNewApplicant
      },
      res,
      jest.fn()
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        application: expect.objectContaining({ status: "submitted" })
      })
    );
  });

  it("updateStudentApplication: refuses a second submission", async() => {
    const findOne = mockFindOne(applicationDoc({ status: "submitted" }));

    const res = response();
    await updateStudentApplication(
      { params: {}, body: { status: "renewal", fullName: "Jane Doe" }, user: studentUser },
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(findOne).toHaveBeenCalledWith({ student: "student-1" });
  });

  it("submitStudentApplication: renewal flow -> status 'renewal'", async() => {
    mockFindOne(applicationDoc());
    mockUserReads();

    const res = response();
    await submitStudentApplication(
      {
        params: {},
        body: {},
        user: studentUser
      },
      res,
      jest.fn()
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        application: expect.objectContaining({ status: "renewal", submittedAt: expect.any(Date) })
      })
    );
  });

  it("submitStudentApplication: already submitted blocks the renewal", async() => {
    const findOne = mockFindOne(applicationDoc({ status: "submitted" }));

    const res = response();
    await submitStudentApplication(
      { params: {}, body: {}, user: studentUser },
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(findOne).toHaveBeenCalledWith({ student: "student-1" });
  });

  it("submitStudentApplication: new applicant still gets status 'submitted'", async() => {
    mockFindOne(applicationDoc());
    mockUserReads();

    const res = response();
    await submitStudentApplication(
      {
        params: {},
        body: {},
        user: studentUserNewApplicant
      },
      res,
      jest.fn()
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        application: expect.objectContaining({ status: "submitted" })
      })
    );
  });

  // --- approved -> renewal: the real bug and its fix -----------------------
  //
  // The only way an already-approved application may move to 'renewal' is for an
  // existing scholar whose City Office claim is *approved* (scholarType AND
  // scholarVerificationStatus). scholarType alone must NOT open this door.

  it("updateStudentApplication: approved + verified scholar -> 'renewal' via one atomic write", async() => {
    mockFindOne(applicationDoc({ status: "approved" }));
    mockUserReads();
    const renewedDoc = applicationDoc({ status: "renewal" });
    const findOneAndUpdate = mockFindOneAndUpdate(renewedDoc);

    const res = response();
    await updateStudentApplication(
      {
        params: {},
        body: { status: "renewal", fullName: "Jane Doe", email: "jane@example.com", submittedAt: "2026-01-01" },
        user: studentUser
      },
      res,
      jest.fn()
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        application: expect.objectContaining({ status: "renewal" })
      })
    );
    // The write is atomic: the current status ('approved') is pinned in the
    // filter so a concurrent double click cannot match a second time.
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(findOneAndUpdate.mock.calls[0][0]).toEqual({ _id: "app-1", status: "approved" });
    expect(findOneAndUpdate.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        $set: expect.objectContaining({ status: "renewal", submittedAt: expect.any(Date) })
      })
    );
  });

  it("updateStudentApplication: approved + pending scholar -> 409 (scholarType alone must not renew)", async() => {
    mockFindOne(applicationDoc({ status: "approved" }));
    const findOneAndUpdate = mockFindOneAndUpdate(applicationDoc({ status: "renewal" }));

    const res = response();
    await updateStudentApplication(
      {
        params: {},
        body: { status: "renewal", fullName: "Jane Doe", email: "jane@example.com" },
        user: studentUserPendingScholar
      },
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
    // No renewal write happened for the unverified scholar.
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("updateStudentApplication: approved + new applicant -> 409", async() => {
    mockFindOne(applicationDoc({ status: "approved" }));
    const findOneAndUpdate = mockFindOneAndUpdate(applicationDoc({ status: "renewal" }));

    const res = response();
    await updateStudentApplication(
      {
        params: {},
        body: { status: "renewal", fullName: "Jane Doe", email: "jane@example.com" },
        user: studentUserNewApplicant
      },
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("updateStudentApplication: second submit while already 'renewal' -> 200, no second write", async() => {
    const doc = applicationDoc({ status: "renewal" });
    const findOne = mockFindOne(doc);
    const findOneAndUpdate = mockFindOneAndUpdate(applicationDoc({ status: "renewal" }));

    const res = response();
    await updateStudentApplication(
      {
        params: {},
        body: { status: "renewal", fullName: "Jane Doe", email: "jane@example.com" },
        user: studentUser
      },
      res,
      jest.fn()
    );

    // Idempotent: the repeated submit returns 200 with the existing record.
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        application: expect.objectContaining({ status: "renewal" })
      })
    );
    // No state-changing write occurred (atomic updater and plain save).
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(doc.save).not.toHaveBeenCalled();
    expect(findOne).toHaveBeenCalledWith({ student: "student-1" });
  });
});
