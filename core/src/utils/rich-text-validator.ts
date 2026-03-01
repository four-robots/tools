/**
 * Rich Text Content Validation and XSS Protection Utilities
 * 
 * Comprehensive utilities for validating rich text comment content,
 * sanitizing user input, and preventing XSS attacks while preserving
 * allowed formatting and @mention functionality.
 * 
 * Features:
 * - HTML sanitization with allowed tags whitelist
 * - Rich text format validation
 * - @mention preservation during sanitization
 * - Content length and structure validation
 * - XSS prevention with multiple security layers
 * - Markdown conversion and validation
 */

import { sanitizeInput } from './sql-security.js';
import { RichTextFormat, CommentContentType } from '@shared/types/whiteboard.js';
import { Logger } from './logger.js';

// Maximum content lengths
const MAX_CONTENT_LENGTH = 10000;
const MAX_LINK_LENGTH = 2048;
const MAX_FORMATTING_RANGES = 100;

// Allowed HTML tags for rich text (very restrictive)
const ALLOWED_HTML_TAGS = ['b', 'strong', 'i', 'em', 'u', 'strike', 'code', 'a'];
const ALLOWED_HTML_ATTRIBUTES = {
  'a': ['href', 'title'],
};

// Comprehensive dangerous patterns with proper escaping to prevent bypass
const DANGEROUS_PATTERNS = [
  // Script injection (all variants)
  /<script[\s\S]*?<\/script>/gi,
  /<script[^>]*>/gi,
  /javascript:/gi,
  /vbscript:/gi,
  /livescript:/gi,
  /mocha:/gi,
  /on\w+\s*=/gi,
  /&\s*{[^}]*}/gi, // CSS expressions
  
  // Data URIs (except safe image types)
  /data:(?!image\/(png|jpg|jpeg|gif|svg\+xml|webp|bmp))[^;\s]*/gi,
  
  // Dangerous tags and elements
  /<(meta|style|link|object|embed|iframe|frame|frameset|form|input|textarea|select|option|button|applet|base|bgsound|blink|body|html|head|title)[\s\S]*?>/gi,
  /<\/(meta|style|link|object|embed|iframe|frame|frameset|form|input|textarea|select|option|button|applet|base|bgsound|blink|body|html|head|title)>/gi,
  
  // Comments and CDATA
  /<!--[\s\S]*?-->/g,
  /<![\s\S]*?>/g,
  /<\?[\s\S]*?\?>/g,
  
  // CSS injection
  /expression\s*\(/gi,
  /behavior\s*:/gi,
  /-moz-binding/gi,
  
  // Protocol handlers
  /file:/gi,
  /ftp:/gi,
  /mailto:.*<script/gi,
  
  // XML entities that could be dangerous
  /&\w+;.*<script/gi,
  
  // Encoded script tags
  /%3cscript/gi,
  /%3c%2fscript%3e/gi,
];

// Safe URL protocols - very restrictive list for security
const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:'];

export interface RichTextValidationResult {
  isValid: boolean;
  sanitizedContent: string;
  sanitizedFormat?: RichTextFormat;
  errors: string[];
  warnings: string[];
  metadata: {
    originalLength: number;
    sanitizedLength: number;
    removedElements: string[];
    modifiedRanges: number;
  };
}

export interface ContentSanitizationOptions {
  preserveMentions: boolean;
  allowLinks: boolean;
  allowFormatting: boolean;
  maxLength?: number;
  stripHtml?: boolean;
}

/**
 * RichTextValidator - Core class for validating and sanitizing rich text content
 */
export class RichTextValidator {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('RichTextValidator');
  }

  /**
   * Validate and sanitize rich text comment content
   */
  validateRichText(
    content: string,
    contentType: CommentContentType,
    format?: RichTextFormat,
    options: ContentSanitizationOptions = {
      preserveMentions: true,
      allowLinks: true,
      allowFormatting: true,
      stripHtml: false,
    }
  ): RichTextValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const removedElements: string[] = [];
    let modifiedRanges = 0;

    try {
      // Validate input parameters
      if (!content || typeof content !== 'string') {
        return {
          isValid: false,
          sanitizedContent: '',
          errors: ['Content is required and must be a string'],
          warnings: [],
          metadata: {
            originalLength: 0,
            sanitizedLength: 0,
            removedElements: [],
            modifiedRanges: 0,
          },
        };
      }

      const originalLength = content.length;
      const maxLength = options.maxLength || MAX_CONTENT_LENGTH;

      // Check content length
      if (originalLength > maxLength) {
        errors.push(`Content exceeds maximum length of ${maxLength} characters`);
        return {
          isValid: false,
          sanitizedContent: content.substring(0, maxLength),
          errors,
          warnings,
          metadata: {
            originalLength,
            sanitizedLength: maxLength,
            removedElements: [],
            modifiedRanges: 0,
          },
        };
      }

      // Basic SQL injection protection
      let sanitizedContent = sanitizeInput(content);

      // Content-type specific processing
      switch (contentType) {
        case 'rich_text':
          ({ content: sanitizedContent, removedElements, modifiedRanges } = 
            this.sanitizeRichTextContent(sanitizedContent, options));
          break;
        case 'markdown':
          ({ content: sanitizedContent, removedElements, modifiedRanges } = 
            this.sanitizeMarkdownContent(sanitizedContent, options));
          break;
        case 'text':
        default:
          ({ content: sanitizedContent, removedElements, modifiedRanges } = 
            this.sanitizePlainTextContent(sanitizedContent, options));
          break;
      }

      // Validate and sanitize rich text formatting
      let sanitizedFormat: RichTextFormat | undefined;
      if (format && options.allowFormatting) {
        const formatResult = this.validateRichTextFormat(format, sanitizedContent);
        sanitizedFormat = formatResult.sanitizedFormat;
        errors.push(...formatResult.errors);
        warnings.push(...formatResult.warnings);
        modifiedRanges += formatResult.modifiedRanges;
      }

      // Final validation
      const finalLength = sanitizedContent.length;
      const isValid = errors.length === 0 && finalLength > 0;

      // Add warnings for removed content
      if (removedElements.length > 0) {
        warnings.push(`Removed ${removedElements.length} potentially unsafe elements: ${removedElements.join(', ')}`);
      }

      if (modifiedRanges > 0) {
        warnings.push(`Modified ${modifiedRanges} formatting ranges for safety`);
      }

      return {
        isValid,
        sanitizedContent,
        sanitizedFormat,
        errors,
        warnings,
        metadata: {
          originalLength,
          sanitizedLength: finalLength,
          removedElements,
          modifiedRanges,
        },
      };

    } catch (error) {
      this.logger.error('Rich text validation failed', { error, contentType });
      return {
        isValid: false,
        sanitizedContent: '',
        errors: [`Validation failed: ${error instanceof Error ? error.message : String(error)}`],
        warnings: [],
        metadata: {
          originalLength: content?.length || 0,
          sanitizedLength: 0,
          removedElements: [],
          modifiedRanges: 0,
        },
      };
    }
  }

  /**
   * Sanitize rich text HTML content
   */
  private sanitizeRichTextContent(
    content: string,
    options: ContentSanitizationOptions
  ): { content: string; removedElements: string[]; modifiedRanges: number } {
    let sanitized = content;
    const removedElements: string[] = [];
    let modifiedRanges = 0;

    // Remove dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      const matches = sanitized.match(pattern);
      if (matches) {
        removedElements.push(...matches);
        sanitized = sanitized.replace(pattern, '');
      }
    }

    if (options.stripHtml) {
      // Strip all HTML tags
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    } else {
      // Allow only safe HTML tags
      sanitized = this.sanitizeHtmlTags(sanitized, removedElements);
    }

    // Validate and sanitize URLs
    if (options.allowLinks) {
      sanitized = this.sanitizeUrls(sanitized, removedElements);
    } else {
      // Remove all links
      sanitized = sanitized.replace(/<a[^>]*>([^<]*)<\/a>/gi, '$1');
    }

    // Preserve @mentions if requested
    if (options.preserveMentions) {
      sanitized = this.preserveMentions(sanitized);
    }

    return { content: sanitized.trim(), removedElements, modifiedRanges };
  }

  /**
   * Sanitize markdown content
   */
  private sanitizeMarkdownContent(
    content: string,
    options: ContentSanitizationOptions
  ): { content: string; removedElements: string[]; modifiedRanges: number } {
    let sanitized = content;
    const removedElements: string[] = [];
    let modifiedRanges = 0;

    // Remove dangerous markdown patterns
    const dangerousMarkdownPatterns = [
      // Inline HTML
      /<script[\s\S]*?<\/script>/gi,
      /<iframe[\s\S]*?<\/iframe>/gi,
      /<object[\s\S]*?<\/object>/gi,
      /javascript:/gi,
    ];

    for (const pattern of dangerousMarkdownPatterns) {
      const matches = sanitized.match(pattern);
      if (matches) {
        removedElements.push(...matches);
        sanitized = sanitized.replace(pattern, '');
        modifiedRanges++;
      }
    }

    // Sanitize markdown links
    if (options.allowLinks) {
      sanitized = this.sanitizeMarkdownLinks(sanitized, removedElements);
    } else {
      // Convert links to plain text
      sanitized = sanitized.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    }

    return { content: sanitized.trim(), removedElements, modifiedRanges };
  }

  /**
   * Sanitize plain text content
   */
  private sanitizePlainTextContent(
    content: string,
    options: ContentSanitizationOptions
  ): { content: string; removedElements: string[]; modifiedRanges: number } {
    let sanitized = content;
    const removedElements: string[] = [];
    
    // Remove any HTML tags from plain text
    const htmlMatches = sanitized.match(/<[^>]*>/g);
    if (htmlMatches) {
      removedElements.push(...htmlMatches);
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    }

    // Preserve @mentions
    if (options.preserveMentions) {
      sanitized = this.preserveMentions(sanitized);
    }

    return { content: sanitized.trim(), removedElements, modifiedRanges: 0 };
  }

  /**
   * Sanitize HTML tags with comprehensive security checks
   */
  private sanitizeHtmlTags(content: string, removedElements: string[]): string {
    let sanitized = content;

    // First pass: Remove dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      const matches = sanitized.match(pattern);
      if (matches) {
        removedElements.push(...matches);
        sanitized = sanitized.replace(pattern, '');
      }
    }

    // Second pass: Process remaining tags with strict validation
    const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
    
    sanitized = sanitized.replace(tagPattern, (match, tagName) => {
      const lowerTagName = tagName.toLowerCase();
      
      // Additional security check for tag name
      if (!this.isValidTagName(lowerTagName)) {
        removedElements.push(match);
        return '';
      }
      
      if (ALLOWED_HTML_TAGS.includes(lowerTagName)) {
        // Sanitize attributes for allowed tags
        return this.sanitizeTagAttributes(match, lowerTagName);
      } else {
        removedElements.push(match);
        return '';
      }
    });

    // Third pass: Final security validation
    sanitized = this.performFinalSecurityCheck(sanitized, removedElements);

    return sanitized;
  }

  /**
   * Sanitize tag attributes
   */
  private sanitizeTagAttributes(tag: string, tagName: string): string {
    const allowedAttrs = ALLOWED_HTML_ATTRIBUTES[tagName] || [];
    
    if (allowedAttrs.length === 0) {
      // Return simple tag without attributes
      return tag.replace(/<([^>\s]+)[^>]*>/, '<$1>');
    }

    // Extract and validate attributes
    const attrPattern = /(\w+)\s*=\s*["']([^"']*)["']/g;
    const validAttrs: string[] = [];
    let match;

    while ((match = attrPattern.exec(tag)) !== null) {
      const [, attrName, attrValue] = match;
      
      if (allowedAttrs.includes(attrName.toLowerCase())) {
        if (attrName.toLowerCase() === 'href') {
          const sanitizedUrl = this.sanitizeUrl(attrValue);
          if (sanitizedUrl) {
            validAttrs.push(`${attrName}="${sanitizedUrl}"`);
          }
        } else {
          validAttrs.push(`${attrName}="${sanitizeInput(attrValue)}"`);
        }
      }
    }

    // Reconstruct tag with valid attributes
    const isClosingTag = tag.startsWith('</');
    if (isClosingTag) {
      return tag; // Closing tags don't need attribute sanitization
    }

    const isSelfClosing = tag.endsWith('/>');
    const tagEnd = isSelfClosing ? '/>' : '>';
    
    return validAttrs.length > 0 
      ? `<${tagName} ${validAttrs.join(' ')}${tagEnd}`
      : `<${tagName}${tagEnd}`;
  }

  /**
   * Sanitize URLs in content
   */
  private sanitizeUrls(content: string, removedElements: string[]): string {
    // Sanitize href attributes in anchor tags
    return content.replace(/(<a[^>]*href\s*=\s*["'])([^"']*)(["'][^>]*>)/gi, (match, before, url, after) => {
      const sanitizedUrl = this.sanitizeUrl(url);
      if (sanitizedUrl) {
        return `${before}${sanitizedUrl}${after}`;
      } else {
        removedElements.push(`unsafe URL: ${url}`);
        return before + '#' + after; // Replace with safe placeholder
      }
    });
  }

  /**
   * Sanitize markdown links
   */
  private sanitizeMarkdownLinks(content: string, removedElements: string[]): string {
    return content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
      const sanitizedUrl = this.sanitizeUrl(url);
      if (sanitizedUrl) {
        return `[${sanitizeInput(text)}](${sanitizedUrl})`;
      } else {
        removedElements.push(`unsafe URL: ${url}`);
        return sanitizeInput(text); // Just return the link text
      }
    });
  }

  /**
   * Enhanced URL sanitization with comprehensive security validation
   */
  private sanitizeUrl(url: string): string | null {
    if (!url || typeof url !== 'string') return null;
    if (url.length > MAX_LINK_LENGTH) return null;

    try {
      // Decode and normalize URL for proper validation
      let normalizedUrl = decodeURIComponent(url).toLowerCase().trim();
      
      // Remove null bytes and control characters
      normalizedUrl = normalizedUrl.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
      
      // Check for dangerous protocols (case-insensitive)
      const dangerousProtocols = [
        'javascript:', 'vbscript:', 'livescript:', 'mocha:',
        'file:', 'ftp:', 'gopher:', 'tel:',
        'sms:', 'callto:', 'wtai:', 'wyciwyg:'
      ];
      
      for (const protocol of dangerousProtocols) {
        if (normalizedUrl.startsWith(protocol)) {
          return null;
        }
      }
      
      // Enhanced data URI validation
      if (normalizedUrl.startsWith('data:')) {
        // Only allow specific safe image types
        const safeDataPattern = /^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml);base64,[a-za-z0-9+\/=]+$/i;
        if (!safeDataPattern.test(normalizedUrl)) {
          return null;
        }
      }

      // Validate protocol if present
      const protocolMatch = normalizedUrl.match(/^([a-za-z][a-za-z0-9+.-]*):/);
      if (protocolMatch) {
        const protocol = protocolMatch[1] + ':';
        if (!SAFE_PROTOCOLS.includes(protocol)) {
          return null;
        }
      }

      // Check for encoded dangerous content
      const encodedDangerousPatterns = [
        /%3cscript/i, // <script
        /%22javascript:/i, // "javascript:
        /%27javascript:/i, // 'javascript:
        /&lt;script/i, // &lt;script
        /\\u003cscript/i, // Unicode encoded <script
      ];
      
      for (const pattern of encodedDangerousPatterns) {
        if (pattern.test(normalizedUrl)) {
          return null;
        }
      }

      // Validate URL structure for HTTP(S) URLs
      if (normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://')) {
        try {
          const urlObj = new URL(url);
          
          // Additional checks on the parsed URL
          if (urlObj.hostname.includes('..') || 
              urlObj.hostname.startsWith('.') || 
              urlObj.hostname.endsWith('.') ||
              urlObj.hostname.length > 253) {
            return null;
          }
          
          // Block suspicious query parameters
          if (urlObj.search.includes('<script') || 
              urlObj.search.includes('javascript:') ||
              urlObj.hash.includes('<script')) {
            return null;
          }
          
        } catch {
          return null;
        }
      }

      // Final sanitization
      return sanitizeInput(url);
      
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate HTML tag name for security
   */
  private isValidTagName(tagName: string): boolean {
    // Only allow alphanumeric characters and hyphens
    return /^[a-z][a-z0-9-]*$/i.test(tagName) && tagName.length <= 20;
  }

  /**
   * Perform final security check on sanitized content
   */
  private performFinalSecurityCheck(content: string, removedElements: string[]): string {
    let sanitized = content;
    
    // Check for any remaining dangerous patterns that might have been missed
    const finalDangerousPatterns = [
      /\bjavascript\s*:/gi,
      /\bvbscript\s*:/gi,
      /\bon\w+\s*=/gi,
      /<script/gi,
      /expression\s*\(/gi,
    ];
    
    for (const pattern of finalDangerousPatterns) {
      const matches = sanitized.match(pattern);
      if (matches) {
        removedElements.push(...matches);
        sanitized = sanitized.replace(pattern, '');
      }
    }
    
    return sanitized;
  }

  /**
   * Preserve @mentions during sanitization with enhanced security
   */
  private preserveMentions(content: string): string {
    // @mentions are already handled by the mention parser
    // This ensures they're not corrupted during HTML sanitization
    return content.replace(/@([a-zA-Z0-9._-]{1,50}|"[^"\\]{1,50}")/g, (match) => {
      // Additional validation for mention content
      if (match.includes('<') || match.includes('>') || match.includes('&')) {
        return ''; // Remove potentially dangerous mentions
      }
      return sanitizeInput(match);
    });
  }

  /**
   * Validate rich text formatting structure
   */
  private validateRichTextFormat(
    format: RichTextFormat,
    content: string
  ): { 
    sanitizedFormat: RichTextFormat; 
    errors: string[]; 
    warnings: string[]; 
    modifiedRanges: number; 
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    let modifiedRanges = 0;

    const contentLength = content.length;
    const sanitizedFormat: RichTextFormat = {
      bold: [],
      italic: [],
      underline: [],
      strikethrough: [],
      code: [],
      links: [],
    };

    // Validate each formatting type
    const formatTypes: (keyof RichTextFormat)[] = ['bold', 'italic', 'underline', 'strikethrough', 'code', 'links'];
    
    for (const formatType of formatTypes) {
      const ranges = format[formatType] || [];
      
      if (ranges.length > MAX_FORMATTING_RANGES) {
        errors.push(`Too many ${formatType} formatting ranges (max ${MAX_FORMATTING_RANGES})`);
        continue;
      }

      for (const range of ranges) {
        if (formatType === 'links') {
          // Special handling for links
          const linkRange = range as any;
          if (!this.isValidRange(linkRange, contentLength)) {
            warnings.push(`Invalid ${formatType} range: ${JSON.stringify(range)}`);
            modifiedRanges++;
            continue;
          }
          
          const sanitizedUrl = this.sanitizeUrl(linkRange.url);
          if (sanitizedUrl) {
            sanitizedFormat.links.push({
              start: linkRange.start,
              end: linkRange.end,
              url: sanitizedUrl,
              title: linkRange.title ? sanitizeInput(linkRange.title) : undefined,
            });
          } else {
            warnings.push(`Removed unsafe link: ${linkRange.url}`);
            modifiedRanges++;
          }
        } else {
          // Standard range validation
          if (!this.isValidRange(range, contentLength)) {
            warnings.push(`Invalid ${formatType} range: ${JSON.stringify(range)}`);
            modifiedRanges++;
            continue;
          }
          
          sanitizedFormat[formatType].push(range);
        }
      }
    }

    return { sanitizedFormat, errors, warnings, modifiedRanges };
  }

  /**
   * Validate formatting range
   */
  private isValidRange(range: any, contentLength: number): boolean {
    return (
      range &&
      typeof range.start === 'number' &&
      typeof range.end === 'number' &&
      range.start >= 0 &&
      range.end >= range.start &&
      range.end <= contentLength
    );
  }

  /**
   * Static method to quickly sanitize plain text
   */
  static sanitizePlainText(content: string, maxLength = MAX_CONTENT_LENGTH): string {
    if (!content || typeof content !== 'string') return '';
    
    let sanitized = sanitizeInput(content);
    
    // Remove HTML tags
    sanitized = sanitized.replace(/<[^>]*>/g, '');
    
    // Truncate if too long
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }
    
    return sanitized.trim();
  }

  /**
   * Static method to validate content type
   */
  static isValidContentType(contentType: string): contentType is CommentContentType {
    return ['text', 'markdown', 'rich_text'].includes(contentType);
  }

  /**
   * Static method to estimate content complexity
   */
  static estimateContentComplexity(content: string, format?: RichTextFormat): number {
    let complexity = content.length / 1000; // Base complexity from length
    
    if (format) {
      const totalRanges = Object.values(format).reduce((sum, ranges) => sum + ranges.length, 0);
      complexity += totalRanges * 0.1; // Add complexity for formatting
    }
    
    // Add complexity for HTML tags
    const htmlTags = content.match(/<[^>]*>/g);
    if (htmlTags) {
      complexity += htmlTags.length * 0.05;
    }
    
    return Math.min(complexity, 10); // Cap at 10
  }
}