/**
 * Cursor Test Utilities
 * 
 * Utilities for testing the live cursor tracking system with multiple users and edge cases.
 */

import { LiveCursorState } from '@shared/types/whiteboard';

export interface MockCursorUser {
  userId: string;
  userName: string;
  userColor: string;
}

export interface CursorTestConfig {
  userCount: number;
  updateFrequency: number; // Updates per second
  canvasBounds: {
    width: number;
    height: number;
  };
  movementPattern: 'random' | 'circular' | 'linear' | 'chaotic';
  duration: number; // Test duration in seconds
}

/**
 * Generates mock users for cursor testing
 */
export function generateMockUsers(count: number): MockCursorUser[] {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#FFB347', '#98D8E8', '#F7DC6F', '#BB8FCE',
    '#85C1E9', '#F8C471', '#82E0AA', '#D7BDE2', '#A9DFBF'
  ];

  return Array.from({ length: count }, (_, i) => ({
    userId: `test-user-${i + 1}`,
    userName: `Test User ${i + 1}`,
    userColor: colors[i % colors.length],
  }));
}

/**
 * Simulates cursor movement patterns for testing
 */
export class CursorMovementSimulator {
  private users: MockCursorUser[];
  private config: CursorTestConfig;
  private positions: Map<string, { x: number; y: number; canvasX: number; canvasY: number }>;
  private intervalId: NodeJS.Timer | null = null;
  private startTime: number = 0;
  private onUpdate?: (cursors: LiveCursorState[]) => void;

  constructor(users: MockCursorUser[], config: CursorTestConfig) {
    this.users = users;
    this.config = config;
    this.positions = new Map();

    // Initialize positions
    users.forEach(user => {
      this.positions.set(user.userId, {
        x: Math.random() * config.canvasBounds.width,
        y: Math.random() * config.canvasBounds.height,
        canvasX: Math.random() * config.canvasBounds.width,
        canvasY: Math.random() * config.canvasBounds.height,
      });
    });
  }

  /**
   * Start cursor movement simulation
   */
  start(onUpdate: (cursors: LiveCursorState[]) => void): void {
    this.onUpdate = onUpdate;
    this.startTime = Date.now();

    const updateInterval = 1000 / this.config.updateFrequency;
    
    this.intervalId = setInterval(() => {
      const elapsed = Date.now() - this.startTime;
      
      if (elapsed > this.config.duration * 1000) {
        this.stop();
        return;
      }

      this.updatePositions(elapsed);
      
      const cursors = this.generateCursorStates();
      this.onUpdate?.(cursors);
    }, updateInterval);
  }

  /**
   * Stop cursor movement simulation
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private updatePositions(elapsedMs: number): void {
    const time = elapsedMs / 1000; // Convert to seconds

    this.users.forEach(user => {
      const currentPos = this.positions.get(user.userId)!;
      let newPos = { ...currentPos };

      switch (this.config.movementPattern) {
        case 'circular':
          newPos = this.calculateCircularMovement(user, time);
          break;
        case 'linear':
          newPos = this.calculateLinearMovement(user, time);
          break;
        case 'chaotic':
          newPos = this.calculateChaoticMovement(user, time);
          break;
        case 'random':
        default:
          newPos = this.calculateRandomMovement(user, currentPos);
          break;
      }

      this.positions.set(user.userId, newPos);
    });
  }

  private calculateCircularMovement(user: MockCursorUser, time: number) {
    const centerX = this.config.canvasBounds.width / 2;
    const centerY = this.config.canvasBounds.height / 2;
    const radius = Math.min(centerX, centerY) * 0.7;
    
    // Each user gets a different phase offset
    const userIndex = this.users.findIndex(u => u.userId === user.userId);
    const phaseOffset = (userIndex / this.users.length) * Math.PI * 2;
    const speed = 0.5; // Radians per second
    
    const angle = time * speed + phaseOffset;
    
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      canvasX: centerX + Math.cos(angle) * radius,
      canvasY: centerY + Math.sin(angle) * radius,
    };
  }

  private calculateLinearMovement(user: MockCursorUser, time: number) {
    const userIndex = this.users.findIndex(u => u.userId === user.userId);
    const speed = 100; // pixels per second
    const direction = (userIndex % 4) * (Math.PI / 2); // 4 different directions
    
    const startX = this.config.canvasBounds.width * 0.2;
    const startY = this.config.canvasBounds.height * 0.2;
    
    const x = startX + Math.cos(direction) * speed * time;
    const y = startY + Math.sin(direction) * speed * time;
    
    // Wrap around bounds
    const wrappedX = ((x % this.config.canvasBounds.width) + this.config.canvasBounds.width) % this.config.canvasBounds.width;
    const wrappedY = ((y % this.config.canvasBounds.height) + this.config.canvasBounds.height) % this.config.canvasBounds.height;
    
    return {
      x: wrappedX,
      y: wrappedY,
      canvasX: wrappedX,
      canvasY: wrappedY,
    };
  }

  private calculateChaoticMovement(user: MockCursorUser, time: number) {
    const userIndex = this.users.findIndex(u => u.userId === user.userId);
    const seed = userIndex + 1;
    
    // Generate pseudo-random but deterministic movement
    const x = (Math.sin(time * seed * 0.7) + Math.cos(time * seed * 0.3)) * this.config.canvasBounds.width * 0.4 + this.config.canvasBounds.width * 0.5;
    const y = (Math.cos(time * seed * 0.5) + Math.sin(time * seed * 0.9)) * this.config.canvasBounds.height * 0.4 + this.config.canvasBounds.height * 0.5;
    
    return {
      x: Math.max(0, Math.min(this.config.canvasBounds.width, x)),
      y: Math.max(0, Math.min(this.config.canvasBounds.height, y)),
      canvasX: Math.max(0, Math.min(this.config.canvasBounds.width, x)),
      canvasY: Math.max(0, Math.min(this.config.canvasBounds.height, y)),
    };
  }

  private calculateRandomMovement(user: MockCursorUser, currentPos: any) {
    const maxMove = 50; // Maximum pixels to move in one update
    
    const dx = (Math.random() - 0.5) * maxMove;
    const dy = (Math.random() - 0.5) * maxMove;
    
    const newX = Math.max(0, Math.min(this.config.canvasBounds.width, currentPos.x + dx));
    const newY = Math.max(0, Math.min(this.config.canvasBounds.height, currentPos.y + dy));
    
    return {
      x: newX,
      y: newY,
      canvasX: newX,
      canvasY: newY,
    };
  }

  private generateCursorStates(): LiveCursorState[] {
    const now = Date.now();
    
    return this.users.map(user => {
      const position = this.positions.get(user.userId)!;
      
      return {
        userId: user.userId,
        userName: user.userName,
        userColor: user.userColor,
        currentPosition: {
          x: position.x,
          y: position.y,
          canvasX: position.canvasX,
          canvasY: position.canvasY,
          timestamp: now,
          interpolated: false,
        },
        lastPosition: undefined,
        isActive: true,
        lastSeen: now,
        sessionId: `session-${user.userId}`,
      };
    });
  }
}

/**
 * Performance testing utilities
 */
export class CursorPerformanceTester {
  private frameTimeBuffer: number[] = [];
  private lastFrameTime: number = 0;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;

  startPerfTest(onResults: (results: PerformanceResults) => void): void {
    this.frameTimeBuffer = [];
    this.lastFrameTime = performance.now();
    this.isRunning = true;

    const frame = (timestamp: number) => {
      if (!this.isRunning) return;

      const frameTime = timestamp - this.lastFrameTime;
      this.frameTimeBuffer.push(frameTime);
      this.lastFrameTime = timestamp;

      // Keep buffer size manageable
      if (this.frameTimeBuffer.length > 1000) {
        this.frameTimeBuffer = this.frameTimeBuffer.slice(-500);
      }

      this.animationFrameId = requestAnimationFrame(frame);
    };

    this.animationFrameId = requestAnimationFrame(frame);

    // Report results every 5 seconds
    setTimeout(() => {
      this.stopPerfTest();
      onResults(this.calculateResults());
    }, 5000);
  }

  stopPerfTest(): void {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private calculateResults(): PerformanceResults {
    const frameTimes = this.frameTimeBuffer.filter(time => time > 0);
    const avgFrameTime = frameTimes.reduce((sum, time) => sum + time, 0) / frameTimes.length;
    const fps = 1000 / avgFrameTime;
    
    const sortedTimes = [...frameTimes].sort((a, b) => a - b);
    const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)];
    const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
    const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)];

    const droppedFrames = frameTimes.filter(time => time > 16.67).length; // 60 FPS threshold

    return {
      avgFps: Math.round(fps),
      avgFrameTime: Math.round(avgFrameTime * 100) / 100,
      p50FrameTime: Math.round(p50 * 100) / 100,
      p95FrameTime: Math.round(p95 * 100) / 100,
      p99FrameTime: Math.round(p99 * 100) / 100,
      droppedFrames,
      totalFrames: frameTimes.length,
      droppedFrameRate: droppedFrames / frameTimes.length,
    };
  }
}

export interface PerformanceResults {
  avgFps: number;
  avgFrameTime: number;
  p50FrameTime: number;
  p95FrameTime: number;
  p99FrameTime: number;
  droppedFrames: number;
  totalFrames: number;
  droppedFrameRate: number;
}

/**
 * Edge case testing scenarios
 */
export const EDGE_CASE_SCENARIOS = {
  highFrequency: {
    userCount: 5,
    updateFrequency: 60,
    canvasBounds: { width: 1920, height: 1080 },
    movementPattern: 'chaotic' as const,
    duration: 30,
  },
  
  manyUsers: {
    userCount: 25,
    updateFrequency: 30,
    canvasBounds: { width: 1920, height: 1080 },
    movementPattern: 'circular' as const,
    duration: 60,
  },

  rapidMovement: {
    userCount: 10,
    updateFrequency: 120,
    canvasBounds: { width: 1920, height: 1080 },
    movementPattern: 'linear' as const,
    duration: 20,
  },

  stressTest: {
    userCount: 50,
    updateFrequency: 60,
    canvasBounds: { width: 1920, height: 1080 },
    movementPattern: 'chaotic' as const,
    duration: 30,
  },
} as const;

/**
 * Test runner for automated cursor testing
 */
export async function runCursorTests(): Promise<{
  scenario: string;
  results: PerformanceResults;
  passed: boolean;
}[]> {
  const results = [];

  for (const [scenarioName, config] of Object.entries(EDGE_CASE_SCENARIOS)) {
    const users = generateMockUsers(config.userCount);
    const simulator = new CursorMovementSimulator(users, config);
    const perfTester = new CursorPerformanceTester();

    const testResult = await new Promise<{
      scenario: string;
      results: PerformanceResults;
      passed: boolean;
    }>((resolve) => {
      let cursorsReceived = 0;
      
      const handleCursorUpdate = (cursors: LiveCursorState[]) => {
        cursorsReceived += cursors.length;
      };

      perfTester.startPerfTest((perfResults) => {
        const passed = perfResults.avgFps >= 30 && perfResults.droppedFrameRate < 0.1;
        
        resolve({
          scenario: scenarioName,
          results: perfResults,
          passed,
        });
      });

      simulator.start(handleCursorUpdate);
    });

    simulator.stop();
    perfTester.stopPerfTest();
    
    results.push(testResult);
  }

  return results;
}