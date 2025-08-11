import { z } from 'zod';

/**
 * Whiteboard types for collaborative real-time whiteboard functionality
 */

// Base enums and types
export const WhiteboardStatus = z.enum(['active', 'archived', 'deleted']);
export type WhiteboardStatus = z.infer<typeof WhiteboardStatus>;

export const WhiteboardVisibility = z.enum(['workspace', 'members', 'public']);
export type WhiteboardVisibility = z.infer<typeof WhiteboardVisibility>;

export const WhiteboardRole = z.enum(['owner', 'editor', 'viewer', 'commenter']);
export type WhiteboardRole = z.infer<typeof WhiteboardRole>;

export const WhiteboardElementType = z.enum([
  'rectangle', 'ellipse', 'triangle', 'line', 'arrow', 'freehand',
  'text', 'sticky_note', 'image', 'link', 'frame', 'group',
  'connector', 'shape', 'chart', 'table'
]);
export type WhiteboardElementType = z.infer<typeof WhiteboardElementType>;

export const WhiteboardChangeType = z.enum(['major', 'minor', 'auto_save', 'conflict_resolution']);
export type WhiteboardChangeType = z.infer<typeof WhiteboardChangeType>;

export const WhiteboardActivityAction = z.enum([
  // Whiteboard level
  'whiteboard_created', 'whiteboard_updated', 'whiteboard_deleted', 'whiteboard_archived',
  'whiteboard_restored', 'whiteboard_shared', 'whiteboard_duplicated',
  
  // Element level
  'element_created', 'element_updated', 'element_deleted', 'element_moved',
  'element_resized', 'element_styled', 'element_grouped', 'element_ungrouped',
  'element_locked', 'element_unlocked', 'element_duplicated',
  
  // Collaboration
  'session_started', 'session_ended', 'cursor_moved', 'selection_changed',
  'comment_added', 'comment_updated', 'comment_deleted', 'comment_resolved',
  
  // Template actions
  'template_applied', 'template_created', 'template_updated',
  
  // Permission actions
  'permission_granted', 'permission_revoked', 'permission_updated',
  
  // Version control
  'version_saved', 'version_restored'
]);
export type WhiteboardActivityAction = z.infer<typeof WhiteboardActivityAction>;

// Canvas and geometry types
export const Point = z.object({
  x: z.number(),
  y: z.number(),
});
export type Point = z.infer<typeof Point>;

export const Size = z.object({
  width: z.number(),
  height: z.number(),
});
export type Size = z.infer<typeof Size>;

export const Bounds = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type Bounds = z.infer<typeof Bounds>;

export const ViewportData = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  zoom: z.number().min(0.1).max(10).default(1),
});
export type ViewportData = z.infer<typeof ViewportData>;

// Style and appearance types
export const ColorData = z.object({
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().min(0).optional(),
  opacity: z.number().min(0).max(1).default(1),
});
export type ColorData = z.infer<typeof ColorData>;

export const TextStyle = z.object({
  fontFamily: z.string().default('Arial'),
  fontSize: z.number().min(8).max(200).default(16),
  fontWeight: z.enum(['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900']).default('normal'),
  fontStyle: z.enum(['normal', 'italic']).default('normal'),
  textAlign: z.enum(['left', 'center', 'right', 'justify']).default('left'),
  textDecoration: z.enum(['none', 'underline', 'strikethrough']).default('none'),
  color: z.string().default('#000000'),
  lineHeight: z.number().min(0.5).max(3).default(1.2),
});
export type TextStyle = z.infer<typeof TextStyle>;

export const ElementStyle = z.object({
  color: ColorData.optional(),
  text: TextStyle.optional(),
  borderRadius: z.number().min(0).optional(),
  shadow: z.object({
    offsetX: z.number(),
    offsetY: z.number(),
    blur: z.number().min(0),
    color: z.string(),
  }).optional(),
  gradient: z.object({
    type: z.enum(['linear', 'radial']),
    stops: z.array(z.object({
      offset: z.number().min(0).max(1),
      color: z.string(),
    })),
  }).optional(),
});
export type ElementStyle = z.infer<typeof ElementStyle>;

// Element data schemas
export const BaseElementData = z.object({
  position: Point,
  size: Size.optional(),
  rotation: z.number().default(0),
  bounds: Bounds.optional(),
});

export const RectangleElementData = BaseElementData.extend({
  cornerRadius: z.number().min(0).default(0),
});
export type RectangleElementData = z.infer<typeof RectangleElementData>;

export const EllipseElementData = BaseElementData;
export type EllipseElementData = z.infer<typeof EllipseElementData>;

export const TextElementData = BaseElementData.extend({
  text: z.string(),
  autoResize: z.boolean().default(true),
  maxWidth: z.number().optional(),
});
export type TextElementData = z.infer<typeof TextElementData>;

export const ImageElementData = BaseElementData.extend({
  src: z.string(), // URL or data URI
  alt: z.string().optional(),
  preserveAspectRatio: z.boolean().default(true),
  cropData: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }).optional(),
});
export type ImageElementData = z.infer<typeof ImageElementData>;

export const LineElementData = z.object({
  start: Point,
  end: Point,
  controlPoints: z.array(Point).optional(), // For bezier curves
});
export type LineElementData = z.infer<typeof LineElementData>;

export const ArrowElementData = LineElementData.extend({
  startArrowhead: z.enum(['none', 'triangle', 'circle', 'square']).default('none'),
  endArrowhead: z.enum(['none', 'triangle', 'circle', 'square']).default('triangle'),
});
export type ArrowElementData = z.infer<typeof ArrowElementData>;

export const FreehandElementData = z.object({
  points: z.array(Point), // Series of points for freehand drawing
  pressure: z.array(z.number()).optional(), // Pressure sensitivity data
  smoothing: z.number().min(0).max(1).default(0.5),
});
export type FreehandElementData = z.infer<typeof FreehandElementData>;

export const StickyNoteElementData = BaseElementData.extend({
  text: z.string(),
  color: z.string().default('#FFD700'), // Default yellow
});
export type StickyNoteElementData = z.infer<typeof StickyNoteElementData>;

export const FrameElementData = BaseElementData.extend({
  title: z.string().optional(),
  backgroundColor: z.string().optional(),
  childrenIds: z.array(z.string().uuid()).default([]),
});
export type FrameElementData = z.infer<typeof FrameElementData>;

// Union type for all element data
export const WhiteboardElementData = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rectangle'), data: RectangleElementData }),
  z.object({ type: z.literal('ellipse'), data: EllipseElementData }),
  z.object({ type: z.literal('text'), data: TextElementData }),
  z.object({ type: z.literal('image'), data: ImageElementData }),
  z.object({ type: z.literal('line'), data: LineElementData }),
  z.object({ type: z.literal('arrow'), data: ArrowElementData }),
  z.object({ type: z.literal('freehand'), data: FreehandElementData }),
  z.object({ type: z.literal('sticky_note'), data: StickyNoteElementData }),
  z.object({ type: z.literal('frame'), data: FrameElementData }),
  // Generic fallback for custom elements
  z.object({ type: z.string(), data: z.record(z.string(), z.any()) }),
]);
export type WhiteboardElementData = z.infer<typeof WhiteboardElementData>;

// Canvas configuration
export const WhiteboardCanvasData = z.object({
  viewport: ViewportData.default({}),
  background: z.object({
    color: z.string().default('#ffffff'),
    pattern: z.enum(['none', 'dots', 'grid', 'lines']).default('none'),
    patternColor: z.string().default('#e5e5e5'),
    patternSize: z.number().min(5).max(100).default(20),
  }).default({}),
  dimensions: Size.optional(), // Canvas size limits (optional)
  gridSnap: z.object({
    enabled: z.boolean().default(false),
    size: z.number().min(5).max(50).default(10),
  }).default({}),
});
export type WhiteboardCanvasData = z.infer<typeof WhiteboardCanvasData>;

// Settings and preferences
export const WhiteboardSettings = z.object({
  collaboration: z.object({
    enableRealTimeUpdates: z.boolean().default(true),
    enablePresenceIndicators: z.boolean().default(true),
    enableCursors: z.boolean().default(true),
    enableComments: z.boolean().default(true),
    conflictResolution: z.enum(['manual', 'auto_merge', 'last_writer_wins']).default('manual'),
    autoSaveInterval: z.number().min(10).max(300).default(30), // seconds
  }).default({}),
  
  editing: z.object({
    snapToGrid: z.boolean().default(false),
    snapToObjects: z.boolean().default(true),
    showRulers: z.boolean().default(false),
    showGuides: z.boolean().default(true),
    enableUndo: z.boolean().default(true),
    undoStackSize: z.number().min(10).max(100).default(50),
  }).default({}),
  
  display: z.object({
    showElementBounds: z.boolean().default(false),
    showElementHandles: z.boolean().default(true),
    showLayerPanel: z.boolean().default(false),
    showMinimap: z.boolean().default(false),
    theme: z.enum(['light', 'dark', 'auto']).default('light'),
  }).default({}),
  
  performance: z.object({
    enableVirtualization: z.boolean().default(true),
    maxElementsPerView: z.number().min(100).max(10000).default(1000),
    lowLatencyMode: z.boolean().default(false),
  }).default({}),
});
export type WhiteboardSettings = z.infer<typeof WhiteboardSettings>;

// Permissions system
export const WhiteboardPermissions = z.object({
  canEdit: z.boolean().default(false),
  canDelete: z.boolean().default(false),
  canComment: z.boolean().default(true),
  canShare: z.boolean().default(false),
  canManagePermissions: z.boolean().default(false),
  canExport: z.boolean().default(false),
  canCreateTemplates: z.boolean().default(false),
  canViewHistory: z.boolean().default(false),
  canRestoreVersions: z.boolean().default(false),
  
  // Element-level permissions
  elementPermissions: z.object({
    canCreateElements: z.boolean().default(true),
    canEditElements: z.boolean().default(true),
    canDeleteElements: z.boolean().default(false),
    canMoveElements: z.boolean().default(true),
    canStyleElements: z.boolean().default(true),
    canGroupElements: z.boolean().default(true),
    restrictedElementTypes: z.array(WhiteboardElementType).default([]),
  }).default({}),
});
export type WhiteboardPermissions = z.infer<typeof WhiteboardPermissions>;

// Core schemas
export const Whiteboard = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  thumbnail: z.string().optional(),
  canvasData: WhiteboardCanvasData.default({}),
  settings: WhiteboardSettings.default({}),
  templateId: z.string().uuid().optional(),
  isTemplate: z.boolean().default(false),
  visibility: WhiteboardVisibility.default('workspace'),
  status: WhiteboardStatus.default('active'),
  version: z.number().min(1).default(1),
  createdBy: z.string().uuid(),
  lastModifiedBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
});
export type Whiteboard = z.infer<typeof Whiteboard>;

export const WhiteboardElement = z.object({
  id: z.string().uuid(),
  whiteboardId: z.string().uuid(),
  elementType: WhiteboardElementType,
  elementData: z.record(z.string(), z.any()), // Flexible element data storage
  layerIndex: z.number().default(0),
  parentId: z.string().uuid().optional(),
  locked: z.boolean().default(false),
  visible: z.boolean().default(true),
  styleData: ElementStyle.default({}),
  metadata: z.record(z.string(), z.any()).default({}),
  version: z.number().min(1).default(1),
  createdBy: z.string().uuid(),
  lastModifiedBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
});
export type WhiteboardElement = z.infer<typeof WhiteboardElement>;

// Session and presence schemas
export const WhiteboardCursorPosition = z.object({
  x: z.number(),
  y: z.number(),
  elementId: z.string().uuid().optional(),
  isDrawing: z.boolean().default(false),
});
export type WhiteboardCursorPosition = z.infer<typeof WhiteboardCursorPosition>;

export const WhiteboardSelectionData = z.object({
  elementIds: z.array(z.string().uuid()).default([]),
  bounds: Bounds.optional(),
  isMultiSelect: z.boolean().default(false),
});
export type WhiteboardSelectionData = z.infer<typeof WhiteboardSelectionData>;

export const WhiteboardPresenceData = z.object({
  userId: z.string().uuid(),
  userName: z.string(),
  userColor: z.string().optional(),
  userAvatar: z.string().optional(),
  isActive: z.boolean().default(true),
  lastSeen: z.string().datetime(),
  currentTool: z.string().optional(),
  customStatus: z.string().optional(),
});
export type WhiteboardPresenceData = z.infer<typeof WhiteboardPresenceData>;

export const WhiteboardToolsState = z.object({
  activeTool: z.string().default('select'),
  toolSettings: z.record(z.string(), z.any()).default({}),
  penSettings: z.object({
    size: z.number().min(1).max(50).default(3),
    color: z.string().default('#000000'),
    opacity: z.number().min(0).max(1).default(1),
  }).optional(),
  textSettings: z.object({
    font: TextStyle,
  }).optional(),
  shapeSettings: z.object({
    style: ElementStyle,
  }).optional(),
});
export type WhiteboardToolsState = z.infer<typeof WhiteboardToolsState>;

export const WhiteboardSession = z.object({
  id: z.string().uuid(),
  whiteboardId: z.string().uuid(),
  userId: z.string().uuid(),
  sessionToken: z.string(),
  connectionId: z.string().optional(),
  cursorPosition: WhiteboardCursorPosition.optional(),
  selectionData: WhiteboardSelectionData.default({}),
  viewportData: ViewportData.default({}),
  presenceData: WhiteboardPresenceData,
  toolsState: WhiteboardToolsState.default({}),
  isActive: z.boolean().default(true),
  permissions: WhiteboardPermissions.default({}),
  startedAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
});
export type WhiteboardSession = z.infer<typeof WhiteboardSession>;

// Permission and access schemas
export const WhiteboardPermission = z.object({
  id: z.string().uuid(),
  whiteboardId: z.string().uuid(),
  userId: z.string().uuid(),
  role: WhiteboardRole,
  permissions: WhiteboardPermissions,
  grantedBy: z.string().uuid(),
  expiresAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WhiteboardPermission = z.infer<typeof WhiteboardPermission>;

// Template system
export const WhiteboardTemplateData = z.object({
  canvasData: WhiteboardCanvasData.default({}),
  defaultElements: z.array(z.object({
    elementType: WhiteboardElementType,
    elementData: z.record(z.string(), z.any()),
    styleData: ElementStyle.default({}),
    layerIndex: z.number().default(0),
  })).default([]),
  defaultSettings: WhiteboardSettings.default({}),
  placeholders: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    type: z.enum(['text', 'image', 'color', 'number']),
    defaultValue: z.any().optional(),
  })).default([]),
});
export type WhiteboardTemplateData = z.infer<typeof WhiteboardTemplateData>;

export const WhiteboardTemplate = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string(),
  thumbnail: z.string().optional(),
  templateData: WhiteboardTemplateData,
  defaultSettings: WhiteboardSettings.default({}),
  tags: z.array(z.string()).default([]),
  isPublic: z.boolean().default(false),
  workspaceId: z.string().uuid().optional(),
  usageCount: z.number().min(0).default(0),
  rating: z.number().min(0).max(5).optional(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WhiteboardTemplate = z.infer<typeof WhiteboardTemplate>;

// Activity and audit trail
export const WhiteboardActivityDetails = z.object({
  elementId: z.string().uuid().optional(),
  elementType: WhiteboardElementType.optional(),
  oldValue: z.any().optional(),
  newValue: z.any().optional(),
  changes: z.array(z.object({
    field: z.string(),
    oldValue: z.any(),
    newValue: z.any(),
  })).optional(),
  operationId: z.string().uuid().optional(), // For grouping related operations
  position: Point.optional(),
  bounds: Bounds.optional(),
  metadata: z.record(z.string(), z.any()).default({}),
});
export type WhiteboardActivityDetails = z.infer<typeof WhiteboardActivityDetails>;

export const WhiteboardActivityLog = z.object({
  id: z.string().uuid(),
  whiteboardId: z.string().uuid(),
  userId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  action: WhiteboardActivityAction,
  targetType: z.string(),
  targetId: z.string().uuid().optional(),
  actionData: WhiteboardActivityDetails.default({}),
  oldData: z.record(z.string(), z.any()).optional(),
  newData: z.record(z.string(), z.any()).optional(),
  operationId: z.string().uuid().optional(),
  clientMetadata: z.record(z.string(), z.any()).default({}),
  createdAt: z.string().datetime(),
});
export type WhiteboardActivityLog = z.infer<typeof WhiteboardActivityLog>;

// Comments and collaboration
export const WhiteboardComment = z.object({
  id: z.string().uuid(),
  whiteboardId: z.string().uuid(),
  elementId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
  content: z.string(),
  contentType: z.enum(['text', 'markdown']).default('text'),
  position: Point.optional(), // Position on canvas
  resolved: z.boolean().default(false),
  resolvedBy: z.string().uuid().optional(),
  resolvedAt: z.string().datetime().optional(),
  mentions: z.array(z.string().uuid()).default([]),
  attachments: z.record(z.string(), z.any()).default({}),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
});
export type WhiteboardComment = z.infer<typeof WhiteboardComment>;

// Version control
export const WhiteboardVersionSnapshot = z.object({
  whiteboardData: Whiteboard,
  elements: z.array(WhiteboardElement),
  metadata: z.record(z.string(), z.any()).default({}),
});
export type WhiteboardVersionSnapshot = z.infer<typeof WhiteboardVersionSnapshot>;

export const WhiteboardVersion = z.object({
  id: z.string().uuid(),
  whiteboardId: z.string().uuid(),
  versionNumber: z.number().min(1),
  snapshotData: WhiteboardVersionSnapshot,
  changesSummary: z.record(z.string(), z.any()).default({}),
  changeType: WhiteboardChangeType,
  createdBy: z.string().uuid(),
  commitMessage: z.string().optional(),
  isAutomatic: z.boolean().default(false),
  createdAt: z.string().datetime(),
});
export type WhiteboardVersion = z.infer<typeof WhiteboardVersion>;

// API Request/Response schemas
export const CreateWhiteboardRequest = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  templateId: z.string().uuid().optional(),
  visibility: WhiteboardVisibility.optional(),
  settings: WhiteboardSettings.optional(),
  canvasData: WhiteboardCanvasData.optional(),
});
export type CreateWhiteboardRequest = z.infer<typeof CreateWhiteboardRequest>;

export const UpdateWhiteboardRequest = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  visibility: WhiteboardVisibility.optional(),
  settings: WhiteboardSettings.optional(),
  canvasData: WhiteboardCanvasData.optional(),
});
export type UpdateWhiteboardRequest = z.infer<typeof UpdateWhiteboardRequest>;

export const CreateElementRequest = z.object({
  elementType: WhiteboardElementType,
  elementData: z.record(z.string(), z.any()),
  styleData: ElementStyle.optional(),
  parentId: z.string().uuid().optional(),
  layerIndex: z.number().optional(),
});
export type CreateElementRequest = z.infer<typeof CreateElementRequest>;

export const UpdateElementRequest = z.object({
  elementData: z.record(z.string(), z.any()).optional(),
  styleData: ElementStyle.optional(),
  layerIndex: z.number().optional(),
  locked: z.boolean().optional(),
  visible: z.boolean().optional(),
  parentId: z.string().uuid().optional(),
});
export type UpdateElementRequest = z.infer<typeof UpdateElementRequest>;

export const GrantPermissionRequest = z.object({
  userId: z.string().uuid(),
  role: WhiteboardRole,
  permissions: WhiteboardPermissions.optional(),
  expiresAt: z.string().datetime().optional(),
});
export type GrantPermissionRequest = z.infer<typeof GrantPermissionRequest>;

export const CreateTemplateRequest = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string(),
  templateData: WhiteboardTemplateData.optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
});
export type CreateTemplateRequest = z.infer<typeof CreateTemplateRequest>;

export const CreateCommentRequest = z.object({
  content: z.string().min(1),
  elementId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
  position: Point.optional(),
  mentions: z.array(z.string().uuid()).optional(),
});
export type CreateCommentRequest = z.infer<typeof CreateCommentRequest>;

// Response schemas with additional data
export const WhiteboardWithStats = Whiteboard.extend({
  elementCount: z.number(),
  collaboratorCount: z.number(),
  commentCount: z.number(),
  lastActivity: z.string().datetime().optional(),
  isCollaborating: z.boolean().default(false),
});
export type WhiteboardWithStats = z.infer<typeof WhiteboardWithStats>;

export const WhiteboardWithElements = Whiteboard.extend({
  elements: z.array(WhiteboardElement),
  activeSessions: z.number().default(0),
  permissions: WhiteboardPermissions.optional(),
});
export type WhiteboardWithElements = z.infer<typeof WhiteboardWithElements>;

// Real-time event schemas
export const WhiteboardRealtimeEvent = z.object({
  type: z.enum([
    'whiteboard_updated',
    'element_created',
    'element_updated',
    'element_deleted',
    'user_joined',
    'user_left',
    'cursor_moved',
    'selection_changed',
    'comment_added',
    'comment_updated',
    'comment_resolved',
    'permission_changed',
    'version_saved',
  ]),
  whiteboardId: z.string().uuid(),
  userId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  data: z.any(),
  timestamp: z.string().datetime(),
});
export type WhiteboardRealtimeEvent = z.infer<typeof WhiteboardRealtimeEvent>;

export const WhiteboardPresenceEvent = z.object({
  sessionId: z.string().uuid(),
  whiteboardId: z.string().uuid(),
  userId: z.string().uuid(),
  presenceData: WhiteboardPresenceData,
  cursorPosition: WhiteboardCursorPosition.optional(),
  selectionData: WhiteboardSelectionData.optional(),
  timestamp: z.string().datetime(),
});
export type WhiteboardPresenceEvent = z.infer<typeof WhiteboardPresenceEvent>;

// Bulk operations
export const BulkElementOperation = z.object({
  operation: z.enum(['create', 'update', 'delete', 'move', 'style', 'group', 'ungroup']),
  elementIds: z.array(z.string().uuid()),
  data: z.record(z.string(), z.any()).optional(),
  layerIndexDelta: z.number().optional(),
  targetParentId: z.string().uuid().optional(),
});
export type BulkElementOperation = z.infer<typeof BulkElementOperation>;

// Search and filtering
export const WhiteboardFilter = z.object({
  status: z.array(WhiteboardStatus).optional(),
  visibility: z.array(WhiteboardVisibility).optional(),
  createdBy: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  hasElements: z.boolean().optional(),
  hasComments: z.boolean().optional(),
  isCollaborating: z.boolean().optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  updatedAfter: z.string().datetime().optional(),
  updatedBefore: z.string().datetime().optional(),
  search: z.string().optional(),
});
export type WhiteboardFilter = z.infer<typeof WhiteboardFilter>;

export const WhiteboardSort = z.object({
  field: z.enum(['name', 'createdAt', 'updatedAt', 'elementCount', 'collaboratorCount']),
  direction: z.enum(['asc', 'desc']).default('desc'),
});
export type WhiteboardSort = z.infer<typeof WhiteboardSort>;

// Pagination
export const PaginatedWhiteboards = z.object({
  items: z.array(WhiteboardWithStats),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});
export type PaginatedWhiteboards = z.infer<typeof PaginatedWhiteboards>;

export const PaginatedElements = z.object({
  items: z.array(WhiteboardElement),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});
export type PaginatedElements = z.infer<typeof PaginatedElements>;

export const PaginatedComments = z.object({
  items: z.array(WhiteboardComment),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});
export type PaginatedComments = z.infer<typeof PaginatedComments>;

export const PaginatedTemplates = z.object({
  items: z.array(WhiteboardTemplate),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});
export type PaginatedTemplates = z.infer<typeof PaginatedTemplates>;

export const PaginatedVersions = z.object({
  items: z.array(WhiteboardVersion),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});
export type PaginatedVersions = z.infer<typeof PaginatedVersions>;

// Error types
export const WhiteboardError = z.object({
  code: z.enum([
    'WHITEBOARD_NOT_FOUND',
    'WHITEBOARD_ACCESS_DENIED',
    'ELEMENT_NOT_FOUND',
    'ELEMENT_ACCESS_DENIED',
    'TEMPLATE_NOT_FOUND',
    'PERMISSION_DENIED',
    'SESSION_EXPIRED',
    'VERSION_CONFLICT',
    'INVALID_ELEMENT_DATA',
    'INVALID_OPERATION',
    'WORKSPACE_LIMIT_EXCEEDED',
    'COLLABORATION_ERROR',
    'VALIDATION_ERROR',
  ]),
  message: z.string(),
  details: z.record(z.string(), z.any()).optional(),
});
export type WhiteboardError = z.infer<typeof WhiteboardError>;

// Analytics schemas
export const WhiteboardAnalytics = z.object({
  whiteboardId: z.string().uuid(),
  period: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  metrics: z.object({
    totalElements: z.number(),
    elementsCreated: z.number(),
    elementsModified: z.number(),
    elementsDeleted: z.number(),
    totalCollaborators: z.number(),
    activeCollaborators: z.number(),
    totalSessions: z.number(),
    totalCommentsAdded: z.number(),
    totalVersions: z.number(),
    averageSessionDuration: z.number(),
  }),
  elementTypeBreakdown: z.record(z.string(), z.number()),
  collaborationPatterns: z.array(z.object({
    userId: z.string().uuid(),
    sessionCount: z.number(),
    elementsCreated: z.number(),
    commentsAdded: z.number(),
    lastActive: z.string().datetime(),
  })),
  activityTimeline: z.array(z.object({
    timestamp: z.string().datetime(),
    action: WhiteboardActivityAction,
    count: z.number(),
  })),
});
export type WhiteboardAnalytics = z.infer<typeof WhiteboardAnalytics>;