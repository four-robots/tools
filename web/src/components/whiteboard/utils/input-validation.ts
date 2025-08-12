/**
 * Input Validation Utilities
 * 
 * Comprehensive security-focused validation for whiteboard selection inputs.
 * Prevents DoS attacks and malicious input injection.
 */

export interface ValidationConfig {
  maxArrayLength: number;
  maxStringLength: number;
  allowedElementIdPattern: RegExp;
  rateLimitConfig: {
    maxRequestsPerMinute: number;
    maxRequestsPerSecond: number;
  };
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  value?: any;
}

export interface ValidationResult<T = any> {
  isValid: boolean;
  errors: ValidationError[];
  sanitized?: T;
  warnings?: string[];
}

// Enhanced security configuration for production 25+ users
const DEFAULT_CONFIG: ValidationConfig = {
  maxArrayLength: 100, // Strict limit to prevent DoS
  maxStringLength: 1000,
  allowedElementIdPattern: /^[a-zA-Z0-9_-]{1,50}$/, // Strict alphanumeric + underscore/dash
  rateLimitConfig: {
    maxRequestsPerMinute: 600, // Increased for 25+ users
    maxRequestsPerSecond: 15, // Allow burst activity
  },
};

class InputValidator {
  private config: ValidationConfig;
  private rateLimitMap = new Map<string, { count: number; lastReset: number; secondCount: number; lastSecondReset: number }>();
  private suspiciousClients = new Map<string, { violations: number; firstViolation: number; blocked: boolean }>();
  private readonly MAX_VIOLATIONS = 5;
  private readonly VIOLATION_WINDOW = 300000; // 5 minutes
  private readonly BLOCK_DURATION = 600000; // 10 minutes

  constructor(config: Partial<ValidationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate selection element IDs array
   */
  validateElementIds(elementIds: any, clientId?: string): ValidationResult<string[]> {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Type validation
    if (!Array.isArray(elementIds)) {
      return {
        isValid: false,
        errors: [{ code: 'INVALID_TYPE', message: 'Element IDs must be an array' }],
      };
    }

    // Length validation (DoS prevention)
    if (elementIds.length > this.config.maxArrayLength) {
      return {
        isValid: false,
        errors: [{
          code: 'ARRAY_TOO_LARGE',
          message: `Element IDs array exceeds maximum length of ${this.config.maxArrayLength}`,
          value: elementIds.length,
        }],
      };
    }

    // Enhanced rate limiting with suspicious behavior detection
    if (clientId) {
      // Check if client is blocked for suspicious behavior
      if (this.isClientBlocked(clientId)) {
        return {
          isValid: false,
          errors: [{
            code: 'CLIENT_BLOCKED',
            message: 'Client blocked due to suspicious activity. Try again later.',
          }],
        };
      }

      if (!this.checkRateLimit(clientId, elementIds.length)) {
        this.recordViolation(clientId, 'RATE_LIMIT_EXCEEDED');
        return {
          isValid: false,
          errors: [{
            code: 'RATE_LIMITED',
            message: 'Too many selection requests. Please slow down.',
          }],
        };
      }
    }

    const sanitized: string[] = [];

    // Validate each element ID
    for (let i = 0; i < elementIds.length; i++) {
      const elementId = elementIds[i];
      
      // Type check
      if (typeof elementId !== 'string') {
        errors.push({
          code: 'INVALID_ELEMENT_ID_TYPE',
          message: `Element ID at index ${i} must be a string`,
          field: `elementIds[${i}]`,
          value: elementId,
        });
        continue;
      }

      // Length check
      if (elementId.length > this.config.maxStringLength) {
        errors.push({
          code: 'ELEMENT_ID_TOO_LONG',
          message: `Element ID at index ${i} exceeds maximum length of ${this.config.maxStringLength}`,
          field: `elementIds[${i}]`,
          value: elementId.length,
        });
        continue;
      }

      // Enhanced pattern validation with injection detection
      if (!this.config.allowedElementIdPattern.test(elementId)) {
        // Check for potential injection attempts
        const suspiciousPatterns = [
          /<script/i, // XSS
          /javascript:/i, // JS injection
          /data:/i, // Data URL injection
          /vbscript:/i, // VBScript injection
          /'|(or |union |select |drop |insert |update |delete )/i, // SQL injection patterns
          /[\x00-\x1f\x7f-\x9f]/, // Control characters
        ];

        const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(elementId));
        if (isSuspicious && clientId) {
          this.recordViolation(clientId, 'INJECTION_ATTEMPT');
        }

        errors.push({
          code: 'INVALID_ELEMENT_ID_FORMAT',
          message: `Element ID at index ${i} contains invalid characters`,
          field: `elementIds[${i}]`,
          value: elementId,
        });
        continue;
      }

      // Sanitize and add
      const sanitizedId = this.sanitizeElementId(elementId);
      if (sanitizedId !== elementId) {
        warnings.push(`Element ID at index ${i} was sanitized`);
      }
      sanitized.push(sanitizedId);
    }

    // Check for duplicates
    const uniqueIds = new Set(sanitized);
    if (uniqueIds.size !== sanitized.length) {
      warnings.push('Duplicate element IDs detected and removed');
      const deduplicatedIds = Array.from(uniqueIds);
      return {
        isValid: errors.length === 0,
        errors,
        sanitized: deduplicatedIds,
        warnings,
      };
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitized,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate bounds object
   */
  validateBounds(bounds: any): ValidationResult<{ x: number; y: number; width: number; height: number }> {
    const errors: ValidationError[] = [];

    if (bounds === null || bounds === undefined) {
      return { isValid: true, errors: [], sanitized: undefined };
    }

    if (typeof bounds !== 'object') {
      return {
        isValid: false,
        errors: [{ code: 'INVALID_BOUNDS_TYPE', message: 'Bounds must be an object' }],
      };
    }

    const { x, y, width, height } = bounds;

    // Validate each property
    const properties = { x, y, width, height };
    for (const [key, value] of Object.entries(properties)) {
      if (typeof value !== 'number' || !isFinite(value)) {
        errors.push({
          code: 'INVALID_BOUNDS_PROPERTY',
          message: `Bounds property '${key}' must be a finite number`,
          field: `bounds.${key}`,
          value,
        });
      }
    }

    // Validate ranges (prevent absurdly large values that could cause DoS)
    const maxCoordinate = 1000000; // 1 million pixels max
    if (Math.abs(x) > maxCoordinate || Math.abs(y) > maxCoordinate) {
      errors.push({
        code: 'BOUNDS_OUT_OF_RANGE',
        message: 'Bounds coordinates are out of valid range',
      });
    }

    if (width < 0 || height < 0 || width > maxCoordinate || height > maxCoordinate) {
      errors.push({
        code: 'BOUNDS_DIMENSIONS_INVALID',
        message: 'Bounds dimensions must be positive and within valid range',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? { x, y, width, height } : undefined,
    };
  }

  /**
   * Validate user information
   */
  validateUser(user: any): ValidationResult<{ id: string; name: string; color: string }> {
    const errors: ValidationError[] = [];

    if (!user || typeof user !== 'object') {
      return {
        isValid: false,
        errors: [{ code: 'INVALID_USER_TYPE', message: 'User must be an object' }],
      };
    }

    const { id, name, color } = user;

    // Validate user ID
    if (typeof id !== 'string' || id.length === 0) {
      errors.push({
        code: 'INVALID_USER_ID',
        message: 'User ID must be a non-empty string',
        field: 'user.id',
      });
    } else if (id.length > this.config.maxStringLength) {
      errors.push({
        code: 'USER_ID_TOO_LONG',
        message: 'User ID is too long',
        field: 'user.id',
      });
    }

    // Validate user name
    if (typeof name !== 'string' || name.length === 0) {
      errors.push({
        code: 'INVALID_USER_NAME',
        message: 'User name must be a non-empty string',
        field: 'user.name',
      });
    } else if (name.length > 100) {
      errors.push({
        code: 'USER_NAME_TOO_LONG',
        message: 'User name is too long',
        field: 'user.name',
      });
    }

    // Validate user color (prevent XSS through CSS injection)
    if (typeof color !== 'string' || !this.isValidColor(color)) {
      errors.push({
        code: 'INVALID_USER_COLOR',
        message: 'User color must be a valid color value',
        field: 'user.color',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? {
        id: this.sanitizeString(id),
        name: this.sanitizeString(name),
        color: this.sanitizeColor(color),
      } : undefined,
    };
  }

  /**
   * Validate complete selection update payload
   */
  validateSelectionUpdate(payload: any, clientId?: string): ValidationResult<{
    elementIds: string[];
    bounds?: { x: number; y: number; width: number; height: number };
    isMultiSelect?: boolean;
  }> {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    if (!payload || typeof payload !== 'object') {
      return {
        isValid: false,
        errors: [{ code: 'INVALID_PAYLOAD_TYPE', message: 'Payload must be an object' }],
      };
    }

    // Validate element IDs
    const elementIdsResult = this.validateElementIds(payload.elementIds, clientId);
    errors.push(...elementIdsResult.errors);
    if (elementIdsResult.warnings) {
      warnings.push(...elementIdsResult.warnings);
    }

    // Validate bounds if present
    let boundsResult: ValidationResult<{ x: number; y: number; width: number; height: number }> = { isValid: true, errors: [] };
    if ('bounds' in payload) {
      boundsResult = this.validateBounds(payload.bounds);
      errors.push(...boundsResult.errors);
    }

    // Validate isMultiSelect
    const isMultiSelect = payload.isMultiSelect;
    if (isMultiSelect !== undefined && typeof isMultiSelect !== 'boolean') {
      errors.push({
        code: 'INVALID_MULTI_SELECT_TYPE',
        message: 'isMultiSelect must be a boolean',
        field: 'isMultiSelect',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? {
        elementIds: elementIdsResult.sanitized!,
        bounds: boundsResult.sanitized,
        isMultiSelect: isMultiSelect === true,
      } : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(clientId: string, requestSize: number = 1): boolean {
    const now = Date.now();
    const rateData = this.rateLimitMap.get(clientId);

    if (!rateData) {
      this.rateLimitMap.set(clientId, {
        count: requestSize,
        lastReset: now,
        secondCount: requestSize,
        lastSecondReset: now,
      });
      return true;
    }

    // Check per-second limit
    if (now - rateData.lastSecondReset >= 1000) {
      rateData.secondCount = requestSize;
      rateData.lastSecondReset = now;
    } else {
      rateData.secondCount += requestSize;
      if (rateData.secondCount > this.config.rateLimitConfig.maxRequestsPerSecond) {
        return false;
      }
    }

    // Check per-minute limit
    if (now - rateData.lastReset >= 60000) {
      rateData.count = requestSize;
      rateData.lastReset = now;
    } else {
      rateData.count += requestSize;
      if (rateData.count > this.config.rateLimitConfig.maxRequestsPerMinute) {
        return false;
      }
    }

    return true;
  }

  /**
   * Sanitize element ID
   */
  private sanitizeElementId(elementId: string): string {
    // Remove any characters that don't match the allowed pattern
    return elementId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
  }

  /**
   * Sanitize general string input
   */
  private sanitizeString(input: string): string {
    // Remove potential XSS vectors
    return input
      .replace(/[<>'"&]/g, '') // Remove HTML/XML chars
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/data:/gi, '') // Remove data: protocol
      .trim()
      .substring(0, this.config.maxStringLength);
  }

  /**
   * Sanitize color value
   */
  private sanitizeColor(color: string): string {
    // Allow only valid CSS color formats
    const validColorPatterns = [
      /^#[0-9a-fA-F]{3}$/,           // #RGB
      /^#[0-9a-fA-F]{6}$/,           // #RRGGBB
      /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/,      // rgb(r,g,b)
      /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/, // rgba(r,g,b,a)
      /^hsl\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*\)$/,    // hsl(h,s,l)
      /^hsla\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*,\s*[\d.]+\s*\)$/, // hsla(h,s,l,a)
    ];

    for (const pattern of validColorPatterns) {
      if (pattern.test(color)) {
        return color;
      }
    }

    // Default to safe color if invalid
    return '#000000';
  }

  /**
   * Check if color is valid
   */
  private isValidColor(color: string): boolean {
    return this.sanitizeColor(color) === color;
  }

  /**
   * Update validation configuration
   */
  updateConfig(newConfig: Partial<ValidationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Clear rate limit data (for cleanup)
   */
  clearRateLimitData(): void {
    this.rateLimitMap.clear();
    this.suspiciousClients.clear();
  }

  /**
   * Manually unblock a client (for admin use)
   */
  unblockClient(clientId: string): boolean {
    const suspiciousData = this.suspiciousClients.get(clientId);
    if (suspiciousData) {
      suspiciousData.blocked = false;
      suspiciousData.violations = 0;
      suspiciousData.firstViolation = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Enhanced validation statistics
   */
  getStats(): {
    rateLimitedClients: number;
    totalValidations: number;
    suspiciousClients: number;
    blockedClients: number;
    securityViolations: number;
  } {
    const blockedCount = Array.from(this.suspiciousClients.values())
      .filter(client => client.blocked).length;
    
    const totalViolations = Array.from(this.suspiciousClients.values())
      .reduce((sum, client) => sum + client.violations, 0);

    return {
      rateLimitedClients: this.rateLimitMap.size,
      totalValidations: Array.from(this.rateLimitMap.values())
        .reduce((sum, data) => sum + data.count, 0),
      suspiciousClients: this.suspiciousClients.size,
      blockedClients: blockedCount,
      securityViolations: totalViolations,
    };
  }

  /**
   * Check if client is currently blocked
   */
  private isClientBlocked(clientId: string): boolean {
    const suspiciousData = this.suspiciousClients.get(clientId);
    if (!suspiciousData || !suspiciousData.blocked) return false;

    const now = Date.now();
    // Check if block period has expired
    if (now - suspiciousData.firstViolation > this.BLOCK_DURATION) {
      // Unblock client but keep monitoring
      suspiciousData.blocked = false;
      suspiciousData.violations = 0;
      suspiciousData.firstViolation = now;
      return false;
    }

    return true;
  }

  /**
   * Record a security violation
   */
  private recordViolation(clientId: string, violationType: string): void {
    const now = Date.now();
    let suspiciousData = this.suspiciousClients.get(clientId);

    if (!suspiciousData) {
      suspiciousData = {
        violations: 1,
        firstViolation: now,
        blocked: false,
      };
      this.suspiciousClients.set(clientId, suspiciousData);
    } else {
      // Reset if outside violation window
      if (now - suspiciousData.firstViolation > this.VIOLATION_WINDOW) {
        suspiciousData.violations = 1;
        suspiciousData.firstViolation = now;
        suspiciousData.blocked = false;
      } else {
        suspiciousData.violations++;
      }
    }

    // Block client if too many violations
    if (suspiciousData.violations >= this.MAX_VIOLATIONS) {
      suspiciousData.blocked = true;
      console.warn(`[InputValidator] Client ${clientId} blocked for violation: ${violationType}`);
    }
  }

  /**
   * Clean up expired client data
   */
  private cleanupClientData(): void {
    const now = Date.now();
    
    // Clean up rate limit data older than 1 hour
    for (const [clientId, data] of this.rateLimitMap.entries()) {
      if (now - data.lastReset > 3600000) { // 1 hour
        this.rateLimitMap.delete(clientId);
      }
    }

    // Clean up suspicious client data outside block window
    for (const [clientId, data] of this.suspiciousClients.entries()) {
      if (now - data.firstViolation > this.BLOCK_DURATION * 2) { // 2x block duration
        this.suspiciousClients.delete(clientId);
      }
    }
  }
}

// Global validator instance with periodic cleanup
const inputValidator = new InputValidator();

// Periodic cleanup of client data every 30 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    (inputValidator as any).cleanupClientData();
  }, 1800000); // 30 minutes

  window.addEventListener('beforeunload', () => {
    inputValidator.clearRateLimitData();
  });
}

export default inputValidator;
export { InputValidator };