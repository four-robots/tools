/**
 * Gateway Search Service Tests
 *
 * Tests the off-by-one fix in checkServiceAvailability where
 * totalAvailable was miscounted using filter(Boolean).length - 1.
 */

import { createSearchService, validateSearchServiceRequirements, type GatewayAppLocals } from '../search-service';

describe('Gateway Search Service', () => {
  describe('Service Availability - Off-by-One Fix', () => {
    it('should count 0 services when none are provided', () => {
      const appLocals: GatewayAppLocals = {};
      const result = validateSearchServiceRequirements(appLocals);

      expect(result.isValid).toBe(false);
      expect(result.missingServices).toHaveLength(4);
    });

    it('should count exactly 1 service when only memory is provided', () => {
      const appLocals: GatewayAppLocals = {
        memoryService: { search: jest.fn() } as any,
      };
      const result = validateSearchServiceRequirements(appLocals);

      expect(result.isValid).toBe(true);
      expect(result.missingServices).toHaveLength(3);
    });

    it('should count exactly 2 services when memory and kanban are provided', () => {
      const appLocals: GatewayAppLocals = {
        memoryService: { search: jest.fn() } as any,
        kanbanService: { search: jest.fn() } as any,
      };
      const result = validateSearchServiceRequirements(appLocals);

      expect(result.isValid).toBe(true);
      expect(result.missingServices).toHaveLength(2);
    });

    it('should count all 4 services when all are provided', () => {
      const appLocals: GatewayAppLocals = {
        memoryService: { search: jest.fn() } as any,
        kanbanService: { search: jest.fn() } as any,
        wikiService: { search: jest.fn() } as any,
        scraperService: { searchScrapedContent: jest.fn() } as any,
      };
      const result = validateSearchServiceRequirements(appLocals);

      expect(result.isValid).toBe(true);
      expect(result.missingServices).toHaveLength(0);
    });

    it('should return null when no services are available', () => {
      const appLocals: GatewayAppLocals = {};
      const result = createSearchService(appLocals);

      expect(result).toBeNull();
    });
  });
});
