/**
 * Input Validation Utilities for Chat Service
 * Security: Prevents injection attacks, XSS, and ensures data integrity
 */

// ========== VALIDATION RULES ==========

const MESSAGE_MAX_LENGTH = 2000;
const USERNAME_MAX_LENGTH = 50;

// Forbidden patterns (XSS attempts, dangerous content)
const DANGEROUS_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,  // onclick=, onerror=, etc.
  /data:/i,
];

// ========== VALIDATION FUNCTIONS ==========

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates and sanitizes a chat message
 */
export function validateMessage(content: unknown): ValidationResult {
  if (typeof content !== 'string') {
    return { valid: false, error: 'Message must be a string' };
  }

  if (content.trim().length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  if (content.length > MESSAGE_MAX_LENGTH) {
    return { valid: false, error: `Message exceeds maximum length of ${MESSAGE_MAX_LENGTH}` };
  }

  // Check for dangerous XSS patterns
  if (containsDangerousPattern(content)) {
    return { valid: false, error: 'Message contains forbidden content' };
  }

  return { valid: true };
}

/**
 * Validates user ID
 */
export function validateUserId(id: unknown): ValidationResult {
  if (typeof id !== 'number' || !Number.isInteger(id)) {
    return { valid: false, error: 'User ID must be an integer' };
  }

  if (id <= 0) {
    return { valid: false, error: 'User ID must be positive' };
  }

  return { valid: true };
}

/**
 * Validates username for search
 */
export function validateUsername(username: unknown): ValidationResult {
  if (typeof username !== 'string') {
    return { valid: false, error: 'Username must be a string' };
  }

  if (username.length < 2) {
    return { valid: false, error: 'Username must be at least 2 characters' };
  }

  if (username.length > USERNAME_MAX_LENGTH) {
    return { valid: false, error: `Username exceeds maximum length of ${USERNAME_MAX_LENGTH}` };
  }

  if (containsDangerousPattern(username)) {
    return { valid: false, error: 'Username contains forbidden characters' };
  }

  return { valid: true };
}

/**
 * Checks if input contains dangerous XSS patterns
 */
export function containsDangerousPattern(input: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Sanitizes HTML entities in a string (for safe storage/display)
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
