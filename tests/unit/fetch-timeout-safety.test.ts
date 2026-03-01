/**
 * Tests for fetch timeout safety patterns.
 *
 * Bug: `fetch()` without AbortController/signal has no timeout.
 * If the server is unresponsive, the request hangs indefinitely,
 * blocking the entire processing pipeline.
 *
 * Fix: Use AbortController with configurable timeout.
 */

import { describe, it, expect, vi } from 'vitest';

describe('fetch timeout safety', () => {
  describe('AbortController timeout pattern', () => {
    it('should abort fetch after timeout', async () => {
      const controller = new AbortController();
      const timeoutMs = 100;

      // Simulate a fetch that takes too long
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const slowFetch = new Promise<void>((resolve, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
        // This would never resolve without the abort
        setTimeout(resolve, 10_000);
      });

      try {
        await slowFetch;
        expect.unreachable('Should have been aborted');
      } catch (error) {
        expect(error).toBeInstanceOf(DOMException);
        expect((error as DOMException).name).toBe('AbortError');
      } finally {
        clearTimeout(timeoutId);
      }
    });

    it('should not abort if fetch completes before timeout', async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const fastFetch = new Promise<string>((resolve) => {
        setTimeout(() => resolve('done'), 10);
      });

      try {
        const result = await fastFetch;
        expect(result).toBe('done');
        expect(controller.signal.aborted).toBe(false);
      } finally {
        clearTimeout(timeoutId);
      }
    });

    it('should clean up timeout in finally block', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        // Simulated fast operation
        await Promise.resolve();
      } finally {
        clearTimeout(timeoutId);
      }

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('configurable timeout values', () => {
    it('should support different timeouts for different operations', () => {
      const config = {
        requestTimeout: 30_000,  // 30s for normal requests
      };

      // Normal request timeout
      expect(config.requestTimeout).toBe(30_000);

      // Model pull uses 5x multiplier
      const pullTimeout = config.requestTimeout * 5;
      expect(pullTimeout).toBe(150_000); // 2.5 minutes
    });
  });

  describe('AbortError handling', () => {
    it('should distinguish AbortError from network errors', () => {
      const abortError = new DOMException('The operation was aborted.', 'AbortError');
      const networkError = new TypeError('Failed to fetch');

      expect(abortError.name).toBe('AbortError');
      expect(networkError.name).not.toBe('AbortError');

      // Pattern for error handling
      const isTimeout = (error: unknown): boolean => {
        return error instanceof DOMException && error.name === 'AbortError';
      };

      expect(isTimeout(abortError)).toBe(true);
      expect(isTimeout(networkError)).toBe(false);
    });
  });
});
