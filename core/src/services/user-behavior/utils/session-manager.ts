import { Logger } from '../../../shared/utils/logger.js';

interface SessionInfo {
  userId: string;
  sessionId: string;
  startTime: Date;
  lastActivity: Date;
  eventCount: number;
  isActive: boolean;
}

export class SessionManager {
  private sessions: Map<string, SessionInfo>;
  private sessionTimeout: number;
  private cleanupInterval: NodeJS.Timeout;
  private logger: Logger;

  constructor(sessionTimeout: number = 30 * 60 * 1000) { // 30 minutes default
    this.sessions = new Map();
    this.sessionTimeout = sessionTimeout;
    this.logger = new Logger('SessionManager');

    // Clean up expired sessions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
  }

  /**
   * Update session information for a user event
   */
  updateSession(userId: string, sessionId: string, eventTime: Date): SessionInfo {
    const sessionKey = `${userId}:${sessionId}`;
    let session = this.sessions.get(sessionKey);

    if (!session) {
      // Create new session
      session = {
        userId,
        sessionId,
        startTime: eventTime,
        lastActivity: eventTime,
        eventCount: 1,
        isActive: true,
      };
      
      this.logger.debug('New session created', { userId, sessionId });
    } else {
      // Update existing session
      session.lastActivity = eventTime;
      session.eventCount += 1;
      session.isActive = this.isSessionActive(session, eventTime);
    }

    this.sessions.set(sessionKey, session);
    return session;
  }

  /**
   * Get session information
   */
  getSession(userId: string, sessionId: string): SessionInfo | null {
    const sessionKey = `${userId}:${sessionId}`;
    return this.sessions.get(sessionKey) || null;
  }

  /**
   * Get all active sessions for a user
   */
  getUserActiveSessions(userId: string): SessionInfo[] {
    const userSessions: SessionInfo[] = [];
    
    for (const [sessionKey, session] of this.sessions) {
      if (session.userId === userId && session.isActive) {
        userSessions.push(session);
      }
    }

    return userSessions;
  }

  /**
   * End a session
   */
  endSession(userId: string, sessionId: string): void {
    const sessionKey = `${userId}:${sessionId}`;
    const session = this.sessions.get(sessionKey);
    
    if (session) {
      session.isActive = false;
      this.logger.debug('Session ended', { userId, sessionId, duration: this.getSessionDuration(session) });
    }
  }

  /**
   * Get session duration in milliseconds
   */
  getSessionDuration(session: SessionInfo): number {
    return session.lastActivity.getTime() - session.startTime.getTime();
  }

  /**
   * Check if session is still active based on timeout
   */
  private isSessionActive(session: SessionInfo, currentTime: Date): boolean {
    const timeSinceLastActivity = currentTime.getTime() - session.lastActivity.getTime();
    return timeSinceLastActivity <= this.sessionTimeout;
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    let cleanedCount = 0;

    for (const [sessionKey, session] of this.sessions) {
      if (!this.isSessionActive(session, now)) {
        session.isActive = false;
        this.sessions.delete(sessionKey);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug('Cleaned up expired sessions', { count: cleanedCount });
    }
  }

  /**
   * Get session statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    avgSessionDuration: number;
    avgEventsPerSession: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const activeSessions = sessions.filter(s => s.isActive);
    
    const totalDuration = sessions.reduce((sum, session) => {
      return sum + this.getSessionDuration(session);
    }, 0);

    const totalEvents = sessions.reduce((sum, session) => {
      return sum + session.eventCount;
    }, 0);

    return {
      totalSessions: sessions.length,
      activeSessions: activeSessions.length,
      avgSessionDuration: sessions.length > 0 ? totalDuration / sessions.length : 0,
      avgEventsPerSession: sessions.length > 0 ? totalEvents / sessions.length : 0,
    };
  }

  /**
   * Shutdown and cleanup resources
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.sessions.clear();
    this.logger.info('Session manager shutdown complete');
  }
}