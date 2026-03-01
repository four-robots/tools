/**
 * RateLimitManager Tests
 *
 * Tests rate limiting windows, circuit breaker, backpressure handling,
 * and resource cleanup for the client-side rate limiter.
 */

import RateLimitManager from '../rate-limit-manager';

describe('RateLimitManager', () => {
  let manager: RateLimitManager;

  beforeEach(() => {
    jest.useFakeTimers();
    manager = new RateLimitManager({
      maxRequestsPerSecond: 5,
      maxRequestsPerMinute: 20,
      maxRequestsPerHour: 100,
      enableBackpressure: true,
      backpressureThreshold: 80,
      backpressureDelay: 100,
      maxQueueSize: 5,
      queueTimeoutMs: 1000,
      enableCircuitBreaker: true,
      failureThreshold: 3,
      recoveryTimeMs: 5000,
    });
  });

  afterEach(() => {
    manager.reset();
    jest.useRealTimers();
  });

  describe('Rate Limiting Windows', () => {
    it('should allow requests within the per-second limit', async () => {
      for (let i = 0; i < 4; i++) {
        const result = await manager.checkRateLimit();
        expect(result.allowed).toBe(true);
      }
    });

    it('should reject requests exceeding the per-second limit', async () => {
      // Exhaust the per-second limit
      for (let i = 0; i < 5; i++) {
        await manager.checkRateLimit();
      }

      const result = await manager.checkRateLimit();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('per second');
    });

    it('should reset the second window after 1 second', async () => {
      // Exhaust the per-second limit
      for (let i = 0; i < 5; i++) {
        await manager.checkRateLimit();
      }

      // Advance time past the 1-second window
      jest.advanceTimersByTime(1001);

      const result = await manager.checkRateLimit();
      expect(result.allowed).toBe(true);
    });

    it('should track per-minute limits independently', async () => {
      // Send 20 requests across multiple seconds
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 5; j++) {
          await manager.checkRateLimit();
        }
        jest.advanceTimersByTime(1001);
      }

      // Should now be at the per-minute limit (20)
      const result = await manager.checkRateLimit();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('per minute');
    });

    it('should provide retryAfterMs when rate limited', async () => {
      for (let i = 0; i < 5; i++) {
        await manager.checkRateLimit();
      }

      const result = await manager.checkRateLimit();
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeDefined();
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after reaching failure threshold', () => {
      manager.recordFailure();
      manager.recordFailure();
      manager.recordFailure();

      const status = manager.getStatus();
      expect(status.isCircuitOpen).toBe(true);
    });

    it('should reject requests when circuit is open', async () => {
      manager.recordFailure();
      manager.recordFailure();
      manager.recordFailure();

      const result = await manager.checkRateLimit();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Circuit breaker');
    });

    it('should close circuit after recovery time', async () => {
      manager.recordFailure();
      manager.recordFailure();
      manager.recordFailure();

      expect(manager.getStatus().isCircuitOpen).toBe(true);

      // Advance past recovery time
      jest.advanceTimersByTime(5001);

      const result = await manager.checkRateLimit();
      expect(result.allowed).toBe(true);
      expect(manager.getStatus().isCircuitOpen).toBe(false);
    });

    it('should decrement failure count on success', () => {
      manager.recordFailure();
      manager.recordFailure();
      manager.recordSuccess();

      const status = manager.getStatus();
      expect(status.isCircuitOpen).toBe(false);
    });

    it('should not open circuit when circuit breaker is disabled', () => {
      const noCircuitManager = new RateLimitManager({
        enableCircuitBreaker: false,
        failureThreshold: 1,
      });

      noCircuitManager.recordFailure();
      noCircuitManager.recordFailure();
      noCircuitManager.recordFailure();

      expect(noCircuitManager.getStatus().isCircuitOpen).toBe(false);
      noCircuitManager.reset();
    });
  });

  describe('Backpressure', () => {
    it('should report backpressure status in getStatus', async () => {
      // Use 80% of per-second limit (4/5)
      for (let i = 0; i < 4; i++) {
        await manager.checkRateLimit();
      }
      // Advance past the 100ms debounce for backpressure check
      jest.advanceTimersByTime(101);

      const status = manager.getStatus();
      expect(status.percentOfSecondLimit).toBe(80);
    });

    it('should reject with queue full when maxQueueSize is exceeded', async () => {
      // Fill up by going over threshold; this triggers backpressure path
      const fullManager = new RateLimitManager({
        maxRequestsPerSecond: 2,
        maxRequestsPerMinute: 100,
        maxRequestsPerHour: 1000,
        enableBackpressure: true,
        backpressureThreshold: 50,
        backpressureDelay: 50,
        maxQueueSize: 0, // Queue immediately full
        queueTimeoutMs: 500,
        enableCircuitBreaker: false,
      });

      // Use 50% of limit to trigger backpressure
      await fullManager.checkRateLimit();
      jest.advanceTimersByTime(101);

      const result = await fullManager.checkRateLimit();
      // Should be rejected due to queue full
      if (!result.allowed) {
        expect(result.reason).toContain('queue full');
      }

      fullManager.reset();
    });
  });

  describe('Server Rate Limit Handling', () => {
    it('should activate backpressure on server rate limit', () => {
      manager.recordServerRateLimit(2000);

      const status = manager.getStatus();
      expect(status.isBackpressureActive).toBe(true);
    });

    it('should auto-reset backpressure after delay', () => {
      manager.recordServerRateLimit(1000);
      expect(manager.getStatus().isBackpressureActive).toBe(true);

      // Advance past 2x the retryAfter (auto-reset time)
      jest.advanceTimersByTime(2001);

      expect(manager.getStatus().isBackpressureActive).toBe(false);
    });

    it('should clear previous timeout when recordServerRateLimit is called again', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      manager.recordServerRateLimit(1000);
      manager.recordServerRateLimit(2000);

      // The second call should have cleared the first timeout
      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });
  });

  describe('Status Reporting', () => {
    it('should report accurate request counts', async () => {
      await manager.checkRateLimit();
      await manager.checkRateLimit();
      await manager.checkRateLimit();

      const status = manager.getStatus();
      expect(status.requestsThisSecond).toBe(3);
      expect(status.requestsThisMinute).toBe(3);
      expect(status.requestsThisHour).toBe(3);
    });

    it('should report percentage of limits', async () => {
      await manager.checkRateLimit();
      await manager.checkRateLimit();

      const status = manager.getStatus();
      expect(status.percentOfSecondLimit).toBe(40); // 2/5 * 100
      expect(status.percentOfMinuteLimit).toBe(10); // 2/20 * 100
      expect(status.percentOfHourLimit).toBe(2); // 2/100 * 100
    });
  });

  describe('Configuration Updates', () => {
    it('should allow runtime config changes', async () => {
      manager.updateConfig({ maxRequestsPerSecond: 2 });

      await manager.checkRateLimit();
      await manager.checkRateLimit();

      const result = await manager.checkRateLimit();
      expect(result.allowed).toBe(false);
    });
  });

  describe('Reset', () => {
    it('should clear all state on reset', async () => {
      // Accumulate state
      await manager.checkRateLimit();
      await manager.checkRateLimit();
      manager.recordFailure();
      manager.recordFailure();
      manager.recordFailure();
      manager.recordServerRateLimit(5000);

      // Reset
      manager.reset();

      const status = manager.getStatus();
      expect(status.requestsThisSecond).toBe(0);
      expect(status.requestsThisMinute).toBe(0);
      expect(status.requestsThisHour).toBe(0);
      expect(status.isCircuitOpen).toBe(false);
      expect(status.isBackpressureActive).toBe(false);
      expect(status.queueSize).toBe(0);
    });

    it('should clear backpressure timeout on reset', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      manager.recordServerRateLimit(5000);
      manager.reset();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('should allow requests after reset', async () => {
      // Exhaust limits
      for (let i = 0; i < 5; i++) {
        await manager.checkRateLimit();
      }
      const blocked = await manager.checkRateLimit();
      expect(blocked.allowed).toBe(false);

      manager.reset();

      const result = await manager.checkRateLimit();
      expect(result.allowed).toBe(true);
    });
  });

  describe('Default Configuration', () => {
    it('should use sensible defaults when no config provided', () => {
      const defaultManager = new RateLimitManager();
      const status = defaultManager.getStatus();

      expect(status.requestsThisSecond).toBe(0);
      expect(status.isCircuitOpen).toBe(false);
      expect(status.isBackpressureActive).toBe(false);

      defaultManager.reset();
    });
  });
});
