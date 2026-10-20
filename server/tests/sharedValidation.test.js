const {
  ACADEMIC_TERM_OPTIONS,
  CIVIL_STATUS_OPTIONS,
  COURSE_OPTIONS,
  DROPDOWN_OPTIONS,
  SCHOOL_TYPE_OPTIONS,
  SEX_OPTIONS,
  YEAR_LEVEL_OPTIONS,
  normalizeEmail,
  normalizeFullName,
  validateField,
  validateRegistrationEmail
} = require('../shared/validation');
const { GRADING } = require('../utils/gradingConfig');

describe('shared input validation rules', () => {
  it('normalizes and validates full names', () => {
    expect(normalizeFullName('  Ma.   Cristina Dela Cruz-Reyes  ')).toBe('Ma. Cristina Dela Cruz-Reyes');
    expect(validateField('fullName', 'Ma. Cristina Dela Cruz-Reyes')).toBeNull();
    expect(validateField('fullName', 'Riz Carlos 11')).toMatch(/letters/);
    expect(validateField('fullName', "O'Neil José")).toBeNull();
    expect(validateField('fullName', 'A')).not.toBeNull();
    expect(validateField('fullName', `A${'b'.repeat(100)}`)).not.toBeNull();
  });

  it('requires the exact student-number and mobile formats', () => {
    expect(validateField('studentId', '03-01-2425-036891')).toBeNull();
    expect(validateField('studentId', '03-01-2425-036891w')).not.toBeNull();
    expect(validateField('studentId', '03 01 2425 036891')).not.toBeNull();
    expect(validateField('mobileNumber', '09297860510')).toBeNull();
    expect(validateField('mobileNumber', '09297860510s')).not.toBeNull();
    expect(validateField('mobileNumber', '+639297860510')).not.toBeNull();
  });

  it('normalizes email and enforces standard format and length', () => {
    expect(normalizeEmail(' Student@Example.COM ')).toBe('student@example.com');
    expect(validateField('email', 'Student@Example.COM')).toBeNull();
    expect(validateField('email', 'not-an-email')).not.toBeNull();
    expect(validateField('email', `${'a'.repeat(243)}@example.com`)).not.toBeNull();
  });

  it('restricts new account registration email to Gmail addresses', () => {
    expect(validateRegistrationEmail(' Student@GMAIL.COM ')).toBeNull();
    expect(validateRegistrationEmail('student+scholar@gmail.com')).toBeNull();
    expect(validateRegistrationEmail('student@example.com')).toMatch(/@gmail\.com/);
    expect(validateRegistrationEmail('student@gmail.com.example.org')).toMatch(/@gmail\.com/);
    expect(validateRegistrationEmail('not-an-email')).toMatch(/valid email/);
  });

  it('accepts only real dates for students aged 15 through 60 and rejects future dates', () => {
    const now = new Date(2026, 9, 19);
    expect(validateField('dateOfBirth', '2011-10-19', { now })).toBeNull();
    expect(validateField('dateOfBirth', '1966-10-19', { now })).toBeNull();
    expect(validateField('dateOfBirth', '2026-10-20', { now })).toMatch(/future/);
    expect(validateField('dateOfBirth', '2023-02-29', { now })).toMatch(/real/);
    expect(validateField('dateOfBirth', '2011-10-20', { now })).toMatch(/15 and 60/);
    expect(validateField('dateOfBirth', '1965-10-18', { now })).toMatch(/15 and 60/);
  });

  it('rejects dropdown values outside the application options', () => {
    expect(Object.keys(DROPDOWN_OPTIONS)).toEqual([
      'sex', 'civilStatus', 'yearLevel', 'academicTerm', 'course', 'schoolType'
    ]);
    for (const [field, options] of Object.entries(DROPDOWN_OPTIONS)) {
      expect(validateField(field, options[0])).toBeNull();
      expect(validateField(field, 'Not an option')).not.toBeNull();
    }
    expect(SEX_OPTIONS).toContain('Other');
    expect(CIVIL_STATUS_OPTIONS).toContain('Single');
    expect(YEAR_LEVEL_OPTIONS).toContain('4th Year');
    expect(ACADEMIC_TERM_OPTIONS).toContain('Summer');
    expect(COURSE_OPTIONS).toContain('BS Information Technology');
    expect(SCHOOL_TYPE_OPTIONS).toContain('State University');
  });

  it('validates nationality, house number, street, city, and postal code', () => {
    expect(validateField('nationality', 'Filipino')).toBeNull();
    expect(validateField('nationality', 'Filipino1')).not.toBeNull();
    expect(validateField('houseNo', '12-B / #4')).toBeNull();
    expect(validateField('houseNo', '12;B')).not.toBeNull();
    expect(validateField('streetName', "St. John's Road, #2")).toBeNull();
    expect(validateField('streetName', 'A')).not.toBeNull();
    expect(validateField('city', 'San José-del Monte')).toBeNull();
    expect(validateField('city', 'City 4')).not.toBeNull();
    expect(validateField('zipCode', '1234')).toBeNull();
    expect(validateField('zipCode', '12345')).not.toBeNull();
  });

  it('requires consecutive school years', () => {
    expect(validateField('schoolYear', '2025-2026')).toBeNull();
    expect(validateField('schoolYear', '2025-2027')).not.toBeNull();
    expect(validateField('schoolYear', '2025/2026')).not.toBeNull();
  });

  it('uses the configured grade scales and allows at most two decimals', () => {
    for (const value of ['1.00', '5.00', '60', '100']) {
      expect(validateField('gwa', value, { grading: GRADING })).toBeNull();
    }
    for (const value of ['0.99', '5.01', '59.99', '100.01', '1.001', '1e2']) {
      expect(validateField('gwa', value, { grading: GRADING })).not.toBeNull();
    }
  });

  it('limits units and rejects markup or oversized remarks', () => {
    expect(validateField('unitsEnrolled', '1')).toBeNull();
    expect(validateField('unitsEnrolled', '40')).toBeNull();
    for (const value of ['0', '41', '1.5', '-1', '2e1']) {
      expect(validateField('unitsEnrolled', value)).not.toBeNull();
    }
    expect(validateField('remarks', 'A'.repeat(500))).toBeNull();
    expect(validateField('remarks', 'A'.repeat(501))).not.toBeNull();
    expect(validateField('remarks', '<b>markup</b>')).not.toBeNull();
  });
});
