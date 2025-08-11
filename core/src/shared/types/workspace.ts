import { z } from 'zod';

/**
 * Workspace types for collaborative environments
 */

// Base types
export const WorkspaceStatus = z.enum(['active', 'inactive', 'archived', 'suspended']);
export type WorkspaceStatus = z.infer<typeof WorkspaceStatus>;

export const WorkspaceVisibility = z.enum(['private', 'internal', 'public']);
export type WorkspaceVisibility = z.infer<typeof WorkspaceVisibility>;

export const WorkspaceMemberRole = z.enum(['owner', 'admin', 'member', 'viewer']);
export type WorkspaceMemberRole = z.infer<typeof WorkspaceMemberRole>;

export const WorkspaceMemberStatus = z.enum(['active', 'inactive', 'pending', 'suspended']);
export type WorkspaceMemberStatus = z.infer<typeof WorkspaceMemberStatus>;

export const WorkspaceSessionStatus = z.enum(['active', 'inactive', 'disconnected', 'ended']);
export type WorkspaceSessionStatus = z.infer<typeof WorkspaceSessionStatus>;

export const WorkspaceResourceType = z.enum(['file', 'image', 'document', 'video', 'audio', 'archive', 'other']);
export type WorkspaceResourceType = z.infer<typeof WorkspaceResourceType>;

export const WorkspaceResourceAccessLevel = z.enum(['workspace', 'members', 'admins', 'owner']);
export type WorkspaceResourceAccessLevel = z.infer<typeof WorkspaceResourceAccessLevel>;

export const WorkspaceIntegrationType = z.enum(['kanban', 'wiki', 'memory', 'github', 'jira', 'slack', 'discord', 'teams', 'external']);
export type WorkspaceIntegrationType = z.infer<typeof WorkspaceIntegrationType>;

export const WorkspaceIntegrationStatus = z.enum(['active', 'inactive', 'error', 'configuring']);
export type WorkspaceIntegrationStatus = z.infer<typeof WorkspaceIntegrationStatus>;

// Activity types
export const WorkspaceActivityAction = z.enum([
  // Workspace management
  'workspace_created', 'workspace_updated', 'workspace_deleted', 'workspace_archived',
  'workspace_restored', 'workspace_settings_changed',
  
  // Member management
  'member_added', 'member_removed', 'member_role_changed', 'member_invited',
  'member_joined', 'member_left', 'member_suspended', 'member_restored',
  
  // Session management
  'session_started', 'session_ended', 'session_timeout', 'session_reconnected',
  
  // Resource management
  'resource_uploaded', 'resource_downloaded', 'resource_deleted', 'resource_shared',
  'resource_updated', 'resource_moved',
  
  // Collaboration activities
  'content_created', 'content_updated', 'content_deleted', 'content_shared',
  'comment_added', 'comment_updated', 'comment_deleted',
  
  // Integration activities
  'integration_added', 'integration_removed', 'integration_configured',
  'integration_synced', 'integration_error',
  
  // Template activities
  'template_applied', 'template_created', 'template_shared'
]);
export type WorkspaceActivityAction = z.infer<typeof WorkspaceActivityAction>;

// Core schemas
export const WorkspaceSettings = z.object({
  general: z.object({
    allowGuestAccess: z.boolean().default(false),
    requireApproval: z.boolean().default(true),
    autoArchiveInactive: z.boolean().default(false),
    inactivityThreshold: z.number().default(90), // days
  }).optional(),
  
  collaboration: z.object({
    enableRealTimeEditing: z.boolean().default(true),
    enablePresence: z.boolean().default(true),
    enableComments: z.boolean().default(true),
    conflictResolution: z.enum(['manual', 'auto_merge', 'last_writer_wins']).default('manual'),
    sessionTimeout: z.number().default(3600), // seconds
  }).optional(),
  
  permissions: z.object({
    defaultMemberRole: WorkspaceMemberRole.default('member'),
    allowMemberInvites: z.boolean().default(true),
    allowResourceSharing: z.boolean().default(true),
    restrictFileTypes: z.array(z.string()).default([]),
    maxFileSize: z.number().default(100 * 1024 * 1024), // 100MB in bytes
  }).optional(),
  
  integrations: z.object({
    enabledTools: z.array(WorkspaceIntegrationType).default(['kanban', 'wiki', 'memory']),
    externalIntegrations: z.array(z.string()).default([]),
    syncFrequency: z.enum(['realtime', 'hourly', 'daily', 'manual']).default('realtime'),
  }).optional(),
  
  notifications: z.object({
    emailNotifications: z.boolean().default(true),
    pushNotifications: z.boolean().default(true),
    digestFrequency: z.enum(['never', 'daily', 'weekly']).default('daily'),
    mentionNotifications: z.boolean().default(true),
  }).optional(),
});
export type WorkspaceSettings = z.infer<typeof WorkspaceSettings>;

export const WorkspaceMetadata = z.object({
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  industry: z.string().optional(),
  teamSize: z.number().optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  customFields: z.record(z.string(), z.any()).optional(),
  analytics: z.object({
    totalSessions: z.number().optional(),
    activeUsers: z.number().optional(),
    storageUsed: z.number().optional(),
    lastActivity: z.string().optional(),
  }).optional(),
});
export type WorkspaceMetadata = z.infer<typeof WorkspaceMetadata>;

// Main workspace schema
export const CollaborativeWorkspace = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  tenantId: z.string().uuid(),
  ownerId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  status: WorkspaceStatus,
  settings: WorkspaceSettings.default({}),
  metadata: WorkspaceMetadata.default({}),
  visibility: WorkspaceVisibility,
  maxMembers: z.number().min(1).max(1000).default(100),
  currentMembers: z.number().min(0).default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
});
export type CollaborativeWorkspace = z.infer<typeof CollaborativeWorkspace>;

// Workspace member permissions schema
export const WorkspaceMemberPermissions = z.object({
  canInviteMembers: z.boolean().default(false),
  canRemoveMembers: z.boolean().default(false),
  canEditSettings: z.boolean().default(false),
  canManageResources: z.boolean().default(true),
  canCreateContent: z.boolean().default(true),
  canDeleteContent: z.boolean().default(false),
  canManageIntegrations: z.boolean().default(false),
  canViewAnalytics: z.boolean().default(false),
  canExportData: z.boolean().default(false),
  customPermissions: z.record(z.string(), z.boolean()).optional(),
});
export type WorkspaceMemberPermissions = z.infer<typeof WorkspaceMemberPermissions>;

export const WorkspaceMemberNotificationSettings = z.object({
  mentions: z.boolean().default(true),
  comments: z.boolean().default(true),
  newMembers: z.boolean().default(true),
  resourceChanges: z.boolean().default(false),
  integrationUpdates: z.boolean().default(false),
  weeklyDigest: z.boolean().default(true),
});
export type WorkspaceMemberNotificationSettings = z.infer<typeof WorkspaceMemberNotificationSettings>;

export const WorkspaceMember = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  role: WorkspaceMemberRole,
  permissions: WorkspaceMemberPermissions.default({}),
  invitedBy: z.string().uuid().optional(),
  joinedAt: z.string().datetime(),
  status: WorkspaceMemberStatus,
  lastActiveAt: z.string().datetime().optional(),
  notificationSettings: WorkspaceMemberNotificationSettings.default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WorkspaceMember = z.infer<typeof WorkspaceMember>;

// Session schemas
export const WorkspaceSessionClientInfo = z.object({
  userAgent: z.string().optional(),
  platform: z.string().optional(),
  browser: z.string().optional(),
  ip: z.string().optional(),
  location: z.string().optional(),
});
export type WorkspaceSessionClientInfo = z.infer<typeof WorkspaceSessionClientInfo>;

export const WorkspaceSessionPresenceData = z.object({
  isOnline: z.boolean(),
  isActive: z.boolean(),
  lastSeen: z.string().datetime(),
  currentPage: z.string().optional(),
  currentTool: z.string().optional(),
  customStatus: z.string().optional(),
});
export type WorkspaceSessionPresenceData = z.infer<typeof WorkspaceSessionPresenceData>;

export const WorkspaceSessionCursorPosition = z.object({
  x: z.number(),
  y: z.number(),
  elementId: z.string().optional(),
  selectionStart: z.number().optional(),
  selectionEnd: z.number().optional(),
});
export type WorkspaceSessionCursorPosition = z.infer<typeof WorkspaceSessionCursorPosition>;

export const WorkspaceSession = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  sessionToken: z.string(),
  connectionId: z.string().optional(),
  clientInfo: WorkspaceSessionClientInfo.default({}),
  presenceData: WorkspaceSessionPresenceData.default({ isOnline: true, isActive: true, lastSeen: new Date().toISOString() }),
  cursorPosition: WorkspaceSessionCursorPosition.optional(),
  activeTool: z.string().optional(),
  activeResource: z.string().optional(),
  startedAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  status: WorkspaceSessionStatus,
});
export type WorkspaceSession = z.infer<typeof WorkspaceSession>;

// Template schemas
export const WorkspaceTemplateData = z.object({
  defaultBoards: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    columns: z.array(z.object({
      name: z.string(),
      limit: z.number().optional(),
    })),
  })).optional(),
  
  defaultPages: z.array(z.object({
    title: z.string(),
    content: z.string().optional(),
    category: z.string().optional(),
  })).optional(),
  
  defaultMemoryNodes: z.array(z.object({
    title: z.string(),
    content: z.string().optional(),
    type: z.string().optional(),
  })).optional(),
  
  defaultSettings: WorkspaceSettings.optional(),
  
  customFields: z.array(z.object({
    name: z.string(),
    type: z.enum(['text', 'number', 'date', 'select', 'multiselect', 'boolean']),
    options: z.array(z.string()).optional(),
    required: z.boolean().default(false),
  })).optional(),
});
export type WorkspaceTemplateData = z.infer<typeof WorkspaceTemplateData>;

export const WorkspaceTemplate = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string(),
  templateData: WorkspaceTemplateData,
  defaultSettings: WorkspaceSettings.default({}),
  requiredTools: z.array(WorkspaceIntegrationType).default([]),
  isPublic: z.boolean().default(false),
  createdBy: z.string().uuid().optional(),
  usageCount: z.number().min(0).default(0),
  rating: z.number().min(0).max(5).optional(),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WorkspaceTemplate = z.infer<typeof WorkspaceTemplate>;

// Activity log schema
export const WorkspaceActivityDetails = z.object({
  oldValue: z.any().optional(),
  newValue: z.any().optional(),
  changes: z.array(z.object({
    field: z.string(),
    oldValue: z.any(),
    newValue: z.any(),
  })).optional(),
  reason: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});
export type WorkspaceActivityDetails = z.infer<typeof WorkspaceActivityDetails>;

export const WorkspaceActivityLog = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  action: WorkspaceActivityAction,
  resourceType: z.string().optional(),
  resourceId: z.string().uuid().optional(),
  details: WorkspaceActivityDetails.default({}),
  metadata: z.record(z.string(), z.any()).default({}),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  sessionId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
});
export type WorkspaceActivityLog = z.infer<typeof WorkspaceActivityLog>;

// Settings schema
export const WorkspaceSettingsValidationRules = z.object({
  required: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
  options: z.array(z.string()).optional(),
});
export type WorkspaceSettingsValidationRules = z.infer<typeof WorkspaceSettingsValidationRules>;

export const WorkspaceSettingsItem = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  category: z.string(),
  key: z.string(),
  value: z.any(),
  defaultValue: z.any().optional(),
  description: z.string().optional(),
  dataType: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  validationRules: WorkspaceSettingsValidationRules.default({}),
  isSensitive: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WorkspaceSettingsItem = z.infer<typeof WorkspaceSettingsItem>;

// Resource schema
export const WorkspaceResourceMetadata = z.object({
  originalName: z.string().optional(),
  description: z.string().optional(),
  version: z.string().optional(),
  author: z.string().optional(),
  thumbnail: z.string().optional(),
  previewUrl: z.string().optional(),
  externalUrl: z.string().optional(),
  customProperties: z.record(z.string(), z.any()).optional(),
});
export type WorkspaceResourceMetadata = z.infer<typeof WorkspaceResourceMetadata>;

export const WorkspaceResource = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(255),
  type: WorkspaceResourceType,
  filePath: z.string().optional(),
  fileSize: z.number().min(0).optional(),
  mimeType: z.string().optional(),
  checksum: z.string().optional(),
  metadata: WorkspaceResourceMetadata.default({}),
  tags: z.array(z.string()).default([]),
  uploadedBy: z.string().uuid(),
  accessLevel: WorkspaceResourceAccessLevel,
  downloadCount: z.number().min(0).default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
});
export type WorkspaceResource = z.infer<typeof WorkspaceResource>;

// Integration schemas
export const WorkspaceIntegrationConfiguration = z.object({
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  webhook: z.object({
    url: z.string().url(),
    secret: z.string(),
    events: z.array(z.string()),
  }).optional(),
  syncSettings: z.object({
    autoSync: z.boolean().default(true),
    frequency: z.enum(['realtime', 'hourly', 'daily', 'manual']).default('realtime'),
    lastSync: z.string().datetime().optional(),
  }).optional(),
  customSettings: z.record(z.string(), z.any()).optional(),
});
export type WorkspaceIntegrationConfiguration = z.infer<typeof WorkspaceIntegrationConfiguration>;

export const WorkspaceIntegration = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  integrationType: WorkspaceIntegrationType,
  externalId: z.string().optional(),
  configuration: WorkspaceIntegrationConfiguration,
  credentials: z.record(z.string(), z.string()).optional(),
  status: WorkspaceIntegrationStatus,
  lastSyncAt: z.string().datetime().optional(),
  syncFrequency: z.string().optional(),
  errorCount: z.number().min(0).default(0),
  lastError: z.string().optional(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WorkspaceIntegration = z.infer<typeof WorkspaceIntegration>;

// API request/response schemas
export const CreateWorkspaceRequest = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  templateId: z.string().uuid().optional(),
  visibility: WorkspaceVisibility.optional(),
  settings: WorkspaceSettings.optional(),
  metadata: WorkspaceMetadata.optional(),
});
export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequest>;

export const UpdateWorkspaceRequest = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  visibility: WorkspaceVisibility.optional(),
  settings: WorkspaceSettings.optional(),
  metadata: WorkspaceMetadata.optional(),
});
export type UpdateWorkspaceRequest = z.infer<typeof UpdateWorkspaceRequest>;

export const InviteMemberRequest = z.object({
  userId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  role: WorkspaceMemberRole,
  permissions: WorkspaceMemberPermissions.optional(),
  message: z.string().optional(),
}).refine(data => data.userId || data.email, {
  message: "Either userId or email must be provided",
});
export type InviteMemberRequest = z.infer<typeof InviteMemberRequest>;

export const UpdateMemberRequest = z.object({
  role: WorkspaceMemberRole.optional(),
  permissions: WorkspaceMemberPermissions.optional(),
  status: WorkspaceMemberStatus.optional(),
});
export type UpdateMemberRequest = z.infer<typeof UpdateMemberRequest>;

export const CreateTemplateRequest = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string(),
  templateData: WorkspaceTemplateData,
  defaultSettings: WorkspaceSettings.optional(),
  requiredTools: z.array(WorkspaceIntegrationType).optional(),
  isPublic: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});
export type CreateTemplateRequest = z.infer<typeof CreateTemplateRequest>;

export const UploadResourceRequest = z.object({
  name: z.string().min(1).max(255),
  type: WorkspaceResourceType.optional(),
  metadata: WorkspaceResourceMetadata.optional(),
  tags: z.array(z.string()).optional(),
  accessLevel: WorkspaceResourceAccessLevel.optional(),
});
export type UploadResourceRequest = z.infer<typeof UploadResourceRequest>;

export const CreateIntegrationRequest = z.object({
  integrationType: WorkspaceIntegrationType,
  externalId: z.string().optional(),
  configuration: WorkspaceIntegrationConfiguration,
  credentials: z.record(z.string(), z.string()).optional(),
});
export type CreateIntegrationRequest = z.infer<typeof CreateIntegrationRequest>;

// Response schemas
export const WorkspaceWithStats = CollaborativeWorkspace.extend({
  memberCount: z.number(),
  activeMembers: z.number(),
  resourceCount: z.number(),
  activityCount: z.number(),
  integrationCount: z.number(),
});
export type WorkspaceWithStats = z.infer<typeof WorkspaceWithStats>;

export const WorkspaceMemberWithUser = WorkspaceMember.extend({
  user: z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    avatar: z.string().optional(),
  }).optional(),
});
export type WorkspaceMemberWithUser = z.infer<typeof WorkspaceMemberWithUser>;

export const WorkspaceActivityFeedItem = WorkspaceActivityLog.extend({
  user: z.object({
    id: z.string().uuid(),
    name: z.string(),
    avatar: z.string().optional(),
  }).optional(),
  workspace: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }).optional(),
});
export type WorkspaceActivityFeedItem = z.infer<typeof WorkspaceActivityFeedItem>;

// Real-time event schemas
export const WorkspaceRealtimeEvent = z.object({
  type: z.enum([
    'workspace_updated',
    'member_joined',
    'member_left',
    'member_updated',
    'session_started',
    'session_ended',
    'presence_updated',
    'cursor_moved',
    'activity_logged',
    'resource_uploaded',
    'resource_updated',
    'integration_updated',
  ]),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  data: z.any(),
  timestamp: z.string().datetime(),
});
export type WorkspaceRealtimeEvent = z.infer<typeof WorkspaceRealtimeEvent>;

export const WorkspacePresenceUpdate = z.object({
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  presenceData: WorkspaceSessionPresenceData,
  cursorPosition: WorkspaceSessionCursorPosition.optional(),
  timestamp: z.string().datetime(),
});
export type WorkspacePresenceUpdate = z.infer<typeof WorkspacePresenceUpdate>;

// Bulk operations
export const BulkMemberOperation = z.object({
  operation: z.enum(['invite', 'remove', 'update_role', 'update_permissions']),
  memberIds: z.array(z.string().uuid()).optional(),
  emails: z.array(z.string().email()).optional(),
  role: WorkspaceMemberRole.optional(),
  permissions: WorkspaceMemberPermissions.optional(),
});
export type BulkMemberOperation = z.infer<typeof BulkMemberOperation>;

export const BulkResourceOperation = z.object({
  operation: z.enum(['delete', 'move', 'update_access', 'add_tags', 'remove_tags']),
  resourceIds: z.array(z.string().uuid()),
  accessLevel: WorkspaceResourceAccessLevel.optional(),
  tags: z.array(z.string()).optional(),
  targetWorkspaceId: z.string().uuid().optional(),
});
export type BulkResourceOperation = z.infer<typeof BulkResourceOperation>;

// Export data schemas
export const WorkspaceExportOptions = z.object({
  includeMembers: z.boolean().default(true),
  includeActivity: z.boolean().default(false),
  includeResources: z.boolean().default(true),
  includeSettings: z.boolean().default(true),
  includeIntegrations: z.boolean().default(false),
  dateRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }).optional(),
  format: z.enum(['json', 'csv', 'excel']).default('json'),
});
export type WorkspaceExportOptions = z.infer<typeof WorkspaceExportOptions>;

// Analytics schemas
export const WorkspaceAnalytics = z.object({
  workspaceId: z.string().uuid(),
  period: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  metrics: z.object({
    totalMembers: z.number(),
    activeMembers: z.number(),
    newMembers: z.number(),
    totalSessions: z.number(),
    averageSessionDuration: z.number(),
    totalActivities: z.number(),
    resourcesUploaded: z.number(),
    resourcesDownloaded: z.number(),
    integrationEvents: z.number(),
    collaborationEvents: z.number(),
  }),
  trends: z.object({
    memberGrowth: z.array(z.object({
      date: z.string().datetime(),
      count: z.number(),
    })),
    activityTrend: z.array(z.object({
      date: z.string().datetime(),
      count: z.number(),
    })),
    engagementScore: z.number().min(0).max(100),
  }),
  topUsers: z.array(z.object({
    userId: z.string().uuid(),
    name: z.string(),
    activityCount: z.number(),
    sessionCount: z.number(),
    lastActive: z.string().datetime(),
  })),
});
export type WorkspaceAnalytics = z.infer<typeof WorkspaceAnalytics>;

// Search and filtering
export const WorkspaceFilter = z.object({
  status: z.array(WorkspaceStatus).optional(),
  visibility: z.array(WorkspaceVisibility).optional(),
  memberRole: WorkspaceMemberRole.optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  search: z.string().optional(),
});
export type WorkspaceFilter = z.infer<typeof WorkspaceFilter>;

export const WorkspaceSort = z.object({
  field: z.enum(['name', 'createdAt', 'updatedAt', 'memberCount', 'activityCount']),
  direction: z.enum(['asc', 'desc']).default('desc'),
});
export type WorkspaceSort = z.infer<typeof WorkspaceSort>;

export const WorkspaceSearchQuery = z.object({
  query: z.string().optional(),
  filters: WorkspaceFilter.optional(),
  sort: WorkspaceSort.optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});
export type WorkspaceSearchQuery = z.infer<typeof WorkspaceSearchQuery>;

// Pagination
export const PaginatedWorkspaces = z.object({
  items: z.array(WorkspaceWithStats),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});
export type PaginatedWorkspaces = z.infer<typeof PaginatedWorkspaces>;

export const PaginatedMembers = z.object({
  items: z.array(WorkspaceMemberWithUser),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});
export type PaginatedMembers = z.infer<typeof PaginatedMembers>;

export const PaginatedActivities = z.object({
  items: z.array(WorkspaceActivityFeedItem),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});
export type PaginatedActivities = z.infer<typeof PaginatedActivities>;

export const PaginatedResources = z.object({
  items: z.array(WorkspaceResource),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});
export type PaginatedResources = z.infer<typeof PaginatedResources>;

export const PaginatedTemplates = z.object({
  items: z.array(WorkspaceTemplate),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});
export type PaginatedTemplates = z.infer<typeof PaginatedTemplates>;

// Error types
export const WorkspaceError = z.object({
  code: z.enum([
    'WORKSPACE_NOT_FOUND',
    'WORKSPACE_ACCESS_DENIED',
    'WORKSPACE_LIMIT_EXCEEDED',
    'MEMBER_NOT_FOUND',
    'MEMBER_ACCESS_DENIED',
    'MEMBER_LIMIT_EXCEEDED',
    'TEMPLATE_NOT_FOUND',
    'RESOURCE_NOT_FOUND',
    'RESOURCE_ACCESS_DENIED',
    'INTEGRATION_NOT_FOUND',
    'INTEGRATION_CONFIG_INVALID',
    'SESSION_EXPIRED',
    'VALIDATION_ERROR',
    'CONFLICT_ERROR',
  ]),
  message: z.string(),
  details: z.record(z.string(), z.any()).optional(),
});
export type WorkspaceError = z.infer<typeof WorkspaceError>;