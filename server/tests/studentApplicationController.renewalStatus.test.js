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

const studentUser = {
  id: "student-1",
  name: "Jane Doe",
  email: "jane@example.com",
  role: "student",
  account: { scholarType: "existing_scholar", name: "Jane Doe", email: "jane@example.com" }
};

const studentUserNewApplicant = {
  ...studentUser,
  account: { scholarType: "new_applicant", name: "Jane Doe", email: "jane@example.com" }
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
});
