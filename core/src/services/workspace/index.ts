/**
 * Collaborative Workspace Services
 * 
 * This module provides comprehensive workspace management functionality including:
 * - Core workspace CRUD operations
 * - Member and role management
 * - Real-time session coordination
 * - Activity tracking and audit trails
 * - Template management
 * - External integrations
 */

export { WorkspaceService } from './workspace-service.js';
export { WorkspaceMembershipService } from './workspace-membership-service.js';
export { WorkspaceTemplateService } from './workspace-template-service.js';
export { WorkspaceSessionService } from './workspace-session-service.js';
export { WorkspaceActivityService } from './workspace-activity-service.js';
export { WorkspaceIntegrationService } from './workspace-integration-service.js';

// Integration adapters
export { KanbanWorkspaceIntegration } from './integrations/kanban-integration.js';
export { WikiWorkspaceIntegration } from './integrations/wiki-integration.js';
export { MemoryWorkspaceIntegration } from './integrations/memory-integration.js';

// Types are re-exported from shared types
export type {
  CollaborativeWorkspace,
  WorkspaceMember,
  WorkspaceTemplate,
  WorkspaceSession,
  WorkspaceActivityLog,
  WorkspaceIntegration,
  WorkspaceResource,
  WorkspaceSettings,
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  InviteMemberRequest,
  UpdateMemberRequest,
  WorkspaceWithStats,
  WorkspaceMemberWithUser,
  WorkspaceActivityFeedItem,
  WorkspaceAnalytics,
  PaginatedWorkspaces,
  PaginatedMembers,
  PaginatedActivities,
  PaginatedResources,
  WorkspaceRealtimeEvent,
  WorkspacePresenceUpdate,
} from '@shared/types/workspace.js';