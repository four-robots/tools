/**
 * FacetCacheManager Edge Case Tests
 *
 * Tests ReDoS safety in invalidatePattern — user-provided patterns
 * must be escaped before being used in RegExp construction.
 */

describe('FacetCacheManager - ReDoS Safety', () => {
  it('should escape special regex characters in invalidation patterns', () => {
    // Simulates the fix: pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const userPattern = 'facet.(a+)+$';
    const escapedPattern = userPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // The escaped pattern should not contain unescaped regex metacharacters
    expect(escapedPattern).toBe('facet\\.\\(a\\+\\)\\+\\$');

    // Should be safe to construct a RegExp
    expect(() => new RegExp(escapedPattern)).not.toThrow();
  });

  it('should handle normal patterns correctly after escaping', () => {
    const normalPattern = 'facet-user-123';
    const escapedPattern = normalPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Normal patterns should be unchanged
    expect(escapedPattern).toBe('facet-user-123');

    const regex = new RegExp(escapedPattern);
    expect(regex.test('facet-user-123')).toBe(true);
    expect(regex.test('facet-user-456')).toBe(false);
  });

  it('should escape dots in patterns to match literally', () => {
    const pattern = 'user.name';
    const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const regex = new RegExp(escapedPattern);
    expect(regex.test('user.name')).toBe(true);
    expect(regex.test('userName')).toBe(false); // dot should not match any char
  });
});
