/**
 * Tests verifying .substr() → .substring() migration correctness
 *
 * .substr(start, length) uses (start, length) semantics
 * .substring(start, end) uses (start, end) semantics
 *
 * Migration mapping:
 *   .substr(2, 9)  → .substring(2, 11)   // start=2, end=2+9=11
 *   .substr(2, 5)  → .substring(2, 7)    // start=2, end=2+5=7
 *   .substr(2, 4)  → .substring(2, 6)    // start=2, end=2+4=6
 *   .substr(0, 2)  → .substring(0, 2)    // start=0, end=0+2=2
 *   .substr(2, 2)  → .substring(2, 4)    // start=2, end=2+2=4
 *   .substr(4, 2)  → .substring(4, 6)    // start=4, end=4+2=6
 */

describe('substring migration correctness', () => {
  describe('random ID generation patterns', () => {
    it('should produce equivalent results for .substr(2, 9) and .substring(2, 11)', () => {
      const base = Math.random().toString(36);
      const substrResult = base.substr(2, 9);
      const substringResult = base.substring(2, 11);
      expect(substringResult).toBe(substrResult);
      expect(substringResult.length).toBeLessThanOrEqual(9);
    });

    it('should produce equivalent results for .substr(2, 5) and .substring(2, 7)', () => {
      const base = Math.random().toString(36);
      const substrResult = base.substr(2, 5);
      const substringResult = base.substring(2, 7);
      expect(substringResult).toBe(substrResult);
      expect(substringResult.length).toBeLessThanOrEqual(5);
    });

    it('should produce equivalent results for .substr(2, 4) and .substring(2, 6)', () => {
      const base = Math.random().toString(36);
      const substrResult = base.substr(2, 4);
      const substringResult = base.substring(2, 6);
      expect(substringResult).toBe(substrResult);
      expect(substringResult.length).toBeLessThanOrEqual(4);
    });

    it('should generate valid ID strings', () => {
      const id = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      expect(id).toMatch(/^sub_\d+_[a-z0-9]+$/);
    });
  });

  describe('hex color parsing pattern', () => {
    it('should produce equivalent results for hex substring extraction', () => {
      const hex = 'ff8800';

      // .substr(start, length) → .substring(start, end)
      expect(hex.substring(0, 2)).toBe(hex.substr(0, 2)); // 'ff'
      expect(hex.substring(2, 4)).toBe(hex.substr(2, 2)); // '88'
      expect(hex.substring(4, 6)).toBe(hex.substr(4, 2)); // '00'
    });

    it('should correctly parse RGB components from hex string', () => {
      const hex = 'ff8800';
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);

      expect(r).toBe(255);
      expect(g).toBe(136);
      expect(b).toBe(0);
    });

    it('should handle contrasting text color calculation', () => {
      const getContrastingTextColor = (bgColor: string): string => {
        const hex = bgColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return brightness > 128 ? '#000000' : '#ffffff';
      };

      // Light background → dark text
      expect(getContrastingTextColor('#ffffff')).toBe('#000000');
      expect(getContrastingTextColor('#ffff00')).toBe('#000000');

      // Dark background → light text
      expect(getContrastingTextColor('#000000')).toBe('#ffffff');
      expect(getContrastingTextColor('#003366')).toBe('#ffffff');
    });
  });

  describe('consistency across multiple invocations', () => {
    it('should always produce alphanumeric strings', () => {
      for (let i = 0; i < 100; i++) {
        const result = Math.random().toString(36).substring(2, 11);
        expect(result).toMatch(/^[a-z0-9]+$/);
        expect(result.length).toBeGreaterThan(0);
        expect(result.length).toBeLessThanOrEqual(9);
      }
    });
  });
});
