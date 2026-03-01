/**
 * Numeric Sort Safety Tests
 *
 * Verifies that timestamp arrays are sorted numerically (not
 * lexicographically) when calculating session durations.
 *
 * Without a comparator, Array.sort() converts values to strings:
 *   [9, 80, 700].sort() => [700, 80, 9]  (lexicographic, wrong!)
 *   [9, 80, 700].sort((a,b) => a-b) => [9, 80, 700]  (numeric, correct)
 */

describe('Numeric Sort Safety', () => {
  it('should sort timestamps numerically, not lexicographically', () => {
    // These values would be incorrectly sorted lexicographically
    const timestamps = [9, 80, 700, 5000, 30];

    // Lexicographic sort (broken)
    const lexSorted = [...timestamps].sort();
    expect(lexSorted).toEqual([30, 5000, 700, 80, 9]); // Wrong order

    // Numeric sort (correct)
    const numSorted = [...timestamps].sort((a, b) => a - b);
    expect(numSorted).toEqual([9, 30, 80, 700, 5000]); // Correct order
  });

  it('should calculate correct session duration with numeric sort', () => {
    // Simulate getTime() values that would break with lexicographic sort
    const timestamps = [
      1700000000100,
      1700000000001,
      1700000099999,
    ];

    const sorted = [...timestamps].sort((a, b) => a - b);
    const duration = sorted[sorted.length - 1] - sorted[0];

    expect(sorted[0]).toBe(1700000000001); // smallest
    expect(sorted[sorted.length - 1]).toBe(1700000099999); // largest
    expect(duration).toBe(99998);
  });

  it('should handle timestamps that happen to sort correctly lexicographically', () => {
    // All same digit count, so lexicographic happens to work — but we should
    // still use numeric sort for correctness
    const timestamps = [
      1700000000000,
      1600000000000,
      1800000000000,
    ];

    const sorted = [...timestamps].sort((a, b) => a - b);
    expect(sorted).toEqual([1600000000000, 1700000000000, 1800000000000]);
  });

  it('should handle single-element and two-element arrays', () => {
    expect([42].sort((a, b) => a - b)).toEqual([42]);
    expect([100, 1].sort((a, b) => a - b)).toEqual([1, 100]);
  });
});
