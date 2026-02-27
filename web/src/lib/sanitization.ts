/**
 * Input Sanitization Utilities
 * 
 * Provides secure input sanitization to prevent XSS attacks
 * using DOMPurify with configurable security policies.
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitization options for different content types
 */
interface SanitizationOptions {
  allowedTags?: string[];
  allowedAttributes?: string[];
  stripTags?: boolean;
  allowLinks?: boolean;
  allowFormatting?: boolean;
}

/**
 * Predefined sanitization profiles for common use cases
 */
export const SanitizationProfiles = {
  // Completely strip all HTML - safest for plain text fields
  PLAIN_TEXT: {
    stripTags: true,
    allowedTags: [],
    allowedAttributes: []
  },

  // Allow only basic formatting (bold, italic, emphasis)
  BASIC_FORMAT: {
    allowedTags: ['b', 'i', 'em', 'strong', 'u'],
    allowedAttributes: [],
    stripTags: false,
    allowFormatting: true
  },

  // Allow formatting and safe HTML for descriptions
  RICH_TEXT: {
    allowedTags: ['b', 'i', 'em', 'strong', 'u', 'p', 'br', 'ul', 'ol', 'li'],
    allowedAttributes: ['class'],
    stripTags: false,
    allowFormatting: true
  },

  // Allow links but sanitize them thoroughly
  WITH_LINKS: {
    allowedTags: ['b', 'i', 'em', 'strong', 'u', 'p', 'br', 'ul', 'ol', 'li', 'a'],
    allowedAttributes: ['href', 'target', 'rel', 'class'],
    stripTags: false,
    allowFormatting: true,
    allowLinks: true
  }
} as const;

/**
 * Sanitize HTML input to prevent XSS attacks
 */
export function sanitizeHtml(
  input: string, 
  options: SanitizationOptions = SanitizationProfiles.PLAIN_TEXT
): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Configure DOMPurify based on options
  const config: any = {};

  if (options.stripTags) {
    // Strip all HTML tags
    config.ALLOWED_TAGS = [];
    config.ALLOWED_ATTR = [];
  } else {
    // Allow specified tags and attributes
    if (options.allowedTags) {
      config.ALLOWED_TAGS = options.allowedTags;
    }
    if (options.allowedAttributes) {
      config.ALLOWED_ATTR = options.allowedAttributes;
    }
  }

  // Additional security measures for links
  if (options.allowLinks) {
    config.ADD_ATTR = ['target', 'rel'];
    config.ALLOWED_URI_REGEXP = /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;
    
    // Hook to add security attributes to links
    DOMPurify.addHook('afterSanitizeAttributes', function (node) {
      // Set all links to open in new tab and add security attributes
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer nofollow');
      }
    });
  }

  try {
    const sanitized = DOMPurify.sanitize(input, config);
    
    // Clean up hooks to prevent side effects
    if (options.allowLinks) {
      DOMPurify.removeHook('afterSanitizeAttributes');
    }
    
    return sanitized;
  } catch (error) {
    console.warn('Sanitization failed, returning empty string:', error);
    return '';
  }
}

/**
 * Sanitize plain text input (removes all HTML)
 */
export function sanitizePlainText(input: string): string {
  return sanitizeHtml(input, SanitizationProfiles.PLAIN_TEXT);
}

/**
 * Sanitize rich text content (allows safe HTML formatting)
 */
export function sanitizeRichText(input: string): string {
  return sanitizeHtml(input, SanitizationProfiles.RICH_TEXT);
}

/**
 * Sanitize content with links (allows safe HTML and links)
 */
export function sanitizeWithLinks(input: string): string {
  return sanitizeHtml(input, SanitizationProfiles.WITH_LINKS);
}

/**
 * Sanitize search query input - extra strict for search inputs
 */
export function sanitizeSearchQuery(input: string): string {
  // Remove HTML, limit length, and escape special characters
  const cleaned = sanitizePlainText(input)
    .trim()
    .substring(0, 500) // Reasonable limit for search queries
    .replace(/[<>]/g, ''); // Extra protection against angle brackets
  
  return cleaned;
}

/**
 * Sanitize user-generated metadata fields
 */
export function sanitizeMetadata(obj: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Sanitize key names
    const cleanKey = sanitizePlainText(key);
    
    if (cleanKey) {
      // Sanitize values based on type
      if (typeof value === 'string') {
        sanitized[cleanKey] = sanitizeRichText(value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[cleanKey] = value;
      } else if (Array.isArray(value)) {
        sanitized[cleanKey] = value.map(item => 
          typeof item === 'string' ? sanitizePlainText(item) : item
        );
      } else if (value && typeof value === 'object') {
        // Recursively sanitize nested objects
        sanitized[cleanKey] = sanitizeMetadata(value);
      }
    }
  }
  
  return sanitized;
}

/**
 * Sanitize saved search data before storage or display
 */
export function sanitizeSavedSearch(searchData: any): any {
  return {
    ...searchData,
    name: sanitizePlainText(searchData.name || ''),
    description: searchData.description ? sanitizeRichText(searchData.description) : undefined,
    tags: Array.isArray(searchData.tags) 
      ? searchData.tags.map((tag: string) => sanitizePlainText(tag)).filter(Boolean)
      : [],
    metadata: searchData.metadata ? sanitizeMetadata(searchData.metadata) : {}
  };
}

/**
 * React hook for sanitizing content in components
 */
export function useSanitizedContent(
  content: string, 
  profile: keyof typeof SanitizationProfiles = 'PLAIN_TEXT'
): string {
  if (!content) return '';
  
  return sanitizeHtml(content, SanitizationProfiles[profile]);
}

/**
 * Safe HTML component props sanitization
 */
export function sanitizeComponentProps(props: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'string' && key.toLowerCase().includes('html')) {
      // Sanitize any prop that might contain HTML
      sanitized[key] = sanitizeRichText(value);
    } else if (typeof value === 'string') {
      // Plain text sanitization for other string props
      sanitized[key] = sanitizePlainText(value);
    } else {
      // Keep non-string props as-is
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}