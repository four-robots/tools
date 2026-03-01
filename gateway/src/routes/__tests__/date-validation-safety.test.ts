/**
 * Tests for date validation safety patterns.
 *
 * Bug: `new Date(userInput)` produces `Invalid Date` when input is malformed.
 * `Invalid Date` is truthy but `.getTime()` returns NaN, causing silent
 * failures in arithmetic comparisons (all comparisons with NaN are false).
 *
 * Fix: Always check `Number.isNaN(date.getTime())` after constructing
 * dates from user input.
 */

describe('date validation safety', () => {
  describe('Invalid Date detection', () => {
    it('should detect NaN from invalid date strings', () => {
      const invalidDates = [
        'not-a-date',
        '2025-13-01',  // month 13
        'undefined',
        '',
        'null',
        '12/34/5678',
      ];

      for (const str of invalidDates) {
        const date = new Date(str);
        expect(Number.isNaN(date.getTime())).toBe(true);
      }
    });

    it('should accept valid ISO 8601 date strings', () => {
      const validDates = [
        '2025-01-15',
        '2025-01-15T10:30:00Z',
        '2025-01-15T10:30:00.000Z',
        '2025-06-01T00:00:00+05:00',
      ];

      for (const str of validDates) {
        const date = new Date(str);
        expect(Number.isNaN(date.getTime())).toBe(false);
      }
    });
  });

  describe('NaN comparison behavior', () => {
    it('should demonstrate that NaN breaks comparisons silently', () => {
      const invalidDate = new Date('invalid');
      const validDate = new Date('2025-01-15');

      // All comparisons with NaN return false
      expect(invalidDate.getTime() < validDate.getTime()).toBe(false);
      expect(invalidDate.getTime() > validDate.getTime()).toBe(false);
      expect(invalidDate.getTime() === validDate.getTime()).toBe(false);

      // NaN arithmetic produces NaN
      expect(Number.isNaN(invalidDate.getTime() - validDate.getTime())).toBe(true);
    });

    it('should demonstrate Invalid Date is truthy', () => {
      const invalidDate = new Date('invalid');

      // Invalid Date is truthy — can't use truthiness to detect it
      expect(!!invalidDate).toBe(true);
      expect(invalidDate instanceof Date).toBe(true);

      // Must use getTime() + isNaN
      expect(Number.isNaN(invalidDate.getTime())).toBe(true);
    });
  });

  describe('safe date parsing pattern', () => {
    const safeParseDateRange = (fromStr?: string, toStr?: string) => {
      if (!fromStr || !toStr) return undefined;
      const from = new Date(fromStr);
      const to = new Date(toStr);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return undefined;
      }
      return { from, to };
    };

    it('should return undefined for invalid date strings', () => {
      expect(safeParseDateRange('invalid', '2025-01-15')).toBeUndefined();
      expect(safeParseDateRange('2025-01-15', 'invalid')).toBeUndefined();
      expect(safeParseDateRange('invalid', 'invalid')).toBeUndefined();
    });

    it('should return date range for valid date strings', () => {
      const result = safeParseDateRange('2025-01-01', '2025-01-31');
      expect(result).toBeDefined();
      expect(result!.from.getFullYear()).toBe(2025);
      expect(result!.to.getMonth()).toBe(0); // January
    });

    it('should return undefined for missing parameters', () => {
      expect(safeParseDateRange(undefined, '2025-01-15')).toBeUndefined();
      expect(safeParseDateRange('2025-01-15', undefined)).toBeUndefined();
    });
  });
});
