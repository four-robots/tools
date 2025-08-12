/**
 * @mention Parsing and User Resolution Utilities
 * 
 * Comprehensive utilities for parsing @mentions from comment content,
 * resolving usernames to user IDs, and preparing mention notifications.
 * 
 * Features:
 * - Advanced @mention pattern detection
 * - User resolution with fuzzy matching
 * - Cross-workspace mention support
 * - Notification preparation and batching
 * - XSS protection and input sanitization
 */

import { DatabasePool } from './database-pool.js';
import { Logger } from './logger.js';
import { sanitizeInput } from './sql-security.js';
import { CommentMention } from '@shared/types/whiteboard.js';

// Secure @mention pattern with proper escaping to prevent regex injection
// This pattern safely matches @username, @user.name, @"user name" patterns
// Using character classes to prevent injection attacks
const MENTION_PATTERN = /@(?:(?:"([^"\\]{1,50})")|(?:([a-zA-Z0-9._-]{1,50})))/g;

// Maximum mentions per comment to prevent spam
const MAX_MENTIONS_PER_COMMENT = 10;

// Maximum mention text length
const MAX_MENTION_LENGTH = 50;

export interface ParsedMention {
  mentionText: string;
  username: string;
  startIndex: number;
  length: number;
}

export interface MentionResolutionResult {
  userId: string;
  userName: string;
  userEmail?: string;
  resolved: boolean;
  confidence: number; // 0-1 match confidence score
}

export interface ResolvedMention extends ParsedMention {
  resolution: MentionResolutionResult;
}

export interface MentionParsingResult {
  parsedMentions: ParsedMention[];
  resolvedMentions: ResolvedMention[];
  unresolvedMentions: ParsedMention[];
  errors: string[];
  warnings: string[];
}

export interface UserSearchCandidate {
  userId: string;
  userName: string;
  userEmail: string;
  displayName?: string;
  workspaceRole?: string;
  isActive: boolean;
  lastSeen?: Date;
}

export interface MentionNotificationData {
  userId: string;
  userName: string;
  userEmail?: string;
  mentionText: string;
  commentId: string;
  whiteboardId: string;
  whiteboardName: string;
  mentionContext: string; // Surrounding text for context
  triggeredBy: string; // User who created the comment
  triggeredByName: string;
}

/**
 * MentionParser - Core class for parsing and resolving @mentions
 */
export class MentionParser {
  private logger: Logger;

  constructor(
    private db: DatabasePool,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('MentionParser');
  }

  /**
   * Parse @mentions from comment content with comprehensive security validation
   */
  parseMentions(content: string): ParsedMention[] {
    if (!content || typeof content !== 'string') {
      return [];
    }

    // Input validation and length limit for DoS protection
    if (content.length > 50000) {
      this.logger.warn('Content too long for mention parsing', { length: content.length });
      return [];
    }

    const sanitizedContent = sanitizeInput(content);
    const mentions: ParsedMention[] = [];
    
    // Create new regex instance to prevent state issues
    const mentionRegex = new RegExp(MENTION_PATTERN.source, 'g');
    let match;
    let iterations = 0;
    const maxIterations = 1000; // Prevent infinite loops

    while ((match = mentionRegex.exec(sanitizedContent)) !== null && iterations < maxIterations) {
      iterations++;
      
      // Prevent infinite loop with zero-length matches
      if (match.index === mentionRegex.lastIndex) {
        mentionRegex.lastIndex++;
        continue;
      }

      // Extract username from quoted or unquoted format
      const username = match[1] || match[2];
      
      // Enhanced validation
      if (!username || 
          username.length > MAX_MENTION_LENGTH || 
          !this.isValidUsername(username)) {
        continue;
      }

      // Additional security validation
      if (!MentionParser.validateMentionText(match[0])) {
        this.logger.warn('Invalid mention text detected', { mention: match[0] });
        continue;
      }

      mentions.push({
        mentionText: sanitizeInput(match[0]),
        username: sanitizeInput(username.trim()),
        startIndex: match.index,
        length: match[0].length,
      });

      // Prevent mention spam with rate limiting
      if (mentions.length >= MAX_MENTIONS_PER_COMMENT) {
        this.logger.warn('Maximum mentions per comment exceeded', {
          content: content.substring(0, 100),
          mentionCount: mentions.length
        });
        break;
      }
    }

    if (iterations >= maxIterations) {
      this.logger.error('Mention parsing hit iteration limit - possible attack', {
        content: content.substring(0, 100),
        iterations
      });
    }

    return mentions;
  }

  /**
   * Resolve parsed mentions to user IDs
   */
  async resolveMentions(
    mentions: ParsedMention[],
    workspaceId: string,
    options: {
      includeCrossWorkspace?: boolean;
      excludeUserIds?: string[];
      fuzzyMatching?: boolean;
      activeUsersOnly?: boolean;
    } = {}
  ): Promise<MentionParsingResult> {
    const {
      includeCrossWorkspace = false,
      excludeUserIds = [],
      fuzzyMatching = true,
      activeUsersOnly = true
    } = options;

    const resolvedMentions: ResolvedMention[] = [];
    const unresolvedMentions: ParsedMention[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Get workspace users for resolution
      const userCandidates = await this.getWorkspaceUsers(workspaceId, {
        includeCrossWorkspace,
        activeUsersOnly,
        excludeUserIds
      });

      for (const mention of mentions) {
        try {
          const resolution = await this.resolveUserMention(
            mention.username,
            userCandidates,
            { fuzzyMatching }
          );

          if (resolution.resolved) {
            resolvedMentions.push({
              ...mention,
              resolution
            });
          } else {
            unresolvedMentions.push(mention);
            warnings.push(`Could not resolve mention: ${mention.mentionText}`);
          }
        } catch (error) {
          errors.push(`Failed to resolve mention ${mention.mentionText}: ${error instanceof Error ? error.message : String(error)}`);
          unresolvedMentions.push(mention);
        }
      }

      this.logger.debug('Mention resolution completed', {
        workspaceId,
        totalMentions: mentions.length,
        resolved: resolvedMentions.length,
        unresolved: unresolvedMentions.length,
        errors: errors.length
      });

      return {
        parsedMentions: mentions,
        resolvedMentions,
        unresolvedMentions,
        errors,
        warnings
      };

    } catch (error) {
      const errorMessage = `Failed to resolve mentions: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error('Mention resolution failed', { error, workspaceId });
      
      return {
        parsedMentions: mentions,
        resolvedMentions: [],
        unresolvedMentions: mentions,
        errors: [errorMessage],
        warnings: []
      };
    }
  }

  /**
   * Parse and resolve mentions in one operation
   */
  async parseAndResolveMentions(
    content: string,
    workspaceId: string,
    options?: {
      includeCrossWorkspace?: boolean;
      excludeUserIds?: string[];
      fuzzyMatching?: boolean;
      activeUsersOnly?: boolean;
    }
  ): Promise<MentionParsingResult> {
    const parsedMentions = this.parseMentions(content);
    
    if (parsedMentions.length === 0) {
      return {
        parsedMentions: [],
        resolvedMentions: [],
        unresolvedMentions: [],
        errors: [],
        warnings: []
      };
    }

    return this.resolveMentions(parsedMentions, workspaceId, options);
  }

  /**
   * Convert resolved mentions to CommentMention objects
   */
  createCommentMentions(resolvedMentions: ResolvedMention[]): CommentMention[] {
    return resolvedMentions.map(mention => ({
      userId: mention.resolution.userId,
      userName: mention.resolution.userName,
      userEmail: mention.resolution.userEmail,
      mentionText: mention.mentionText,
      startIndex: mention.startIndex,
      length: mention.length,
      resolved: mention.resolution.resolved,
      notified: false,
      notifiedAt: undefined,
    }));
  }

  /**
   * Prepare mention notifications for delivery
   */
  async prepareMentionNotifications(
    resolvedMentions: ResolvedMention[],
    commentId: string,
    whiteboardId: string,
    content: string,
    triggeredBy: string,
    triggeredByName: string
  ): Promise<MentionNotificationData[]> {
    if (resolvedMentions.length === 0) {
      return [];
    }

    try {
      // Get whiteboard name for context
      const whiteboardQuery = `
        SELECT name FROM whiteboards 
        WHERE id = $1 AND deleted_at IS NULL
      `;
      const whiteboardResult = await this.db.query(whiteboardQuery, [whiteboardId]);
      const whiteboardName = whiteboardResult.rows[0]?.name || 'Unknown Whiteboard';

      const notifications: MentionNotificationData[] = [];

      for (const mention of resolvedMentions) {
        // Create mention context (50 chars before and after)
        const contextStart = Math.max(0, mention.startIndex - 50);
        const contextEnd = Math.min(content.length, mention.startIndex + mention.length + 50);
        const mentionContext = content.substring(contextStart, contextEnd).trim();

        notifications.push({
          userId: mention.resolution.userId,
          userName: mention.resolution.userName,
          userEmail: mention.resolution.userEmail,
          mentionText: mention.mentionText,
          commentId,
          whiteboardId,
          whiteboardName,
          mentionContext,
          triggeredBy,
          triggeredByName,
        });
      }

      return notifications;

    } catch (error) {
      this.logger.error('Failed to prepare mention notifications', {
        error,
        commentId,
        whiteboardId,
        mentionCount: resolvedMentions.length
      });
      return [];
    }
  }

  /**
   * Get workspace users for mention resolution
   */
  private async getWorkspaceUsers(
    workspaceId: string,
    options: {
      includeCrossWorkspace?: boolean;
      activeUsersOnly?: boolean;
      excludeUserIds?: string[];
    }
  ): Promise<UserSearchCandidate[]> {
    const { includeCrossWorkspace = false, activeUsersOnly = true, excludeUserIds = [] } = options;

    // Input validation for workspace ID
    if (!workspaceId || typeof workspaceId !== 'string') {
      this.logger.warn('Invalid workspace ID for user lookup');
      return [];
    }

    // Limit excluded user IDs to prevent DoS
    const safeExcludeIds = excludeUserIds.slice(0, 100).map(id => sanitizeInput(id));

    const query = `
      SELECT DISTINCT
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        u.display_name,
        wm.role as workspace_role,
        u.is_active,
        u.last_seen_at
      FROM users u
      JOIN workspace_members wm ON u.id = wm.user_id
      WHERE wm.workspace_id = $1
        AND wm.status = 'active'
        AND ($2 = false OR u.is_active = true)
        AND ($3::text[] IS NULL OR u.id != ALL($3))
      ORDER BY u.name ASC
      LIMIT 1000
    `;

    const params = [
      sanitizeInput(workspaceId),
      activeUsersOnly,
      safeExcludeIds.length > 0 ? safeExcludeIds : null
    ];

    try {
      const result = await this.db.query(query, params);
      
      return result.rows.map(row => ({
        userId: sanitizeInput(row.user_id || ''),
        userName: sanitizeInput(row.user_name || ''),
        userEmail: sanitizeInput(row.user_email || ''),
        displayName: sanitizeInput(row.display_name || ''),
        workspaceRole: sanitizeInput(row.workspace_role || ''),
        isActive: Boolean(row.is_active),
        lastSeen: row.last_seen_at ? new Date(row.last_seen_at) : undefined,
      }));

    } catch (error) {
      this.logger.error('Failed to get workspace users for mentions', {
        error: error instanceof Error ? error.message : String(error),
        workspaceId: workspaceId.substring(0, 20), // Limit logged content
        optionsCount: Object.keys(options).length
      });
      return [];
    }
  }

  /**
   * Resolve a username to a user with fuzzy matching
   */
  private async resolveUserMention(
    username: string,
    candidates: UserSearchCandidate[],
    options: { fuzzyMatching?: boolean } = {}
  ): Promise<MentionResolutionResult> {
    const { fuzzyMatching = true } = options;
    
    const normalizedUsername = username.toLowerCase().trim();

    // Try exact matches first
    for (const candidate of candidates) {
      if (candidate.userName.toLowerCase() === normalizedUsername) {
        return {
          userId: candidate.userId,
          userName: candidate.userName,
          userEmail: candidate.userEmail,
          resolved: true,
          confidence: 1.0,
        };
      }
    }

    // Try email matches
    for (const candidate of candidates) {
      if (candidate.userEmail.toLowerCase() === normalizedUsername) {
        return {
          userId: candidate.userId,
          userName: candidate.userName,
          userEmail: candidate.userEmail,
          resolved: true,
          confidence: 0.95,
        };
      }
    }

    // Try display name matches
    for (const candidate of candidates) {
      if (candidate.displayName?.toLowerCase() === normalizedUsername) {
        return {
          userId: candidate.userId,
          userName: candidate.userName,
          userEmail: candidate.userEmail,
          resolved: true,
          confidence: 0.9,
        };
      }
    }

    if (fuzzyMatching) {
      // Try fuzzy matching with partial matches
      const fuzzyMatches = candidates
        .map(candidate => {
          const nameScore = this.calculateMatchScore(normalizedUsername, candidate.userName.toLowerCase());
          const emailScore = this.calculateMatchScore(normalizedUsername, candidate.userEmail.toLowerCase());
          const displayScore = candidate.displayName 
            ? this.calculateMatchScore(normalizedUsername, candidate.displayName.toLowerCase())
            : 0;
          
          const maxScore = Math.max(nameScore, emailScore, displayScore);
          
          return {
            candidate,
            confidence: maxScore,
          };
        })
        .filter(match => match.confidence > 0.7) // Minimum confidence threshold
        .sort((a, b) => b.confidence - a.confidence);

      if (fuzzyMatches.length > 0) {
        const bestMatch = fuzzyMatches[0];
        return {
          userId: bestMatch.candidate.userId,
          userName: bestMatch.candidate.userName,
          userEmail: bestMatch.candidate.userEmail,
          resolved: true,
          confidence: bestMatch.confidence,
        };
      }
    }

    // No match found
    return {
      userId: '',
      userName: '',
      userEmail: '',
      resolved: false,
      confidence: 0,
    };
  }

  /**
   * Calculate string similarity score for fuzzy matching
   */
  private calculateMatchScore(input: string, candidate: string): number {
    if (!input || !candidate) return 0;
    if (input === candidate) return 1;

    // Check if input is a substring of candidate
    if (candidate.includes(input)) {
      return 0.8 * (input.length / candidate.length);
    }

    // Check if candidate starts with input
    if (candidate.startsWith(input)) {
      return 0.85 * (input.length / candidate.length);
    }

    // Simple Levenshtein-based similarity
    return this.levenshteinSimilarity(input, candidate);
  }

  /**
   * Calculate Levenshtein similarity (0-1)
   */
  private levenshteinSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Validate username format for security
   */
  private isValidUsername(username: string): boolean {
    if (!username || typeof username !== 'string') return false;
    if (username.length < 1 || username.length > MAX_MENTION_LENGTH) return false;
    
    // Only allow safe characters for usernames
    const safeUsernamePattern = /^[a-zA-Z0-9._\-\s@"]+$/;
    if (!safeUsernamePattern.test(username)) {
      this.logger.warn('Invalid username characters detected', { username });
      return false;
    }
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /\.\./, // Directory traversal
      /\/\*/, // SQL comment start
      /\*\//, // SQL comment end
      /--/, // SQL comment
      /;/, // SQL statement terminator
      /<script/i, // XSS
      /javascript:/i, // XSS
    ];
    
    return !suspiciousPatterns.some(pattern => pattern.test(username));
  }

  /**
   * Enhanced mention text validation with comprehensive security checks
   */
  static validateMentionText(mentionText: string): boolean {
    if (!mentionText || typeof mentionText !== 'string') return false;
    if (mentionText.length > MAX_MENTION_LENGTH + 3) return false; // +3 for @" and "
    if (!mentionText.startsWith('@')) return false;
    
    // Check for malicious patterns with proper escaping
    const dangerousPatterns = [
      /<script[\s\S]*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /data:(?!image\/)[^;]*/gi,
      /<iframe[\s\S]*?<\/iframe>/gi,
      /<object[\s\S]*?<\/object>/gi,
      /<embed[\s\S]*?>/gi,
      /\.\.\//g, // Directory traversal
      /\/\*[\s\S]*?\*\//g, // SQL comments
      /--[^\r\n]*/g, // SQL line comments
      /;\s*(drop|delete|update|insert|create|alter)\s+/gi, // SQL injection
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(mentionText)) {
        return false;
      }
    }
    
    // Validate the extracted username part
    const usernameMatch = mentionText.match(/^@(?:(?:"([^"\\]{1,50})")|(?:([a-zA-Z0-9._-]{1,50})))$/);
    if (!usernameMatch) return false;
    
    const username = usernameMatch[1] || usernameMatch[2];
    return username && username.length > 0;
  }

  /**
   * Extract all unique user IDs from resolved mentions
   */
  static extractUserIds(mentions: CommentMention[]): string[] {
    return [...new Set(mentions.filter(m => m.resolved).map(m => m.userId))];
  }

  /**
   * Get mention text with context for notifications
   */
  static getMentionContext(content: string, mention: CommentMention, contextLength = 100): string {
    const start = Math.max(0, mention.startIndex - contextLength / 2);
    const end = Math.min(content.length, mention.startIndex + mention.length + contextLength / 2);
    
    let context = content.substring(start, end).trim();
    
    if (start > 0) context = '...' + context;
    if (end < content.length) context = context + '...';
    
    return context;
  }
}