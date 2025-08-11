// Whiteboard components
export { default as WhiteboardCanvas } from './WhiteboardCanvas';
export { default as WhiteboardEditor } from './WhiteboardEditor';
export { default as WhiteboardToolbar } from './WhiteboardToolbar';
export { default as WhiteboardList } from './WhiteboardList';

// Presence and collaboration components
export { WhiteboardPresence } from './WhiteboardPresence';
export { WhiteboardPresencePanel } from './WhiteboardPresencePanel';
export { UserAvatar, UserAvatarGroup, UserActivityStatus } from './UserAvatar';
export { PresenceTooltip } from './PresenceTooltip';

// Cross-service integration components
export { default as UnifiedSearchModal } from './search/UnifiedSearchModal';
export { default as KanbanCardElement } from './elements/KanbanCardElement';
export { default as WikiPageElement } from './elements/WikiPageElement';
export { default as MemoryNodeElement } from './elements/MemoryNodeElement';

// Context and providers
export { 
  WhiteboardProvider,
  useWhiteboardContext,
  useWhiteboardState,
  useWhiteboardActions,
  useWhiteboardSelection,
  useWhiteboardStatus,
  useWhiteboardCollaboration,
} from './WhiteboardProvider';

// Custom hooks
export { useWhiteboard } from './hooks/useWhiteboard';
export { useWhiteboardCanvas } from './hooks/useWhiteboardCanvas';
export { useWhiteboardPersistence } from './hooks/useWhiteboardPersistence';

// Enhanced presence and collaboration hooks
export { useEnhancedPresence } from './hooks/useEnhancedPresence';
export { useActivityAwareness } from './hooks/useActivityAwareness';

// Integration hooks
export { useUnifiedSearch } from './hooks/useUnifiedSearch';
export { useWhiteboardIntegration } from './hooks/useWhiteboardIntegration';

// Utilities
export * from './utils/tldraw-serialization';
export * from './utils/canvas-export';
export * from './utils/workspace-theming';