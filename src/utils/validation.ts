// Input validation and sanitization utilities

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitized?: any;
}

// Regular expressions for validation
const COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const URL_REGEX = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;
const FONT_FAMILY_REGEX = /^[a-zA-Z0-9 ,'-]+$/;

/**
 * Validate color input (hex format)
 */
export function validateColor(color: string): ValidationResult {
  const errors: string[] = [];

  if (!color) {
    errors.push('Color is required');
  } else if (!COLOR_REGEX.test(color)) {
    errors.push('Color must be in valid hex format (e.g., #ff0000 or #f00)');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: color?.toUpperCase()
  };
}

/**
 * Validate URL input
 */
export function validateUrl(url: string): ValidationResult {
  const errors: string[] = [];

  if (!url) {
    errors.push('URL is required');
  } else if (!URL_REGEX.test(url)) {
    errors.push('URL must be in valid format');
  }

  // Additional security check for protocol
  if (url && !url.startsWith('https://') && !url.startsWith('http://')) {
    errors.push('URL must include http:// or https:// protocol');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: url.trim()
  };
}

/**
 * Validate username input
 */
export function validateUsername(username: string): ValidationResult {
  const errors: string[] = [];

  if (!username) {
    errors.push('Username is required');
  } else if (!USERNAME_REGEX.test(username)) {
    errors.push('Username must be 3-20 characters and contain only letters, numbers, underscores, or hyphens');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: username.trim()
  };
}

/**
 * Validate password input
 */
export function validatePassword(password: string): ValidationResult {
  const errors: string[] = [];

  if (!password) {
    errors.push('Password is required');
  } else if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  } else if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  } else if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  } else if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  } else if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate font family input
 */
export function validateFontFamily(fontFamily: string): ValidationResult {
  const errors: string[] = [];

  if (!fontFamily) {
    errors.push('Font family is required');
  } else if (!FONT_FAMILY_REGEX.test(fontFamily)) {
    errors.push('Font family contains invalid characters');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: fontFamily.trim()
  };
}

/**
 * Validate numeric input with range
 */
export function validateNumber(value: number, min: number, max: number): ValidationResult {
  const errors: string[] = [];

  if (value === undefined || value === null) {
    errors.push('Value is required');
  } else if (isNaN(value)) {
    errors.push('Value must be a valid number');
  } else if (value < min) {
    errors.push(`Value must be at least ${min}`);
  } else if (value > max) {
    errors.push(`Value must be at most ${max}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: Math.max(min, Math.min(max, value))
  };
}

/**
 * Sanitize HTML content to prevent XSS
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize user input for safe display
 */
export function sanitizeText(text: string): string {
  if (!text) return '';

  return text
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/[&]/g, '&amp;') // Escape ampersands
    .replace(/["]/g, '&quot;') // Escape quotes
    .trim();
}

/**
 * Validate ITSM connection configuration
 */
export function validateITSMConnection(config: any): ValidationResult {
  const errors: string[] = [];

  if (!config.name || config.name.trim().length === 0) {
    errors.push('Connection name is required');
  }

  if (!config.baseUrl) {
    errors.push('Base URL is required');
  } else {
    const urlValidation = validateUrl(config.baseUrl);
    if (!urlValidation.isValid) {
      errors.push(...urlValidation.errors);
    }
  }

  if (!config.type || !['servicenow', 'jira', 'zendesk', 'salesforce'].includes(config.type)) {
    errors.push('Valid ITSM type is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: {
      ...config,
      name: sanitizeText(config.name),
      baseUrl: config.baseUrl?.trim()
    }
  };
}

/**
 * Validate theme configuration
 */
export function validateThemeConfig(theme: any): ValidationResult {
  const errors: string[] = [];
  const sanitized: any = {};

  // Validate colors
  const colorFields = ['primaryColor', 'secondaryColor', 'backgroundColor', 'textColor'];
  for (const field of colorFields) {
    if (theme[field]) {
      const validation = validateColor(theme[field]);
      if (!validation.isValid) {
        errors.push(`${field}: ${validation.errors.join(', ')}`);
      }
      sanitized[field] = validation.sanitized;
    }
  }

  // Validate font family
  if (theme.fontFamily) {
    const validation = validateFontFamily(theme.fontFamily);
    if (!validation.isValid) {
      errors.push(`fontFamily: ${validation.errors.join(', ')}`);
    }
    sanitized.fontFamily = validation.sanitized;
  }

  // Validate border radius
  if (theme.borderRadius !== undefined) {
    const validation = validateNumber(theme.borderRadius, 0, 20);
    if (!validation.isValid) {
      errors.push(`borderRadius: ${validation.errors.join(', ')}`);
    }
    sanitized.borderRadius = validation.sanitized;
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}