/**
 * Frontend sanitization utilities to prevent XSS attacks
 * 
 * These utilities sanitize user-provided data before rendering in the UI.
 * They complement the backend sanitization but provide client-side protection.
 */

/**
 * Sanitize a string for safe display in HTML
 * Removes/escapes potentially dangerous characters
 */
export function sanitizeForDisplay(input: unknown): string {
  if (input == null) {
    return '';
  }
  
  const str = String(input);
  
  // Remove or escape HTML tags and special characters
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .substring(0, 200); // Limit length to prevent UI overflow
}

/**
 * Sanitize metadata object for safe display
 * Recursively sanitizes all string values in the object
 */
export function sanitizeMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, string> {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }
  
  const sanitized: Record<string, string> = {};
  const maxEntries = 10; // Limit number of entries to prevent UI overflow
  let entryCount = 0;
  
  for (const [key, value] of Object.entries(metadata)) {
    if (entryCount >= maxEntries) break;
    
    // Sanitize both key and value
    const safeKey = sanitizeForDisplay(key);
    const safeValue = sanitizeForDisplay(value);
    
    // Only include non-empty entries
    if (safeKey && safeValue) {
      sanitized[safeKey] = safeValue;
      entryCount++;
    }
  }
  
  return sanitized;
}

/**
 * Sanitize an array of strings for display
 */
export function sanitizeStringArray(
  items: string[] | null | undefined,
  maxItems: number = 5
): string[] {
  if (!Array.isArray(items)) {
    return [];
  }
  
  return items
    .slice(0, maxItems)
    .map(item => sanitizeForDisplay(item))
    .filter(item => item.length > 0);
}

/**
 * Format and sanitize a key-value pair for display
 */
export function formatKeyValue(key: string, value: unknown): string {
  const safeKey = sanitizeForDisplay(key);
  const safeValue = sanitizeForDisplay(value);
  
  if (!safeKey || !safeValue) {
    return '';
  }
  
  return `${safeKey}: ${safeValue}`;
}

/**
 * Sanitize and format metadata entries for display
 */
export function formatMetadataEntries(
  metadata: Record<string, unknown> | null | undefined,
  maxEntries: number = 2,
  separator: string = ' • '
): string {
  const sanitized = sanitizeMetadata(metadata);
  
  return Object.entries(sanitized)
    .slice(0, maxEntries)
    .map(([key, value]) => formatKeyValue(key, value))
    .filter(entry => entry.length > 0)
    .join(separator);
}