/**
 * Sanitize string to prevent injection attacks and normalize encoding
 */
export function sanitizeString(input: string): string {
  if (!input) return '';

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');

  // Normalize to UTF-8 and remove invalid characters
  sanitized = Buffer.from(sanitized, 'utf8').toString('utf8');

  // Remove control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Limit length to prevent DoS
  sanitized = sanitized.substring(0, 10000);

  return sanitized;
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return (obj as any).map((item: any) => {
      if (typeof item === 'string') return sanitizeString(item);
      if (typeof item === 'object' && item !== null) return sanitizeObject(item);
      return item;
    });
  }

  const sanitized: Record<string, any> = {};
  for (const key in obj) {
    const value = obj[key];
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}
