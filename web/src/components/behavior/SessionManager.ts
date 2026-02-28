interface SessionData {
  sessionId: string;
  startTime: Date;
  lastActivity: Date;
  pageViews: number;
  events: number;
  isActive: boolean;
}

interface SessionMetrics {
  duration: number;
  pageViews: number;
  events: number;
  engagementScore: number;
}

export class SessionManager {
  private sessionId: string;
  private sessionData: SessionData;
  private activityTimeout: number = 30 * 60 * 1000; // 30 minutes
  private inactivityTimer?: number;
  private heartbeatInterval?: number;
  private listeners: Map<string, Function[]> = new Map();
  private domListeners: Array<{ target: EventTarget; event: string; handler: EventListener }> = [];

  constructor(sessionId?: string, options: {
    activityTimeout?: number;
    enableHeartbeat?: boolean;
  } = {}) {
    this.sessionId = sessionId || this.generateSessionId();
    this.activityTimeout = options.activityTimeout || 30 * 60 * 1000;

    this.sessionData = {
      sessionId: this.sessionId,
      startTime: new Date(),
      lastActivity: new Date(),
      pageViews: 0,
      events: 0,
      isActive: true,
    };

    this.setupActivityTracking();
    
    if (options.enableHeartbeat !== false) {
      this.setupHeartbeat();
    }

    this.loadPersistedSession();
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get session data
   */
  getSessionData(): SessionData {
    return { ...this.sessionData };
  }

  /**
   * Get session metrics
   */
  getSessionMetrics(): SessionMetrics {
    const duration = Date.now() - this.sessionData.startTime.getTime();
    const engagementScore = this.calculateEngagementScore();

    return {
      duration,
      pageViews: this.sessionData.pageViews,
      events: this.sessionData.events,
      engagementScore,
    };
  }

  /**
   * Record a page view
   */
  recordPageView(url?: string): void {
    this.updateActivity();
    this.sessionData.pageViews++;
    this.persistSession();
    this.emit('pageView', { url, sessionData: this.getSessionData() });
  }

  /**
   * Record an event
   */
  recordEvent(eventType: string, metadata?: any): void {
    this.updateActivity();
    this.sessionData.events++;
    this.persistSession();
    this.emit('event', { eventType, metadata, sessionData: this.getSessionData() });
  }

  /**
   * Update last activity timestamp
   */
  updateActivity(): void {
    const wasInactive = !this.sessionData.isActive;
    
    this.sessionData.lastActivity = new Date();
    this.sessionData.isActive = true;
    
    this.resetInactivityTimer();

    if (wasInactive) {
      this.emit('sessionReactivated', this.getSessionData());
    }
  }

  /**
   * Check if session is active
   */
  isSessionActive(): boolean {
    const timeSinceActivity = Date.now() - this.sessionData.lastActivity.getTime();
    return timeSinceActivity < this.activityTimeout;
  }

  /**
   * End the current session
   */
  endSession(): void {
    this.sessionData.isActive = false;
    this.clearTimers();
    this.emit('sessionEnded', this.getSessionMetrics());
    this.clearPersistedSession();
  }

  /**
   * Start a new session
   */
  startNewSession(): void {
    const previousMetrics = this.getSessionMetrics();
    
    this.sessionId = this.generateSessionId();
    this.sessionData = {
      sessionId: this.sessionId,
      startTime: new Date(),
      lastActivity: new Date(),
      pageViews: 0,
      events: 0,
      isActive: true,
    };

    this.setupActivityTracking();
    this.persistSession();
    
    this.emit('sessionStarted', { 
      sessionData: this.getSessionData(),
      previousMetrics 
    });
  }

  /**
   * Add event listener
   */
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  /**
   * Remove event listener
   */
  off(event: string, callback: Function): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(callback);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  /**
   * Shutdown session manager
   */
  shutdown(): void {
    this.clearTimers();
    // Remove all DOM event listeners
    for (const { target, event, handler } of this.domListeners) {
      target.removeEventListener(event, handler);
    }
    this.domListeners = [];
    this.persistSession();
    this.emit('shutdown', this.getSessionMetrics());
  }

  private generateSessionId(): string {
    return crypto.randomUUID();
  }

  private addDomListener(target: EventTarget, event: string, handler: EventListener, options?: AddEventListenerOptions): void {
    target.addEventListener(event, handler, options);
    this.domListeners.push({ target, event, handler });
  }

  private setupActivityTracking(): void {
    // Track various user activities
    const activities = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

    const activityHandler = () => this.updateActivity();

    activities.forEach(activity => {
      this.addDomListener(document, activity, activityHandler, { passive: true });
    });

    // Track visibility changes
    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        this.updateActivity();
      }
    };
    this.addDomListener(document, 'visibilitychange', visibilityHandler);

    // Setup initial inactivity timer
    this.resetInactivityTimer();
  }

  private setupHeartbeat(): void {
    // Send periodic heartbeat to maintain session
    this.heartbeatInterval = window.setInterval(() => {
      if (this.isSessionActive()) {
        this.emit('heartbeat', this.getSessionData());
      }
    }, 60000); // Every minute
  }

  private resetInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }

    this.inactivityTimer = window.setTimeout(() => {
      if (this.sessionData.isActive) {
        this.sessionData.isActive = false;
        this.emit('sessionInactive', this.getSessionData());
      }
    }, this.activityTimeout);
  }

  private clearTimers(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = undefined;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  private calculateEngagementScore(): number {
    const metrics = {
      duration: Date.now() - this.sessionData.startTime.getTime(),
      pageViews: this.sessionData.pageViews,
      events: this.sessionData.events,
    };

    // Simple engagement scoring algorithm
    let score = 0;

    // Duration score (up to 40% of total)
    const durationMinutes = metrics.duration / (1000 * 60);
    const durationScore = Math.min(durationMinutes / 30, 1) * 0.4; // Max at 30 minutes
    score += durationScore;

    // Page views score (up to 30% of total)
    const pageViewScore = Math.min(metrics.pageViews / 10, 1) * 0.3; // Max at 10 pages
    score += pageViewScore;

    // Events score (up to 30% of total)
    const eventScore = Math.min(metrics.events / 50, 1) * 0.3; // Max at 50 events
    score += eventScore;

    return Math.round(score * 100) / 100; // Round to 2 decimal places
  }

  private persistSession(): void {
    try {
      const sessionKey = `session-${this.sessionId}`;
      localStorage.setItem(sessionKey, JSON.stringify({
        ...this.sessionData,
        startTime: this.sessionData.startTime.toISOString(),
        lastActivity: this.sessionData.lastActivity.toISOString(),
      }));

      // Also store current session ID
      localStorage.setItem('current-session-id', this.sessionId);
    } catch (error) {
      console.warn('Failed to persist session data:', error);
    }
  }

  private loadPersistedSession(): void {
    try {
      const currentSessionId = localStorage.getItem('current-session-id');
      if (currentSessionId && currentSessionId !== this.sessionId) {
        // Load existing session if it's recent enough
        const sessionKey = `session-${currentSessionId}`;
        const persistedData = localStorage.getItem(sessionKey);
        
        if (persistedData) {
          const parsed = JSON.parse(persistedData);
          const lastActivity = new Date(parsed.lastActivity);
          const timeSinceActivity = Date.now() - lastActivity.getTime();
          
          if (timeSinceActivity < this.activityTimeout) {
            // Resume existing session
            this.sessionId = currentSessionId;
            this.sessionData = {
              ...parsed,
              startTime: new Date(parsed.startTime),
              lastActivity,
            };
            return;
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load persisted session:', error);
    }
  }

  private clearPersistedSession(): void {
    try {
      const sessionKey = `session-${this.sessionId}`;
      localStorage.removeItem(sessionKey);
      localStorage.removeItem('current-session-id');
    } catch (error) {
      console.warn('Failed to clear persisted session:', error);
    }
  }

  private emit(event: string, data?: any): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in session manager event listener for ${event}:`, error);
        }
      });
    }
  }
}

export default SessionManager;