/**
 * Tests for division-by-zero safety patterns.
 *
 * Bug: Dividing by a value that can legitimately be zero produces
 * Infinity or NaN, which silently corrupts downstream calculations
 * and comparisons (e.g., NaN > threshold is always false).
 *
 * Fix: Guard against zero divisors before performing division.
 */

import { describe, it, expect } from 'vitest';

describe('division by zero safety', () => {
  describe('NaN and Infinity propagation', () => {
    it('should demonstrate NaN from 0/0', () => {
      expect(Number.isNaN(0 / 0)).toBe(true);
    });

    it('should demonstrate Infinity from n/0', () => {
      expect(5 / 0).toBe(Infinity);
      expect(-5 / 0).toBe(-Infinity);
    });

    it('should demonstrate NaN poisoning in Math.min', () => {
      expect(Number.isNaN(Math.min(NaN, 1.0))).toBe(true);
    });

    it('should demonstrate Infinity in comparisons', () => {
      // Infinity > any finite number is true — causes false alerts
      expect(Infinity > 100).toBe(true);
      expect(Infinity > 1000000).toBe(true);
    });
  });

  describe('answer completeness with short-word questions', () => {
    const calculateAnswerCompleteness = (answer: string, question: string): number => {
      const questionWords = question.toLowerCase().split(/\s+/).filter(word => word.length > 3);
      const answerWords = answer.toLowerCase().split(/\s+/);

      const addressedConcepts = questionWords.filter(word => answerWords.includes(word)).length;
      if (questionWords.length === 0) return 0;
      return Math.min(addressedConcepts / questionWords.length, 1.0);
    };

    it('should return 0 for questions with only short words', () => {
      // All words are ≤3 characters — questionWords is empty after filter
      const result = calculateAnswerCompleteness('some answer', 'how do I do it?');
      expect(result).toBe(0);
      expect(Number.isNaN(result)).toBe(false);
    });

    it('should return 0 for single-character question', () => {
      const result = calculateAnswerCompleteness('yes', 'a?');
      expect(result).toBe(0);
      expect(Number.isNaN(result)).toBe(false);
    });

    it('should calculate correctly for questions with long words', () => {
      const result = calculateAnswerCompleteness(
        'TypeScript supports strong typing',
        'What is TypeScript?'
      );
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(1.0);
      expect(Number.isFinite(result)).toBe(true);
    });
  });

  describe('rate of change with zero previous value', () => {
    const evaluateRateOfChange = (currentValue: number, previousValue: number | null): number | null => {
      if (previousValue === null || previousValue === 0) return null;
      return Math.abs((currentValue - previousValue) / previousValue) * 100;
    };

    it('should return null when previous value is zero', () => {
      expect(evaluateRateOfChange(10, 0)).toBeNull();
    });

    it('should return null when previous value is null', () => {
      expect(evaluateRateOfChange(10, null)).toBeNull();
    });

    it('should calculate correctly for non-zero previous value', () => {
      // 50% change: |20 - 10| / 10 * 100 = 100
      expect(evaluateRateOfChange(20, 10)).toBe(100);
    });

    it('should handle negative values correctly', () => {
      // |(-5) - (-10)| / |-10| * 100 = 50
      expect(evaluateRateOfChange(-5, -10)).toBe(50);
    });
  });

  describe('safe division helper pattern', () => {
    const safeDivide = (numerator: number, denominator: number, fallback = 0): number => {
      if (denominator === 0) return fallback;
      return numerator / denominator;
    };

    it('should return fallback when dividing by zero', () => {
      expect(safeDivide(10, 0)).toBe(0);
      expect(safeDivide(10, 0, -1)).toBe(-1);
    });

    it('should divide normally for non-zero denominator', () => {
      expect(safeDivide(10, 2)).toBe(5);
      expect(safeDivide(7, 3)).toBeCloseTo(2.333, 2);
    });
  });
});
