const NAME_PATTERN = /^[\p{L} .'-]+$/u;
const STUDENT_NUMBER_PATTERN = /^\d{2}-\d{2}-\d{4}-\d{6}$/;
const MOBILE_PATTERN = /^09\d{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NATIONALITY_PATTERN = /^[\p{L} -]+$/u;
const HOUSE_NUMBER_PATTERN = /^[\p{L}\d\s\-/.#]+$/u;
const STREET_NAME_PATTERN = /^[\p{L}\d\s.,\- '#]+$/u;
const CITY_PATTERN = /^[\p{L} .-]+$/u;
const SCHOOL_YEAR_PATTERN = /^(\d{4})-(\d{4})$/;
const ZIP_PATTERN = /^\d{4}$/;
const UNITS_PATTERN = /^\d+$/;
const GWA_PATTERN = /^\d+(?:\.\d{1,2})?$/;

const SEX_OPTIONS = Object.freeze(['Male', 'Female', 'Other']);
const CIVIL_STATUS_OPTIONS = Object.freeze(['Single', 'Married', 'Widowed', 'Divorced']);
const YEAR_LEVEL_OPTIONS = Object.freeze(['1st Year', '2nd Year', '3rd Year', '4th Year']);
const ACADEMIC_TERM_OPTIONS = Object.freeze(['1st Semester', '2nd Semester', 'Summer']);
const COURSE_OPTIONS = Object.freeze([
  'BS Information Technology',
  'BS Computer Science',
  'BS Business Administration',
  'BS Accountancy',
  'BS Nursing',
  'BS Education',
  'BS Criminology',
  'BS Psychology',
  'BA Communication',
  'BEEd / BSEd',
  'BS Hospitality Management',
  'BS Tourism Management'
]);
const SCHOOL_TYPE_OPTIONS = Object.freeze(['Public', 'Private', 'State University']);

const DROPDOWN_OPTIONS = Object.freeze({
  sex: SEX_OPTIONS,
  civilStatus: CIVIL_STATUS_OPTIONS,
  yearLevel: YEAR_LEVEL_OPTIONS,
  academicTerm: ACADEMIC_TERM_OPTIONS,
  course: COURSE_OPTIONS,
  schoolType: SCHOOL_TYPE_OPTIONS
});

const FIELD_LABELS = Object.freeze({
  fullName: 'Full Name',
  name: 'Full Name',
  firstName: 'First name',
  lastName: 'Last name',
  studentId: 'Student Number',
  mobileNumber: 'Mobile Number',
  email: 'Email',
  dateOfBirth: 'Birth Date',
  sex: 'Sex',
  civilStatus: 'Civil Status',
  nationality: 'Nationality',
  houseNo: 'House No.',
  streetName: 'Street Name',
  city: 'City / municipality',
  zipCode: 'ZIP / postal code',
  schoolYear: 'School Year',
  gwa: 'Current GWA',
  unitsEnrolled: 'Units Enrolled',
  course: 'Course',
  yearLevel: 'Year Level',
  academicTerm: 'Academic Term',
  schoolType: 'School Type',
  remarks: 'Remarks'
});

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').normalize('NFC') : '';
}

function normalizeFullName(value) {
  return normalizeText(value);
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validateFullName(value, required = false) {
  const normalized = normalizeFullName(value);
  if (!normalized) return required ? 'Full Name is required.' : null;
  const length = Array.from(normalized).length;
  if (length < 2 || length > 100 || !NAME_PATTERN.test(normalized)
    || (normalized.match(/\p{L}/gu) || []).length < 2) {
    return 'Use 2 to 100 characters: letters, spaces, periods, apostrophes, or hyphens; include at least 2 letters.';
  }
  return null;
}

function validateNamePart(value, label = 'Name', required = false) {
  const normalized = normalizeFullName(value);
  if (!normalized) return required ? `${label} is required.` : null;
  const length = Array.from(normalized).length;
  if (length > 100 || !NAME_PATTERN.test(normalized) || !/\p{L}/u.test(normalized)) {
    return `${label} may use only letters, spaces, periods, apostrophes, or hyphens, up to 100 characters.`;
  }
  return null;
}

function validateEmail(value, required = false) {
  const normalized = normalizeEmail(value);
  if (!normalized) return required ? 'Email is required.' : null;
  if (normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
    return 'Enter a valid email address of at most 254 characters.';
  }
  return null;
}

function validateRegistrationEmail(value, required = false) {
  const normalized = normalizeEmail(value);
  if (!normalized) return required ? 'Email is required.' : null;
  const error = validateEmail(value, required);
  if (error) return error;
  if (normalized.split('@')[1] !== 'gmail.com') {
    return 'Use a Gmail address ending in @gmail.com.';
  }
  return null;
}

function isRealDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateBirthDate(value, now = new Date()) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return null;
  if (!isRealDate(normalized)) return 'Enter a real birth date.';
  const [year, month, day] = normalized.split('-').map(Number);
  const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  if (year > today[0] || (year === today[0] && month > today[1])
    || (year === today[0] && month === today[1] && day > today[2])) {
    return 'Birth Date cannot be in the future.';
  }
  let age = today[0] - year;
  if (today[1] < month || (today[1] === month && today[2] < day)) age -= 1;
  if (age < 15 || age > 60) return 'Student must be between 15 and 60 years old.';
  return null;
}

function validateGwa(value, grading = { decimal: { min: 1, max: 5 }, percentage: { min: 60, max: 100 } }) {
  const normalized = typeof value === 'number' ? String(value) : String(value || '').trim();
  if (!normalized) return null;
  if (!GWA_PATTERN.test(normalized)) return 'Current GWA must be a number with at most 2 decimal places.';
  const number = Number(normalized);
  const decimal = grading.decimal || { min: 1, max: 5 };
  const percentage = grading.percentage || { min: 60, max: 100 };
  if (!((number >= decimal.min && number <= decimal.max) || (number >= percentage.min && number <= percentage.max))) {
    return 'Current GWA must be between 1.00 and 5.00, or between 60 and 100.';
  }
  return null;
}

function validateField(field, value, options = {}) {
  const label = FIELD_LABELS[field] || field;
  const normalized = typeof value === 'string' ? value.trim().normalize('NFC') : value;
  const blank = normalized === undefined || normalized === null || normalized === '';
  if (blank) return options.required ? `${label} is required.` : null;
  if (typeof value !== 'string' && !(typeof value === 'number' && (field === 'gwa' || field === 'unitsEnrolled'))) {
    return 'Enter a text value.';
  }

  switch (field) {
    case 'fullName':
    case 'name':
      return validateFullName(value, options.required);
    case 'firstName':
      return validateNamePart(value, 'First name', options.required);
    case 'lastName':
      return validateNamePart(value, 'Last name', options.required);
    case 'email':
      return validateEmail(value, options.required);
    case 'studentId':
      return STUDENT_NUMBER_PATTERN.test(String(normalized))
        ? null : 'Student Number must use the format XX-XX-XXXX-XXXXXX.';
    case 'mobileNumber':
      return MOBILE_PATTERN.test(String(normalized))
        ? null : 'Mobile Number must contain 11 digits and start with 09.';
    case 'dateOfBirth':
      return validateBirthDate(String(normalized), options.now);
    case 'sex':
    case 'civilStatus':
    case 'yearLevel':
    case 'academicTerm':
    case 'course':
    case 'schoolType':
      return DROPDOWN_OPTIONS[field].includes(String(normalized))
        ? null : `Select a valid ${label}.`;
    case 'nationality':
      return String(normalized).length >= 2 && String(normalized).length <= 50
        && NATIONALITY_PATTERN.test(String(normalized))
        ? null : 'Nationality must be 2 to 50 letters, spaces, or hyphens.';
    case 'houseNo':
      return String(normalized).length >= 1 && String(normalized).length <= 20
        && HOUSE_NUMBER_PATTERN.test(String(normalized))
        ? null : 'House No. must be 1 to 20 characters using letters, digits, spaces, -, /, ., or #.';
    case 'streetName':
      return String(normalized).length >= 2 && String(normalized).length <= 100
        && STREET_NAME_PATTERN.test(String(normalized))
        ? null : 'Street Name must be 2 to 100 characters using letters, digits, spaces, periods, commas, hyphens, apostrophes, or #.';
    case 'city':
      return String(normalized).length >= 2 && String(normalized).length <= 60
        && CITY_PATTERN.test(String(normalized))
        ? null : 'City / municipality must be 2 to 60 letters, spaces, periods, or hyphens.';
    case 'zipCode':
      return ZIP_PATTERN.test(String(normalized)) ? null : 'ZIP / postal code must contain exactly 4 digits.';
    case 'schoolYear': {
      const match = String(normalized).match(SCHOOL_YEAR_PATTERN);
      return match && Number(match[2]) === Number(match[1]) + 1
        ? null : 'School Year must use the format YYYY-YYYY with consecutive years.';
    }
    case 'gwa':
      return validateGwa(normalized, options.grading);
    case 'unitsEnrolled': {
      if (!UNITS_PATTERN.test(String(normalized))) return 'Units Enrolled must be a whole number from 1 to 40.';
      const units = Number(normalized);
      return units >= 1 && units <= 40 ? null : 'Units Enrolled must be a whole number from 1 to 40.';
    }
    case 'remarks':
      return String(normalized).length <= 500 && !/[<>]/.test(String(normalized))
        ? null : 'Remarks must be at most 500 characters and contain no markup.';
    default:
      return null;
  }
}

function validateFields(record, fields, options = {}) {
  const errors = {};
  for (const [field, required] of Object.entries(fields)) {
    const message = validateField(field, record?.[field], {
      ...options,
      required: Boolean(required)
    });
    if (message) errors[field] = message;
  }
  return errors;
}

module.exports = {
  NAME_PATTERN,
  STUDENT_NUMBER_PATTERN,
  MOBILE_PATTERN,
  EMAIL_PATTERN,
  DROPDOWN_OPTIONS,
  SEX_OPTIONS,
  CIVIL_STATUS_OPTIONS,
  YEAR_LEVEL_OPTIONS,
  ACADEMIC_TERM_OPTIONS,
  COURSE_OPTIONS,
  SCHOOL_TYPE_OPTIONS,
  FIELD_LABELS,
  normalizeText,
  normalizeFullName,
  normalizeEmail,
  validateFullName,
  validateNamePart,
  validateEmail,
  validateRegistrationEmail,
  validateBirthDate,
  validateGwa,
  validateField,
  validateFields,
  isRealDate
};
