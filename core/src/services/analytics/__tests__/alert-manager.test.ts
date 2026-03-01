/**
 * Alert Manager Tests
 *
 * Tests escalation timeout safety, alert rule validation,
 * and the fire-and-forget async fixes in setTimeout callbacks.
 */

// Mock dependencies before imports
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../utils/database', () => ({
  DatabaseConnection: jest.fn(),
}));

import { AlertManager } from '../alert-manager';

// Mock database connection
const mockDb = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
  connect: jest.fn(),
} as any;

describe('AlertManager', () => {
  let alertManager: AlertManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    alertManager = new AlertManager(mockDb);
  });

  afterEach(() => {
    // Clean up intervals and timeouts
    alertManager.removeAllListeners();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Escalation Safety', () => {
    it('should handle escalation of non-existent alert gracefully', async () => {
      // escalateAlert is async — when called from setTimeout,
      // its rejection must be caught. This test verifies the method
      // itself handles missing alerts without throwing.
      await expect(
        alertManager.escalateAlert('non-existent', 0)
      ).resolves.toBeUndefined();
    });

    it('should handle escalation with exceeded level gracefully', async () => {
      await expect(
        alertManager.escalateAlert('any-id', 999)
      ).resolves.toBeUndefined();
    });
  });

  describe('Alert Rule Validation', () => {
    it('should reject rules with empty name', () => {
      expect(() =>
        (alertManager as any).validateAlertRule({
          name: '',
          condition: { metric: 'cpu', operator: 'greater_than', threshold: 90, duration: 60, type: 'threshold' },
          actions: [{ type: 'email', target: 'admin@test.com' }],
        })
      ).toThrow('Alert rule name is required');
    });

    it('should reject rules with empty metric', () => {
      expect(() =>
        (alertManager as any).validateAlertRule({
          name: 'Valid Name',
          condition: { metric: '', operator: 'greater_than', threshold: 90, duration: 60, type: 'threshold' },
          actions: [{ type: 'email', target: 'admin@test.com' }],
        })
      ).toThrow('Alert rule metric is required');
    });

    it('should reject threshold rules without threshold value', () => {
      expect(() =>
        (alertManager as any).validateAlertRule({
          name: 'Valid Name',
          condition: { metric: 'cpu', type: 'threshold', duration: 60 },
          actions: [{ type: 'email', target: 'admin@test.com' }],
        })
      ).toThrow('Threshold alerts require threshold value and operator');
    });

    it('should reject rules with no actions', () => {
      expect(() =>
        (alertManager as any).validateAlertRule({
          name: 'Valid Name',
          condition: { metric: 'cpu', operator: 'greater_than', threshold: 90, duration: 60, type: 'threshold' },
          actions: [],
        })
      ).toThrow('Alert rule must have at least one action');
    });

    it('should reject actions without type or target', () => {
      expect(() =>
        (alertManager as any).validateAlertRule({
          name: 'Valid Name',
          condition: { metric: 'cpu', operator: 'greater_than', threshold: 90, duration: 60, type: 'threshold' },
          actions: [{ type: '', target: '' }],
        })
      ).toThrow('Alert action must have type and target');
    });
  });
});
