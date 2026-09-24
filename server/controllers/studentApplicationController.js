const Application = require('../models/Application');
const Document = require('../models/Document');
const User = require('../models/User');
const { missingRequiredApplicationDocuments } = require('./studentDocController');

const VALID_COURSES = new Set([
  'BS Information Technology', 'BS Computer Science', 'BS Business Administration',
  'BS Accountancy', 'BS Nursing', 'BS Education', 'BS Criminology',
  'BS Psychology', 'BA Communication', 'BEEd / BSEd',
  'BS Hospitality Management', 'BS Tourism Management'
]);
const VALID_YEAR_LEVELS = new Set(['1st Year', '2nd Year', '3rd Year', '4th Year']);
const STUDENT_ID_PATTERN = /^\d{2}-\d{2}-\d{4}-\d{6}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_PATTERN = /^(?:09\d{9}|\+639\d{9})$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function fieldError(errors, field, reason) {
  errors[field] = reason;
}

function submissionErrors(application, isRenewalFlow, studentName, accountEmail) {
  const errors = {};
  if (!String(studentName || '').trim()) {
    fieldError(errors, 'fullName', 'Full Name is required.');
  }
  if (accountEmail && !EMAIL_PATTERN.test(String(accountEmail).trim().toLowerCase())) {
    fieldError(errors, 'email', 'Enter a valid email address.');
  }
  if (!application.university || !application.university.trim()) {
    fieldError(errors, 'university', 'No university found on your account. Please contact the scholarship office to have it corrected.');
  }
  const applicant = application.applicant || {};
  if (!isRenewalFlow && !String(applicant.houseNo || '').trim()) {
    fieldError(errors, 'houseNo', 'House No. is required.');
  }
  if (!isRenewalFlow && !String(applicant.streetName || '').trim()) {
    fieldError(errors, 'streetName', 'Street Name is required.');
  }
  if (!String(applicant.course || '').trim()) {
    fieldError(errors, 'course', 'Course is required.');
  } else if (!VALID_COURSES.has(String(applicant.course).trim())) {
    fieldError(errors, 'course', 'Select a valid Course.');
  }
  if (!String(applicant.yearLevel || '').trim()) {
    fieldError(errors, 'yearLevel', 'Year Level is required.');
  } else if (!VALID_YEAR_LEVELS.has(String(applicant.yearLevel).trim())) {
    fieldError(errors, 'yearLevel', 'Select a valid college Year Level.');
  }
  if (!String(applicant.academicTerm || '').trim()) {
    fieldError(errors, 'academicTerm', 'Academic Term is required.');
  } else if (!['1st Semester', '2nd Semester', 'Summer'].includes(String(applicant.academicTerm).trim())) {
    fieldError(errors, 'academicTerm', 'Select a valid Academic Term.');
  }
  if (!String(applicant.studentId || '').trim()) {
    fieldError(errors, 'studentId', 'Student Number is required.');
  } else if (!STUDENT_ID_PATTERN.test(String(applicant.studentId).replace(/\s+/g, ''))) {
    fieldError(errors, 'studentId', 'Student Number must use the format XX-XX-XXXX-XXXXXX.');
  }
  if (!String(applicant.mobileNumber || '').trim()) {
    fieldError(errors, 'mobileNumber', 'Mobile Number is required.');
  } else if (!MOBILE_PATTERN.test(String(applicant.mobileNumber).replace(/[\s-]/g, ''))) {
    fieldError(errors, 'mobileNumber', 'Mobile Number must be 09XXXXXXXXX or +639XXXXXXXXX.');
  }
  if (applicant.dateOfBirth && !DATE_PATTERN.test(String(applicant.dateOfBirth).trim())) {
    fieldError(errors, 'dateOfBirth', 'Birth Date is invalid.');
  }
  if (applicant.gwa && (!Number.isFinite(Number(applicant.gwa)) || Number(applicant.gwa) < 1 || Number(applicant.gwa) > 5)) {
    fieldError(errors, 'gwa', 'Current GWA must be between 1.00 and 5.00.');
  }
  if (applicant.unitsEnrolled && (!Number.isInteger(Number(applicant.unitsEnrolled)) || Number(applicant.unitsEnrolled) <= 0)) {
    fieldError(errors, 'unitsEnrolled', 'Units Enrolled must be a positive whole number.');
  }
  return errors;
}

function sendValidationError(res, errors, message = 'Please correct the highlighted fields.') {
  console.error('Application validation failed:', { message, errors });
  return res.status(400).json({ success: false, message, errors });
}

// Application submissions use one controller-owned field contract. The
// frontend sends the current form fields only; `address`, schoolAddress, and
// strand remain readable for historical applications but are not accepted as
// new client writes.
const CURRENT_APPLICANT_FIELDS = [
  'dateOfBirth', 'sex', 'civilStatus', 'mobileNumber', 'studentId',
  'parentName', 'parentRelationship', 'parentMobile', 'course', 'yearLevel',
  'academicTerm', 'gwa', 'unitsEnrolled', 'schoolType', 'schoolYear',
  'houseNo', 'streetName'
];

const REMOVED_APPLICANT_FIELDS = ['nationality', 'city', 'zipCode', 'schoolAddress', 'strand', 'address'];
function normalizeApplicantInput(applicant) {
  if (!applicant || typeof applicant !== 'object' || Array.isArray(applicant)) return {};
  const copy = {};
  for (const key of CURRENT_APPLICANT_FIELDS) {
      if (typeof applicant[key] === 'string' || (key === 'gwa' || key === 'unitsEnrolled') && typeof applicant[key] === 'number') {
        const value = String(applicant[key]).trim();
        if (value) copy[key] = key === 'mobileNumber' ? value.replace(/[\s-]/g, '') : key === 'studentId' ? value.replace(/\s+/g, '') : value;
      }
  }
  if (copy.yearLevel && ['grade 11', 'grade 12'].includes(copy.yearLevel.toLowerCase())) delete copy.yearLevel;
  return copy;
}

async function getUniversity(userId) {
  const owner = await User.findById(userId).select('university').lean();
  return String(owner?.university || '');
}

// Residency link — application.barangay mirrors the student's registered
// barangay (User.barangay, set at registration) so the Barangay review
// queue and the City views can scope on application.barangay.
async function linkBarangay(application) {
  if (application.barangay) return;
  const owner = await User.findById(application.student).select('barangay').lean();
  if (owner?.barangay) application.barangay = owner.barangay;
}

// GET /api/student/application — fetch the student most recent application + documents
const getStudentApplication = async (req, res, next) => {
  try {
    const application = await Application.findOne({ student: req.user.id })
      .sort({ createdAt: -1 })
      .populate('student', 'name email')
      .lean();
    if (!application) {
      return res.json({ success: true, application: null, documents: [] });
    }
    const documents = await Document.find({ application: application._id }).sort({ createdAt: 1 }).lean();
    return res.json({ success: true, application, documents });
  } catch (err) { next(err); }
};

// POST /api/student/application — create a new draft
const createStudentApplication = async (req, res, next) => {
  try {
    const existing = await Application.findOne({ student: req.user.id, status: 'draft' }).sort({ createdAt: -1 });
    if (existing) return res.status(409).json({ success: false, message: 'You already have a draft application.', errors: { application: 'A draft application already exists.' } });
    // Residency link: copy the student's registered barangay (User.barangay,
    // chosen at registration) onto the application so the Barangay review
    // queue and City views can scope on application.barangay.
    const university = await getUniversity(req.user.id);
    if (!university) {
      return sendValidationError(res, { university: 'No university found on your account. Please contact the scholarship office to have it corrected.' });
    }
    const registrar = await User.findById(req.user.id).select('barangay').lean();
    const application = await Application.create({ student: req.user.id, university, school: university, applicant: normalizeApplicantInput(req.body.applicant), barangay: registrar?.barangay || null, status: 'draft' });
    await application.populate('student', 'name email');
    return res.status(201).json({ success: true, application });
  } catch (err) { next(err); }
};

// PATCH /api/student/application — save applicant data
const updateStudentApplication = async (req, res, next) => {
  try {
    const application = await Application.findOne({ student: req.user.id }).sort({ createdAt: -1 });
    if (!application) return res.status(404).json({ success: false, message: 'No application found.' });
    // Full Name edits the account itself, not the application document.
    if (typeof req.body.fullName === 'string' && req.body.fullName.trim()) {
      await User.findByIdAndUpdate(req.user.id, { name: req.body.fullName.trim() });
    }
    if (req.body.applicant) application.applicant = { ...application.applicant, ...normalizeApplicantInput(req.body.applicant) };
    const registrar = await User.findById(req.user.id).select('barangay').lean();
    if (registrar?.barangay) application.barangay = registrar.barangay;
    const university = await getUniversity(req.user.id);
    if (!university) {
      return sendValidationError(res, { university: 'No university found on your account. Please contact the scholarship office to have it corrected.' });
    }
    // Ignore any client school/university payload: MongoDB User is authoritative.
    application.university = university;
    application.school = university;
    // Support submitting through PATCH (draft -> submitted only).
    if (req.body.status === 'submitted') {
      if (application.status !== 'draft') {
        return res.status(409).json({ success: false, message: 'This application has already been submitted.', errors: { application: 'This application has already been submitted.' } });
      }
      // Required fields are validated here rather than at the schema level
      // so drafts may stay incomplete. The university was refreshed above.
      const isRenewalFlow = req.user.account?.scholarType === 'existing_scholar';
      if (!isRenewalFlow) {
        const missingDocuments = await missingRequiredApplicationDocuments(application._id);
        if (missingDocuments.length) {
          return sendValidationError(res, { documents: 'Please upload all required documents before submitting.' }, 'Please upload all required documents before submitting.');
        }
      }
      const errors = submissionErrors(application, isRenewalFlow, req.body.fullName || req.user.name, req.user.email);
      if (Object.keys(errors).length) {
        return sendValidationError(res, errors);
      }
      if (!isRenewalFlow) await linkBarangay(application);
      application.status = 'submitted';
      application.submittedAt = req.body.submittedAt ? new Date(req.body.submittedAt) : new Date();
    }
    await application.save();
    await application.populate('student', 'name email');
    return res.json({ success: true, application });
  } catch (err) { next(err); }
};

// PATCH /api/student/application/submit — transition draft to submitted
const submitStudentApplication = async (req, res, next) => {
  try {
    const application = await Application.findOne({ student: req.user.id }).sort({ createdAt: -1 });
    if (!application) return res.status(404).json({ success: false, message: 'No application found.' });
    if (application.status !== 'draft') return res.status(409).json({ success: false, message: 'This application has already been submitted.', errors: { application: 'This application has already been submitted.' } });
    const registrar = await User.findById(req.user.id).select('barangay').lean();
    if (registrar?.barangay) application.barangay = registrar.barangay;
    const university = await getUniversity(req.user.id);
    if (!university) {
      return sendValidationError(res, { university: 'No university found on your account. Please contact the scholarship office to have it corrected.' });
    }
    application.university = university;
    application.school = university;
    // University, course, year level, and (for new applicants) House No./Street
    // Name are required. These checks intentionally run only on submission.
    const isRenewalFlow = req.user.account?.scholarType === 'existing_scholar';
    if (!isRenewalFlow) {
      const missingDocuments = await missingRequiredApplicationDocuments(application._id);
      if (missingDocuments.length) {
        return sendValidationError(res, { documents: 'Please upload all required documents before submitting.' }, 'Please upload all required documents before submitting.');
      }
    }
    const errors = submissionErrors(application, isRenewalFlow, req.user.name, req.user.email);
    if (Object.keys(errors).length) {
        return sendValidationError(res, errors);
    }
    if (!isRenewalFlow) await linkBarangay(application);
    application.status = 'submitted';
    application.submittedAt = new Date();
    await application.save();
    await application.populate('student', 'name email');
    return res.json({ success: true, application });
  } catch (err) { next(err); }
};

module.exports = { getStudentApplication, createStudentApplication, updateStudentApplication, submitStudentApplication };