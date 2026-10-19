const mongoose = require('mongoose');
const User = require('../models/User');
const Application = require('../models/Application');
const { validateField } = require('../../shared/validation');
const { GRADING } = require('../utils/gradingConfig');

const USER_PROFILE_FIELDS = [
  'dateOfBirth', 'sex', 'civilStatus', 'nationality', 'mobileNumber',
  'houseNo', 'streetName', 'city', 'zipCode', 'studentId', 'course',
  'yearLevel', 'academicTerm', 'gwa', 'unitsEnrolled', 'schoolType',
  'schoolYear'
];
const APPLICATION_FIELDS = [
  'dateOfBirth', 'sex', 'civilStatus', 'mobileNumber', 'studentId',
  'course', 'yearLevel', 'academicTerm', 'gwa', 'unitsEnrolled',
  'schoolType', 'schoolYear', 'houseNo', 'streetName'
];

function reportInvalid(documentId, field, value, required = false) {
  const reason = validateField(field, value, { required, grading: GRADING });
  if (reason) {
    console.log(JSON.stringify({ id: String(documentId), field, reason }));
  }
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const userCursor = User.find({}).select('_id name email role profile').lean().cursor();
    for await (const user of userCursor) {
      reportInvalid(user._id, 'fullName', user.name, user.role === 'student');
      reportInvalid(user._id, 'email', user.email, true);
      for (const field of USER_PROFILE_FIELDS) {
        reportInvalid(user._id, field, user.profile?.[field]);
      }
    }

    const applicationCursor = Application.find({})
      .select('_id student applicant remarks status')
      .populate('student', 'name email')
      .lean()
      .cursor();
    for await (const application of applicationCursor) {
      reportInvalid(application._id, 'fullName', application.student?.name, true);
      reportInvalid(application._id, 'email', application.student?.email, true);
      for (const field of APPLICATION_FIELDS) {
        const required = application.status !== 'draft'
          && ['studentId', 'mobileNumber', 'course', 'yearLevel', 'academicTerm'].includes(field);
        const requiredAddress = application.status !== 'draft'
          && application.status !== 'renewal'
          && ['houseNo', 'streetName'].includes(field);
        reportInvalid(application._id, field, application.applicant?.[field], required || requiredAddress);
      }
      reportInvalid(application._id, 'remarks', application.remarks);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(() => {
  console.error('Invalid-profile scan failed; no data was changed.');
  process.exitCode = 1;
});
