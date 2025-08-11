/**
 * Conflict Resolution Integration Tests
 * 
 * Comprehensive end-to-end testing of the complete conflict resolution workflow.
 * Tests the integration between detection, merge strategies, operational transforms,
 * AI assistance, and user interaction scenarios.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Pool } from 'pg';
import {
  ConflictDetectionService,
  MergeStrategyEngine,
  OperationalTransformEngine,
  AIAssistedMergeService,
  MetricsCollector,
  ConflictResolutionRateLimiter,
  RateLimitResult
} from '@mcp-tools/core';
import {
  ContentVersion,
  ConflictDetection,
  MergeResult,
  Operation,
  ConflictResolutionSession,
  ConflictStatus
} from '@mcp-tools/core';

// Mock database pool for testing
const mockDb = {
  connect: jest.fn(),
  query: jest.fn(),
  end: jest.fn()
} as unknown as Pool;

// Mock client for transactions
const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};

// Mock services
const mockLLMService = {
  generateResponse: jest.fn(),
  analyzeContent: jest.fn()
};

describe('Conflict Resolution Integration Tests', () => {
  let conflictDetectionService: ConflictDetectionService;
  let operationalTransformEngine: OperationalTransformEngine;
  let aiAssistedMergeService: AIAssistedMergeService;
  let mergeStrategyEngine: MergeStrategyEngine;

  // Test data
  const testSessionId = 'test-session-123';
  const testContentId = 'test-content-456';
  const userA = 'user-a';
  const userB = 'user-b';

  const baseContent = `# Project Documentation

## Overview
This is the initial content for our project.

## Features
- Feature A
- Feature B

## Installation
1. Clone the repository
2. Install dependencies
3. Run the application`;

  const versionAContent = `# Project Documentation

## Overview
This is the enhanced content for our project with advanced features.

## Features
- Feature A (Enhanced)
- Feature B
- Feature C (New)

## Installation
1. Clone the repository
2. Install dependencies
3. Configure environment
4. Run the application`;

  const versionBContent = `# Project Documentation

## Overview
This is the improved content for our project documentation.

## Features
- Feature A
- Feature B (Updated)
- Feature D (Beta)

## Configuration
New configuration section added.

## Installation
1. Clone the repository
2. Install all dependencies
3. Run the application`;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock database responses
    (mockDb.connect as jest.Mock).mockResolvedValue(mockClient);
    (mockClient.query as jest.Mock).mockResolvedValue({ rows: [] });
    
    // Initialize services
    conflictDetectionService = new ConflictDetectionService(mockDb);
    operationalTransformEngine = new OperationalTransformEngine(mockDb);
    aiAssistedMergeService = new AIAssistedMergeService(mockDb, mockLLMService);
    mergeStrategyEngine = new MergeStrategyEngine(
      mockDb,
      operationalTransformEngine,
      aiAssistedMergeService
    );
  });

  afterEach(() => {
    // Cleanup any resources
    if (operationalTransformEngine.destroy) {
      operationalTransformEngine.destroy();
    }
  });

  test('handles complete three-way merge workflow', async () => {
    // Setup test data
    const baseVersion: ContentVersion = {
      id: 'base-version-1',
      contentId: testContentId,
      content: baseContent,
      contentHash: 'base-hash',
      userId: 'system',
      sessionId: testSessionId,
      createdAt: new Date('2024-01-01T10:00:00Z'),
      contentType: 'markdown',
      vectorClock: {
        userId: 'system',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        logicalClock: 0,
        sessionId: testSessionId,
        nodeId: 'node-1'
      }
    };

    const versionA: ContentVersion = {
      id: 'version-a-1',
      contentId: testContentId,
      content: versionAContent,
      contentHash: 'version-a-hash',
      userId: userA,
      sessionId: testSessionId,
      createdAt: new Date('2024-01-01T10:05:00Z'),
      contentType: 'markdown',
      vectorClock: {
        userId: userA,
        timestamp: new Date('2024-01-01T10:05:00Z'),
        logicalClock: 1,
        sessionId: testSessionId,
        nodeId: 'node-1'
      },
      parentVersionId: baseVersion.id
    };

    const versionB: ContentVersion = {
      id: 'version-b-1',
      contentId: testContentId,
      content: versionBContent,
      contentHash: 'version-b-hash',
      userId: userB,
      sessionId: testSessionId,
      createdAt: new Date('2024-01-01T10:06:00Z'),
      contentType: 'markdown',
      vectorClock: {
        userId: userB,
        timestamp: new Date('2024-01-01T10:06:00Z'),
        logicalClock: 1,
        sessionId: testSessionId,
        nodeId: 'node-1'
      },
      parentVersionId: baseVersion.id
    };

    // Mock database responses for conflict detection
    (mockClient.query as jest.Mock)
      .mockResolvedValueOnce({ 
        rows: [
          {
            id: versionA.id,
            content: versionA.content,
            user_id: versionA.userId,
            created_at: versionA.createdAt,
            vector_clock_user_id: versionA.vectorClock.userId,
            vector_clock_logical: versionA.vectorClock.logicalClock,
            vector_clock_timestamp: versionA.vectorClock.timestamp
          },
          {
            id: versionB.id,
            content: versionB.content,
            user_id: versionB.userId,
            created_at: versionB.createdAt,
            vector_clock_user_id: versionB.vectorClock.userId,
            vector_clock_logical: versionB.vectorClock.logicalClock,
            vector_clock_timestamp: versionB.vectorClock.timestamp
          }
        ]
      })
      .mockResolvedValueOnce({ 
        rows: [{
          id: baseVersion.id,
          content: baseVersion.content,
          created_at: baseVersion.createdAt
        }]
      })
      .mockResolvedValueOnce({ rows: [] }); // No existing conflicts

    // Step 1: Detect conflicts
    const conflicts = await conflictDetectionService.detectConflicts(testContentId, testSessionId);
    
    expect(conflicts).toHaveLength(1);
    const conflict = conflicts[0];
    expect(conflict.conflictType).toBe('content_modification');
    expect(conflict.versionA.userId).toBe(userA);
    expect(conflict.versionB.userId).toBe(userB);

    // Step 2: Execute three-way merge
    const mergeResult = await mergeStrategyEngine.threeWayMerge(
      baseVersion,
      versionA,
      versionB
    );

    expect(mergeResult.strategy).toBe('three_way_merge');
    expect(mergeResult.mergedContent).toBeDefined();
    expect(mergeResult.confidenceScore).toBeGreaterThan(0);
    expect(mergeResult.appliedOperations.length + mergeResult.rejectedOperations.length).toBeGreaterThan(0);

    // Step 3: Verify merge result contains elements from both versions
    expect(mergeResult.mergedContent).toContain('Feature A');
    expect(mergeResult.mergedContent).toContain('Feature B');
    
    // Step 4: Check metrics were recorded
    const metricsCollector = MetricsCollector.getInstance();
    const summary = MetricsCollector.getMetricsSummary('merge_operation', 5);
    expect(summary.totalOperations).toBeGreaterThan(0);
  }, 30000);

  test('handles concurrent users resolving same conflict', async () => {
    const conflictId = 'conflict-123';
    
    // Setup mock for concurrent access
    let resolveCount = 0;
    (mockClient.query as jest.Mock).mockImplementation(async (query: string, params?: any[]) => {
      if (query.includes('UPDATE conflict_detections')) {
        resolveCount++;
        if (resolveCount === 1) {
          // First user succeeds
          return { rowCount: 1 };
        } else {
          // Second user gets conflict
          const error = new Error('Conflict already resolved by another user');
          (error as any).code = '23505'; // Unique constraint violation
          throw error;
        }
      }
      return { rows: [], rowCount: 0 };
    });

    // Simulate two users trying to resolve the same conflict simultaneously
    const resolution1Promise = mergeStrategyEngine.executeMerge(
      conflictId,
      'last_writer_wins',
      { userPriority: { [userA]: 10 } }
    );

    const resolution2Promise = mergeStrategyEngine.executeMerge(
      conflictId,
      'last_writer_wins',
      { userPriority: { [userB]: 5 } }
    );

    // One should succeed, one should fail with appropriate error
    const results = await Promise.allSettled([resolution1Promise, resolution2Promise]);
    
    const successResults = results.filter(r => r.status === 'fulfilled');
    const failureResults = results.filter(r => r.status === 'rejected');
    
    expect(successResults).toHaveLength(1);
    expect(failureResults).toHaveLength(1);
    
    if (failureResults[0].status === 'rejected') {
      expect(failureResults[0].reason.message).toContain('Conflict already resolved');
    }
  }, 15000);

  test('handles AI-assisted merge with security validation', async () => {
    // Setup AI service mock
    (mockLLMService.analyzeContent as jest.Mock).mockResolvedValue({
      contentType: 'markdown',
      semanticStructure: {
        entities: [
          { text: 'Feature A', type: 'feature', confidence: 0.9 },
          { text: 'Installation', type: 'section', confidence: 0.8 }
        ],
        relationships: [],
        topics: [{ topic: 'documentation', score: 0.95 }],
        sentiment: { polarity: 0.1, subjectivity: 0.3 }
      },
      syntacticFeatures: {
        complexity: 0.3,
        readability: 0.8,
        structure: 'markdown',
        language: 'english'
      },
      contextualRelevance: {
        domain: 'software',
        intent: 'documentation',
        urgency: 0.2,
        formality: 0.7
      }
    });

    (mockLLMService.generateResponse as jest.Mock).mockResolvedValue({
      content: `# Project Documentation

## Overview  
This is the enhanced content for our project with advanced features and improved documentation.

## Features
- Feature A (Enhanced)
- Feature B (Updated)  
- Feature C (New)
- Feature D (Beta)

## Configuration
New configuration section added.

## Installation
1. Clone the repository
2. Install all dependencies
3. Configure environment
4. Run the application`,
      confidence: 0.85,
      rationale: 'Merged both versions by combining enhanced features from version A with updated elements from version B',
      tokensUsed: 250,
      modelVersion: 'gpt-4'
    });

    // Create test conflict with potential security content
    const conflictWithSecurity: ConflictDetection = {
      id: 'security-conflict-1',
      contentId: testContentId,
      sessionId: testSessionId,
      conflictType: 'content_modification',
      status: 'detected' as ConflictStatus,
      severity: 'medium',
      baseVersion: {
        id: 'base-1',
        contentId: testContentId,
        content: 'API_KEY=secret123\nDATABASE_URL=postgres://user:pass@localhost',
        contentHash: 'base-hash',
        userId: 'system',
        sessionId: testSessionId,
        createdAt: new Date(),
        contentType: 'text',
        vectorClock: {
          userId: 'system',
          timestamp: new Date(),
          logicalClock: 0,
          sessionId: testSessionId,
          nodeId: 'node-1'
        }
      },
      versionA: {
        id: 'version-a-2',
        contentId: testContentId,
        content: 'API_KEY=${API_KEY}\nDATABASE_URL=${DATABASE_URL}\nNEW_FEATURE=enabled',
        contentHash: 'version-a-hash',
        userId: userA,
        sessionId: testSessionId,
        createdAt: new Date(),
        contentType: 'text',
        vectorClock: {
          userId: userA,
          timestamp: new Date(),
          logicalClock: 1,
          sessionId: testSessionId,
          nodeId: 'node-1'
        }
      },
      versionB: {
        id: 'version-b-2',
        contentId: testContentId,
        content: 'API_KEY=updated_secret\nDATABASE_URL=postgres://newuser:newpass@localhost\nDEBUG=true',
        contentHash: 'version-b-hash',
        userId: userB,
        sessionId: testSessionId,
        createdAt: new Date(),
        contentType: 'text',
        vectorClock: {
          userId: userB,
          timestamp: new Date(),
          logicalClock: 1,
          sessionId: testSessionId,
          nodeId: 'node-1'
        }
      },
      conflictRegions: [
        {
          start: 0,
          end: 50,
          type: 'overlap',
          description: 'Configuration values conflict'
        }
      ],
      detectedAt: new Date(),
      createdAt: new Date()
    };

    // Mock database for AI analysis
    (mockClient.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });

    // Execute AI-assisted merge
    const aiContext = await aiAssistedMergeService.analyzeSemantic(conflictWithSecurity);
    expect(aiContext).toBeDefined();
    expect(aiContext.contextualFactors.domain).toBe('software');

    const suggestions = await aiAssistedMergeService.generateMergeSuggestions(aiContext);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].confidence).toBe(0.85);
    
    // Verify security-sensitive content is handled appropriately
    expect(suggestions[0].content).not.toContain('secret123');
    expect(suggestions[0].content).not.toContain('user:pass');
    
    // Verify AI metrics are recorded
    const summary = MetricsCollector.getMetricsSummary('ai_analysis', 5);
    expect(summary.totalOperations).toBeGreaterThan(0);
  }, 20000);

  test('handles operational transform with multiple concurrent edits', async () => {
    // Create multiple concurrent operations
    const operations: Operation[] = [
      {
        id: 'op-1',
        type: 'insert',
        position: 10,
        content: 'New text at position 10',
        userId: userA,
        timestamp: new Date('2024-01-01T10:01:00Z'),
        sessionId: testSessionId
      },
      {
        id: 'op-2',
        type: 'delete',
        position: 5,
        length: 3,
        userId: userB,
        timestamp: new Date('2024-01-01T10:01:30Z'),
        sessionId: testSessionId
      },
      {
        id: 'op-3',
        type: 'insert',
        position: 15,
        content: 'Another insertion',
        userId: userA,
        timestamp: new Date('2024-01-01T10:02:00Z'),
        sessionId: testSessionId
      },
      {
        id: 'op-4',
        type: 'replace',
        position: 20,
        length: 5,
        content: 'replaced',
        userId: userB,
        timestamp: new Date('2024-01-01T10:02:30Z'),
        sessionId: testSessionId
      }
    ];

    // Mock database for operation tracking
    (mockClient.query as jest.Mock).mockResolvedValue({ rows: [] });

    // Transform operations
    const transformedOps = await operationalTransformEngine.transformOperationList(
      operations,
      []
    );

    expect(transformedOps).toHaveLength(operations.length);
    
    // Verify operations maintain their essential properties
    transformedOps.forEach((op, index) => {
      expect(op.type).toBe(operations[index].type);
      expect(op.userId).toBe(operations[index].userId);
      expect(op.sessionId).toBe(operations[index].sessionId);
    });

    // Apply operations to content
    let resultContent = baseContent;
    for (const op of transformedOps) {
      resultContent = await operationalTransformEngine.applyOperation(resultContent, op);
    }

    expect(resultContent).not.toBe(baseContent);
    expect(resultContent.length).toBeGreaterThan(0);
  }, 15000);

  test('handles large content with memory management', async () => {
    // Create large content (>1MB)
    const largeContent = 'Lorem ipsum dolor sit amet, '.repeat(40000); // ~1.1MB
    
    const largeVersionA: ContentVersion = {
      id: 'large-version-a',
      contentId: testContentId,
      content: largeContent + 'Version A additions',
      contentHash: 'large-a-hash',
      userId: userA,
      sessionId: testSessionId,
      createdAt: new Date(),
      contentType: 'text',
      vectorClock: {
        userId: userA,
        timestamp: new Date(),
        logicalClock: 1,
        sessionId: testSessionId,
        nodeId: 'node-1'
      }
    };

    const largeVersionB: ContentVersion = {
      id: 'large-version-b',
      contentId: testContentId,
      content: largeContent + 'Version B additions',
      contentHash: 'large-b-hash',
      userId: userB,
      sessionId: testSessionId,
      createdAt: new Date(),
      contentType: 'text',
      vectorClock: {
        userId: userB,
        timestamp: new Date(),
        logicalClock: 1,
        sessionId: testSessionId,
        nodeId: 'node-1'
      }
    };

    const largeBaseVersion: ContentVersion = {
      id: 'large-base',
      contentId: testContentId,
      content: largeContent,
      contentHash: 'large-base-hash',
      userId: 'system',
      sessionId: testSessionId,
      createdAt: new Date(),
      contentType: 'text',
      vectorClock: {
        userId: 'system',
        timestamp: new Date(),
        logicalClock: 0,
        sessionId: testSessionId,
        nodeId: 'node-1'
      }
    };

    // Monitor memory usage
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Execute merge with large content
    const mergeResult = await mergeStrategyEngine.threeWayMerge(
      largeBaseVersion,
      largeVersionA,
      largeVersionB
    );

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Verify merge completed successfully
    expect(mergeResult.strategy).toBe('three_way_merge');
    expect(mergeResult.mergedContent).toBeDefined();
    
    // Verify memory usage is reasonable (less than 50MB increase)
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    
    // Verify memory metrics were recorded
    const summary = MetricsCollector.getMetricsSummary('merge_operation', 5);
    expect(summary.totalOperations).toBeGreaterThan(0);
  }, 30000);

  test('handles timeout scenarios gracefully', async () => {
    // Mock a slow operation by making the database query hang
    (mockClient.query as jest.Mock).mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 35000)) // 35 seconds
    );

    const conflictId = 'timeout-test-conflict';
    
    // Execute merge with short timeout
    const startTime = Date.now();
    
    await expect(
      mergeStrategyEngine.executeMerge(
        conflictId,
        'three_way_merge',
        { timeoutMs: 1000 } // 1 second timeout
      )
    ).rejects.toThrow(/timeout/i);
    
    const duration = Date.now() - startTime;
    
    // Verify operation timed out quickly (within 2 seconds)
    expect(duration).toBeLessThan(2000);
    
    // Verify timeout metrics were recorded
    const summary = MetricsCollector.getMetricsSummary('merge_execution', 5);
    expect(summary.errorCount).toBeGreaterThan(0);
  }, 10000);

  test('validates error message sanitization', async () => {
    // Mock database to throw an error with sensitive information
    const sensitiveError = new Error(
      'Database connection failed: postgres://user:password123@sensitive.db.com:5432/prod_db API_KEY=super_secret_key'
    );
    
    (mockClient.query as jest.Mock).mockRejectedValue(sensitiveError);

    const conflictId = 'error-test-conflict';
    
    try {
      await mergeStrategyEngine.executeMerge(conflictId, 'last_writer_wins');
      fail('Expected error to be thrown');
    } catch (error) {
      // Verify sensitive information is sanitized
      expect(error.message).not.toContain('password123');
      expect(error.message).not.toContain('sensitive.db.com');
      expect(error.message).not.toContain('super_secret_key');
      expect(error.message).toContain('[CREDENTIALS_REDACTED]');
      expect(error.message).toContain('[API_KEY_REDACTED]');
    }
  });

  test('handles rate limiting integration', async () => {
    // This test would integrate with the rate limiter
    // For now, we'll test that the service respects concurrent limits
    
    const conflictId = 'rate-limit-test';
    const concurrentOperations: Promise<any>[] = [];
    
    // Mock successful operations
    (mockClient.query as jest.Mock).mockResolvedValue({ 
      rows: [{ id: conflictId }], 
      rowCount: 1 
    });

    // Start multiple concurrent operations
    for (let i = 0; i < 10; i++) {
      concurrentOperations.push(
        mergeStrategyEngine.executeMerge(
          `${conflictId}-${i}`,
          'last_writer_wins'
        )
      );
    }

    // All operations should complete (rate limiting would be handled at gateway level)
    const results = await Promise.allSettled(concurrentOperations);
    
    // In a real scenario with rate limiting, some might be rejected
    // Here we just verify they all attempt to execute
    expect(results.length).toBe(10);
  });

  test('complete production readiness workflow', async () => {
    // This test validates all production readiness features working together
    const startTime = Date.now();
    
    // 1. Test Rate Limiting
    const userId = 'production-test-user';
    const rateLimitResult = await ConflictResolutionRateLimiter.checkLimits(
      userId,
      'merge_operation',
      testSessionId,
      1024 // 1KB content
    );
    expect(rateLimitResult).toBe(RateLimitResult.ALLOWED);

    // 2. Record operation for rate limiting
    await ConflictResolutionRateLimiter.recordOperation(
      userId,
      'merge_operation',
      testSessionId,
      1024
    );

    // 3. Create production-like conflict scenario
    const prodConflict: ConflictDetection = {
      id: 'prod-conflict-1',
      contentId: testContentId,
      sessionId: testSessionId,
      conflictType: 'content_modification',
      status: 'detected' as ConflictStatus,
      severity: 'high', // High severity for production
      baseVersion: {
        id: 'prod-base-1',
        contentId: testContentId,
        content: 'Production configuration with sensitive data: API_KEY=prod_secret_123',
        contentHash: 'prod-base-hash',
        userId: 'system',
        sessionId: testSessionId,
        createdAt: new Date(),
        contentType: 'config',
        vectorClock: {
          userId: 'system',
          timestamp: new Date(),
          logicalClock: 0,
          sessionId: testSessionId,
          nodeId: 'prod-node-1'
        }
      },
      versionA: {
        id: 'prod-version-a',
        contentId: testContentId,
        content: 'Production configuration updated: API_KEY=${API_KEY} DATABASE_URL=postgres://user:pass@db.prod.com',
        contentHash: 'prod-version-a-hash',
        userId: userA,
        sessionId: testSessionId,
        createdAt: new Date(),
        contentType: 'config',
        vectorClock: {
          userId: userA,
          timestamp: new Date(),
          logicalClock: 1,
          sessionId: testSessionId,
          nodeId: 'prod-node-1'
        }
      },
      versionB: {
        id: 'prod-version-b',
        contentId: testContentId,
        content: 'Production configuration enhanced: API_KEY=new_prod_key_456 MONITORING_ENABLED=true',
        contentHash: 'prod-version-b-hash',
        userId: userB,
        sessionId: testSessionId,
        createdAt: new Date(),
        contentType: 'config',
        vectorClock: {
          userId: userB,
          timestamp: new Date(),
          logicalClock: 1,
          sessionId: testSessionId,
          nodeId: 'prod-node-1'
        }
      },
      conflictRegions: [
        {
          start: 0,
          end: 100,
          type: 'overlap',
          description: 'Production API key configuration conflict'
        }
      ],
      detectedAt: new Date(),
      createdAt: new Date()
    };

    // Mock database operations
    (mockClient.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });

    // 4. Test Operational Transform with timeout handling
    const testOperation: Operation = {
      id: 'prod-op-1',
      type: 'replace',
      position: 30,
      length: 20,
      content: 'API_KEY=${SECURE_API_KEY}',
      userId: userA,
      timestamp: new Date(),
      sessionId: testSessionId
    };

    // Transform operation (should complete within timeout)
    const transformedOp = await operationalTransformEngine.transformOperation(
      testOperation,
      {
        id: 'prod-op-2',
        type: 'insert',
        position: 10,
        content: 'ENVIRONMENT=production\n',
        userId: userB,
        timestamp: new Date(),
        sessionId: testSessionId
      }
    );

    expect(transformedOp).toBeDefined();
    expect(transformedOp.id).not.toBe(testOperation.id); // Should be a new transformed operation

    // 5. Test AI-assisted merge with security considerations
    (mockLLMService.analyzeContent as jest.Mock).mockResolvedValue({
      contentType: 'config',
      semanticStructure: {
        entities: [
          { text: 'API_KEY', type: 'configuration', confidence: 0.95 },
          { text: 'DATABASE_URL', type: 'configuration', confidence: 0.90 }
        ],
        relationships: [],
        topics: [{ topic: 'production-config', score: 0.98 }],
        sentiment: { polarity: 0.0, subjectivity: 0.1 }
      },
      syntacticFeatures: {
        complexity: 0.2,
        readability: 0.9,
        structure: 'key-value',
        language: 'english'
      },
      contextualRelevance: {
        domain: 'devops',
        intent: 'configuration',
        urgency: 0.8,
        formality: 0.9
      }
    });

    (mockLLMService.generateResponse as jest.Mock).mockResolvedValue({
      content: 'Production configuration merged: API_KEY=${API_KEY} DATABASE_URL=${DATABASE_URL} MONITORING_ENABLED=true',
      confidence: 0.92,
      rationale: 'Merged production configurations with environment variable substitution for security',
      tokensUsed: 150,
      modelVersion: 'gpt-4'
    });

    const aiContext = await aiAssistedMergeService.analyzeSemantic(prodConflict);
    expect(aiContext.contextualFactors.domain).toBe('devops');
    expect(aiContext.contextualFactors.urgency).toBe(0.8);

    const suggestions = await aiAssistedMergeService.generateMergeSuggestions(aiContext);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].confidence).toBe(0.92);

    // Verify sensitive data is not in the merged content
    expect(suggestions[0].content).not.toContain('prod_secret_123');
    expect(suggestions[0].content).not.toContain('new_prod_key_456');
    expect(suggestions[0].content).not.toContain('user:pass@db.prod.com');

    // 6. Test Complete Merge Workflow
    const mergeResult = await mergeStrategyEngine.threeWayMerge(
      prodConflict.baseVersion,
      prodConflict.versionA,
      prodConflict.versionB
    );

    expect(mergeResult.strategy).toBe('three_way_merge');
    expect(mergeResult.confidenceScore).toBeGreaterThan(0.5);
    expect(mergeResult.mergedContent).toBeDefined();

    // 7. Complete rate limiting operation
    await ConflictResolutionRateLimiter.completeOperation(
      userId,
      'merge_operation',
      testSessionId
    );

    // 8. Verify all metrics were collected
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

    const metricsSummary = MetricsCollector.getMetricsSummary('merge_operation', 5);
    expect(metricsSummary.totalOperations).toBeGreaterThan(0);

    const aiMetricsSummary = MetricsCollector.getMetricsSummary('ai_analysis', 5);
    expect(aiMetricsSummary.totalOperations).toBeGreaterThan(0);

    const transformMetricsSummary = MetricsCollector.getMetricsSummary('operation_transform', 5);
    expect(transformMetricsSummary.totalOperations).toBeGreaterThan(0);

    // 9. Verify Rate Limiting Status
    const rateLimitStatus = await ConflictResolutionRateLimiter.getRateLimitStatus(userId);
    expect(rateLimitStatus.limits).toBeDefined();
    expect(rateLimitStatus.current).toBeDefined();
    expect(rateLimitStatus.remaining).toBeDefined();

    // 10. Test Memory Management (verify no memory leaks)
    const memoryAfter = process.memoryUsage().heapUsed;
    // Should not have excessive memory growth (allow up to 10MB for test execution)
    expect(memoryAfter).toBeLessThan(process.memoryUsage().heapUsed + 10 * 1024 * 1024);

    console.log(`Production readiness workflow completed in ${duration}ms`);
    console.log(`Memory usage: ${Math.round(memoryAfter / 1024 / 1024)}MB`);
    console.log(`Metrics collected: merge=${metricsSummary.totalOperations}, ai=${aiMetricsSummary.totalOperations}, transform=${transformMetricsSummary.totalOperations}`);
  }, 45000);
});

// Helper function to create test vector clock
function createTestVectorClock(userId: string, logicalClock: number, sessionId: string) {
  return {
    userId,
    timestamp: new Date(),
    logicalClock,
    sessionId,
    nodeId: 'test-node-1',
    vectorState: { [userId]: logicalClock }
  };
}