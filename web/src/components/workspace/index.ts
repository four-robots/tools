/**
 * Workspace Components
 * 
 * React components for collaborative workspace management
 */

// Main workspace components
export { WorkspaceLayout } from './WorkspaceLayout.js';
export { WorkspaceNavigation } from './WorkspaceNavigation.js';
export { WorkspaceDashboard } from './WorkspaceDashboard.js';

// Member and presence components
export { MemberPresence } from './MemberPresence.js';
export { MemberList } from './MemberList.js';
export { MemberInviteModal } from './MemberInviteModal.js';
export { CollaborationToolbar } from './CollaborationToolbar.js';

// Settings and configuration
export { WorkspaceSettings } from './WorkspaceSettings.js';
export { WorkspaceAnalytics } from './WorkspaceAnalytics.js';

// Activity and feeds
export { ActivityFeed } from './ActivityFeed.js';
export { ActivityItem } from './ActivityItem.js';

// Templates
export { TemplateSelector } from './TemplateSelector.js';
export { TemplateCard } from './TemplateCard.js';
export { TemplateCreator } from './TemplateCreator.js';

// Integrations
export { IntegrationManager } from './IntegrationManager.js';
export { IntegrationCard } from './IntegrationCard.js';
export { IntegrationSetup } from './IntegrationSetup.js';

// Real-time collaboration
export { RealtimeIndicator } from './RealtimeIndicator.js';
export { CursorTracker } from './CursorTracker.js';
export { EditingIndicator } from './EditingIndicator.js';

// Hooks
export { useWorkspace } from './hooks/useWorkspace.js';
export { useWorkspaceMembers } from './hooks/useWorkspaceMembers.js';
export { useWorkspaceActivity } from './hooks/useWorkspaceActivity.js';
export { useWorkspaceRealtime } from './hooks/useWorkspaceRealtime.js';
export { useWorkspaceSession } from './hooks/useWorkspaceSession.js';