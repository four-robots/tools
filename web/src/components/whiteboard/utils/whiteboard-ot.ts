/**
 * Whiteboard Operational Transforms - Web Client
 * 
 * Re-exports shared OT utilities from core package for frontend use.
 * Maintains compatibility while eliminating circular dependencies.
 */

// Re-export all OT utilities from the core package
export * from '@mcp-tools/core/shared/whiteboard-ot.js';

// Additional web-specific utilities can be added here if needed