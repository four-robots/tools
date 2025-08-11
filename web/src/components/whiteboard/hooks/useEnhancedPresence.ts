/**
 * Enhanced Whiteboard Presence Hook
 * 
 * Integrates with the new presence service to provide:
 * - Real-time presence status tracking (online/idle/away/offline)
 * - Activity awareness (drawing, typing, selecting, commenting)
 * - User avatar management with consistent colors
 * - Heartbeat and connection management
 * - Automatic status updates based on user activity
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { UserPresenceState } from '../WhiteboardPresencePanel';

export type PresenceStatus = 'online' | 'idle' | 'away' | 'busy' | 'offline';
export type ActivityType = 'drawing' | 'typing' | 'selecting' | 'commenting' | 'idle';

export interface ActivityInfo {
  type: ActivityType;
  elementId?: string;
  description?: string;
  timestamp: number;
}

export interface UseEnhancedPresenceOptions {
  whiteboardId: string;
  currentUser: {
    userId: string;
    userName: string;
    userEmail?: string;
    avatar?: string;
  };
  socketUrl?: string;
  heartbeatInterval?: number; // ms
  idleTimeout?: number; // ms
  awayTimeout?: number; // ms
}

export interface UseEnhancedPresenceResult {
  // Current state
  presences: UserPresenceState[];
  currentPresence: UserPresenceState | null;
  isConnected: boolean;
  
  // Status management
  setStatus: (status: PresenceStatus, customStatus?: string) => void;
  updateActivity: (activity: ActivityInfo) => void;
  
  // User actions
  followUser: (userId: string) => void;
  unfollowUser: () => void;
  followingUserId: string | null;
  
  // Connection management
  connect: () => void;
  disconnect: () => void;
  
  // Statistics
  stats: {
    totalUsers: number;
    onlineUsers: number;
    activeUsers: number;
    idleUsers: number;
    awayUsers: number;
  };
}

export function useEnhancedPresence(options: UseEnhancedPresenceOptions): UseEnhancedPresenceResult {
  const {
    whiteboardId,
    currentUser,
    socketUrl = '/whiteboard',
    heartbeatInterval = 30000, // 30 seconds
    idleTimeout = 5 * 60 * 1000, // 5 minutes
    awayTimeout = 15 * 60 * 1000, // 15 minutes
  } = options;

  // State management
  const [presences, setPresences] = useState<UserPresenceState[]>([]);
  const [currentPresence, setCurrentPresence] = useState<UserPresenceState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [followingUserId, setFollowingUserId] = useState<string | null>(null);
  
  // Refs for tracking
  const socketRef = useRef<Socket | null>(null);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const idleCheckTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Statistics computed from presences
  const stats = useState(() => ({
    totalUsers: 0,
    onlineUsers: 0,
    activeUsers: 0,
    idleUsers: 0,
    awayUsers: 0,
  }))[0];

  // Update stats when presences change
  useEffect(() => {
    stats.totalUsers = presences.length;
    stats.onlineUsers = presences.filter(p => p.isOnline).length;
    stats.activeUsers = presences.filter(p => p.isActive).length;
    stats.idleUsers = presences.filter(p => p.status === 'idle').length;
    stats.awayUsers = presences.filter(p => p.status === 'away').length;
  }, [presences, stats]);

  // Initialize socket connection
  const connect = useCallback(() => {
    if (socketRef.current) return;

    const socket = io(socketUrl, {
      auth: {
        token: localStorage.getItem('authToken'), // Adjust based on your auth system
      },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('Connected to whiteboard socket');
      setIsConnected(true);

      // Join whiteboard
      socket.emit('whiteboard:join', {
        whiteboardId,
        workspaceId: 'current-workspace', // Adjust based on your system
        clientInfo: {
          userAgent: navigator.userAgent,
          timestamp: Date.now(),
        },
      });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from whiteboard socket');
      setIsConnected(false);
    });

    // Session management
    socket.on('whiteboard:session_started', (data: {
      sessionId: string;
      presenceState: UserPresenceState;
    }) => {
      console.log('Whiteboard session started', data);
      sessionIdRef.current = data.sessionId;
      setCurrentPresence(data.presenceState);
    });

    // Presence events
    socket.on('whiteboard:user_joined', (data: {
      user: { id: string; name: string; avatar?: string };
      presenceState: UserPresenceState;
    }) => {
      console.log('User joined', data);
      setPresences(prev => {
        const filtered = prev.filter(p => p.userId !== data.presenceState.userId);
        return [...filtered, data.presenceState];
      });
    });

    socket.on('whiteboard:user_left', (data: {
      user: { id: string; name: string };
    }) => {
      console.log('User left', data);
      setPresences(prev => prev.filter(p => p.userId !== data.user.id));
      if (followingUserId === data.user.id) {
        setFollowingUserId(null);
      }
    });

    socket.on('whiteboard:presence_list', (allPresences: UserPresenceState[]) => {
      console.log('Received presence list', allPresences);
      setPresences(allPresences.filter(p => p.userId !== currentUser.userId));
    });

    socket.on('whiteboard:presence_status_updated', (data: {
      userId: string;
      status: PresenceStatus;
      customStatus?: string;
      presenceState: UserPresenceState;
    }) => {
      setPresences(prev => prev.map(p => 
        p.userId === data.userId 
          ? { ...data.presenceState }
          : p
      ));
    });

    socket.on('whiteboard:activity_updated', (data: {
      userId: string;
      userName: string;
      activity: ActivityInfo;
      presenceState: UserPresenceState;
    }) => {
      setPresences(prev => prev.map(p =>
        p.userId === data.userId
          ? { ...data.presenceState }
          : p
      ));
    });

    // Heartbeat acknowledgment
    socket.on('whiteboard:heartbeat_ack', () => {
      // Connection is healthy
    });

    // Error handling
    socket.on('error', (error: any) => {
      console.error('Whiteboard socket error:', error);
    });

    // Start heartbeat
    startHeartbeat();
    startIdleCheck();
  }, [whiteboardId, currentUser, socketUrl]);

  // Disconnect socket
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('whiteboard:leave', { 
        whiteboardId,
        reason: 'manual_disconnect' 
      });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }

    if (idleCheckTimerRef.current) {
      clearInterval(idleCheckTimerRef.current);
      idleCheckTimerRef.current = null;
    }

    setIsConnected(false);
    setPresences([]);
    setCurrentPresence(null);
  }, [whiteboardId]);

  // Set user status
  const setStatus = useCallback((status: PresenceStatus, customStatus?: string) => {
    if (!socketRef.current || !isConnected) return;

    socketRef.current.emit('whiteboard:presence_status', {
      status,
      customStatus,
    });

    // Update current presence
    if (currentPresence) {
      setCurrentPresence(prev => prev ? {
        ...prev,
        status,
        customStatus,
        lastSeen: Date.now(),
      } : null);
    }
  }, [isConnected, currentPresence]);

  // Update activity
  const updateActivity = useCallback((activity: ActivityInfo) => {
    if (!socketRef.current || !isConnected) return;

    // Track activity for idle detection
    lastActivityRef.current = Date.now();

    socketRef.current.emit('whiteboard:activity', {
      type: activity.type,
      elementId: activity.elementId,
      description: activity.description,
    });

    // Update current presence
    if (currentPresence) {
      setCurrentPresence(prev => prev ? {
        ...prev,
        lastActivity: activity,
        lastSeen: Date.now(),
        isActive: activity.type !== 'idle',
        status: activity.type !== 'idle' ? 'online' : prev.status,
      } : null);
    }
  }, [isConnected, currentPresence]);

  // Follow a user (focus on their cursor/viewport)
  const followUser = useCallback((userId: string) => {
    setFollowingUserId(userId);
    
    // Optional: Emit follow event to server
    if (socketRef.current && isConnected) {
      socketRef.current.emit('whiteboard:follow_user', { userId });
    }
  }, [isConnected]);

  // Unfollow current user
  const unfollowUser = useCallback(() => {
    setFollowingUserId(null);
    
    // Optional: Emit unfollow event to server
    if (socketRef.current && isConnected) {
      socketRef.current.emit('whiteboard:unfollow_user', {});
    }
  }, [isConnected]);

  // Start heartbeat timer
  const startHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
    }

    heartbeatTimerRef.current = setInterval(() => {
      if (socketRef.current && isConnected) {
        socketRef.current.emit('whiteboard:heartbeat');
      }
    }, heartbeatInterval);
  }, [heartbeatInterval, isConnected]);

  // Start idle check timer
  const startIdleCheck = useCallback(() => {
    if (idleCheckTimerRef.current) {
      clearInterval(idleCheckTimerRef.current);
    }

    idleCheckTimerRef.current = setInterval(() => {
      const now = Date.now();
      const timeSinceActivity = now - lastActivityRef.current;

      if (!currentPresence) return;

      let newStatus = currentPresence.status;
      
      // Auto-update status based on activity
      if (timeSinceActivity > awayTimeout && currentPresence.status !== 'away' && currentPresence.status !== 'offline') {
        newStatus = 'away';
      } else if (timeSinceActivity > idleTimeout && currentPresence.status === 'online') {
        newStatus = 'idle';
      }
      
      if (newStatus !== currentPresence.status) {
        setStatus(newStatus);
      }
    }, 30000); // Check every 30 seconds
  }, [currentPresence, idleTimeout, awayTimeout, setStatus]);

  // Track user activity for idle detection
  useEffect(() => {
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      
      // If user was idle/away, set back to online
      if (currentPresence && (currentPresence.status === 'idle' || currentPresence.status === 'away')) {
        setStatus('online');
      }
    };

    // Listen to various user activity events
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, handleActivity, true);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
      });
    };
  }, [currentPresence, setStatus]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    // Current state
    presences,
    currentPresence,
    isConnected,
    
    // Status management
    setStatus,
    updateActivity,
    
    // User actions
    followUser,
    unfollowUser,
    followingUserId,
    
    // Connection management
    connect,
    disconnect,
    
    // Statistics
    stats,
  };
}