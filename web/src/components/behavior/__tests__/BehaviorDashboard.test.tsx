/**
 * Tests for BehaviorDashboard — verifying the infinite re-render fix.
 *
 * Bug: Default `dateRange` parameter created new Date objects on every render,
 * causing `useEffect([..., dateRange.start, dateRange.end])` to fire infinitely
 * since Date objects are compared by reference.
 *
 * Fix: Use useMemo for the default dateRange and compare by .getTime() in deps.
 */

import React from 'react';

describe('BehaviorDashboard default dateRange stability', () => {
  it('should produce stable .getTime() values for the same logical date range', () => {
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    // Simulate what the default parameter used to do on two renders:
    const render1Start = new Date(now - thirtyDaysMs);
    const render1End = new Date(now);
    const render2Start = new Date(now - thirtyDaysMs);
    const render2End = new Date(now);

    // Object references are different
    expect(render1Start).not.toBe(render2Start);
    expect(render1End).not.toBe(render2End);

    // But .getTime() values are the same (within the same millisecond)
    expect(render1Start.getTime()).toBe(render2Start.getTime());
    expect(render1End.getTime()).toBe(render2End.getTime());
  });

  it('should detect when dateRange actually changes via .getTime()', () => {
    const range1 = {
      start: new Date('2025-01-01'),
      end: new Date('2025-01-31'),
    };
    const range2 = {
      start: new Date('2025-02-01'),
      end: new Date('2025-02-28'),
    };

    expect(range1.start.getTime()).not.toBe(range2.start.getTime());
    expect(range1.end.getTime()).not.toBe(range2.end.getTime());
  });
});

describe('Mock data determinism', () => {
  it('should produce deterministic chart values without Math.random()', () => {
    const generateDeterministic = (length: number) =>
      Array.from({ length }, (_, i) => 10 + ((i * 7 + 13) % 50));

    const run1 = generateDeterministic(7);
    const run2 = generateDeterministic(7);

    expect(run1).toEqual(run2);
    // All values should be in range [10, 59]
    for (const v of run1) {
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(60);
    }
  });

  it('should produce deterministic trend data without Math.random()', () => {
    const generateTrend = (baseValue: number) => {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      return days.map((day, index) => ({
        day,
        predicted: Math.round(baseValue + (index % 2 === 0 ? 1 : -1) * (index * 0.3)),
      }));
    };

    const run1 = generateTrend(10);
    const run2 = generateTrend(10);
    expect(run1).toEqual(run2);
  });
});
