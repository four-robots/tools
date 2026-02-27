/**
 * WebSocket Setup
 * 
 * Configures Socket.io for real-time updates across the application.
 */

import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { KanbanService } from '@mcp-tools/core/kanban';
import { AnalyticsService } from '../services/AnalyticsService.js';
import { setupAnalyticsWebSocket } from './analytics.websocket.js';
import { setupWorkspaceWebSocket } from './workspace-socket.js';
import { setupWhiteboardWebSocket } from './whiteboard-socket.js';
import {
  WorkspaceSessionService,
  WorkspaceActivityService,
  WorkspaceMembershipService,
} from '@mcp-tools/core/services/workspace';

interface AuthenticatedSocket {
  id: string;
  user?: {
    id: string;
    email: string;
    name: string;
  };
  join: (room: string) => void;
  leave: (room: string) => void;
  emit: (event: string, data: any) => void;
  on: (event: string, handler: Function) => void;
  disconnect: () => void;
}

export function setupWebSocket(
  io: SocketIOServer, 
  kanbanService: KanbanService, 
  analyticsService?: AnalyticsService,
  workspaceServices?: {
    workspaceSessionService: WorkspaceSessionService;
    workspaceActivityService: WorkspaceActivityService;
    workspaceMembershipService: WorkspaceMembershipService;
  }
): void {
  // Authentication middleware
  io.use(async (socket: any, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        // Allow anonymous connections in development
        if (process.env.NODE_ENV === 'development') {
          socket.user = {
            id: 'dev-user-123',
            email: 'developer@mcp-tools.dev',
            name: 'Development User'
          };
          return next();
        }
        
        return next(new Error('Authentication required'));
      }
      
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        return next(new Error('JWT_SECRET is not configured'));
      }
      const decoded = jwt.verify(token, jwtSecret) as any;
      
      socket.user = {
        id: decoded.sub || decoded.id,
        email: decoded.email,
        name: decoded.name
      };
      
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });
  
  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`User connected: ${socket.user?.id || 'anonymous'} (${socket.id})`);
    
    // Join user-specific room
    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);
    }
    
    // Board-related events
    socket.on('join:board', (boardId: string) => {
      console.log(`User ${socket.user?.id} joined board: ${boardId}`);
      socket.join(`board:${boardId}`);
      
      // Emit to other users in the board
      socket.to(`board:${boardId}`).emit('user:joined', {
        userId: socket.user?.id,
        userName: socket.user?.name,
        boardId
      });
    });
    
    socket.on('leave:board', (boardId: string) => {
      console.log(`User ${socket.user?.id} left board: ${boardId}`);
      socket.leave(`board:${boardId}`);
      
      socket.to(`board:${boardId}`).emit('user:left', {
        userId: socket.user?.id,
        userName: socket.user?.name,
        boardId
      });
    });
    
    // Card movement events
    socket.on('card:move', (data: {
      cardId: string;
      boardId: string;
      fromColumnId: string;
      toColumnId: string;
      position: number;
    }) => {
      console.log(`Card moved by ${socket.user?.id}:`, data);
      
      // Broadcast to all users in the board except sender
      socket.to(`board:${data.boardId}`).emit('card:moved', {
        ...data,
        movedBy: {
          id: socket.user?.id,
          name: socket.user?.name
        },
        timestamp: new Date().toISOString()
      });
    });
    
    // Card update events
    socket.on('card:update', (data: {
      cardId: string;
      boardId: string;
      changes: any;
    }) => {
      console.log(`Card updated by ${socket.user?.id}:`, data);
      
      socket.to(`board:${data.boardId}`).emit('card:updated', {
        ...data,
        updatedBy: {
          id: socket.user?.id,
          name: socket.user?.name
        },
        timestamp: new Date().toISOString()
      });
    });
    
    // Memory-related events
    socket.on('join:memory', () => {
      socket.join('memory:global');
      console.log(`User ${socket.user?.id} joined memory updates`);
    });
    
    socket.on('leave:memory', () => {
      socket.leave('memory:global');
      console.log(`User ${socket.user?.id} left memory updates`);
    });
    
    // Wiki-related events
    socket.on('join:wiki', () => {
      socket.join('wiki:global');
      console.log(`User ${socket.user?.id} joined wiki updates`);
    });
    
    socket.on('wiki:editing', (data: { pageId: string; section?: string }) => {
      socket.to('wiki:global').emit('wiki:user_editing', {
        pageId: data.pageId,
        section: data.section,
        user: {
          id: socket.user?.id,
          name: socket.user?.name
        },
        timestamp: new Date().toISOString()
      });
    });
    
    socket.on('wiki:stop_editing', (data: { pageId: string }) => {
      socket.to('wiki:global').emit('wiki:user_stopped_editing', {
        pageId: data.pageId,
        user: {
          id: socket.user?.id,
          name: socket.user?.name
        },
        timestamp: new Date().toISOString()
      });
    });
    
    // Wiki attachment events
    socket.on('join:wiki_page', (pageId: string) => {
      console.log(`User ${socket.user?.id} joined wiki page: ${pageId}`);
      socket.join(`wiki:page:${pageId}`);
    });
    
    socket.on('leave:wiki_page', (pageId: string) => {
      console.log(`User ${socket.user?.id} left wiki page: ${pageId}`);
      socket.leave(`wiki:page:${pageId}`);
    });
    
    socket.on('attachment:upload_start', (data: { pageId: string; filename: string }) => {
      socket.to(`wiki:page:${data.pageId}`).emit('attachment:upload_started', {
        pageId: data.pageId,
        filename: data.filename,
        user: {
          id: socket.user?.id,
          name: socket.user?.name
        },
        timestamp: new Date().toISOString()
      });
    });
    
    socket.on('attachment:upload_progress', (data: { pageId: string; filename: string; progress: number }) => {
      socket.to(`wiki:page:${data.pageId}`).emit('attachment:upload_progress', {
        ...data,
        user: {
          id: socket.user?.id,
          name: socket.user?.name
        },
        timestamp: new Date().toISOString()
      });
    });
    
    // Disconnect handling
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user?.id || 'anonymous'} (${socket.id})`);
    });
    
    // Error handling
    socket.on('error', (error) => {
      console.error(`Socket error for user ${socket.user?.id}:`, error);
    });
  });
  
  // Broadcast system-wide updates
  const broadcastUpdate = (event: string, data: any, room?: string) => {
    if (room) {
      io.to(room).emit(event, data);
    } else {
      io.emit(event, data);
    }
  };
  
  // Set up analytics WebSocket if service is provided
  if (analyticsService) {
    setupAnalyticsWebSocket(io, analyticsService);
  }

  // Set up workspace WebSocket if services are provided
  if (workspaceServices) {
    setupWorkspaceWebSocket(io, workspaceServices);
  }

  // Set up whiteboard WebSocket for real-time collaboration
  setupWhiteboardWebSocket(io, {
    useRedis: process.env.NODE_ENV === 'production',
    sessionTtl: 30 * 60 * 1000, // 30 minutes
  });
  
  // Example: Memory updates could be broadcast here
  // This would be called from the API routes when memories are created/updated
  
  console.log('✅ WebSocket server configured');
}

// Helper function to broadcast events from API routes
export function broadcastToRoom(io: SocketIOServer, room: string, event: string, data: any): void {
  io.to(room).emit(event, data);
}

export function broadcastToUser(io: SocketIOServer, userId: string, event: string, data: any): void {
  io.to(`user:${userId}`).emit(event, data);
}

// Wiki attachment specific broadcast functions
export function broadcastAttachmentUploaded(io: SocketIOServer, pageId: string, attachment: any, uploadedBy: string): void {
  io.to(`wiki:page:${pageId}`).emit('attachment:uploaded', {
    pageId,
    attachment,
    uploadedBy,
    timestamp: new Date().toISOString()
  });
}

export function broadcastAttachmentDeleted(io: SocketIOServer, pageId: string, attachmentId: string, deletedBy: string): void {
  io.to(`wiki:page:${pageId}`).emit('attachment:deleted', {
    pageId,
    attachmentId,
    deletedBy,
    timestamp: new Date().toISOString()
  });
}

export function broadcastAttachmentUpdated(io: SocketIOServer, pageId: string, attachment: any, updatedBy: string): void {
  io.to(`wiki:page:${pageId}`).emit('attachment:updated', {
    pageId,
    attachment,
    updatedBy,
    timestamp: new Date().toISOString()
  });
}