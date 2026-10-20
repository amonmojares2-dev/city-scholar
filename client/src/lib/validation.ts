import {
  EMAIL_PATTERN,
  MOBILE_PATTERN,
  NAME_PATTERN,
  STUDENT_NUMBER_PATTERN,
  normalizeFullName,
  validateEmail as validateSharedEmail,
  validateRegistrationEmail as validateSharedRegistrationEmail,
  validateField,
  validateFullName,
  validateNamePart as validateSharedNamePart,
  validateGwa as validateSharedGwa,
} from '../../../server/shared/validation.js';
import { GRADING } from './gradingConfig';

export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;
export { EMAIL_PATTERN, MOBILE_PATTERN, NAME_PATTERN };
export const STUDENT_ID_PATTERN = STUDENT_NUMBER_PATTERN;

export const PASSWORD_RULE_MESSAGE = 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.';
export const NAME_RULE_MESSAGE = 'Use 2 to 100 characters: letters, spaces, periods, apostrophes, or hyphens; include at least 2 letters.';

export function normalizeName(value: string): string {
  return normalizeFullName(value);
}

export function validateRequired(value: string, label = 'This field'): string | null {
  return String(value || '').trim() ? null : `${label} is required.`;
}

export function validateName(value: string, label = 'Name'): string | null {
  return validateFullName(value, true)?.replace(/^Full Name/, label) || null;
}

export function validateNamePart(value: string, label = 'Name'): string | null {
  return validateSharedNamePart(value, label, true);
}

export function validateEmail(value: string): string | null {
  return validateSharedEmail(value, true);
}

export function validateRegistrationEmail(value: string): string | null {
  return validateSharedRegistrationEmail(value, true);
}

export function validatePassword(value: string): string | null {
  const normalized = String(value || '');
  if (!normalized) return 'Password is required.';
  if (!PASSWORD_PATTERN.test(normalized)) return PASSWORD_RULE_MESSAGE;
  return null;
}

export function validatePasswordConfirmation(password: string, confirmation: string): string | null {
  if (!String(confirmation || '')) return 'Please confirm your password.';
  if (password !== confirmation) return 'Passwords do not match.';
  return null;
}

export function validateMobile(value: string): string | null {
  return validateField('mobileNumber', value, { required: true });
}

export function validateOptionalEmail(value: string): string | null {
  return validateSharedEmail(value, false);
}

export function validateStudentNumber(value: string): string | null {
  return validateField('studentId', value, { required: true });
}

export function validateGwa(value: string): string | null {
  return validateSharedGwa(value, GRADING);
}

export function validateUnitsEnrolled(value: string): string | null {
  return validateField('unitsEnrolled', value);
}
