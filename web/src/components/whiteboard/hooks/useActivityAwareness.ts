/**
 * Activity Awareness Hook
 * 
 * Automatically detects and tracks user activities for whiteboard collaboration:
 * - Drawing detection (canvas interactions)
 * - Typing detection (input focus and keystrokes)
 * - Selection detection (element selection changes)
 * - Commenting detection (comment modals/inputs)
 * - Idle detection (no activity for specified time)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ActivityInfo, ActivityType } from './useEnhancedPresence';

export interface UseActivityAwarenessOptions {
  // Activity detection settings
  enableDrawingDetection?: boolean;
  enableTypingDetection?: boolean;
  enableSelectionDetection?: boolean;
  enableCommentingDetection?: boolean;
  
  // Timing configuration
  typingDebounceMs?: number; // How long to wait before stopping "typing"
  drawingDebounceMs?: number; // How long to wait before stopping "drawing"
  idleThresholdMs?: number; // Time before considering user idle
  
  // Activity callbacks
  onActivityChange?: (activity: ActivityInfo) => void;
  onActivityStart?: (activityType: ActivityType) => void;
  onActivityEnd?: (activityType: ActivityType) => void;
  
  // Canvas/editor references
  canvasElement?: HTMLElement | null;
  editorContainer?: HTMLElement | null;
}

export interface UseActivityAwarenessResult {
  // Current activity state
  currentActivity: ActivityInfo;
  isActive: boolean;
  
  // Manual activity updates
  setActivity: (type: ActivityType, elementId?: string, description?: string) => void;
  setIdle: () => void;
  
  // Activity history
  activityHistory: ActivityInfo[];
  
  // Detection status
  detectionStatus: {
    drawing: boolean;
    typing: boolean;
    selecting: boolean;
    commenting: boolean;
  };
}

export function useActivityAwareness(options: UseActivityAwarenessOptions = {}): UseActivityAwarenessResult {
  const {
    enableDrawingDetection = true,
    enableTypingDetection = true,
    enableSelectionDetection = true,
    enableCommentingDetection = true,
    typingDebounceMs = 2000,
    drawingDebounceMs = 1000,
    idleThresholdMs = 30000,
    onActivityChange,
    onActivityStart,
    onActivityEnd,
    canvasElement,
    editorContainer,
  } = options;

  // State management
  const [currentActivity, setCurrentActivity] = useState<ActivityInfo>({
    type: 'idle',
    timestamp: Date.now(),
  });
  
  const [activityHistory, setActivityHistory] = useState<ActivityInfo[]>([]);
  const [isActive, setIsActive] = useState(false);

  // Refs for timers and tracking
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const drawingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityTimeRef = useRef<number>(Date.now());
  const currentActivityTypeRef = useRef<ActivityType>('idle');

  // Detection status
  const [detectionStatus, setDetectionStatus] = useState({
    drawing: false,
    typing: false,
    selecting: false,
    commenting: false,
  });

  // Update activity with history tracking
  const updateActivity = useCallback((
    type: ActivityType,
    elementId?: string,
    description?: string,
    skipHistory = false
  ) => {
    const now = Date.now();
    const newActivity: ActivityInfo = {
      type,
      elementId,
      description,
      timestamp: now,
    };

    // Update current activity
    setCurrentActivity(newActivity);
    setIsActive(type !== 'idle');
    lastActivityTimeRef.current = now;
    
    // Track activity change
    if (currentActivityTypeRef.current !== type) {
      if (onActivityEnd && currentActivityTypeRef.current !== 'idle') {
        onActivityEnd(currentActivityTypeRef.current);
      }
      if (onActivityStart && type !== 'idle') {
        onActivityStart(type);
      }
      currentActivityTypeRef.current = type;
    }

    // Add to history (limit to last 20 activities)
    if (!skipHistory) {
      setActivityHistory(prev => {
        const updated = [newActivity, ...prev].slice(0, 20);
        return updated;
      });
    }

    // Callback for external handling
    if (onActivityChange) {
      onActivityChange(newActivity);
    }

    // Reset idle timer
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }
    idleTimeoutRef.current = setTimeout(() => {
      if (Date.now() - lastActivityTimeRef.current >= idleThresholdMs) {
        updateActivity('idle', undefined, 'Auto-idle timeout', true);
      }
    }, idleThresholdMs);
  }, [onActivityChange, onActivityStart, onActivityEnd, idleThresholdMs]);

  // Manual activity setters
  const setActivity = useCallback((
    type: ActivityType,
    elementId?: string,
    description?: string
  ) => {
    updateActivity(type, elementId, description);
  }, [updateActivity]);

  const setIdle = useCallback(() => {
    updateActivity('idle', undefined, 'Manual idle');
  }, [updateActivity]);

  // Drawing detection
  useEffect(() => {
    if (!enableDrawingDetection || !canvasElement) return;

    const handleDrawingStart = (event: Event) => {
      // Check if this is a drawing interaction (not just navigation)
      const target = event.target as HTMLElement;
      const isDrawingTool = target.closest('[data-drawing-tool]') || 
                           target.closest('canvas') ||
                           target.closest('[data-tldraw-canvas]');
      
      if (isDrawingTool) {
        updateActivity('drawing', undefined, 'Drawing on canvas');
        setDetectionStatus(prev => ({ ...prev, drawing: true }));

        // Reset drawing timeout
        if (drawingTimeoutRef.current) {
          clearTimeout(drawingTimeoutRef.current);
        }
        drawingTimeoutRef.current = setTimeout(() => {
          setDetectionStatus(prev => ({ ...prev, drawing: false }));
          if (currentActivityTypeRef.current === 'drawing') {
            updateActivity('idle', undefined, 'Finished drawing');
          }
        }, drawingDebounceMs);
      }
    };

    const handleDrawingMove = (event: MouseEvent) => {
      // Only track if mouse is down (actual drawing)
      if (event.buttons > 0) {
        const target = event.target as HTMLElement;
        const isDrawingTool = target.closest('[data-drawing-tool]') || 
                             target.closest('canvas') ||
                             target.closest('[data-tldraw-canvas]');
        
        if (isDrawingTool) {
          updateActivity('drawing', undefined, 'Drawing on canvas');
          
          // Reset drawing timeout
          if (drawingTimeoutRef.current) {
            clearTimeout(drawingTimeoutRef.current);
          }
          drawingTimeoutRef.current = setTimeout(() => {
            setDetectionStatus(prev => ({ ...prev, drawing: false }));
            if (currentActivityTypeRef.current === 'drawing') {
              updateActivity('idle', undefined, 'Finished drawing');
            }
          }, drawingDebounceMs);
        }
      }
    };

    const events = ['mousedown', 'touchstart'];
    const moveEvents = ['mousemove', 'touchmove'];

    events.forEach(event => {
      canvasElement.addEventListener(event, handleDrawingStart);
    });
    
    moveEvents.forEach(event => {
      canvasElement.addEventListener(event, handleDrawingMove);
    });

    return () => {
      events.forEach(event => {
        canvasElement.removeEventListener(event, handleDrawingStart);
      });
      moveEvents.forEach(event => {
        canvasElement.removeEventListener(event, handleDrawingMove);
      });
    };
  }, [enableDrawingDetection, canvasElement, updateActivity, drawingDebounceMs]);

  // Typing detection
  useEffect(() => {
    if (!enableTypingDetection) return;

    const handleTypingStart = (event: Event) => {
      const target = event.target as HTMLElement;
      
      // Check if typing in input/textarea/contenteditable
      const isTypingElement = target.tagName === 'INPUT' || 
                            target.tagName === 'TEXTAREA' ||
                            target.contentEditable === 'true' ||
                            target.closest('[data-text-editor]') ||
                            target.closest('[data-comment-input]');

      if (isTypingElement) {
        let description = 'Typing';
        let elementId: string | undefined;

        // Get more specific description
        if (target.closest('[data-comment-input]')) {
          description = 'Typing comment';
          elementId = target.closest('[data-comment-input]')?.getAttribute('data-element-id') || undefined;
        } else if (target.closest('[data-text-editor]')) {
          description = 'Editing text';
          elementId = target.closest('[data-text-editor]')?.getAttribute('data-element-id') || undefined;
        }

        updateActivity('typing', elementId, description);
        setDetectionStatus(prev => ({ ...prev, typing: true }));

        // Reset typing timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
          setDetectionStatus(prev => ({ ...prev, typing: false }));
          if (currentActivityTypeRef.current === 'typing') {
            updateActivity('idle', undefined, 'Finished typing');
          }
        }, typingDebounceMs);
      }
    };

    const handleFocus = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      
      // Handle comment input focus specifically
      if (target.closest('[data-comment-input]')) {
        updateActivity('commenting', 
          target.closest('[data-comment-input]')?.getAttribute('data-element-id') || undefined,
          'Started commenting'
        );
        setDetectionStatus(prev => ({ ...prev, commenting: true }));
      }
    };

    const handleBlur = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      
      if (target.closest('[data-comment-input]')) {
        setDetectionStatus(prev => ({ ...prev, commenting: false }));
        if (currentActivityTypeRef.current === 'commenting') {
          updateActivity('idle', undefined, 'Finished commenting');
        }
      }
    };

    // Listen for typing events globally
    document.addEventListener('keypress', handleTypingStart);
    document.addEventListener('input', handleTypingStart);
    document.addEventListener('focusin', handleFocus);
    document.addEventListener('focusout', handleBlur);

    return () => {
      document.removeEventListener('keypress', handleTypingStart);
      document.removeEventListener('input', handleTypingStart);
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('focusout', handleBlur);
    };
  }, [enableTypingDetection, updateActivity, typingDebounceMs]);

  // Selection detection
  const selectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!enableSelectionDetection) return;

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        updateActivity('selecting', undefined, 'Text selection');
        setDetectionStatus(prev => ({ ...prev, selecting: true }));

        if (selectionTimeoutRef.current) {
          clearTimeout(selectionTimeoutRef.current);
        }
        selectionTimeoutRef.current = setTimeout(() => {
          selectionTimeoutRef.current = null;
          setDetectionStatus(prev => ({ ...prev, selecting: false }));
        }, 1000);
      }
    };

    // Listen for selection changes
    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
        selectionTimeoutRef.current = null;
      }
    };
  }, [enableSelectionDetection, updateActivity]);

  // Mouse/touch activity detection for general activity tracking
  useEffect(() => {
    const handleActivity = () => {
      lastActivityTimeRef.current = Date.now();
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'touchmove'];
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (drawingTimeoutRef.current) clearTimeout(drawingTimeoutRef.current);
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, []);

  return {
    // Current activity state
    currentActivity,
    isActive,
    
    // Manual activity updates
    setActivity,
    setIdle,
    
    // Activity history
    activityHistory,
    
    // Detection status
    detectionStatus,
  };
}