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

export class ErrorSanitizer {
  /**
   * Sanitizes error messages to prevent sensitive data leakage
   */
  static sanitizeErrorMessage(error: Error, context: string): string {
    let message = error.message
      .replace(/\b\w+@\w+\.\w+\b/g, '[EMAIL_REDACTED]') // emails
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP_REDACTED]') // IPs
      .replace(/api[_-]?key[s]?[:\s=]+[^\s]+/gi, '[API_KEY_REDACTED]') // API keys
      .replace(/password[:\s=]+[^\s]+/gi, '[PASSWORD_REDACTED]') // passwords
      .replace(/token[:\s=]+[^\s]+/gi, '[TOKEN_REDACTED]') // tokens
      .replace(/secret[:\s=]+[^\s]+/gi, '[SECRET_REDACTED]') // secrets
      .replace(/bearer\s+[^\s]+/gi, '[BEARER_TOKEN_REDACTED]') // bearer tokens
      .replace(/authorization[:\s=]+[^\s]+/gi, '[AUTH_REDACTED]') // authorization headers
      .replace(/x-api-key[:\s=]+[^\s]+/gi, '[X_API_KEY_REDACTED]') // x-api-key headers
      .replace(/\b[A-Fa-f0-9]{32}\b/g, '[HASH_REDACTED]') // 32-char hashes (MD5, etc.)
      .replace(/\b[A-Fa-f0-9]{40}\b/g, '[HASH_REDACTED]') // 40-char hashes (SHA1)
      .replace(/\b[A-Fa-f0-9]{64}\b/g, '[HASH_REDACTED]') // 64-char hashes (SHA256)
      .replace(/\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}/g, '[BCRYPT_HASH_REDACTED]') // bcrypt hashes
      .replace(/mongodb:\/\/[^@]*@[^/]*/g, 'mongodb://[CREDENTIALS_REDACTED]@[HOST_REDACTED]') // MongoDB URIs
      .replace(/postgres:\/\/[^@]*@[^/]*/g, 'postgres://[CREDENTIALS_REDACTED]@[HOST_REDACTED]') // PostgreSQL URIs
      .replace(/redis:\/\/[^@]*@[^/]*/g, 'redis://[CREDENTIALS_REDACTED]@[HOST_REDACTED]') // Redis URIs
      .replace(/\b(?:sk-|pk_)[A-Za-z0-9_-]+/g, '[STRIPE_KEY_REDACTED]') // Stripe keys
      .replace(/\bAIza[A-Za-z0-9_-]{35}/g, '[GOOGLE_API_KEY_REDACTED]') // Google API keys
      .replace(/\bghp_[A-Za-z0-9]{36}/g, '[GITHUB_TOKEN_REDACTED]') // GitHub personal access tokens
      .replace(/\bxoxb-[A-Za-z0-9-]+/g, '[SLACK_BOT_TOKEN_REDACTED]') // Slack bot tokens
      .replace(/\bxoxp-[A-Za-z0-9-]+/g, '[SLACK_USER_TOKEN_REDACTED]') // Slack user tokens
      .replace(/\bAKIA[A-Z0-9]{16}/g, '[AWS_ACCESS_KEY_REDACTED]') // AWS access keys
      .replace(/\b[A-Za-z0-9/+=]{40}/g, '[AWS_SECRET_KEY_REDACTED]') // AWS secret keys (base64)
      .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CREDIT_CARD_REDACTED]') // Credit card numbers
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]') // Social Security Numbers
      .replace(/\b\d{9}\b/g, '[TAX_ID_REDACTED]') // Tax ID numbers
      .replace(/\/([A-Za-z]:)?[\\\/](?:Users|home|Documents|Desktop)[\\\/][^\s"']+/g, '[FILE_PATH_REDACTED]') // File paths
      .replace(/"[^"]*password[^"]*"/gi, '"[PASSWORD_FIELD_REDACTED]"') // Password fields in JSON
      .replace(/"[^"]*secret[^"]*"/gi, '"[SECRET_FIELD_REDACTED]"') // Secret fields in JSON
      .replace(/"[^"]*token[^"]*"/gi, '"[TOKEN_FIELD_REDACTED]"'); // Token fields in JSON

    // Limit message length
    if (message.length > 200) {
      message = message.substring(0, 200) + '...';
    }

    return `[${context}] ${message}`;
  }

  /**
   * Sanitizes log data to remove sensitive fields
   */
  static sanitizeLogData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeLogData(item));
    }

    // Handle objects
    const sensitiveFields = [
      'password', 'token', 'apiKey', 'secret', 'credentials', 'auth', 'authorization',
      'x-api-key', 'x-auth-token', 'bearer', 'jwt', 'session', 'cookie', 'sessionId',
      'privateKey', 'publicKey', 'cert', 'certificate', 'key', 'hash', 'salt',
      'connectionString', 'dbPassword', 'dbUser', 'mongoUri', 'redisUrl', 'databaseUrl',
      'stripeKey', 'googleApiKey', 'githubToken', 'slackToken', 'awsAccessKey', 'awsSecretKey'
    ];

    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(data)) {
      const keyLower = key.toLowerCase();
      
      // Check if field should be redacted
      if (sensitiveFields.some(field => keyLower.includes(field.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeLogData(value);
      } else if (typeof value === 'string') {
        // Apply string sanitization to catch inline sensitive data
        sanitized[key] = this.sanitizeStringValue(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitizes string values to remove inline sensitive data
   */
  private static sanitizeStringValue(value: string): string {
    return value
      .replace(/\b\w+@\w+\.\w+\b/g, '[EMAIL_REDACTED]')
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP_REDACTED]')
      .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[HASH_REDACTED]')
      .replace(/\b(?:sk-|pk_)[A-Za-z0-9_-]+/g, '[API_KEY_REDACTED]')
      .replace(/bearer\s+[^\s]+/gi, '[BEARER_TOKEN_REDACTED]')
      .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD_REDACTED]');
  }
}

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