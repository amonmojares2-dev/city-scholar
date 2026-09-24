export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;
export const NAME_PATTERN = /^\p{L}[\p{L}\s.'-]*$/u;
export const MOBILE_PATTERN = /^(?:09\d{9}|\+639\d{9})$/;
export const STUDENT_ID_PATTERN = /^\d{2}-\d{2}-\d{4}-\d{6}$/;

export const PASSWORD_RULE_MESSAGE = 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.';
export const NAME_RULE_MESSAGE = 'Name must start with a letter, contain at least 2 letters, and use only letters, spaces, periods, hyphens, or apostrophes.';

export function normalizeName(value: string): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function validateRequired(value: string, label = 'This field'): string | null {
  return String(value || '').trim() ? null : `${label} is required.`;
}

export function validateName(value: string, label = 'Name'): string | null {
  const normalized = normalizeName(value);
  if (!normalized) return `${label} is required.`;
  if (normalized.length > 50 || !NAME_PATTERN.test(normalized) || (normalized.match(/\p{L}/gu) || []).length < 2) {
    return `${label}: ${NAME_RULE_MESSAGE}`;
  }
  return null;
}

export function validateEmail(value: string): string | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Email is required.';
  if (!EMAIL_PATTERN.test(normalized)) return 'Enter a valid email address.';
  return null;
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
  const normalized = String(value || '').replace(/[\s-]/g, '');
  if (!normalized) return 'Mobile number is required.';
  if (!MOBILE_PATTERN.test(normalized)) return 'Enter a valid Philippine mobile number: 09XXXXXXXXX or +639XXXXXXXXX.';
  return null;
}

export function validateOptionalEmail(value: string): string | null {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized && !EMAIL_PATTERN.test(normalized) ? 'Enter a valid email address.' : null;
}

export function validateStudentNumber(value: string): string | null {
  const normalized = String(value || '').replace(/\s+/g, '');
  if (!normalized) return 'Student Number is required.';
  if (!STUDENT_ID_PATTERN.test(normalized)) return 'Enter a valid Student Number, for example 03-01-2425-041708.';
  return null;
}

export function validateGwa(value: string): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 1 && number <= 5 ? null : 'GWA must be between 1.00 and 5.00.';
}

export function validateUnitsEnrolled(value: string): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isInteger(number) && number > 0 ? null : 'Units Enrolled must be a positive whole number.';
}
