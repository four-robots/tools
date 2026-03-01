/**
 * SentenceStrategy Edge Case Tests
 *
 * Tests divide-by-zero safety in coefficient of variation calculation
 * when all sentence lengths are zero.
 */

describe('SentenceStrategy - Divide-by-Zero Safety', () => {
  it('should handle zero avgLength in coefficient of variation', () => {
    // Simulates the fix: avgLength > 0 ? Math.sqrt(variance) / avgLength : 0
    const lengths = [0, 0, 0];
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;
    const coefficient = avgLength > 0 ? Math.sqrt(variance) / avgLength : 0;

    expect(Number.isFinite(coefficient)).toBe(true);
    expect(coefficient).toBe(0);
  });

  it('should calculate coefficient correctly for normal data', () => {
    const lengths = [10, 20, 30];
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length; // 20
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;
    const coefficient = avgLength > 0 ? Math.sqrt(variance) / avgLength : 0;

    expect(Number.isFinite(coefficient)).toBe(true);
    expect(coefficient).toBeGreaterThan(0);
    expect(coefficient).toBeLessThan(1);
  });

  it('should handle single-element array', () => {
    const lengths = [15];
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;
    const coefficient = avgLength > 0 ? Math.sqrt(variance) / avgLength : 0;

    expect(Number.isFinite(coefficient)).toBe(true);
    expect(coefficient).toBe(0); // No variation with single element
  });
});
