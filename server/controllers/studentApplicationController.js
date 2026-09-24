const Application = require('../models/Application');
const Document = require('../models/Document');
const User = require('../models/User');

// Submission rules — checked when an application leaves draft status, so
// in-progress drafts may still have empty fields (see Application model).
// Address (street name) + Lot No. + Course / Strand are required for new
// applicants; students on the existing-scholar renewal path skip the address
// rules so the renewal flow keeps working unchanged.
// NOTE: `program` (Scholarship Program / Program Selection section) was
// removed from the Application form — it is no longer collected or required.
function submissionError(application, isRenewalFlow) {
  if (!application.school || !application.school.trim()) {
    return 'Please fill in your School Name before submitting.';
  }
  if (!isRenewalFlow && !String(application.applicant?.address || '').trim()) {
    return 'Please fill in your Address (Street Name) before submitting.';
  }
  if (!isRenewalFlow && !String(application.applicant?.lotNo || '').trim()) {
    return 'Please fill in your Lot No. before submitting.';
  }
  if (!String(application.applicant?.course || '').trim()) {
    return 'Please select your Course / Strand before submitting.';
  }
  return null;
}

// DB-stage helpers — fields the Application form no longer collects.
// `stripRemovedApplicantFields` drops them from any client write so nothing
// new lands in the DB; values already stored on previously submitted
// applications are left untouched (they stay readable historical data).
// `nationality`, `city` and `zipCode` were removed from the Application form;
// `program` (Scholarship Program / Program Selection section) was removed too.
const REMOVED_APPLICANT_FIELDS = ['nationality', 'city', 'zipCode'];
function stripRemovedApplicantFields(applicant) {
  if (!applicant || typeof applicant !== 'object') return applicant;
  const copy = { ...applicant };
  for (const key of REMOVED_APPLICANT_FIELDS) delete copy[key];
  return copy;
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
    if (existing) return res.status(400).json({ success: false, message: 'You already have a draft application.' });
    // Residency link: copy the student's registered barangay (User.barangay,
    // chosen at registration) onto the application so the Barangay review
    // queue and City views can scope on application.barangay.
    const registrar = await User.findById(req.user.id).select('barangay').lean();
    const application = await Application.create({ student: req.user.id, school: req.body.school || '', applicant: stripRemovedApplicantFields(req.body.applicant) || {}, barangay: registrar?.barangay || null, status: 'draft' });
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
    if (req.body.applicant) application.applicant = { ...application.applicant, ...stripRemovedApplicantFields(req.body.applicant) };
    if (req.body.school !== undefined) application.school = req.body.school;
    // Support submitting through PATCH (draft -> submitted only).
    if (req.body.status === 'submitted' && application.status === 'draft') {
      // Required fields are validated here rather than at the schema level
      // so in-progress drafts may stay incomplete (see Application model).
      const school = (req.body.school || application.school || '').trim();
      application.school = school;
      const isRenewalFlow = req.user.account?.scholarType === 'existing_scholar';
      const error = submissionError(application, isRenewalFlow);
      if (error) {
        return res.status(400).json({ success: false, message: error });
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
        if (application.status !== 'draft') return res.status(400).json({ success: false, message: 'Cannot submit.' });
    // school, course, address and lot no. are required at submission time
    // (enforced here rather than at the schema level so drafts with empty
    // values are allowed). Renewal-path accounts skip the address rules so
    // the existing-scholar renewal flow keeps working unchanged.
    const isRenewalFlow = req.user.account?.scholarType === 'existing_scholar';
    const error = submissionError(application, isRenewalFlow);
    if (error) {
        return res.status(400).json({ success: false, message: error });
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