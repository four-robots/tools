'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  WorkspaceSession,
  WorkspacePresenceUpdate,
  WorkspaceActivityFeedItem,
} from '@shared/types/workspace';

interface WorkspaceRealtimeOptions {
  autoReconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

interface OnlineMember {
  id: string;
  name: string;
  avatar?: string;
  sessionId: string;
  presenceData: any;
  lastActive: string;
}

interface UseWorkspaceRealtimeReturn {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  session: WorkspaceSession | null;
  members: OnlineMember[];
  activities: WorkspaceActivityFeedItem[];
  joinWorkspace: (clientInfo?: any) => void;
  leaveWorkspace: () => void;
  updatePresence: (presenceData: any, cursorPosition?: any) => void;
  updateActivity: (activityData: any) => void;
  startEditing: (resourceType: string, resourceId: string, section?: string) => void;
  stopEditing: (resourceType: string, resourceId: string) => void;
  sendContentChange: (resourceType: string, resourceId: string, operation: any, version: number) => void;
}

/**
 * Hook for real-time workspace collaboration
 */
export function useWorkspaceRealtime(
  workspaceId: string,
  options: WorkspaceRealtimeOptions = {}
): UseWorkspaceRealtimeReturn {
  const {
    autoReconnect = true,
    reconnectDelay = 1000,
    maxReconnectAttempts = 5,
  } = options;

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [members, setMembers] = useState<OnlineMember[]>([]);
  const [activities, setActivities] = useState<WorkspaceActivityFeedItem[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const connectionCheckRef = useRef<NodeJS.Timeout>();

  // Initialize socket connection
  const initializeSocket = useCallback(() => {
    if (socketRef.current?.connected) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setError('Authentication token not found');
      return;
    }

    setConnecting(true);
    setError(null);

    const socket = io({
      auth: { token },
      transports: ['websocket'],
      upgrade: true,
      rememberUpgrade: true,
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('Connected to workspace socket');
      setConnected(true);
      setConnecting(false);
      setError(null);
      reconnectAttempts.current = 0;
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from workspace socket:', reason);
      setConnected(false);
      setSession(null);
      setMembers([]);

      // Attempt reconnection if enabled and not a manual disconnect
      if (autoReconnect && reason !== 'io client disconnect') {
        attemptReconnection();
      }
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      setConnecting(false);
      setError(err.message || 'Connection failed');
      
      if (autoReconnect) {
        attemptReconnection();
      }
    });

    // Workspace-specific events
    socket.on('workspace:session_started', (data: { sessionId: string; sessionToken: string; workspaceId: string }) => {
      console.log('Workspace session started:', data);
      setSession({
        id: data.sessionId,
        workspaceId: data.workspaceId,
        userId: '', // Will be filled from token
        sessionToken: data.sessionToken,
        status: 'active',
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      } as WorkspaceSession);
    });

    socket.on('workspace:user_joined', (data: { user: { id: string; name: string }; sessionId: string; timestamp: string }) => {
      console.log('User joined workspace:', data);
      // Add to members list if not already present
      setMembers(prev => {
        const existing = prev.find(m => m.id === data.user.id);
        if (existing) return prev;

        return [...prev, {
          id: data.user.id,
          name: data.user.name,
          sessionId: data.sessionId,
          presenceData: { isOnline: true, isActive: true, lastSeen: data.timestamp },
          lastActive: data.timestamp,
        }];
      });
    });

    socket.on('workspace:user_left', (data: { user: { id: string; name: string }; sessionId: string; reason?: string; timestamp: string }) => {
      console.log('User left workspace:', data);
      setMembers(prev => prev.filter(m => m.id !== data.user.id));
    });

    socket.on('workspace:presence_updated', (data: WorkspacePresenceUpdate) => {
      setMembers(prev => prev.map(member => 
        member.id === data.userId 
          ? { 
              ...member, 
              presenceData: data.presenceData,
              lastActive: data.timestamp 
            }
          : member
      ));
    });

    socket.on('workspace:activity_logged', (data: any) => {
      // Add to real-time activities
      setActivities(prev => [data.data, ...prev.slice(0, 49)]); // Keep last 50 activities
    });

    socket.on('workspace:user_editing_started', (data: any) => {
      console.log('User started editing:', data);
      // Could show editing indicators
    });

    socket.on('workspace:user_editing_stopped', (data: any) => {
      console.log('User stopped editing:', data);
      // Could hide editing indicators
    });

    socket.on('workspace:content_changed', (data: any) => {
      console.log('Content changed:', data);
      // Could trigger content updates
    });

    socket.on('workspace:resource_created', (data: any) => {
      console.log('Resource created:', data);
      // Could update resource lists
    });

    socket.on('workspace:resource_updated', (data: any) => {
      console.log('Resource updated:', data);
      // Could update resource data
    });

    socket.on('workspace:resource_deleted', (data: any) => {
      console.log('Resource deleted:', data);
      // Could remove resource from lists
    });

    socket.on('error', (data: { code: string; message: string }) => {
      console.error('Workspace socket error:', data);
      setError(data.message);
    });

    return socket;
  }, [autoReconnect]);

  // Reconnection logic
  const attemptReconnection = useCallback(() => {
    if (reconnectAttempts.current >= maxReconnectAttempts) {
      setError(`Failed to reconnect after ${maxReconnectAttempts} attempts`);
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    const delay = reconnectDelay * Math.pow(2, reconnectAttempts.current);
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectAttempts.current++;
      initializeSocket();
    }, delay);
  }, [maxReconnectAttempts, reconnectDelay, initializeSocket]);

  // Join workspace
  const joinWorkspace = useCallback((clientInfo?: any) => {
    if (!socketRef.current?.connected) {
      initializeSocket();
      // Wait for connection then join (bounded retry)
      let attempts = 0;
      const maxAttempts = 50;
      const checkConnection = () => {
        if (socketRef.current?.connected) {
          socketRef.current.emit('workspace:join', { workspaceId, clientInfo });
        } else if (attempts < maxAttempts) {
          attempts++;
          connectionCheckRef.current = setTimeout(checkConnection, 100);
        }
      };
      connectionCheckRef.current = setTimeout(checkConnection, 100);
    } else {
      socketRef.current.emit('workspace:join', { workspaceId, clientInfo });
    }
  }, [workspaceId, initializeSocket]);

  // Leave workspace
  const leaveWorkspace = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('workspace:leave', { workspaceId });
    }
  }, [workspaceId]);

  // Update presence
  const updatePresence = useCallback((presenceData: any, cursorPosition?: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('workspace:presence', { presenceData, cursorPosition });
    }
  }, []);

  // Update activity
  const updateActivity = useCallback((activityData: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('workspace:activity', activityData);
    }
  }, []);

  // Start editing
  const startEditing = useCallback((resourceType: string, resourceId: string, section?: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('workspace:editing_started', { resourceType, resourceId, section });
    }
  }, []);

  // Stop editing
  const stopEditing = useCallback((resourceType: string, resourceId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('workspace:editing_stopped', { resourceType, resourceId });
    }
  }, []);

  // Send content change
  const sendContentChange = useCallback((resourceType: string, resourceId: string, operation: any, version: number) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('workspace:content_change', { resourceType, resourceId, operation, version });
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (connectionCheckRef.current) {
        clearTimeout(connectionCheckRef.current);
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  return {
    connected,
    connecting,
    error,
    session,
    members,
    activities,
    joinWorkspace,
    leaveWorkspace,
    updatePresence,
    updateActivity,
    startEditing,
    stopEditing,
    sendContentChange,
  };
}