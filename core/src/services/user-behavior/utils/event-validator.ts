import { BehaviorEvent, BehaviorEventSchema } from '../../../shared/types/user-behavior.js';
import { Logger } from '../../../shared/utils/logger.js';

export class EventValidator {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('EventValidator');
  }

  /**
   * Validate a behavior event
   */
  async validate(event: Partial<BehaviorEvent>): Promise<BehaviorEvent> {
    try {
      // Ensure required fields are present
      const validatedEvent = this.ensureRequiredFields(event);

      // Validate with Zod schema
      const result = BehaviorEventSchema.parse(validatedEvent);

      // Additional business logic validation
      this.validateBusinessRules(result);

      return result;

    } catch (error) {
      this.logger.error('Event validation failed', error, { event });
      throw new Error(`Event validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate multiple events
   */
  async validateBatch(events: Partial<BehaviorEvent>[]): Promise<BehaviorEvent[]> {
    const results: BehaviorEvent[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < events.length; i++) {
      try {
        const validated = await this.validate(events[i]);
        results.push(validated);
      } catch (error) {
        errors.push({
          index: i,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    if (errors.length > 0) {
      this.logger.warn('Batch validation had errors', { errors });
    }

    return results;
  }

  /**
   * Check if event is valid without throwing
   */
  isValid(event: Partial<BehaviorEvent>): boolean {
    try {
      BehaviorEventSchema.parse(this.ensureRequiredFields(event));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get validation errors for an event
   */
  getValidationErrors(event: Partial<BehaviorEvent>): string[] {
    try {
      BehaviorEventSchema.parse(this.ensureRequiredFields(event));
      return [];
    } catch (error: any) {
      if (error.errors) {
        return error.errors.map((err: any) => 
          `${err.path.join('.')}: ${err.message}`
        );
      }
      return [error.message || 'Unknown validation error'];
    }
  }

  /**
   * Sanitize event data to remove potentially harmful content
   */
  sanitizeEvent(event: Partial<BehaviorEvent>): Partial<BehaviorEvent> {
    const sanitized = { ...event };

    // Sanitize search query
    if (sanitized.searchQuery) {
      sanitized.searchQuery = this.sanitizeString(sanitized.searchQuery);
    }

    // Sanitize user agent
    if (sanitized.userAgent) {
      sanitized.userAgent = this.sanitizeString(sanitized.userAgent);
    }

    // Sanitize referrer
    if (sanitized.referrer) {
      sanitized.referrer = this.sanitizeUrl(sanitized.referrer);
    }

    // Sanitize event action
    if (sanitized.eventAction) {
      sanitized.eventAction = this.sanitizeString(sanitized.eventAction);
    }

    return sanitized;
  }

  /**
   * Normalize event data
   */
  normalizeEvent(event: Partial<BehaviorEvent>): Partial<BehaviorEvent> {
    const normalized = { ...event };

    // Normalize event timestamp
    if (normalized.eventTimestamp && typeof normalized.eventTimestamp === 'string') {
      normalized.eventTimestamp = new Date(normalized.eventTimestamp);
    }

    // Normalize session ID
    if (normalized.sessionId && !this.isValidUuid(normalized.sessionId)) {
      normalized.sessionId = crypto.randomUUID();
    }

    // Normalize user ID
    if (normalized.userId && !this.isValidUuid(normalized.userId)) {
      throw new Error('Invalid user ID format');
    }

    // Normalize event type to lowercase
    if (normalized.eventType) {
      normalized.eventType = normalized.eventType.toLowerCase() as any;
    }

    // Normalize event category to lowercase
    if (normalized.eventCategory) {
      normalized.eventCategory = normalized.eventCategory.toLowerCase() as any;
    }

    return normalized;
  }

  private ensureRequiredFields(event: Partial<BehaviorEvent>): Partial<BehaviorEvent> {
    const enriched = { ...event };

    // Generate ID if not provided
    if (!enriched.id) {
      enriched.id = crypto.randomUUID();
    }

    // Generate session ID if not provided
    if (!enriched.sessionId) {
      enriched.sessionId = crypto.randomUUID();
    }

    // Set timestamp if not provided
    if (!enriched.eventTimestamp) {
      enriched.eventTimestamp = new Date();
    }

    // Set created timestamp
    if (!enriched.createdAt) {
      enriched.createdAt = new Date();
    }

    return enriched;
  }

  private validateBusinessRules(event: BehaviorEvent): void {
    // Check if event timestamp is not in the future
    if (event.eventTimestamp > new Date()) {
      throw new Error('Event timestamp cannot be in the future');
    }

    // Check if event timestamp is not too old (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (event.eventTimestamp < thirtyDaysAgo) {
      throw new Error('Event timestamp is too old');
    }

    // Validate search query length
    if (event.searchQuery && event.searchQuery.length > 1000) {
      throw new Error('Search query is too long');
    }

    // Validate performance metrics
    if (event.responseTimeMs && event.responseTimeMs < 0) {
      throw new Error('Response time cannot be negative');
    }

    if (event.searchDurationMs && event.searchDurationMs < 0) {
      throw new Error('Search duration cannot be negative');
    }

    if (event.interactionDurationMs && event.interactionDurationMs < 0) {
      throw new Error('Interaction duration cannot be negative');
    }

    // Validate sequence numbers
    if (event.sessionSequence && event.sessionSequence < 1) {
      throw new Error('Session sequence must be positive');
    }

    if (event.pageSequence && event.pageSequence < 1) {
      throw new Error('Page sequence must be positive');
    }
  }

  private sanitizeString(str: string): string {
    // Remove potentially harmful characters and limit length
    return str
      .replace(/[<>\"'&]/g, '') // Remove basic HTML/JS injection chars
      .replace(/javascript:/gi, '') // Remove javascript: protocols
      .replace(/data:/gi, '') // Remove data: protocols
      .substring(0, 1000) // Limit length
      .trim();
  }

  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      
      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return '';
      }

      return parsed.toString();
    } catch {
      return '';
    }
  }

  private isValidUuid(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}