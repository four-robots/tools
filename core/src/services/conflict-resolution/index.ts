/**
 * Conflict Resolution Services - Comprehensive conflict resolution system
 * 
 * Export all conflict resolution services for the MCP Tools platform.
 * This module provides intelligent merge strategies, real-time conflict detection,
 * operational transformation, AI-assisted resolution, and interactive resolution
 * sessions for collaborative environments.
 */

// Core conflict resolution services
export { ConflictDetectionService } from './conflict-detection-service.js';
export { MergeStrategyEngine } from './merge-strategy-engine.js';
export { OperationalTransformEngine } from './operational-transform-engine.js';
export { ConflictResolutionOrchestrator } from './conflict-resolution-orchestrator.js';
export { ConflictNotificationService } from './conflict-notification-service.js';
export { AIAssistedMergeService } from './ai-assisted-merge-service.js';

// Re-export types for convenience
export * from '../../shared/types/conflict-resolution.js';