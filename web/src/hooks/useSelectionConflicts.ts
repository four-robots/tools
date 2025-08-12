/**
 * useSelectionConflicts Hook
 * 
 * Manages selection conflict detection, resolution, and user interaction
 * for collaborative whiteboard editing with automatic and manual resolution strategies.
 */

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SelectionConflictData, SelectionOwnership } from '@/components/whiteboard/SelectionHighlight';

export interface ConflictResolutionStrategy {
  /** Automatic resolution strategy */
  auto: 'priority' | 'timestamp' | 'ownership' | 'shared' | 'disabled';
  
  /** Timeout for automatic resolution (ms) */
  autoResolveTimeoutMs: number;
  
  /** Enable manual resolution UI */
  enableManualResolution: boolean;
  
  /** Show conflict notifications */
  showNotifications: boolean;
  
  /** Maximum conflicts before forcing resolution */
  maxConflictsPerElement: number;
}

export interface ConflictNotification {
  id: string;
  conflictId: string;
  elementId: string;
  message: string;
  type: 'warning' | 'info' | 'error';
  timestamp: number;
  autoResolveAt?: number;
  dismissed?: boolean;
}

export interface ConflictResolutionResult {
  conflictId: string;
  resolution: 'ownership' | 'shared' | 'timeout' | 'manual';
  winner?: string;
  timestamp: number;
}

export interface UseSelectionConflictsOptions {
  /** Current user ID */
  currentUserId: string;
  
  /** Conflict resolution strategy */
  strategy: ConflictResolutionStrategy;
  
  /** Callback for resolving conflicts */
  onResolveConflict: (conflictId: string, resolution: 'ownership' | 'shared' | 'cancel') => Promise<boolean>;
  
  /** Callback for conflict notifications */
  onNotification?: (notification: ConflictNotification) => void;
  
  /** Debug mode */
  debug?: boolean;
}

export interface ConflictState {
  /** Active conflicts */
  conflicts: SelectionConflictData[];
  
  /** Pending resolutions (auto-resolve timers) */
  pendingResolutions: Map<string, NodeJS.Timeout>;
  
  /** Conflict notifications */
  notifications: ConflictNotification[];
  
  /** Resolution history */
  resolutionHistory: ConflictResolutionResult[];
  
  /** Conflict statistics */
  stats: {
    totalConflicts: number;
    resolvedConflicts: number;
    autoResolved: number;
    manualResolved: number;
    timeoutResolved: number;
    currentConflicts: number;
  };
}

/**
 * Automatic conflict resolution based on strategy
 */
const useAutoResolution = (
  conflicts: SelectionConflictData[],
  strategy: ConflictResolutionStrategy,
  currentUserId: string,
  onResolve: (conflictId: string, resolution: 'ownership' | 'shared' | 'cancel') => Promise<boolean>
) => {
  const pendingResolutions = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [resolutionHistory, setResolutionHistory] = useState<ConflictResolutionResult[]>([]);

  // Clear expired timers when conflicts are resolved externally
  useEffect(() => {
    const activeConflictIds = new Set(conflicts.map(c => c.conflictId));
    
    for (const [conflictId, timer] of pendingResolutions.current.entries()) {
      if (!activeConflictIds.has(conflictId)) {
        clearTimeout(timer);
        pendingResolutions.current.delete(conflictId);
      }
    }
  }, [conflicts]);

  // Set up auto-resolution for new conflicts
  useEffect(() => {
    if (strategy.auto === 'disabled') return;

    for (const conflict of conflicts) {
      // Skip if already scheduled for auto-resolution
      if (pendingResolutions.current.has(conflict.conflictId)) continue;

      // Skip if already resolved
      if (conflict.resolvedAt) continue;

      const timer = setTimeout(async () => {
        try {
          let resolution: 'ownership' | 'shared' | 'cancel' = 'cancel';

          switch (strategy.auto) {
            case 'priority':
              // Resolve in favor of highest priority user
              const highestPriority = Math.max(...conflict.conflictingUsers.map(u => u.priority));
              const winner = conflict.conflictingUsers.find(u => u.priority === highestPriority);
              if (winner) {
                resolution = 'ownership';
              }
              break;

            case 'timestamp':
              // Resolve in favor of earliest timestamp (first to select)
              const earliestTime = Math.min(...conflict.conflictingUsers.map(u => u.timestamp));
              const firstUser = conflict.conflictingUsers.find(u => u.timestamp === earliestTime);
              if (firstUser) {
                resolution = 'ownership';
              }
              break;

            case 'ownership':
              // Check if any user already owns the element
              // This would require ownership data passed to the hook
              resolution = 'ownership'; // Default to ownership resolution
              break;

            case 'shared':
              resolution = 'shared';
              break;
          }

          const success = await onResolve(conflict.conflictId, resolution);
          
          if (success) {
            const result: ConflictResolutionResult = {
              conflictId: conflict.conflictId,
              resolution: 'timeout', // Auto-resolved due to timeout
              timestamp: Date.now(),
            };

            setResolutionHistory(prev => [...prev, result]);
          }
        } catch (error) {
          console.error('Auto-resolution failed:', error);
        } finally {
          pendingResolutions.current.delete(conflict.conflictId);
        }
      }, strategy.autoResolveTimeoutMs);

      pendingResolutions.current.set(conflict.conflictId, timer);
    }
  }, [conflicts, strategy, onResolve]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const timer of pendingResolutions.current.values()) {
        clearTimeout(timer);
      }
      pendingResolutions.current.clear();
    };
  }, []);

  return {
    pendingResolutions: pendingResolutions.current,
    resolutionHistory,
    setResolutionHistory,
  };
};

/**
 * Conflict notifications management
 */
const useConflictNotifications = (
  conflicts: SelectionConflictData[],
  strategy: ConflictResolutionStrategy,
  currentUserId: string,
  pendingResolutions: Map<string, NodeJS.Timeout>,
  onNotification?: (notification: ConflictNotification) => void
) => {
  const [notifications, setNotifications] = useState<ConflictNotification[]>([]);
  const notificationIdRef = useRef(0);

  // Create notifications for new conflicts
  useEffect(() => {
    if (!strategy.showNotifications) return;

    const existingConflictIds = new Set(notifications.map(n => n.conflictId));

    for (const conflict of conflicts) {
      // Skip if notification already exists
      if (existingConflictIds.has(conflict.conflictId)) continue;
      
      // Skip if already resolved
      if (conflict.resolvedAt) continue;

      // Check if current user is involved
      const isUserInvolved = conflict.conflictingUsers.some(u => u.userId === currentUserId);
      
      if (!isUserInvolved) continue; // Only notify if user is involved

      const notification: ConflictNotification = {
        id: `notif-${++notificationIdRef.current}`,
        conflictId: conflict.conflictId,
        elementId: conflict.elementId,
        message: `Selection conflict with ${conflict.conflictingUsers.length} users`,
        type: 'warning',
        timestamp: Date.now(),
        autoResolveAt: strategy.auto !== 'disabled' 
          ? Date.now() + strategy.autoResolveTimeoutMs 
          : undefined,
      };

      setNotifications(prev => [...prev, notification]);
      
      if (onNotification) {
        onNotification(notification);
      }
    }
  }, [conflicts, strategy, currentUserId, notifications, onNotification]);

  // Remove notifications for resolved conflicts
  useEffect(() => {
    const activeConflictIds = new Set(conflicts.map(c => c.conflictId));
    
    setNotifications(prev => 
      prev.filter(notif => activeConflictIds.has(notif.conflictId))
    );
  }, [conflicts]);

  // Dismiss notification
  const dismissNotification = useCallback((notificationId: string) => {
    setNotifications(prev => 
      prev.map(notif => 
        notif.id === notificationId 
          ? { ...notif, dismissed: true }
          : notif
      )
    );
  }, []);

  // Clear all notifications
  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications: notifications.filter(n => !n.dismissed),
    dismissNotification,
    clearAllNotifications,
  };
};

/**
 * Conflict statistics tracking
 */
const useConflictStats = (
  conflicts: SelectionConflictData[],
  resolutionHistory: ConflictResolutionResult[]
) => {
  return useMemo(() => {
    const resolvedConflicts = resolutionHistory.length;
    const autoResolved = resolutionHistory.filter(r => r.resolution === 'timeout').length;
    const manualResolved = resolutionHistory.filter(r => r.resolution === 'manual').length;
    const timeoutResolved = resolutionHistory.filter(r => r.resolution === 'timeout').length;

    return {
      totalConflicts: resolvedConflicts + conflicts.length,
      resolvedConflicts,
      autoResolved,
      manualResolved,
      timeoutResolved,
      currentConflicts: conflicts.length,
    };
  }, [conflicts, resolutionHistory]);
};

/**
 * Main selection conflicts hook
 */
export const useSelectionConflicts = (
  rawConflicts: SelectionConflictData[],
  ownerships: SelectionOwnership[],
  options: UseSelectionConflictsOptions
) => {
  const { currentUserId, strategy, onResolveConflict, onNotification, debug = false } = options;

  // Filter active conflicts
  const activeConflicts = useMemo(() => {
    return rawConflicts.filter(conflict => !conflict.resolvedAt);
  }, [rawConflicts]);

  // Auto-resolution management
  const { pendingResolutions, resolutionHistory, setResolutionHistory } = useAutoResolution(
    activeConflicts,
    strategy,
    currentUserId,
    onResolveConflict
  );

  // Notification management
  const { notifications, dismissNotification, clearAllNotifications } = useConflictNotifications(
    activeConflicts,
    strategy,
    currentUserId,
    pendingResolutions,
    onNotification
  );

  // Statistics tracking
  const stats = useConflictStats(activeConflicts, resolutionHistory);

  // Manual conflict resolution
  const resolveConflictManually = useCallback(async (
    conflictId: string,
    resolution: 'ownership' | 'shared' | 'cancel'
  ): Promise<boolean> => {
    try {
      // Cancel auto-resolution timer if exists
      const timer = pendingResolutions.get(conflictId);
      if (timer) {
        clearTimeout(timer);
        pendingResolutions.delete(conflictId);
      }

      const success = await onResolveConflict(conflictId, resolution);
      
      if (success) {
        const result: ConflictResolutionResult = {
          conflictId,
          resolution: 'manual',
          timestamp: Date.now(),
        };

        setResolutionHistory(prev => [...prev, result]);

        if (debug) {
          console.log('[ConflictResolution] Manual resolution successful:', result);
        }
      }

      return success;
    } catch (error) {
      if (debug) {
        console.error('[ConflictResolution] Manual resolution failed:', error);
      }
      return false;
    }
  }, [pendingResolutions, onResolveConflict, setResolutionHistory, debug]);

  // Get conflicts for specific element
  const getElementConflicts = useCallback((elementId: string): SelectionConflictData[] => {
    return activeConflicts.filter(conflict => conflict.elementId === elementId);
  }, [activeConflicts]);

  // Get conflicts involving current user
  const getUserConflicts = useCallback((userId: string = currentUserId): SelectionConflictData[] => {
    return activeConflicts.filter(conflict =>
      conflict.conflictingUsers.some(user => user.userId === userId)
    );
  }, [activeConflicts, currentUserId]);

  // Check if element has conflicts
  const hasElementConflict = useCallback((elementId: string): boolean => {
    return activeConflicts.some(conflict => conflict.elementId === elementId);
  }, [activeConflicts]);

  // Check if element is owned
  const isElementOwned = useCallback((elementId: string): SelectionOwnership | null => {
    const ownership = ownerships.find(o => o.elementId === elementId);
    
    // Check if ownership is still valid (not expired)
    if (ownership && Date.now() <= ownership.expiresAt) {
      return ownership;
    }
    
    return null;
  }, [ownerships]);

  // Get remaining time for auto-resolution
  const getAutoResolveTimeRemaining = useCallback((conflictId: string): number => {
    const conflict = activeConflicts.find(c => c.conflictId === conflictId);
    if (!conflict || strategy.auto === 'disabled') return 0;

    const conflictAge = Date.now() - (conflict.conflictingUsers[0]?.timestamp || 0);
    return Math.max(0, strategy.autoResolveTimeoutMs - conflictAge);
  }, [activeConflicts, strategy]);

  // Force resolution for conflicts exceeding max limit
  useEffect(() => {
    const elementConflictCounts = new Map<string, number>();
    
    // Count conflicts per element
    for (const conflict of activeConflicts) {
      const current = elementConflictCounts.get(conflict.elementId) || 0;
      elementConflictCounts.set(conflict.elementId, current + 1);
    }

    // Force resolve elements with too many conflicts
    for (const [elementId, count] of elementConflictCounts.entries()) {
      if (count > strategy.maxConflictsPerElement) {
        const elementConflicts = getElementConflicts(elementId);
        
        // Resolve oldest conflict in favor of highest priority user
        const oldestConflict = elementConflicts.sort((a, b) => 
          (a.conflictingUsers[0]?.timestamp || 0) - (b.conflictingUsers[0]?.timestamp || 0)
        )[0];

        if (oldestConflict) {
          resolveConflictManually(oldestConflict.conflictId, 'ownership');
          
          if (debug) {
            console.log('[ConflictResolution] Force resolved due to max conflicts:', {
              elementId,
              conflictCount: count,
              maxAllowed: strategy.maxConflictsPerElement,
            });
          }
        }
      }
    }
  }, [activeConflicts, strategy.maxConflictsPerElement, getElementConflicts, resolveConflictManually, debug]);

  return {
    // Conflict data
    conflicts: activeConflicts,
    notifications,
    resolutionHistory,
    stats,

    // Resolution actions
    resolveConflictManually,
    dismissNotification,
    clearAllNotifications,

    // Query utilities
    getElementConflicts,
    getUserConflicts,
    hasElementConflict,
    isElementOwned,
    getAutoResolveTimeRemaining,

    // Configuration
    strategy,
  };
};

export default useSelectionConflicts;