const Application = require('../models/Application');
const User = require('../models/User');
const OTPVerification = require('../models/OTPVerification');
const {
  updateStudentApplication
} = require('../controllers/studentApplicationController');
const {
  registerUser,
  updateCurrentUser
} = require('../controllers/userController');

function response() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

function draftApplication() {
  return {
    _id: 'application-1',
    student: 'student-1',
    status: 'draft',
    applicant: {
      studentId: '03-01-2425-036891',
      mobileNumber: '09297860510',
      course: 'BS Information Technology',
      yearLevel: '1st Year',
      academicTerm: '1st Semester',
      houseNo: '12',
      streetName: 'Rizal Street'
    },
    save: jest.fn().mockResolvedValue(undefined),
    populate: jest.fn().mockReturnThis()
  };
}

function mockApplication(doc) {
  const query = { sort: jest.fn().mockResolvedValue(doc) };
  jest.spyOn(Application, 'findOne').mockReturnValue(query);
}

afterEach(() => jest.restoreAllMocks());

describe('server validation rejects invalid values before persistence', () => {
  it('returns 400 for an invalid application student number without saving', async() => {
    const application = draftApplication();
    mockApplication(application);
    const updateUser = jest.spyOn(User, 'findByIdAndUpdate');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = response();

    await updateStudentApplication({
      body: { applicant: { studentId: '03-01-2425-036891w' } },
      user: { id: 'student-1' }
    }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      errors: expect.objectContaining({ studentId: expect.any(String) })
    }));
    expect(application.save).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('returns 400 for a disallowed profile dropdown without saving', async() => {
    const findByIdAndUpdate = jest.spyOn(User, 'findByIdAndUpdate');
    const res = response();

    await updateCurrentUser({
      body: { profile: { sex: 'Not a choice' } },
      user: { id: 'student-1' }
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      errors: expect.objectContaining({ sex: expect.any(String) })
    }));
    expect(findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('returns field errors for an invalid registration name without creating a challenge', async() => {
    const createChallenge = jest.spyOn(OTPVerification, 'create');
    const res = response();

    await registerUser({
      body: {
        firstName: 'Riz Carlos 11',
        lastName: 'Reyes',
        email: 'student@example.com',
        password: 'Password1',
        role: 'student',
        barangay: 'Test Barangay',
        university: 'Test University'
      }
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      errors: expect.objectContaining({ firstName: expect.any(String) })
    }));
    expect(createChallenge).not.toHaveBeenCalled();
  });
});
