/**
 * PredictiveAnalytics Service Tests
 *
 * Tests divide-by-zero safety in seasonality analysis and burnout
 * risk calculation when all data point values are zero.
 */

import { PredictiveAnalyticsService } from '../PredictiveAnalytics';

const mockPool = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
} as any;

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
} as any;

describe('PredictiveAnalyticsService', () => {
  let service: PredictiveAnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PredictiveAnalyticsService(mockPool, mockRedis);
  });

  describe('Edge Cases - Divide-by-Zero Safety', () => {
    it('should handle zero-value workload data in burnout risk calculation', () => {
      const calculateBurnoutRisk = (service as any).calculateBurnoutRisk.bind(service);

      // All zero values — historicalAverage would be 0
      const zeroWorkload = Array.from({ length: 14 }, (_, i) => ({
        timestamp: new Date(2024, 0, i + 1),
        value: 0,
      }));

      const result = calculateBurnoutRisk(zeroWorkload, 0.5);

      // Should produce a finite number, not Infinity or NaN
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('should handle zero-value task completions in seasonality analysis', () => {
      const analyzeSeasonality = (service as any).analyzeSeasonality.bind(service);

      // All zero-value completions — avgWeeklyActivity would be 0
      const zeroPatternData = {
        taskCompletions: Array.from({ length: 14 }, (_, i) => ({
          timestamp: new Date(2024, 0, i + 1),
          value: 0,
        })),
        activityLevels: [],
        productivityScores: [],
        workingSessions: [],
        breakPatterns: [],
      };

      const result = analyzeSeasonality(zeroPatternData);

      // Should return finite numbers, not NaN
      expect(Number.isFinite(result.dayOfWeek)).toBe(true);
      expect(Number.isFinite(result.timeOfMonth)).toBe(true);
      // Default multiplier should be 1 when no activity data
      expect(result.dayOfWeek).toBe(1);
    });

    it('should handle normal workload data correctly', () => {
      const calculateBurnoutRisk = (service as any).calculateBurnoutRisk.bind(service);

      const normalWorkload = Array.from({ length: 14 }, (_, i) => ({
        timestamp: new Date(2024, 0, i + 1),
        value: 5 + Math.random() * 5, // 5-10 tasks per day
      }));

      const result = calculateBurnoutRisk(normalWorkload, 0.3);

      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });
  });
});
