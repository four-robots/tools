/**
 * Input Sanitization Utilities
 * 
 * Provides secure sanitization for user inputs to prevent XSS attacks
 * and ensure data integrity.
 */

import DOMPurify from 'isomorphic-dompurify';
import validator from 'validator';

// DOMPurify configuration for different contexts
const SANITIZATION_CONFIGS = {
  // For annotation text that may contain basic formatting
  annotation: {
    ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['class'],
    KEEP_CONTENT: true,
    ALLOW_DATA_ATTR: false
  },
  
  // For plain text fields
  plainText: {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
    STRIP_COMMENTS: true,
    STRIP_CDATA_SECTIONS: true
  },
  
  // For search queries
  searchQuery: {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
    STRIP_COMMENTS: true,
    STRIP_CDATA_SECTIONS: true,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input']
  }
};

export class InputSanitizer {
  /**
   * Sanitizes annotation text allowing basic HTML formatting
   */
  static sanitizeAnnotationText(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }
    
    // First pass: remove obvious malicious content
    let sanitized = text.trim();
    
    // Remove common XSS patterns
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/vbscript:/gi, '');
    sanitized = sanitized.replace(/data:/gi, '');
    sanitized = sanitized.replace(/on\w+\s*=/gi, '');
    
    // Use DOMPurify with annotation config
    sanitized = DOMPurify.sanitize(sanitized, SANITIZATION_CONFIGS.annotation);
    
    // Validate length (prevent DoS via large inputs)
    if (sanitized.length > 10000) {
      throw new Error('Annotation text exceeds maximum length of 10,000 characters');
    }
    
    return sanitized;
  }

  /**
   * Sanitizes plain text fields (session names, etc.)
   */
  static sanitizePlainText(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }
    
    // Strip all HTML tags and decode HTML entities
    let sanitized = DOMPurify.sanitize(text, SANITIZATION_CONFIGS.plainText);
    
    // Additional validation
    sanitized = validator.escape(sanitized);
    sanitized = sanitized.trim();
    
    // Validate length
    if (sanitized.length > 500) {
      throw new Error('Text exceeds maximum length of 500 characters');
    }
    
    return sanitized;
  }

  /**
   * Sanitizes search queries
   */
  static sanitizeSearchQuery(query: string): string {
    if (!query || typeof query !== 'string') {
      return '';
    }
    
    // Remove HTML and potentially dangerous content
    let sanitized = DOMPurify.sanitize(query, SANITIZATION_CONFIGS.searchQuery);
    
    // Trim and validate length
    sanitized = sanitized.trim();
    
    if (sanitized.length > 1000) {
      throw new Error('Search query exceeds maximum length of 1,000 characters');
    }
    
    return sanitized;
  }

  /**
   * Sanitizes URLs
   */
  static sanitizeUrl(url: string): string {
    if (!url || typeof url !== 'string') {
      return '';
    }
    
    const trimmed = url.trim();
    
    // Basic URL validation
    if (!validator.isURL(trimmed, {
      protocols: ['http', 'https'],
      require_protocol: false,
      require_host: true,
      require_valid_protocol: false,
      allow_underscores: true,
      host_whitelist: false,
      host_blacklist: false,
      allow_trailing_dot: false,
      allow_protocol_relative_urls: true,
      disallow_auth: true
    })) {
      throw new Error('Invalid URL format');
    }
    
    // Check for malicious schemes
    if (/^(javascript|vbscript|data|file):/i.test(trimmed)) {
      throw new Error('Potentially malicious URL scheme detected');
    }
    
    if (trimmed.length > 2048) {
      throw new Error('URL exceeds maximum length of 2,048 characters');
    }
    
    return trimmed;
  }

  /**
   * Sanitizes email addresses
   */
  static sanitizeEmail(email: string): string {
    if (!email || typeof email !== 'string') {
      return '';
    }
    
    const trimmed = email.trim().toLowerCase();
    
    if (!validator.isEmail(trimmed)) {
      throw new Error('Invalid email format');
    }
    
    return trimmed;
  }

  /**
   * Sanitizes UUIDs
   */
  static sanitizeUUID(uuid: string): string {
    if (!uuid || typeof uuid !== 'string') {
      throw new Error('UUID is required');
    }
    
    const trimmed = uuid.trim();
    
    if (!validator.isUUID(trimmed, 4)) {
      throw new Error('Invalid UUID format');
    }
    
    return trimmed;
  }

  /**
   * Sanitizes JSON data objects
   */
  static sanitizeJsonData(data: any): any {
    if (data === null || data === undefined) {
      return {};
    }
    
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        throw new Error('Invalid JSON data');
      }
    }
    
    if (typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('JSON data must be an object');
    }
    
    // Deep sanitize object
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(data)) {
      // Sanitize keys
      const sanitizedKey = this.sanitizePlainText(key);
      if (sanitizedKey.length === 0) {
        continue; // Skip empty keys
      }
      
      // Sanitize values based on type
      if (typeof value === 'string') {
        sanitized[sanitizedKey] = this.sanitizePlainText(value);
      } else if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
          throw new Error('Invalid numeric value');
        }
        sanitized[sanitizedKey] = value;
      } else if (typeof value === 'boolean') {
        sanitized[sanitizedKey] = value;
      } else if (value === null) {
        sanitized[sanitizedKey] = null;
      } else if (Array.isArray(value)) {
        // Sanitize array elements (only primitive types allowed)
        sanitized[sanitizedKey] = value.map(item => {
          if (typeof item === 'string') {
            return this.sanitizePlainText(item);
          } else if (typeof item === 'number' && Number.isFinite(item)) {
            return item;
          } else if (typeof item === 'boolean') {
            return item;
          }
          throw new Error('Invalid array element type in JSON data');
        });
      } else if (typeof value === 'object') {
        // Recursive sanitization for nested objects (limit depth)
        sanitized[sanitizedKey] = this.sanitizeJsonData(value);
      }
      // Skip functions, symbols, and other types
    }
    
    // Check total size
    const serialized = JSON.stringify(sanitized);
    if (serialized.length > 50000) {
      throw new Error('JSON data exceeds maximum size of 50KB');
    }
    
    return sanitized;
  }

  /**
   * Validates and sanitizes mentions array
   */
  static sanitizeMentions(mentions: string[]): string[] {
    if (!Array.isArray(mentions)) {
      return [];
    }
    
    if (mentions.length > 50) {
      throw new Error('Too many mentions (maximum 50 allowed)');
    }
    
    return mentions.map(mention => this.sanitizeUUID(mention));
  }

  /**
   * Comprehensive sanitization for search annotation data
   */
  static sanitizeAnnotationData(annotation: any): any {
    if (!annotation || typeof annotation !== 'object') {
      throw new Error('Invalid annotation data');
    }

    const sanitized: any = {};

    // Sanitize text fields
    if (annotation.annotation_text) {
      sanitized.annotation_text = this.sanitizeAnnotationText(annotation.annotation_text);
    }

    if (annotation.selected_text) {
      sanitized.selected_text = this.sanitizePlainText(annotation.selected_text);
    }

    // Sanitize URL
    if (annotation.result_url) {
      sanitized.result_url = this.sanitizeUrl(annotation.result_url);
    }

    // Sanitize IDs
    if (annotation.result_id) {
      sanitized.result_id = this.sanitizeUUID(annotation.result_id);
    }

    if (annotation.parent_annotation_id) {
      sanitized.parent_annotation_id = this.sanitizeUUID(annotation.parent_annotation_id);
    }

    // Sanitize mentions
    if (annotation.mentions) {
      sanitized.mentions = this.sanitizeMentions(annotation.mentions);
    }

    // Sanitize JSON data
    if (annotation.annotation_data) {
      sanitized.annotation_data = this.sanitizeJsonData(annotation.annotation_data);
    }

    if (annotation.text_selection) {
      sanitized.text_selection = this.sanitizeJsonData(annotation.text_selection);
    }

    // Copy other safe fields
    if (typeof annotation.is_shared === 'boolean') {
      sanitized.is_shared = annotation.is_shared;
    }

    if (typeof annotation.is_resolved === 'boolean') {
      sanitized.is_resolved = annotation.is_resolved;
    }

    return sanitized;
  }
}