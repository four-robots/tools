/**
 * Whiteboard Collaboration Hook
 * 
 * Main hook for managing real-time collaboration features in whiteboards.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useToast } from '@/hooks/use-toast';
import {
  WhiteboardClientEvents,
  WhiteboardServerEvents,
  WhiteboardSession,
  WhiteboardPresence,
  WhiteboardComment,
  CanvasChangeEvent,
  createPresenceUpdate,
  createClientInfo,
} from '../utils/collaboration-events';
import { WhiteboardOperation, transformOperation, applyOperation, validateOperation } from '../utils/whiteboard-ot';
import { createPresenceDebouncer, getUserColor } from '../utils/presence-utils';

interface UseWhiteboardCollaborationOptions {
  whiteboardId: string;
  workspaceId: string;
  userId: string;
  userName: string;
  onCanvasChange?: (operation: WhiteboardOperation) => void;
  onSyncRequired?: (version: number) => void;
  onError?: (error: any) => void;
}

interface CollaborationState {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  session: WhiteboardSession | null;
  connectionError: string | null;
  
  // Canvas state
  canvasVersion: number;
  pendingOperations: WhiteboardOperation[];
  
  // Presence
  presences: Map<string, WhiteboardPresence>;
  myPresence: WhiteboardPresence | null;
  
  // Comments
  comments: Map<string, WhiteboardComment>;
  
  // UI state
  showCursors: boolean;
  showComments: boolean;
}

export function useWhiteboardCollaboration(options: UseWhiteboardCollaborationOptions) {
  const {
    whiteboardId,
    workspaceId,
    userId,
    userName,
    onCanvasChange,
    onSyncRequired,
    onError,
  } = options;

  const { toast } = useToast();
  
  // State
  const [state, setState] = useState<CollaborationState>({
    isConnected: false,
    isConnecting: false,
    session: null,
    connectionError: null,
    canvasVersion: 1,
    pendingOperations: [],
    presences: new Map(),
    myPresence: null,
    comments: new Map(),
    showCursors: true,
    showComments: true,
  });

  // Refs
  const socketRef = useRef<Socket<WhiteboardServerEvents, WhiteboardClientEvents> | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  
  // Debounced presence updates
  const debouncedPresenceUpdate = useRef(
    createPresenceDebouncer((update) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('whiteboard:presence', update);
      }
    }, 50)
  );

  // ==================== CONNECTION MANAGEMENT ====================

  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true, connectionError: null }));

    // Create socket connection
    const socket: Socket<WhiteboardServerEvents, WhiteboardClientEvents> = io({
      auth: {
        token: localStorage.getItem('auth_token'), // Assume JWT token stored in localStorage
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
    });

    // Connection events
    socket.on('connect', () => {
      console.log('Whiteboard socket connected');
      reconnectAttempts.current = 0;
      
      // Join whiteboard
      socket.emit('whiteboard:join', {
        whiteboardId,
        workspaceId,
        clientInfo: createClientInfo(),
      });
    });

    socket.on('disconnect', (reason) => {
      console.log('Whiteboard socket disconnected:', reason);
      setState(prev => ({
        ...prev,
        isConnected: false,
        session: null,
        presences: new Map(),
      }));
    });

    socket.on('connect_error', (error) => {
      console.error('Whiteboard connection error:', error);
      setState(prev => ({
        ...prev,
        isConnecting: false,
        connectionError: error.message,
      }));
      
      if (onError) {
        onError(error);
      }
    });

    // Session management
    socket.on('whiteboard:session_started', (data) => {
      console.log('Whiteboard session started:', data);
      
      const myPresence: WhiteboardPresence = {
        userId,
        userName,
        cursor: { x: 0, y: 0 },
        viewport: { x: 0, y: 0, width: 1920, height: 1080, zoom: 1 },
        selection: [],
        color: getUserColor(userId),
        timestamp: new Date().toISOString(),
      };

      setState(prev => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        session: data,
        canvasVersion: data.canvasVersion,
        myPresence,
        connectionError: null,
      }));
    });

    socket.on('whiteboard:user_joined', (data) => {
      console.log('User joined whiteboard:', data.user.name);
      
      setState(prev => {
        const newPresences = new Map(prev.presences);
        newPresences.set(data.user.id, data.presence);
        return { ...prev, presences: newPresences };
      });

      toast({
        title: 'User Joined',
        description: `${data.user.name} joined the whiteboard`,
        duration: 2000,
      });
    });

    socket.on('whiteboard:user_left', (data) => {
      console.log('User left whiteboard:', data.user.name);
      
      setState(prev => {
        const newPresences = new Map(prev.presences);
        newPresences.delete(data.user.id);
        return { ...prev, presences: newPresences };
      });

      toast({
        title: 'User Left',
        description: `${data.user.name} left the whiteboard`,
        duration: 2000,
      });
    });

    socket.on('whiteboard:presence_list', (presences) => {
      setState(prev => {
        const newPresences = new Map(prev.presences);
        presences.forEach(presence => {
          newPresences.set(presence.userId, presence);
        });
        return { ...prev, presences: newPresences };
      });
    });

    // Canvas synchronization
    socket.on('whiteboard:canvas_changed', (data) => {
      console.log('Canvas changed by:', data.user.name, data.operation);
      
      setState(prev => {
        const newVersion = Math.max(prev.canvasVersion, data.operation.version);
        return { ...prev, canvasVersion: newVersion };
      });

      if (onCanvasChange && validateOperation(data.operation)) {
        onCanvasChange(data.operation);
      }
    });

    socket.on('whiteboard:canvas_ack', (data) => {
      if (data.success && data.newVersion) {
        setState(prev => ({ ...prev, canvasVersion: data.newVersion! }));
      } else if (!data.success) {
        console.error('Canvas operation failed:', data.error);
        toast({
          variant: 'destructive',
          title: 'Operation Failed',
          description: data.error || 'Canvas operation failed',
        });
      }
    });

    socket.on('whiteboard:sync_requested', (data) => {
      // Another user is requesting canvas sync - we could provide it if we have the full state
      console.log('Canvas sync requested by:', data.requesterId);
    });

    socket.on('whiteboard:sync_data', (data) => {
      console.log('Received canvas sync data from:', data.provider.name);
      setState(prev => ({ ...prev, canvasVersion: data.version }));
      
      if (onSyncRequired) {
        onSyncRequired(data.version);
      }
    });

    // Presence updates
    socket.on('whiteboard:presence_updated', (presence) => {
      setState(prev => {
        const newPresences = new Map(prev.presences);
        newPresences.set(presence.userId, presence);
        return { ...prev, presences: newPresences };
      });
    });

    // Comments
    socket.on('whiteboard:comment_added', (data) => {
      setState(prev => {
        const newComments = new Map(prev.comments);
        newComments.set(data.comment.id, data.comment);
        return { ...prev, comments: newComments };
      });

      toast({
        title: 'New Comment',
        description: `${data.comment.author.name} added a comment`,
        duration: 3000,
      });
    });

    socket.on('whiteboard:comment_ack', (data) => {
      if (!data.success) {
        toast({
          variant: 'destructive',
          title: 'Comment Failed',
          description: data.error || 'Failed to add comment',
        });
      }
    });

    socket.on('whiteboard:comment_reply_added', (data) => {
      setState(prev => {
        const newComments = new Map(prev.comments);
        const comment = newComments.get(data.commentId);
        if (comment) {
          comment.replies = [...(comment.replies || []), data.reply];
          newComments.set(data.commentId, comment);
        }
        return { ...prev, comments: newComments };
      });
    });

    socket.on('whiteboard:comment_resolved', (data) => {
      setState(prev => {
        const newComments = new Map(prev.comments);
        const comment = newComments.get(data.commentId);
        if (comment) {
          comment.resolved = data.resolved;
          newComments.set(data.commentId, comment);
        }
        return { ...prev, comments: newComments };
      });
    });

    socket.on('whiteboard:comment_deleted', (data) => {
      setState(prev => {
        const newComments = new Map(prev.comments);
        newComments.delete(data.commentId);
        return { ...prev, comments: newComments };
      });
    });

    // Error handling
    socket.on('error', (error) => {
      console.error('Whiteboard error:', error);
      setState(prev => ({ ...prev, connectionError: error.message }));
      
      if (onError) {
        onError(error);
      }

      toast({
        variant: 'destructive',
        title: 'Connection Error',
        description: error.message,
      });
    });

    socketRef.current = socket;
  }, [whiteboardId, workspaceId, userId, userName, onCanvasChange, onSyncRequired, onError, toast]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('whiteboard:leave', { whiteboardId });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    setState(prev => ({
      ...prev,
      isConnected: false,
      session: null,
      presences: new Map(),
      myPresence: null,
    }));
  }, [whiteboardId]);

  // ==================== CANVAS OPERATIONS ====================

  const sendCanvasChange = useCallback((operation: WhiteboardOperation) => {
    if (!socketRef.current?.connected || !validateOperation(operation)) {
      return;
    }

    const event: CanvasChangeEvent = {
      operation,
      clientVersion: state.canvasVersion,
    };

    socketRef.current.emit('whiteboard:canvas_change', event);
  }, [state.canvasVersion]);

  const requestCanvasSync = useCallback(() => {
    if (!socketRef.current?.connected) {
      return;
    }

    socketRef.current.emit('whiteboard:request_sync', { whiteboardId });
  }, [whiteboardId]);

  // ==================== PRESENCE ====================

  const updatePresence = useCallback((update: {
    cursor?: { x: number; y: number };
    viewport?: { x: number; y: number; width: number; height: number; zoom: number };
    selection?: string[];
  }) => {
    if (!state.myPresence) return;

    const updatedPresence = {
      ...state.myPresence,
      ...update,
      timestamp: new Date().toISOString(),
    };

    setState(prev => ({ ...prev, myPresence: updatedPresence }));
    
    debouncedPresenceUpdate.current(createPresenceUpdate(
      update.cursor,
      update.viewport,
      update.selection
    ));
  }, [state.myPresence]);

  // ==================== COMMENTS ====================

  const addComment = useCallback((
    content: string,
    position: { x: number; y: number },
    elementId?: string
  ) => {
    if (!socketRef.current?.connected) {
      return;
    }

    socketRef.current.emit('whiteboard:add_comment', {
      whiteboardId,
      elementId,
      position,
      content,
    });
  }, [whiteboardId]);

  const replyToComment = useCallback((commentId: string, content: string) => {
    if (!socketRef.current?.connected) {
      return;
    }

    socketRef.current.emit('whiteboard:reply_comment', {
      whiteboardId,
      commentId,
      content,
    });
  }, [whiteboardId]);

  const resolveComment = useCallback((commentId: string, resolved: boolean) => {
    if (!socketRef.current?.connected) {
      return;
    }

    socketRef.current.emit('whiteboard:resolve_comment', {
      whiteboardId,
      commentId,
      resolved,
    });
  }, [whiteboardId]);

  const deleteComment = useCallback((commentId: string) => {
    if (!socketRef.current?.connected) {
      return;
    }

    socketRef.current.emit('whiteboard:delete_comment', {
      whiteboardId,
      commentId,
    });
  }, [whiteboardId]);

  // ==================== UI CONTROLS ====================

  const toggleCursors = useCallback(() => {
    setState(prev => ({ ...prev, showCursors: !prev.showCursors }));
  }, []);

  const toggleComments = useCallback(() => {
    setState(prev => ({ ...prev, showComments: !prev.showComments }));
  }, []);

  // ==================== LIFECYCLE ====================

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // ==================== RETURN API ====================

  return {
    // Connection state
    isConnected: state.isConnected,
    isConnecting: state.isConnecting,
    connectionError: state.connectionError,
    session: state.session,
    
    // Canvas operations
    canvasVersion: state.canvasVersion,
    sendCanvasChange,
    requestCanvasSync,
    
    // Presence
    presences: Array.from(state.presences.values()),
    myPresence: state.myPresence,
    updatePresence,
    
    // Comments
    comments: Array.from(state.comments.values()),
    addComment,
    replyToComment,
    resolveComment,
    deleteComment,
    
    // UI state
    showCursors: state.showCursors,
    showComments: state.showComments,
    toggleCursors,
    toggleComments,
    
    // Connection management
    connect,
    disconnect,
  };
}