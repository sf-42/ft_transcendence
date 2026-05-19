/**
 * Input Validation Utilities
 * Security: Prevents injection attacks, XSS, and ensures data integrity
 */

// ========== VALIDATION RULES ==========

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

// Username: alphanumeric, underscore, hyphen only
const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;

// Email validation (basic RFC 5322 compliant)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Forbidden patterns (SQL injection, XSS attempts)
const DANGEROUS_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,  // onclick=, onerror=, etc.
  /union\s+select/i,
  /--/,
  /\/\*/,
  /'\s*or\s+/i,
  /'\s*and\s+/i,
  /;\s*drop/i,
  /;\s*delete/i,
  /;\s*update/i,
  /;\s*insert/i,
];

// ========== VALIDATION FUNCTIONS ==========

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates username format and length
 */
export function validateUsername(username: unknown): ValidationResult {
  if (typeof username !== 'string') {
    return { valid: false, error: 'Username must be a string' };
  }

  const trimmed = username.trim();

  if (trimmed.length < USERNAME_MIN_LENGTH) {
    return { valid: false, error: `Username must be at least ${USERNAME_MIN_LENGTH} characters` };
  }

  if (trimmed.length > USERNAME_MAX_LENGTH) {
    return { valid: false, error: `Username must be at most ${USERNAME_MAX_LENGTH} characters` };
  }

  if (!USERNAME_REGEX.test(trimmed)) {
    return { valid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
  }

  // Check for dangerous patterns
  if (containsDangerousPattern(trimmed)) {
    return { valid: false, error: 'Username contains forbidden characters' };
  }

  return { valid: true };
}

/**
 * Validates password strength
 */
export function validatePassword(password: unknown): ValidationResult {
  if (typeof password !== 'string') {
    return { valid: false, error: 'Password must be a string' };
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` };
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return { valid: false, error: `Password must be at most ${PASSWORD_MAX_LENGTH} characters` };
  }

  // Check password complexity (at least one letter and one number)
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  if (!hasLetter || !hasNumber) {
    return { valid: false, error: 'Password must contain at least one letter and one number' };
  }

  return { valid: true };
}

/**
 * Validates email format
 */
export function validateEmail(email: unknown): ValidationResult {
  if (typeof email !== 'string') {
    return { valid: false, error: 'Email must be a string' };
  }

  const trimmed = email.trim().toLowerCase();

  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }

  if (trimmed.length > 254) {
    return { valid: false, error: 'Email is too long' };
  }

  if (containsDangerousPattern(trimmed)) {
    return { valid: false, error: 'Email contains forbidden characters' };
  }

  return { valid: true };
}

/**
 * Validates 2FA code format (6 digits)
 */
export function validate2FACode(code: unknown): ValidationResult {
  if (typeof code !== 'string') {
    return { valid: false, error: '2FA code must be a string' };
  }

  const trimmed = code.trim();

  if (!/^\d{6}$/.test(trimmed)) {
    return { valid: false, error: '2FA code must be exactly 6 digits' };
  }

  return { valid: true };
}

/**
 * Sanitizes a string by removing potentially dangerous characters
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>'"&]/g, '') // Remove HTML special chars
    .trim()
    .slice(0, 1000); // Limit length
}

/**
 * Checks if input contains dangerous SQL/XSS patterns
 */
export function containsDangerousPattern(input: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Validates generic text input (for messages, etc.)
 */
export function validateTextInput(text: unknown, maxLength: number = 1000): ValidationResult {
  if (typeof text !== 'string') {
    return { valid: false, error: 'Input must be a string' };
  }

  if (text.length > maxLength) {
    return { valid: false, error: `Input exceeds maximum length of ${maxLength}` };
  }

  if (containsDangerousPattern(text)) {
    return { valid: false, error: 'Input contains forbidden patterns' };
  }

  return { valid: true };
}
