import { createHash } from 'crypto';
import { BehaviorEvent } from '../../../shared/types/user-behavior.js';
import { Logger } from '../../../shared/utils/logger.js';

export class DataAnonymizer {
  private logger: Logger;
  private saltKey: string;

  constructor(saltKey: string = 'default-anonymization-salt') {
    this.logger = new Logger('DataAnonymizer');
    this.saltKey = saltKey;
  }

  /**
   * Fully anonymize a behavior event
   */
  anonymizeEvent(event: BehaviorEvent): BehaviorEvent {
    const anonymized = { ...event };

    // Hash the user ID to maintain consistency while anonymizing
    anonymized.userId = this.hashValue(event.userId);

    // Remove or anonymize PII
    anonymized.ipAddress = this.anonymizeIpAddress(event.ipAddress);
    anonymized.userAgent = this.anonymizeUserAgent(event.userAgent);
    anonymized.searchQuery = this.anonymizeSearchQuery(event.searchQuery);
    
    // Remove potentially identifying metadata
    if (anonymized.metadata) {
      anonymized.metadata = this.anonymizeMetadata(anonymized.metadata);
    }

    // Remove device-specific information that could be identifying
    if (anonymized.deviceInfo) {
      anonymized.deviceInfo = this.anonymizeDeviceInfo(anonymized.deviceInfo);
    }

    // Anonymize page context to remove specific URLs
    if (anonymized.pageContext) {
      anonymized.pageContext = this.anonymizePageContext(anonymized.pageContext);
    }

    // Anonymize search context
    if (anonymized.searchContext) {
      anonymized.searchContext = this.anonymizeSearchContext(anonymized.searchContext);
    }

    // Anonymize result data
    if (anonymized.resultData) {
      anonymized.resultData = this.anonymizeResultData(anonymized.resultData);
    }

    return anonymized;
  }

  /**
   * Partially anonymize a behavior event (keep some data for analytics)
   */
  partiallyAnonymizeEvent(event: BehaviorEvent): BehaviorEvent {
    const partiallyAnonymized = { ...event };

    // Always anonymize IP address
    partiallyAnonymized.ipAddress = this.anonymizeIpAddress(event.ipAddress);

    // Generalize user agent instead of full anonymization
    if (partiallyAnonymized.userAgent) {
      partiallyAnonymized.userAgent = this.generalizeUserAgent(partiallyAnonymized.userAgent);
    }

    // Keep search query but remove potential PII
    if (partiallyAnonymized.searchQuery) {
      partiallyAnonymized.searchQuery = this.sanitizeSearchQuery(partiallyAnonymized.searchQuery);
    }

    // Remove specific identifying metadata but keep analytics data
    if (partiallyAnonymized.metadata) {
      partiallyAnonymized.metadata = this.partiallyAnonymizeMetadata(partiallyAnonymized.metadata);
    }

    // Generalize device info
    if (partiallyAnonymized.deviceInfo) {
      partiallyAnonymized.deviceInfo = this.generalizeDeviceInfo(partiallyAnonymized.deviceInfo);
    }

    return partiallyAnonymized;
  }

  /**
   * Anonymize IP address (keep general location info)
   */
  anonymizeIpAddress(ipAddress?: string): string | undefined {
    if (!ipAddress) return undefined;

    try {
      // For IPv4, zero out the last octet
      if (ipAddress.includes('.')) {
        const parts = ipAddress.split('.');
        if (parts.length === 4) {
          return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
        }
      }

      // For IPv6, zero out the last 80 bits
      if (ipAddress.includes(':')) {
        const parts = ipAddress.split(':');
        if (parts.length >= 4) {
          return `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}::`;
        }
      }

      // If IP format is unrecognized, return anonymized placeholder
      return '0.0.0.0';

    } catch (error) {
      this.logger.warn('Failed to anonymize IP address', { error, ipAddress });
      return '0.0.0.0';
    }
  }

  /**
   * Anonymize user agent string
   */
  anonymizeUserAgent(userAgent?: string): string | undefined {
    if (!userAgent) return undefined;

    // Replace with generic user agent that preserves browser type but removes version details
    const browserMap: Record<string, string> = {
      'Chrome': 'Mozilla/5.0 (Generic) AppleWebKit/537.36 Chrome/Generic',
      'Firefox': 'Mozilla/5.0 (Generic) Gecko/Generic Firefox/Generic',
      'Safari': 'Mozilla/5.0 (Generic) AppleWebKit/Generic Safari/Generic',
      'Edge': 'Mozilla/5.0 (Generic) AppleWebKit/537.36 Chrome/Generic Edg/Generic',
    };

    for (const [browser, genericAgent] of Object.entries(browserMap)) {
      if (userAgent.includes(browser)) {
        return genericAgent;
      }
    }

    return 'Mozilla/5.0 (Generic) Generic/Generic';
  }

  /**
   * Generalize user agent (partial anonymization)
   */
  generalizeUserAgent(userAgent: string): string {
    // Keep browser and OS info but remove specific versions and identifying details
    const browserPattern = /(Chrome|Firefox|Safari|Edge)\/[\d.]+/gi;
    const osPattern = /(Windows NT|Mac OS X|Linux|Android|iOS) [\d._]+/gi;

    let generalized = userAgent
      .replace(browserPattern, (match) => {
        const browser = match.split('/')[0];
        return `${browser}/Generic`;
      })
      .replace(osPattern, (match) => {
        const os = match.split(' ')[0];
        return `${os} Generic`;
      });

    // Remove build numbers and specific device info
    generalized = generalized.replace(/\([^)]*Build[^)]*\)/gi, '(Generic Build)');
    
    return generalized;
  }

  /**
   * Anonymize search query
   */
  anonymizeSearchQuery(searchQuery?: string): string | undefined {
    if (!searchQuery) return undefined;

    // Replace with query pattern rather than actual content
    const words = searchQuery.split(' ').length;
    const avgLength = Math.round(searchQuery.length / words);
    
    return `[${words} words, avg ${avgLength} chars]`;
  }

  /**
   * Sanitize search query for partial anonymization
   */
  sanitizeSearchQuery(searchQuery: string): string {
    // Remove potential PII patterns but keep the query for analytics
    return searchQuery
      // Remove email addresses
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
      // Remove phone numbers
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]')
      // Remove social security numbers
      .replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, '[SSN]')
      // Remove credit card numbers
      .replace(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, '[CREDITCARD]')
      // Remove IP addresses
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
      .trim();
  }

  /**
   * Anonymize metadata
   */
  anonymizeMetadata(metadata: Record<string, any>): Record<string, any> {
    const anonymized: Record<string, any> = {};

    // Keep only non-identifying metadata types
    const allowedKeys = [
      'eventSource', 'version', 'platform', 'feature',
      'category', 'action', 'label', 'value'
    ];

    for (const [key, value] of Object.entries(metadata)) {
      if (allowedKeys.includes(key)) {
        anonymized[key] = value;
      }
    }

    return anonymized;
  }

  /**
   * Partially anonymize metadata
   */
  partiallyAnonymizeMetadata(metadata: Record<string, any>): Record<string, any> {
    const partiallyAnonymized = { ...metadata };

    // Remove potentially identifying keys
    const sensitiveKeys = [
      'userId', 'email', 'phone', 'address', 'name',
      'sessionToken', 'authToken', 'apiKey'
    ];

    for (const key of sensitiveKeys) {
      delete partiallyAnonymized[key];
    }

    return partiallyAnonymized;
  }

  /**
   * Anonymize device information
   */
  anonymizeDeviceInfo(deviceInfo: any): any {
    return {
      isMobile: deviceInfo.isMobile,
      isTablet: deviceInfo.isTablet,
      // Remove specific device models, screen sizes, etc.
      browser: 'Generic',
      os: 'Generic',
    };
  }

  /**
   * Generalize device information
   */
  generalizeDeviceInfo(deviceInfo: any): any {
    const generalized = { ...deviceInfo };

    // Keep general categories but remove specific versions
    if (generalized.browserVersion) {
      generalized.browserVersion = 'Generic';
    }
    if (generalized.osVersion) {
      generalized.osVersion = 'Generic';
    }

    // Generalize screen dimensions to common categories
    if (generalized.screenWidth && generalized.screenHeight) {
      const screenCategory = this.categorizeScreen(
        generalized.screenWidth,
        generalized.screenHeight
      );
      generalized.screenCategory = screenCategory;
      delete generalized.screenWidth;
      delete generalized.screenHeight;
    }

    return generalized;
  }

  /**
   * Anonymize page context
   */
  anonymizePageContext(pageContext: any): any {
    return {
      // Keep general navigation patterns but remove specific URLs
      pageType: this.categorizePageUrl(pageContext.currentPage),
      hasNavigation: !!pageContext.navigationPath,
      navigationDepth: pageContext.navigationPath?.length || 0,
      timeOnPage: pageContext.timeOnPage,
      scrollDepth: pageContext.scrollDepth,
      interactions: pageContext.interactions,
    };
  }

  /**
   * Anonymize search context
   */
  anonymizeSearchContext(searchContext: any): any {
    return {
      hasQuery: !!searchContext.query,
      queryLength: searchContext.query?.length || 0,
      filtersApplied: Object.keys(searchContext.filters || {}).length,
      facetsUsed: searchContext.facets?.length || 0,
      sortBy: searchContext.sortBy,
      sortOrder: searchContext.sortOrder,
      page: searchContext.page,
      pageSize: searchContext.pageSize,
    };
  }

  /**
   * Anonymize result data
   */
  anonymizeResultData(resultData: any): any {
    return {
      hasResult: !!resultData.resultId,
      resultType: resultData.resultType,
      clickPosition: resultData.clickPosition,
      interactionType: resultData.interactionType,
      dwellTime: resultData.dwellTime,
      savedToFavorites: resultData.savedToFavorites,
      shared: resultData.shared,
    };
  }

  /**
   * Hash a value consistently
   */
  private hashValue(value: string): string {
    return createHash('sha256')
      .update(value + this.saltKey)
      .digest('hex')
      .substring(0, 16); // Use first 16 chars for readability
  }

  /**
   * Categorize screen dimensions
   */
  private categorizeScreen(width: number, height: number): string {
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    if (width < 1920) return 'desktop';
    return 'large-desktop';
  }

  /**
   * Categorize page URL
   */
  private categorizePageUrl(url?: string): string {
    if (!url) return 'unknown';

    if (url.includes('/search')) return 'search';
    if (url.includes('/profile')) return 'profile';
    if (url.includes('/settings')) return 'settings';
    if (url.includes('/dashboard')) return 'dashboard';
    if (url.includes('/api/')) return 'api';
    
    return 'content';
  }
}