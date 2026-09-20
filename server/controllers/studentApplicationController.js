const Application = require('../models/Application');
const Document = require('../models/Document');
const User = require('../models/User');

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
    const application = await Application.create({ student: req.user.id, program: req.body.program || '', school: req.body.school || '', applicant: req.body.applicant || {}, status: 'draft' });
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
    if (req.body.applicant) application.applicant = { ...application.applicant, ...req.body.applicant };
    if (req.body.program !== undefined) application.program = req.body.program;
    if (req.body.school !== undefined) application.school = req.body.school;
    // Support submitting through PATCH (draft -> submitted only).
    if (req.body.status === 'submitted' && application.status === 'draft') {
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
    application.status = 'submitted';
    application.submittedAt = new Date();
    await application.save();
    await application.populate('student', 'name email');
    return res.json({ success: true, application });
  } catch (err) { next(err); }
};

module.exports = { getStudentApplication, createStudentApplication, updateStudentApplication, submitStudentApplication };