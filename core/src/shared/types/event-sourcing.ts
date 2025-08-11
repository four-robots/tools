import { z } from 'zod';

// Base domain event interface
export interface DomainEvent {
  id: string;
  streamId: string;
  eventType: string;
  eventVersion: number;
  eventData: Record<string, unknown>;
  metadata: EventMetadata;
  timestamp: Date;
  sequenceNumber: number;
  causationId?: string;
  correlationId: string;
  tenantId?: string;
}

// Event metadata for tracking and debugging
export interface EventMetadata {
  userId?: string;
  userAgent?: string;
  ipAddress?: string;
  source: string;
  requestId?: string;
  sessionId?: string;
  workspaceId?: string;
  version: string;
  [key: string]: unknown;
}

// Event snapshot for performance optimization
export interface EventSnapshot {
  id: string;
  streamId: string;
  streamVersion: number;
  snapshotData: Record<string, unknown>;
  createdAt: Date;
}

// Event projection for read models
export interface EventProjection {
  id: string;
  projectionName: string;
  streamId: string;
  lastProcessedSequence: number;
  projectionData: Record<string, unknown>;
  updatedAt: Date;
}

// Saga instance for complex workflows
export interface SagaInstance {
  id: string;
  sagaType: string;
  sagaData: Record<string, unknown>;
  status: 'active' | 'completed' | 'cancelled' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// Event stream metadata
export interface EventStream {
  streamId: string;
  streamType: string;
  currentVersion: number;
  createdAt: Date;
  updatedAt: Date;
  tenantId?: string;
}

// Zod schemas for validation
export const EventMetadataSchema = z.object({
  userId: z.string().uuid().optional(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  source: z.string(),
  requestId: z.string().optional(),
  sessionId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  version: z.string(),
}).passthrough();

export const DomainEventSchema = z.object({
  id: z.string().uuid(),
  streamId: z.string().uuid(),
  eventType: z.string(),
  eventVersion: z.number().int().positive(),
  eventData: z.record(z.unknown()),
  metadata: EventMetadataSchema,
  timestamp: z.date(),
  sequenceNumber: z.number().int().positive(),
  causationId: z.string().uuid().optional(),
  correlationId: z.string().uuid(),
  tenantId: z.string().uuid().optional(),
});

export const EventSnapshotSchema = z.object({
  id: z.string().uuid(),
  streamId: z.string().uuid(),
  streamVersion: z.number().int().positive(),
  snapshotData: z.record(z.unknown()),
  createdAt: z.date(),
});

export const EventProjectionSchema = z.object({
  id: z.string().uuid(),
  projectionName: z.string(),
  streamId: z.string().uuid(),
  lastProcessedSequence: z.number().int().positive(),
  projectionData: z.record(z.unknown()),
  updatedAt: z.date(),
});

export const SagaInstanceSchema = z.object({
  id: z.string().uuid(),
  sagaType: z.string(),
  sagaData: z.record(z.unknown()),
  status: z.enum(['active', 'completed', 'cancelled', 'failed']),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().optional(),
});

export const EventStreamSchema = z.object({
  streamId: z.string().uuid(),
  streamType: z.string(),
  currentVersion: z.number().int().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date(),
  tenantId: z.string().uuid().optional(),
});

// Event handler type
export type EventHandler<T extends DomainEvent> = (event: T) => Promise<void>;

// Event processing result
export interface EventProcessingResult {
  success: boolean;
  error?: string;
  processedCount: number;
  skippedCount: number;
  failedCount: number;
}

// Event subscription configuration
export interface EventSubscription {
  id: string;
  subscriptionName: string;
  eventTypes: string[];
  streamFilter: Record<string, unknown>;
  handlerConfig: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const EventSubscriptionSchema = z.object({
  id: z.string().uuid(),
  subscriptionName: z.string(),
  eventTypes: z.array(z.string()),
  streamFilter: z.record(z.unknown()),
  handlerConfig: z.record(z.unknown()),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Time range for temporal queries
export interface TimeRange {
  start: Date;
  end: Date;
}

export const TimeRangeSchema = z.object({
  start: z.date(),
  end: z.date(),
});

// Audit trail entry
export interface AuditTrail {
  sessionId: string;
  events: DomainEvent[];
  participants: string[];
  summary: {
    totalEvents: number;
    eventTypes: Record<string, number>;
    duration: number;
    conflicts: number;
    resolutions: number;
  };
  timeline: AuditTimelineEntry[];
}

export interface AuditTimelineEntry {
  timestamp: Date;
  eventType: string;
  userId?: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  metadata: Record<string, unknown>;
}

export const AuditTrailSchema = z.object({
  sessionId: z.string().uuid(),
  events: z.array(DomainEventSchema),
  participants: z.array(z.string().uuid()),
  summary: z.object({
    totalEvents: z.number().int().nonnegative(),
    eventTypes: z.record(z.number().int().nonnegative()),
    duration: z.number().nonnegative(),
    conflicts: z.number().int().nonnegative(),
    resolutions: z.number().int().nonnegative(),
  }),
  timeline: z.array(z.object({
    timestamp: z.date(),
    eventType: z.string(),
    userId: z.string().uuid().optional(),
    description: z.string(),
    impact: z.enum(['low', 'medium', 'high']),
    metadata: z.record(z.unknown()),
  })),
});

// Event store configuration
export interface EventStoreConfig {
  snapshotFrequency: number;
  retentionPeriodDays: number;
  batchSize: number;
  maxRetries: number;
  partitionMaintenanceEnabled: boolean;
}

export const EventStoreConfigSchema = z.object({
  snapshotFrequency: z.number().int().positive(),
  retentionPeriodDays: z.number().int().positive(),
  batchSize: z.number().int().positive(),
  maxRetries: z.number().int().nonnegative(),
  partitionMaintenanceEnabled: z.boolean(),
});

// Error types for event sourcing
export class EventSourcingError extends Error {
  constructor(message: string, public code: string, public details?: unknown) {
    super(message);
    this.name = 'EventSourcingError';
  }
}

export class OptimisticConcurrencyError extends EventSourcingError {
  constructor(streamId: string, expectedVersion: number, actualVersion: number) {
    super(
      `Optimistic concurrency violation for stream ${streamId}. Expected version ${expectedVersion}, actual version ${actualVersion}`,
      'OPTIMISTIC_CONCURRENCY_VIOLATION',
      { streamId, expectedVersion, actualVersion }
    );
    this.name = 'OptimisticConcurrencyError';
  }
}

export class StreamNotFoundError extends EventSourcingError {
  constructor(streamId: string) {
    super(`Stream not found: ${streamId}`, 'STREAM_NOT_FOUND', { streamId });
    this.name = 'StreamNotFoundError';
  }
}

export class InvalidEventError extends EventSourcingError {
  constructor(message: string, event: unknown) {
    super(`Invalid event: ${message}`, 'INVALID_EVENT', { event });
    this.name = 'InvalidEventError';
  }
}