/**
 * Countdown Manager Utility
 * 
 * Global singleton manager for countdown timers to prevent memory leaks.
 * Handles multiple countdown operations efficiently with a single interval.
 */

export interface CountdownItem {
  id: string;
  expiresAt: number;
  callback: (remaining: number) => void;
  onExpired?: () => void;
}

class CountdownManager {
  private items = new Map<string, CountdownItem>();
  private interval: NodeJS.Timeout | null = null;
  private readonly UPDATE_INTERVAL = 1000; // 1 second
  private readonly MAX_ITEMS = 1000; // Prevent memory leaks with too many items
  private stats = {
    totalRegistered: 0,
    totalExpired: 0,
    activeCount: 0,
    maxConcurrent: 0,
  };

  /**
   * Register a new countdown item with memory leak protection
   */
  register(item: CountdownItem): boolean {
    // Prevent memory leaks by limiting total items
    if (this.items.size >= this.MAX_ITEMS) {
      console.warn('[CountdownManager] Maximum items reached, cleaning up expired items');
      this.cleanupExpiredItems();
      
      if (this.items.size >= this.MAX_ITEMS) {
        console.error('[CountdownManager] Cannot register new item, max capacity reached');
        return false;
      }
    }

    // Check for duplicate IDs and warn
    if (this.items.has(item.id)) {
      console.warn(`[CountdownManager] Replacing existing countdown item: ${item.id}`);
    }

    this.items.set(item.id, item);
    this.stats.totalRegistered++;
    this.stats.activeCount = this.items.size;
    this.stats.maxConcurrent = Math.max(this.stats.maxConcurrent, this.items.size);
    
    this.startInterval();
    return true;
  }

  /**
   * Unregister a countdown item
   */
  unregister(id: string): boolean {
    const existed = this.items.delete(id);
    this.stats.activeCount = this.items.size;
    
    if (this.items.size === 0) {
      this.stopInterval();
    }
    
    return existed;
  }

  /**
   * Update an existing countdown item's expiration
   */
  update(id: string, expiresAt: number): void {
    const item = this.items.get(id);
    if (item) {
      item.expiresAt = expiresAt;
    }
  }

  /**
   * Get current remaining time for an item
   */
  getRemaining(id: string): number {
    const item = this.items.get(id);
    if (!item) return 0;
    
    const remaining = item.expiresAt - Date.now();
    return Math.max(0, Math.floor(remaining / 1000));
  }

  /**
   * Clear all countdown items
   */
  clear(): void {
    this.items.clear();
    this.stopInterval();
  }

  /**
   * Get active countdown count (for debugging)
   */
  getActiveCount(): number {
    return this.items.size;
  }

  /**
   * Get performance statistics
   */
  getStats(): typeof this.stats {
    return { ...this.stats, activeCount: this.items.size };
  }

  /**
   * Force cleanup of expired items
   */
  private cleanupExpiredItems(): number {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [id, item] of this.items.entries()) {
      if (item.expiresAt <= now) {
        expiredIds.push(id);
      }
    }

    for (const id of expiredIds) {
      this.items.delete(id);
    }

    this.stats.totalExpired += expiredIds.length;
    this.stats.activeCount = this.items.size;

    return expiredIds.length;
  }

  private startInterval(): void {
    if (this.interval) return;

    this.interval = setInterval(() => {
      const now = Date.now();
      const expiredIds: string[] = [];

      // Update all items
      for (const [id, item] of this.items.entries()) {
        const remaining = Math.max(0, Math.floor((item.expiresAt - now) / 1000));
        
        if (remaining > 0) {
          item.callback(remaining);
        } else {
          expiredIds.push(id);
          item.onExpired?.();
        }
      }

      // Remove expired items
      for (const id of expiredIds) {
        this.items.delete(id);
        this.stats.totalExpired++;
      }

      this.stats.activeCount = this.items.size;

      // Stop interval if no items remain
      if (this.items.size === 0) {
        this.stopInterval();
      }
    }, this.UPDATE_INTERVAL);
  }

  private stopInterval(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Cleanup on app unmount
   */
  destroy(): void {
    this.clear();
    this.stats = {
      totalRegistered: 0,
      totalExpired: 0,
      activeCount: 0,
      maxConcurrent: 0,
    };
  }
}

// Global singleton instance
const countdownManager = new CountdownManager();

export default countdownManager;

// Cleanup on window unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    countdownManager.destroy();
  });
}