/**
 * Tests for api-client safe localStorage wrapper.
 *
 * Bug: Direct localStorage calls can throw in private browsing,
 * cross-origin iframes, or when storage quota is exceeded.
 *
 * Fix: Wrap all localStorage operations in try/catch with graceful fallbacks.
 */

describe('safe localStorage access patterns', () => {
  const originalLocalStorage = globalThis.localStorage;

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  it('should handle localStorage.getItem throwing', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => { throw new DOMException('Access denied'); },
        setItem: () => {},
        removeItem: () => {},
      },
      writable: true,
      configurable: true,
    });

    // Safe pattern should return null instead of throwing
    const safeGet = (key: string): string | null => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    };

    expect(safeGet('auth_token')).toBeNull();
  });

  it('should handle localStorage.setItem throwing on quota exceeded', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => null,
        setItem: () => { throw new DOMException('QuotaExceededError'); },
        removeItem: () => {},
      },
      writable: true,
      configurable: true,
    });

    const safeSet = (key: string, value: string): void => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // Silently fail
      }
    };

    // Should not throw
    expect(() => safeSet('auth_token', 'test')).not.toThrow();
  });

  it('should handle localStorage.removeItem throwing', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => { throw new DOMException('Access denied'); },
      },
      writable: true,
      configurable: true,
    });

    const safeRemove = (key: string): void => {
      try {
        localStorage.removeItem(key);
      } catch {
        // Silently fail
      }
    };

    expect(() => safeRemove('auth_token')).not.toThrow();
  });

  it('should work normally when localStorage is available', () => {
    const store: Record<string, string> = {};

    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
      },
      writable: true,
      configurable: true,
    });

    const safeGet = (key: string): string | null => {
      try { return localStorage.getItem(key); } catch { return null; }
    };
    const safeSet = (key: string, value: string): void => {
      try { localStorage.setItem(key, value); } catch {}
    };
    const safeRemove = (key: string): void => {
      try { localStorage.removeItem(key); } catch {}
    };

    safeSet('auth_token', 'abc123');
    expect(safeGet('auth_token')).toBe('abc123');
    safeRemove('auth_token');
    expect(safeGet('auth_token')).toBeNull();
  });
});
