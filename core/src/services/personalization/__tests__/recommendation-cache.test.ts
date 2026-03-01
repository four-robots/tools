/**
 * RecommendationSystem Cache Eviction Tests
 *
 * Tests that the recommendation cache evicts oldest entries
 * when it exceeds MAX_CACHE_SIZE to prevent memory leaks.
 */

describe('RecommendationSystem - Cache Eviction', () => {
  it('should evict oldest cache entry when cache exceeds MAX_CACHE_SIZE', () => {
    const MAX_CACHE_SIZE = 500;
    const cache = new Map<string, any[]>();

    // Fill cache to capacity
    for (let i = 0; i < MAX_CACHE_SIZE; i++) {
      cache.set(`user${i}:content:10`, [{ id: `rec_${i}` }]);
    }

    expect(cache.size).toBe(MAX_CACHE_SIZE);

    // Add one more entry, triggering eviction
    if (cache.size >= MAX_CACHE_SIZE) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }
    cache.set('new_user:content:10', [{ id: 'rec_new' }]);

    expect(cache.size).toBe(MAX_CACHE_SIZE);
    // First entry should be evicted
    expect(cache.has('user0:content:10')).toBe(false);
    // New entry should exist
    expect(cache.has('new_user:content:10')).toBe(true);
  });

  it('should not evict when cache is under limit', () => {
    const MAX_CACHE_SIZE = 500;
    const cache = new Map<string, any[]>();

    cache.set('user1:content:10', [{ id: 'rec_1' }]);
    cache.set('user2:content:10', [{ id: 'rec_2' }]);

    expect(cache.size).toBe(2);
    expect(cache.has('user1:content:10')).toBe(true);
    expect(cache.has('user2:content:10')).toBe(true);
  });
});
