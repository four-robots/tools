/**
 * Whiteboard Presence Service
 * 
 * Manages user presence, avatars, activity awareness, and status tracking for collaborative whiteboards.
 * Integrates with existing cursor tracking and extends it with comprehensive user presence features.
 */

import { Logger } from '../../utils/logger.js';
import { validateWhiteboardId, validateCustomStatus, validateActivityInfo } from '../../utils/input-validation.js';
import { getCursorService, WhiteboardCursorService } from './whiteboard-cursor-service.js';
import {
  WhiteboardPresenceData,
  LiveCursorState,
} from '@shared/types/whiteboard.js';
import {
  PresenceStatus,
  UserPresence,
} from '@shared/types/collaboration.js';

export interface UserAvatarInfo {
  userId: string;
  userName: string;
  userEmail?: string;
  avatar?: string; // URL or data URI
  initials: string; // Fallback when no avatar
  color: string; // Consistent color for this user
  isOnline: boolean;
}

export interface PresenceActivityInfo {
  type: 'drawing' | 'typing' | 'selecting' | 'commenting' | 'idle';
  elementId?: string;
  description?: string;
  timestamp: number;
}

export interface UserPresenceState extends UserAvatarInfo {
  whiteboardId: string;
  sessionId: string;
  status: PresenceStatus;
  lastActivity: PresenceActivityInfo;
  lastSeen: number;
  joinedAt: number;
  cursorState?: LiveCursorState;
  customStatus?: string;
  isActive: boolean;
}

export interface PresenceConfiguration {
  // Status management
  idleTimeoutMs: number; // Time before marking as idle (default: 5 minutes)
  awayTimeoutMs: number; // Time before marking as away (default: 15 minutes)
  offlineTimeoutMs: number; // Time before marking as offline (default: 30 minutes)
  
  // Activity awareness
  enableActivityAwareness: boolean;
  activityHistoryLimit: number; // Number of activities to keep
  
  // Avatar settings
  enableAvatars: boolean;
  avatarCacheTimeMs: number; // How long to cache avatar data
  fallbackToInitials: boolean;
  
  // Real-time updates - adaptive throttling
  basePresenceUpdateThrottleMs: number; // Base throttle for presence updates
  adaptiveThrottling: {
    enabled: boolean;
    smallGroupThreshold: number; // Users below this use basePresenceUpdateThrottleMs
    mediumGroupThreshold: number; // Users below this use mediumGroupThrottleMs
    mediumGroupThrottleMs: number; // Throttle for medium groups
    largeGroupThrottleMs: number; // Throttle for large groups
  };
  heartbeatIntervalMs: number; // Heartbeat frequency
  
  // Performance and memory management
  aggressiveCleanupEnabled: boolean;
  cleanupIntervalMs: number; // How often to run cleanup (reduced for better performance)
  maxStaleDataMultiplier: number; // Multiplier for determining stale data (reduced for aggressive cleanup)
  incrementalCleanupBatchSize: number; // Process this many items per cleanup cycle
}

interface PresenceSessionData {
  sessionId: string;
  whiteboardId: string;
  userId: string;
  connectedAt: number;
  lastHeartbeat: number;
  connectionIds: Set<string>; // Multiple connections per user
}

// Enhanced LRU Cache for presence data
class PresenceLRUCache<K, V> {
  private cache = new Map<K, V>();
  private accessOrder = new Set<K>();
  private maxSize: number;

  constructor(maxSize: number = 500) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.accessOrder.delete(key);
      this.accessOrder.add(key);
    }
    return value;
  }

  set(key: K, value: V): void {
    this.accessOrder.delete(key);
    
    while (this.cache.size >= this.maxSize) {
      const lruKey = this.accessOrder.keys().next().value;
      if (lruKey !== undefined) {
        this.cache.delete(lruKey);
        this.accessOrder.delete(lruKey);
      }
    }
    
    this.cache.set(key, value);
    this.accessOrder.add(key);
  }

  delete(key: K): boolean {
    this.accessOrder.delete(key);
    return this.cache.delete(key);
  }

  size(): number {
    return this.cache.size;
  }

  values(): IterableIterator<V> {
    return this.cache.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
  }
}

/**
 * Comprehensive presence management service for whiteboards
 */
export class WhiteboardPresenceService {
  private logger: Logger;
  private cursorService: WhiteboardCursorService;
  private config: PresenceConfiguration;
  
  // Presence state storage
  private userPresence: PresenceLRUCache<string, UserPresenceState>;
  private avatarCache: PresenceLRUCache<string, UserAvatarInfo>;
  private activityHistory: PresenceLRUCache<string, PresenceActivityInfo[]>;
  private sessionData: PresenceLRUCache<string, PresenceSessionData>;
  
  // Timers and intervals
  private statusUpdateInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  // Throttling maps with adaptive support
  private lastPresenceUpdate = new Map<string, number>();
  private lastActivityUpdate = new Map<string, number>();
  private userCountTracker = new Map<string, number>(); // Track user count per whiteboard
  private cleanupState = {
    lastCleanupTime: 0,
    isCleanupRunning: false,
    cleanupOffset: 0, // For incremental processing
  };

  constructor(config?: Partial<PresenceConfiguration>, logger?: Logger) {
    this.logger = logger || new Logger('WhiteboardPresenceService');
    this.cursorService = getCursorService(this.logger);
    
    this.config = {
      idleTimeoutMs: 5 * 60 * 1000, // 5 minutes
      awayTimeoutMs: 15 * 60 * 1000, // 15 minutes
      offlineTimeoutMs: 30 * 60 * 1000, // 30 minutes
      enableActivityAwareness: true,
      activityHistoryLimit: 50,
      enableAvatars: true,
      avatarCacheTimeMs: 60 * 60 * 1000, // 1 hour
      fallbackToInitials: true,
      basePresenceUpdateThrottleMs: 500, // Base throttle for small groups
      adaptiveThrottling: {
        enabled: true,
        smallGroupThreshold: 10, // <= 10 users: 500ms
        mediumGroupThreshold: 20, // <= 20 users: 1s
        mediumGroupThrottleMs: 1000, // 1 second for medium groups
        largeGroupThrottleMs: 2000, // 2 seconds for large groups (20+ users)
      },
      heartbeatIntervalMs: 30 * 1000, // 30 seconds
      aggressiveCleanupEnabled: true,
      cleanupIntervalMs: 30 * 1000, // Every 30 seconds (more aggressive)
      maxStaleDataMultiplier: 1.2, // 1.2x timeout (reduced from 2x for aggressive cleanup)
      incrementalCleanupBatchSize: 50, // Process 50 items per cleanup cycle
      ...config,
    };
    
    // Initialize storage
    this.userPresence = new PresenceLRUCache<string, UserPresenceState>(1000);
    this.avatarCache = new PresenceLRUCache<string, UserAvatarInfo>(500);
    this.activityHistory = new PresenceLRUCache<string, PresenceActivityInfo[]>(200);
    this.sessionData = new PresenceLRUCache<string, PresenceSessionData>(300);
    
    this.startBackgroundTasks();
    this.logger.info('WhiteboardPresenceService initialized', { config: this.config });
  }

  /**
   * Join whiteboard - register user presence
   */
  async joinWhiteboard(
    userId: string,
    whiteboardId: string,
    sessionId: string,
    userInfo: {
      userName: string;
      userEmail?: string;
      avatar?: string;
      customStatus?: string;
      connectionId?: string;
    }
  ): Promise<UserPresenceState> {
    try {
      const presenceKey = this.getPresenceKey(userId, whiteboardId);
      const sessionKey = this.getSessionKey(sessionId, whiteboardId);
      const now = Date.now();
      
      // Generate user avatar info
      const avatarInfo = await this.getOrCreateAvatarInfo(userId, userInfo);
      
      // Create or update session data
      const existingSession = this.sessionData.get(sessionKey);
      const sessionData: PresenceSessionData = {
        sessionId,
        whiteboardId,
        userId,
        connectedAt: existingSession?.connectedAt || now,
        lastHeartbeat: now,
        connectionIds: existingSession?.connectionIds || new Set(),
      };
      
      if (userInfo.connectionId) {
        sessionData.connectionIds.add(userInfo.connectionId);
      }
      
      this.sessionData.set(sessionKey, sessionData);
      
      // Create presence state
      const presenceState: UserPresenceState = {
        ...avatarInfo,
        whiteboardId,
        sessionId,
        status: 'online',
        lastActivity: {
          type: 'idle',
          description: 'Joined whiteboard',
          timestamp: now,
        },
        lastSeen: now,
        joinedAt: now,
        customStatus: userInfo.customStatus,
        isActive: true,
        isOnline: true,
      };
      
      this.userPresence.set(presenceKey, presenceState);
      
      // Initialize activity history
      this.activityHistory.set(presenceKey, [{
        type: 'idle',
        description: 'Joined whiteboard',
        timestamp: now,
      }]);
      
      this.logger.info('User joined whiteboard', { userId, whiteboardId, sessionId });
      
      return presenceState;
    } catch (error) {
      this.logger.error('Failed to join whiteboard', { error, userId, whiteboardId });
      throw error;
    }
  }

  /**
   * Leave whiteboard - clean up presence
   */
  async leaveWhiteboard(
    userId: string,
    whiteboardId: string,
    sessionId: string,
    connectionId?: string
  ): Promise<void> {
    try {
      const presenceKey = this.getPresenceKey(userId, whiteboardId);
      const sessionKey = this.getSessionKey(sessionId, whiteboardId);
      
      // Update session data
      const sessionData = this.sessionData.get(sessionKey);
      if (sessionData) {
        if (connectionId) {
          sessionData.connectionIds.delete(connectionId);
        }
        
        // If no more connections, mark as disconnected
        if (sessionData.connectionIds.size === 0) {
          this.sessionData.delete(sessionKey);
          
          // Update presence state
          const presence = this.userPresence.get(presenceKey);
          if (presence) {
            presence.status = 'offline';
            presence.isActive = false;
            presence.isOnline = false;
            presence.lastActivity = {
              type: 'idle',
              description: 'Left whiteboard',
              timestamp: Date.now(),
            };
            this.userPresence.set(presenceKey, presence);
          }
        } else {
          this.sessionData.set(sessionKey, sessionData);
        }
      }
      
      this.logger.info('User left whiteboard', { userId, whiteboardId, sessionId });
    } catch (error) {
      this.logger.error('Failed to leave whiteboard', { error, userId, whiteboardId });
      throw error;
    }
  }

  /**
   * Update user presence status
   */
  async updatePresenceStatus(
    userId: string,
    whiteboardId: string,
    status: PresenceStatus,
    customStatus?: string
  ): Promise<UserPresenceState | null> {
    try {
      // Validate inputs to prevent XSS and malicious data
      const whiteboardValidation = validateWhiteboardId(whiteboardId);
      if (!whiteboardValidation.valid) {
        throw new Error(`Invalid whiteboard ID: ${whiteboardValidation.error}`);
      }
      
      let sanitizedCustomStatus: string | undefined;
      if (customStatus) {
        const customStatusValidation = validateCustomStatus(customStatus);
        if (!customStatusValidation.valid) {
          throw new Error(`Invalid custom status: ${customStatusValidation.error}`);
        }
        sanitizedCustomStatus = customStatusValidation.sanitized || undefined;
      }
      
      const sanitizedWhiteboardId = whiteboardValidation.sanitized;
      const presenceKey = this.getPresenceKey(userId, sanitizedWhiteboardId);
      
      // Check adaptive throttling
      if (!this.shouldUpdatePresence(presenceKey)) {
        const existing = this.userPresence.get(presenceKey);
        return existing || null;
      }
      
      const presence = this.userPresence.get(presenceKey);
      if (!presence) {
        return null;
      }
      
      const now = Date.now();
      presence.status = status;
      presence.customStatus = sanitizedCustomStatus;
      presence.lastSeen = now;
      
      // Update activity based on status
      if (status === 'offline') {
        presence.isActive = false;
        presence.isOnline = false;
      } else {
        presence.isOnline = true;
        presence.isActive = status === 'online' || status === 'busy';
      }
      
      this.userPresence.set(presenceKey, presence);
      this.lastPresenceUpdate.set(presenceKey, now);
      
      this.logger.debug('Presence status updated', { userId, whiteboardId, status });
      
      return presence;
    } catch (error) {
      this.logger.error('Failed to update presence status', { error, userId, whiteboardId });
      throw error;
    }
  }

  /**
   * Update user activity awareness
   */
  async updateActivity(
    userId: string,
    whiteboardId: string,
    activity: PresenceActivityInfo
  ): Promise<UserPresenceState | null> {
    try {
      if (!this.config.enableActivityAwareness) {
        return null;
      }
      
      // Validate inputs to prevent XSS and malicious data
      const whiteboardValidation = validateWhiteboardId(whiteboardId);
      if (!whiteboardValidation.valid) {
        throw new Error(`Invalid whiteboard ID: ${whiteboardValidation.error}`);
      }
      
      const activityValidation = validateActivityInfo(activity);
      if (!activityValidation.valid) {
        throw new Error(`Invalid activity data: ${activityValidation.errors.join(', ')}`);
      }
      
      // Use sanitized data
      const sanitizedWhiteboardId = whiteboardValidation.sanitized;
      const sanitizedActivity = activityValidation.sanitizedData;
      
      const presenceKey = this.getPresenceKey(userId, sanitizedWhiteboardId);
      
      // Check adaptive throttling for activity updates
      const lastUpdate = this.lastActivityUpdate.get(presenceKey) || 0;
      const whiteboardId = presenceKey.split(':')[0];
      const userCount = this.getUserCountForWhiteboard(whiteboardId);
      const activityThrottleTime = Math.min(this.getAdaptiveThrottleTime(userCount), 1000); // Max 1s for activities
      
      if (Date.now() - lastUpdate < activityThrottleTime) {
        return this.userPresence.get(presenceKey) || null;
      }
      
      const presence = this.userPresence.get(presenceKey);
      if (!presence) {
        return null;
      }
      
      const now = Date.now();
      presence.lastActivity = {
        ...sanitizedActivity,
        timestamp: now,
      };
      presence.lastSeen = now;
      
      // Update status based on activity
      if (sanitizedActivity.type !== 'idle' && presence.status === 'idle') {
        presence.status = 'online';
        presence.isActive = true;
      }
      
      this.userPresence.set(presenceKey, presence);
      this.lastActivityUpdate.set(presenceKey, now);
      
      // Update activity history with sanitized data
      this.addToActivityHistory(presenceKey, sanitizedActivity);
      
      this.logger.debug('Activity updated', { userId, whiteboardId, activity: activity.type });
      
      return presence;
    } catch (error) {
      this.logger.error('Failed to update activity', { error, userId, whiteboardId });
      throw error;
    }
  }

  /**
   * Send heartbeat to keep presence alive
   */
  async sendHeartbeat(userId: string, whiteboardId: string, sessionId: string): Promise<void> {
    try {
      const presenceKey = this.getPresenceKey(userId, whiteboardId);
      const sessionKey = this.getSessionKey(sessionId, whiteboardId);
      const now = Date.now();
      
      // Update session heartbeat
      const sessionData = this.sessionData.get(sessionKey);
      if (sessionData) {
        sessionData.lastHeartbeat = now;
        this.sessionData.set(sessionKey, sessionData);
      }
      
      // Update presence
      const presence = this.userPresence.get(presenceKey);
      if (presence) {
        presence.lastSeen = now;
        
        // Auto-update status based on activity
        const timeSinceLastActivity = now - presence.lastActivity.timestamp;
        if (timeSinceLastActivity > this.config.idleTimeoutMs && presence.status === 'online') {
          presence.status = 'idle';
        }
        
        this.userPresence.set(presenceKey, presence);
      }
    } catch (error) {
      this.logger.error('Failed to send heartbeat', { error, userId, whiteboardId });
    }
  }

  /**
   * Get all active users for a whiteboard
   */
  getWhiteboardPresence(whiteboardId: string): UserPresenceState[] {
    const activeUsers: UserPresenceState[] = [];
    const now = Date.now();
    
    for (const presence of this.userPresence.values()) {
      if (presence.whiteboardId === whiteboardId) {
        // Check if user is still active
        const timeSinceLastSeen = now - presence.lastSeen;
        if (timeSinceLastSeen <= this.config.offlineTimeoutMs) {
          // Update cursor state with proper error handling
          try {
            const cursorState = this.cursorService.getCursorState(presence.userId, whiteboardId);
            if (cursorState !== null && cursorState !== undefined) {
              presence.cursorState = cursorState;
            } else {
              // Explicitly handle null state - cursor service unavailable or no cursor data
              presence.cursorState = undefined;
              this.logger.debug('No cursor state available for user', { 
                userId: presence.userId, 
                whiteboardId 
              });
            }
          } catch (error) {
            // Log error but don't fail the entire presence operation
            this.logger.warn('Failed to get cursor state for user', {
              userId: presence.userId,
              whiteboardId,
              error: error instanceof Error ? error.message : String(error)
            });
            presence.cursorState = undefined;
          }
          
          activeUsers.push(presence);
        }
      }
    }
    
    return activeUsers;
  }

  /**
   * Get specific user presence
   */
  getUserPresence(userId: string, whiteboardId: string): UserPresenceState | null {
    const presenceKey = this.getPresenceKey(userId, whiteboardId);
    const presence = this.userPresence.get(presenceKey);
    
    if (presence) {
      // Update with latest cursor state with proper error handling
      try {
        const cursorState = this.cursorService.getCursorState(userId, whiteboardId);
        if (cursorState !== null && cursorState !== undefined) {
          presence.cursorState = cursorState;
        } else {
          // Explicitly handle null state
          presence.cursorState = undefined;
          this.logger.debug('No cursor state available for user in getUserPresence', { 
            userId, 
            whiteboardId 
          });
        }
      } catch (error) {
        // Log error but don't fail the presence lookup
        this.logger.warn('Failed to get cursor state in getUserPresence', {
          userId,
          whiteboardId,
          error: error instanceof Error ? error.message : String(error)
        });
        presence.cursorState = undefined;
      }
    }
    
    return presence || null;
  }

  /**
   * Get user activity history
   */
  getUserActivityHistory(userId: string, whiteboardId: string): PresenceActivityInfo[] {
    const presenceKey = this.getPresenceKey(userId, whiteboardId);
    return this.activityHistory.get(presenceKey) || [];
  }

  /**
   * Get or create user avatar info
   */
  async getOrCreateAvatarInfo(userId: string, userInfo: {
    userName: string;
    userEmail?: string;
    avatar?: string;
  }): Promise<UserAvatarInfo> {
    const cached = this.avatarCache.get(userId);
    if (cached) {
      // Update cached info if provided
      if (userInfo.userName !== cached.userName || userInfo.avatar !== cached.avatar) {
        cached.userName = userInfo.userName;
        cached.avatar = userInfo.avatar;
        cached.initials = this.generateInitials(userInfo.userName);
        this.avatarCache.set(userId, cached);
      }
      return cached;
    }
    
    // Create new avatar info
    const avatarInfo: UserAvatarInfo = {
      userId,
      userName: userInfo.userName,
      userEmail: userInfo.userEmail,
      avatar: userInfo.avatar,
      initials: this.generateInitials(userInfo.userName),
      color: this.generateUserColor(userId),
      isOnline: true,
    };
    
    this.avatarCache.set(userId, avatarInfo);
    return avatarInfo;
  }

  /**
   * Get presence statistics
   */
  getPresenceStats(): {
    totalUsers: number;
    onlineUsers: number;
    activeUsers: number;
    idleUsers: number;
    awayUsers: number;
    offlineUsers: number;
    whiteboardCounts: Record<string, number>;
  } {
    const stats = {
      totalUsers: 0,
      onlineUsers: 0,
      activeUsers: 0,
      idleUsers: 0,
      awayUsers: 0,
      offlineUsers: 0,
      whiteboardCounts: {} as Record<string, number>,
    };
    
    for (const presence of this.userPresence.values()) {
      stats.totalUsers++;
      
      // Count by status
      switch (presence.status) {
        case 'online':
          stats.onlineUsers++;
          if (presence.isActive) stats.activeUsers++;
          break;
        case 'idle':
          stats.idleUsers++;
          break;
        case 'away':
          stats.awayUsers++;
          break;
        case 'offline':
          stats.offlineUsers++;
          break;
      }
      
      // Count by whiteboard
      const whiteboardId = presence.whiteboardId;
      stats.whiteboardCounts[whiteboardId] = (stats.whiteboardCounts[whiteboardId] || 0) + 1;
    }
    
    return stats;
  }

  /**
   * Aggressive cleanup of stale presence data with incremental processing
   */
  async forceCleanup(): Promise<{ cleaned: number }> {
    // Prevent concurrent cleanup operations
    if (this.cleanupState.isCleanupRunning) {
      this.logger.debug('Cleanup already running, skipping');
      return { cleaned: 0 };
    }
    
    this.cleanupState.isCleanupRunning = true;
    const now = Date.now();
    let cleaned = 0;
    
    try {
      // Use aggressive cleanup multiplier (1.2x instead of 2x)
      const stalePresenceThreshold = this.config.offlineTimeoutMs * this.config.maxStaleDataMultiplier;
      const staleSessionThreshold = this.config.offlineTimeoutMs;
      const staleThrottleThreshold = 5 * 60 * 1000; // 5 minutes (reduced from 10)
      
      // Incremental cleanup for presence data
      cleaned += await this.cleanupPresenceDataIncremental(now, stalePresenceThreshold);
      
      // Incremental cleanup for session data
      cleaned += await this.cleanupSessionDataIncremental(now, staleSessionThreshold);
      
      // Cleanup throttling maps (always complete due to smaller size)
      cleaned += await this.cleanupThrottlingMaps(now, staleThrottleThreshold);
      
      // Clear user count cache
      this.userCountTracker.clear();
      
      if (cleaned > 0) {
        this.logger.info('Aggressive presence cleanup completed', { 
          cleaned, 
          cleanupTime: Date.now() - now,
          nextCleanupIn: this.config.cleanupIntervalMs / 1000 + 's'
        });
      }
      
      this.cleanupState.lastCleanupTime = now;
      return { cleaned };
      
    } catch (error) {
      this.logger.error('Error during cleanup', { error });
      return { cleaned };
    } finally {
      this.cleanupState.isCleanupRunning = false;
    }
  }
  
  /**
   * Incremental cleanup of presence data to avoid blocking
   */
  private async cleanupPresenceDataIncremental(now: number, threshold: number): Promise<number> {
    let cleaned = 0;
    let processed = 0;
    const maxBatch = this.config.incrementalCleanupBatchSize;
    
    const presenceEntries = Array.from(this.userPresence.entries());
    const startIndex = this.cleanupState.cleanupOffset % presenceEntries.length;
    
    for (let i = 0; i < maxBatch && (startIndex + i) < presenceEntries.length; i++) {
      const index = startIndex + i;
      const [key, presence] = presenceEntries[index];
      processed++;
      
      const timeSinceLastSeen = now - presence.lastSeen;
      if (timeSinceLastSeen > threshold) {
        this.userPresence.delete(key);
        this.activityHistory.delete(key);
        cleaned++;
      }
      
      // Yield control every 10 items to avoid blocking
      if (i % 10 === 0 && i > 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    // Update offset for next incremental cleanup
    this.cleanupState.cleanupOffset = (startIndex + processed) % presenceEntries.length;
    
    return cleaned;
  }
  
  /**
   * Incremental cleanup of session data
   */
  private async cleanupSessionDataIncremental(now: number, threshold: number): Promise<number> {
    let cleaned = 0;
    let processed = 0;
    const maxBatch = this.config.incrementalCleanupBatchSize;
    
    for (const [key, session] of this.sessionData.entries()) {
      if (processed >= maxBatch) break;
      
      const timeSinceHeartbeat = now - session.lastHeartbeat;
      if (timeSinceHeartbeat > threshold) {
        this.sessionData.delete(key);
        cleaned++;
      }
      
      processed++;
      
      // Yield control every 10 items
      if (processed % 10 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    return cleaned;
  }
  
  /**
   * Cleanup throttling maps
   */
  private async cleanupThrottlingMaps(now: number, threshold: number): Promise<number> {
    let cleaned = 0;
    
    // Clean presence update throttling
    for (const [key, timestamp] of this.lastPresenceUpdate.entries()) {
      if (now - timestamp > threshold) {
        this.lastPresenceUpdate.delete(key);
        cleaned++;
      }
    }
    
    // Clean activity update throttling
    for (const [key, timestamp] of this.lastActivityUpdate.entries()) {
      if (now - timestamp > threshold) {
        this.lastActivityUpdate.delete(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  /**
   * Shutdown service and clean up resources
   */
  async shutdown(): Promise<void> {
    // Clear intervals
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
      this.statusUpdateInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Clear all data
    this.userPresence.clear();
    this.avatarCache.clear();
    this.activityHistory.clear();
    this.sessionData.clear();
    this.lastPresenceUpdate.clear();
    this.lastActivityUpdate.clear();
    
    this.logger.info('WhiteboardPresenceService shutdown');
  }

  // Private helper methods

  private getPresenceKey(userId: string, whiteboardId: string): string {
    return `${whiteboardId}:${userId}`;
  }

  private getSessionKey(sessionId: string, whiteboardId: string): string {
    return `${whiteboardId}:${sessionId}`;
  }

  private generateInitials(name: string): string {
    if (!name || name.trim().length === 0) {
      return '??';
    }
    
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase();
    }
    
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  private generateUserColor(userId: string): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#FFB347', '#98D8E8', '#F7DC6F', '#BB8FCE',
      '#F1948A', '#82E0AA', '#85C1E9', '#F8C471', '#D7BDE2'
    ];
    
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * Adaptive throttling based on user count per whiteboard
   */
  private shouldUpdatePresence(presenceKey: string): boolean {
    const lastUpdate = this.lastPresenceUpdate.get(presenceKey) || 0;
    const now = Date.now();
    
    // Extract whiteboard ID from presence key
    const whiteboardId = presenceKey.split(':')[0];
    const userCount = this.getUserCountForWhiteboard(whiteboardId);
    
    // Get adaptive throttle time based on user count
    const throttleTime = this.getAdaptiveThrottleTime(userCount);
    
    return now - lastUpdate >= throttleTime;
  }
  
  /**
   * Gets the appropriate throttle time based on user count
   */
  private getAdaptiveThrottleTime(userCount: number): number {
    if (!this.config.adaptiveThrottling.enabled) {
      return this.config.basePresenceUpdateThrottleMs;
    }
    
    if (userCount <= this.config.adaptiveThrottling.smallGroupThreshold) {
      return this.config.basePresenceUpdateThrottleMs; // 500ms for small groups
    } else if (userCount <= this.config.adaptiveThrottling.mediumGroupThreshold) {
      return this.config.adaptiveThrottling.mediumGroupThrottleMs; // 1s for medium groups
    } else {
      return this.config.adaptiveThrottling.largeGroupThrottleMs; // 2s for large groups
    }
  }
  
  /**
   * Get current user count for a whiteboard
   */
  private getUserCountForWhiteboard(whiteboardId: string): number {
    const cached = this.userCountTracker.get(whiteboardId);
    if (cached !== undefined) {
      return cached;
    }
    
    // Calculate user count and cache it
    let count = 0;
    const now = Date.now();
    
    for (const presence of this.userPresence.values()) {
      if (presence.whiteboardId === whiteboardId) {
        const timeSinceLastSeen = now - presence.lastSeen;
        if (timeSinceLastSeen <= this.config.offlineTimeoutMs) {
          count++;
        }
      }
    }
    
    // Cache for a short time to avoid recalculation on every check
    this.userCountTracker.set(whiteboardId, count);
    
    // Clear cache after 5 seconds to ensure accuracy
    setTimeout(() => {
      this.userCountTracker.delete(whiteboardId);
    }, 5000);
    
    return count;
  }

  private addToActivityHistory(presenceKey: string, activity: PresenceActivityInfo): void {
    const history = this.activityHistory.get(presenceKey) || [];
    history.push(activity);
    
    // Keep only the most recent activities
    if (history.length > this.config.activityHistoryLimit) {
      history.splice(0, history.length - this.config.activityHistoryLimit);
    }
    
    this.activityHistory.set(presenceKey, history);
  }

  private startBackgroundTasks(): void {
    // Status update task - automatically update status based on activity
    this.statusUpdateInterval = setInterval(() => {
      this.updateAllUserStatuses().catch(error => {
        this.logger.error('Status update failed', { error: error instanceof Error ? error.message : String(error) });
      });
    }, 30 * 1000); // Every 30 seconds

    // Aggressive cleanup task - run more frequently
    this.cleanupInterval = setInterval(() => {
      if (this.config.aggressiveCleanupEnabled) {
        this.forceCleanup().catch(error => {
          this.logger.error('Force cleanup failed', { error: error instanceof Error ? error.message : String(error) });
        });
      }
    }, this.config.cleanupIntervalMs); // Every 30 seconds (configurable)
  }

  private async updateAllUserStatuses(): Promise<void> {
    try {
      const now = Date.now();
      
      for (const presence of this.userPresence.values()) {
        const timeSinceLastActivity = now - presence.lastActivity.timestamp;
        const timeSinceLastSeen = now - presence.lastSeen;
        
        let newStatus = presence.status;
        
        // Determine new status based on timing
        if (timeSinceLastSeen > this.config.offlineTimeoutMs) {
          newStatus = 'offline';
          presence.isActive = false;
          presence.isOnline = false;
        } else if (timeSinceLastSeen > this.config.awayTimeoutMs) {
          newStatus = 'away';
          presence.isActive = false;
        } else if (timeSinceLastActivity > this.config.idleTimeoutMs) {
          newStatus = 'idle';
          presence.isActive = false;
        } else if (presence.status === 'idle' || presence.status === 'away') {
          // User became active again
          newStatus = 'online';
          presence.isActive = true;
        }
        
        // Update if status changed
        if (newStatus !== presence.status) {
          presence.status = newStatus;
          const presenceKey = this.getPresenceKey(presence.userId, presence.whiteboardId);
          this.userPresence.set(presenceKey, presence);
        }
      }
    } catch (error) {
      this.logger.error('Failed to update user statuses', { error });
    }
  }
}

// Singleton instance
let presenceServiceInstance: WhiteboardPresenceService | null = null;

/**
 * Get or create the singleton presence service instance
 */
export function getPresenceService(
  config?: Partial<PresenceConfiguration>,
  logger?: Logger
): WhiteboardPresenceService {
  if (!presenceServiceInstance) {
    presenceServiceInstance = new WhiteboardPresenceService(config, logger);
    
    // Add process cleanup handlers
    const cleanup = async () => {
      await shutdownPresenceService();
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
  }
  return presenceServiceInstance;
}

/**
 * Shutdown the presence service singleton
 */
export async function shutdownPresenceService(): Promise<void> {
  if (presenceServiceInstance) {
    try {
      await presenceServiceInstance.shutdown();
    } catch (error) {
      console.error('Error during presence service shutdown:', error);
    } finally {
      presenceServiceInstance = null;
    }
  }
}