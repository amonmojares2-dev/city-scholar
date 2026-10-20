export const NAME_PATTERN: RegExp;
export const STUDENT_NUMBER_PATTERN: RegExp;
export const MOBILE_PATTERN: RegExp;
export const EMAIL_PATTERN: RegExp;
export const SEX_OPTIONS: readonly string[];
export const CIVIL_STATUS_OPTIONS: readonly string[];
export const YEAR_LEVEL_OPTIONS: readonly string[];
export const ACADEMIC_TERM_OPTIONS: readonly string[];
export const COURSE_OPTIONS: readonly string[];
export const SCHOOL_TYPE_OPTIONS: readonly string[];
export const DROPDOWN_OPTIONS: Readonly<Record<string, readonly string[]>>;
export const FIELD_LABELS: Readonly<Record<string, string>>;
export function normalizeText(value: unknown): string;
export function normalizeFullName(value: unknown): string;
export function normalizeEmail(value: unknown): string;
export function validateFullName(value: unknown, required?: boolean): string | null;
export function validateNamePart(value: unknown, label?: string, required?: boolean): string | null;
export function validateEmail(value: unknown, required?: boolean): string | null;
export function validateRegistrationEmail(value: unknown, required?: boolean): string | null;
export function validateBirthDate(value: unknown, now?: Date): string | null;
export function validateGwa(value: unknown, grading?: {
  decimal?: { min: number; max: number };
  percentage?: { min: number; max: number };
}): string | null;
export function validateField(field: string, value: unknown, options?: {
  required?: boolean;
  now?: Date;
  grading?: {
    decimal?: { min: number; max: number };
    percentage?: { min: number; max: number };
  };
}): string | null;
export function validateFields(record: Record<string, unknown>, fields: Record<string, boolean>, options?: {
  now?: Date;
  grading?: {
    decimal?: { min: number; max: number };
    percentage?: { min: number; max: number };
  };
}): Record<string, string>;
export function isRealDate(value: unknown): boolean;
