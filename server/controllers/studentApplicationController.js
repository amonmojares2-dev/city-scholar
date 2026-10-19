const Application = require('../models/Application');
const Document = require('../models/Document');
const User = require('../models/User');
const { missingRequiredApplicationDocuments } = require('./studentDocController');
const { getProgramSettings } = require('../utils/cityProgramSettings');
const {
  normalizeText,
  normalizeFullName,
  validateField
} = require('../../shared/validation');
const { GRADING } = require('../utils/gradingConfig');

const APPLICANT_VALIDATION_FIELDS = [
  'dateOfBirth', 'sex', 'civilStatus', 'mobileNumber', 'studentId',
  'course', 'yearLevel', 'academicTerm', 'unitsEnrolled',
  'schoolType', 'schoolYear', 'houseNo', 'streetName'
];

function fieldError(errors, field, reason) {
  errors[field] = reason;
}

function applicantErrors(applicant, requiredFields = []) {
  const errors = {};
  const required = new Set(requiredFields);
  for (const field of APPLICANT_VALIDATION_FIELDS) {
    const message = validateField(field, applicant?.[field], {
      required: required.has(field),
      grading: GRADING
    });
    if (message) fieldError(errors, field, message);
  }
  return errors;
}

function validateApplicantInput(applicant) {
  const errors = applicantErrors(applicant);
  if (Object.prototype.hasOwnProperty.call(applicant || {}, 'gwa')) {
    const message = validateField('gwa', applicant.gwa, { grading: GRADING });
    if (message) fieldError(errors, 'gwa', message);
  }
  for (const field of CURRENT_APPLICANT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(applicant || {}, field)) continue;
    const value = applicant[field];
    if (typeof value !== 'string' && !(typeof value === 'number' && (field === 'gwa' || field === 'unitsEnrolled'))) {
      fieldError(errors, field, 'Enter a text value.');
    }
  }
  return errors;
}

function submissionErrors(application, isRenewalFlow, studentName, accountEmail) {
  const errors = {};
  const nameError = validateField('fullName', studentName, { required: true });
  if (nameError) fieldError(errors, 'fullName', nameError);
  const emailError = validateField('email', accountEmail, { required: true });
  if (emailError) fieldError(errors, 'email', emailError);
  if (!String(application.university || '').trim()) {
    fieldError(errors, 'university', 'No university found on your account. Please contact the scholarship office to have it corrected.');
  }
  const requiredFields = ['studentId', 'mobileNumber', 'course', 'yearLevel', 'academicTerm'];
  if (!isRenewalFlow) requiredFields.push('houseNo', 'streetName');
  Object.assign(errors, applicantErrors(application.applicant, requiredFields));
  return errors;
}

function sendValidationError(res, errors, message = 'Please correct the highlighted fields.') {
  console.error('Application validation failed:', { message, errors });
  return res.status(400).json({ success: false, message, errors });
}

// The City Office owns when applications may be submitted (City Office >
// Program Settings > Application period). Returns a public-facing reason when
// submissions are not currently accepted, or null when the window is open.
async function applicationWindowBlockReason() {
  const settings = await getProgramSettings();
  const period = settings.applicationPeriod || {};
  if (!period.enabled) {
    return 'Scholarship applications are closed right now. Please check the How to Apply page for the next opening.';
  }
  const now = Date.now();
  if (period.openDate && now < new Date(period.openDate).getTime()) {
    return 'The application period has not opened yet. Please submit your application once it opens.';
  }
  if (period.closeDate && now > new Date(period.closeDate).getTime()) {
    return 'The application period has already closed. Please apply during the next announced period.';
  }
  return null;
}

// Application submissions use one controller-owned field contract. The
// frontend sends the current form fields only; `address`, schoolAddress, and
// strand remain readable for historical applications but are not accepted as
// new client writes.
const CURRENT_APPLICANT_FIELDS = [
  'dateOfBirth', 'sex', 'civilStatus', 'mobileNumber', 'studentId',
  'course', 'yearLevel',
  'academicTerm', 'gwa', 'unitsEnrolled', 'schoolType', 'schoolYear',
  'houseNo', 'streetName'
];

const REMOVED_APPLICANT_FIELDS = ['nationality', 'city', 'zipCode', 'schoolAddress', 'strand', 'address'];
function normalizeApplicantInput(applicant) {
  if (!applicant || typeof applicant !== 'object' || Array.isArray(applicant)) return {};
  const copy = {};
  for (const key of CURRENT_APPLICANT_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(applicant, key)) continue;
      const value = typeof applicant[key] === 'number'
        ? String(applicant[key])
        : normalizeText(applicant[key]);
      copy[key] = value;
  }
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
    const applicantInput = req.body?.applicant;
    if (applicantInput !== undefined && (!applicantInput || typeof applicantInput !== 'object' || Array.isArray(applicantInput))) {
      return sendValidationError(res, { applicant: 'Applicant data must be an object.' });
    }
    const errors = validateApplicantInput(applicantInput);
    if (Object.keys(errors).length) return sendValidationError(res, errors);
    const applicant = normalizeApplicantInput(applicantInput);
    // Residency link: copy the student's registered barangay (User.barangay,
    // chosen at registration) onto the application so the Barangay review
    // queue and City views can scope on application.barangay.
    const university = await getUniversity(req.user.id);
    if (!university) {
      return sendValidationError(res, { university: 'No university found on your account. Please contact the scholarship office to have it corrected.' });
    }
    const registrar = await User.findById(req.user.id).select('barangay').lean();
    const application = await Application.create({ student: req.user.id, university, school: university, applicant, barangay: registrar?.barangay || null, status: 'draft' });
    await application.populate('student', 'name email');
    return res.status(201).json({ success: true, application });
  } catch (err) { next(err); }
};

// PATCH /api/student/application — save applicant data
const updateStudentApplication = async (req, res, next) => {
  try {
    const application = await Application.findOne({ student: req.user.id }).sort({ createdAt: -1 });
    if (!application) return res.status(404).json({ success: false, message: 'No application found.' });

    // A submission (draft -> submitted) or a renewal is requested through the
    // same PATCH.
    //   * Label: an existing scholar's submission is a 'renewal'; a first-time
    //     applicant's is 'submitted'. scholarType alone is enough to choose the
    //     label, and that is the only thing it decides here.
    //   * Gate: the only way an already-approved application may move to
    //     'renewal' is for an existing scholar whose City Office claim is
    //     *approved* (scholarVerificationStatus === 'approved'). A pending
    //     scholar or a new applicant is refused with 409. A record that is
    //     already 'renewal' is a repeated submit (double click): a no-op that
    //     returns 200, not a 409 or a second write. Every other transition out
    //     of a non-draft state is refused with 409. This guard runs before any
    //     account write so a locked record never mutates the User.
    const wantsSubmit = req.body.status === 'submitted' || req.body.status === 'renewal';
    const account = req.user.account || {};
    const isRenewalScholar = account.scholarType === 'existing_scholar';
    const isApprovedRenewal = isRenewalScholar
      && account.scholarVerificationStatus === 'approved'
      && application.status === 'approved';
    if (wantsSubmit && application.status !== 'draft' && !isApprovedRenewal) {
      if (application.status === 'renewal') {
        await application.populate('student', 'name email');
        return res.json({ success: true, application });
      }
      return res.status(409).json({ success: false, message: 'This application has already been submitted.', errors: { application: 'This application has already been submitted.' } });
    }
    if (req.body.applicant !== undefined && (!req.body.applicant || typeof req.body.applicant !== 'object' || Array.isArray(req.body.applicant))) {
      return sendValidationError(res, { applicant: 'Applicant data must be an object.' });
    }
    const incomingApplicantErrors = validateApplicantInput(req.body.applicant);
    if (Object.keys(incomingApplicantErrors).length) return sendValidationError(res, incomingApplicantErrors);
    const requestedName = Object.prototype.hasOwnProperty.call(req.body, 'fullName')
      ? normalizeFullName(req.body.fullName)
      : undefined;
    if (requestedName !== undefined) {
      const nameError = validateField('fullName', requestedName, { required: true });
      if (nameError) return sendValidationError(res, { fullName: nameError });
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'email')) {
      const emailError = validateField('email', req.body.email, { required: true });
      if (emailError) return sendValidationError(res, { email: emailError });
    }
    const accountName = requestedName === undefined ? req.user.name : requestedName;
    if (req.body.applicant) application.applicant = { ...application.applicant, ...normalizeApplicantInput(req.body.applicant) };
    const fieldErrors = applicantErrors(application.applicant);
    if (Object.keys(fieldErrors).length) return sendValidationError(res, fieldErrors);
    const registrar = await User.findById(req.user.id).select('barangay').lean();
    if (registrar?.barangay) application.barangay = registrar.barangay;
    const university = await getUniversity(req.user.id);
    if (!university) {
      return sendValidationError(res, { university: 'No university found on your account. Please contact the scholarship office to have it corrected.' });
    }
    application.university = university;
    application.school = university;

    if (wantsSubmit) {
      const isRenewalFlow = isRenewalScholar;
      // Required fields are validated here rather than at the schema level
      // so drafts may stay incomplete. The university was refreshed above.
      const errors = submissionErrors(application, isRenewalFlow, accountName, req.user.email);
      if (Object.keys(errors).length) {
        return sendValidationError(res, errors);
      }
      if (!isRenewalFlow) {
        const missingDocuments = await missingRequiredApplicationDocuments(application._id);
        if (missingDocuments.length) {
          return sendValidationError(res, { documents: 'Please upload all required documents before submitting.' }, 'Please upload all required documents before submitting.');
        }
        const windowBlock = await applicationWindowBlockReason();
        if (windowBlock) return sendValidationError(res, { application: windowBlock }, windowBlock);
      }
      if (!isRenewalFlow) await linkBarangay(application);

      if (isApprovedRenewal) {
        // Atomic approved -> renewal. The current status is pinned in the
        // filter so two near-simultaneous submits (a double click) can only
        // match once: the winner flips approved -> renewal, the loser finds no
        // 'approved' row and is answered with the already-renewed record (200,
        // no second write). The refreshed applicant/barangay/university values
        // ride along in this same single write.
        const submittedAt = req.body.submittedAt ? new Date(req.body.submittedAt) : new Date();
        const updated = await Application.findOneAndUpdate(
          { _id: application._id, status: 'approved' },
          {
            $set: {
              status: 'renewal',
              submittedAt,
              applicant: application.applicant,
              barangay: application.barangay,
              university: application.university,
              school: application.school
            }
          },
          { returnDocument: "after" }
        );
        const renewed = updated || (await Application.findById(application._id)) || application;
        if (updated && requestedName !== undefined && requestedName !== req.user.name) {
          await User.findByIdAndUpdate(req.user.id, { name: requestedName }, { runValidators: true });
        }
        await renewed.populate('student', 'name email');
        return res.json({ success: true, application: renewed });
      }

      application.status = isRenewalFlow ? 'renewal' : 'submitted';
      application.submittedAt = req.body.submittedAt ? new Date(req.body.submittedAt) : new Date();
    }
    await application.save();
    if (requestedName !== undefined && requestedName !== req.user.name) {
      await User.findByIdAndUpdate(req.user.id, { name: requestedName }, { runValidators: true });
    }
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
    if (!isRenewalFlow) {
      const windowBlock = await applicationWindowBlockReason();
      if (windowBlock) return sendValidationError(res, { application: windowBlock }, windowBlock);
    }
    const errors = submissionErrors(application, isRenewalFlow, req.user.name, req.user.email);
    if (Object.keys(errors).length) {
        return sendValidationError(res, errors);
    }
    if (!isRenewalFlow) await linkBarangay(application);
    application.status = isRenewalFlow ? 'renewal' : 'submitted';
    application.submittedAt = new Date();
    await application.save();
    await application.populate('student', 'name email');
    return res.json({ success: true, application });
  } catch (err) { next(err); }
};

module.exports = { getStudentApplication, createStudentApplication, updateStudentApplication, submitStudentApplication };