interface BehaviorEvent {
  userId: string;
  sessionId: string;
  eventType: string;
  eventCategory: string;
  eventAction: string;
  searchQuery?: string;
  pageUrl?: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export class EventCollector {
  private apiUrl: string;
  private eventQueue: BehaviorEvent[] = [];
  private batchSize: number = 10;
  private flushInterval: number = 5000; // 5 seconds
  private flushTimer?: number;
  private isOnline: boolean = navigator.onLine;
  private retryAttempts: number = 3;
  private retryDelay: number = 1000;
  private boundHandlers: Array<{ target: EventTarget; event: string; handler: EventListener }> = [];

  constructor(apiUrl: string, options: {
    batchSize?: number;
    flushInterval?: number;
    retryAttempts?: number;
    retryDelay?: number;
  } = {}) {
    this.apiUrl = apiUrl;
    this.batchSize = options.batchSize || 10;
    this.flushInterval = options.flushInterval || 5000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;

    this.setupNetworkListeners();
    this.setupPeriodicFlush();
    this.setupBeforeUnload();
  }

  /**
   * Track a single event
   */
  async trackEvent(event: Partial<BehaviorEvent>): Promise<void> {
    const enrichedEvent: BehaviorEvent = {
      ...event,
      userId: event.userId || '',
      sessionId: event.sessionId || crypto.randomUUID(),
      eventType: event.eventType || 'unknown',
      eventCategory: event.eventCategory || 'general',
      eventAction: event.eventAction || 'action',
      timestamp: event.timestamp || new Date(),
      metadata: {
        ...event.metadata,
        url: window.location.href,
        referrer: document.referrer,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      },
    };

    this.eventQueue.push(enrichedEvent);

    // Flush if batch size reached
    if (this.eventQueue.length >= this.batchSize) {
      await this.flush();
    }
  }

  /**
   * Track multiple events at once
   */
  async trackEvents(events: Partial<BehaviorEvent>[]): Promise<void> {
    for (const event of events) {
      await this.trackEvent(event);
    }
  }

  /**
   * Flush pending events to server
   */
  async flush(): Promise<void> {
    if (this.eventQueue.length === 0 || !this.isOnline) {
      return;
    }

    const eventsToSend = [...this.eventQueue];
    this.eventQueue = [];

    try {
      await this.sendEvents(eventsToSend);
    } catch (error) {
      console.error('Failed to send events:', error);
      // Re-queue events for retry
      this.eventQueue.unshift(...eventsToSend);
    }
  }

  /**
   * Force immediate flush of all pending events
   */
  async forceFlush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    await this.flush();
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.eventQueue.length;
  }

  /**
   * Clear the event queue
   */
  clearQueue(): void {
    this.eventQueue = [];
  }

  /**
   * Shutdown the event collector
   */
  shutdown(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    // Remove all registered event listeners
    for (const { target, event, handler } of this.boundHandlers) {
      target.removeEventListener(event, handler);
    }
    this.boundHandlers = [];
    // Attempt final flush
    this.flush().catch(console.error);
  }

  private async sendEvents(events: BehaviorEvent[], attempt: number = 1): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/events/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ events }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to track events');
      }

    } catch (error) {
      if (attempt < this.retryAttempts) {
        // Exponential backoff retry
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendEvents(events, attempt + 1);
      } else {
        throw error;
      }
    }
  }

  private addTrackedListener(target: EventTarget, event: string, handler: EventListener): void {
    target.addEventListener(event, handler);
    this.boundHandlers.push({ target, event, handler });
  }

  private setupNetworkListeners(): void {
    this.addTrackedListener(window, 'online', () => {
      this.isOnline = true;
      this.flush().catch(console.error);
    });

    this.addTrackedListener(window, 'offline', () => {
      this.isOnline = false;
    });
  }

  private setupPeriodicFlush(): void {
    const scheduleFlush = () => {
      this.flushTimer = window.setTimeout(() => {
        this.flush().catch(console.error);
        scheduleFlush(); // Schedule next flush
      }, this.flushInterval);
    };

    scheduleFlush();
  }

  private setupBeforeUnload(): void {
    // Flush events before page unload
    this.addTrackedListener(window, 'beforeunload', () => {
      if (this.eventQueue.length > 0 && this.isOnline) {
        const eventsToSend = [...this.eventQueue];
        try {
          navigator.sendBeacon(
            `${this.apiUrl}/events/batch`,
            JSON.stringify({ events: eventsToSend })
          );
        } catch (error) {
          console.error('Failed to send events on unload:', error);
        }
      }
    });

    // Also handle visibility change (when tab becomes hidden)
    this.addTrackedListener(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flush().catch(console.error);
      }
    });
  }
}

export default EventCollector;