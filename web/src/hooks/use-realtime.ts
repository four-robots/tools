/**
 * Real-time hooks for live updates across the application
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket, useWebSocketSubscription } from '@/lib/websocket';
import { useToast } from '@/hooks/use-toast';
import { queryKeys } from '@/hooks/use-api';

export interface RealtimeUpdate {
  entity: 'kanban' | 'memory' | 'wiki' | 'user';
  action: 'created' | 'updated' | 'deleted' | 'moved';
  id: string;
  data?: any;
  userId?: string;
  boardId?: string;
}

export function useRealtimeConnection() {
  const { toast } = useToast();
  
  return useWebSocket({
    onOpen: () => {
      console.log('Real-time connection established');
    },
    onClose: (event) => {
      console.log('Real-time connection closed:', event.reason);
    },
    onError: (error) => {
      console.error('Real-time connection error:', error);
    },
  });
}

export function useRealtimeUpdates() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const processedMessages = useRef(new Set<string>());

  const handleRealtimeUpdate = useCallback((update: RealtimeUpdate) => {
    // Prevent duplicate processing
    const messageId = `${update.entity}-${update.action}-${update.id}`;
    if (processedMessages.current.has(messageId)) {
      return;
    }
    processedMessages.current.add(messageId);

    // Clean up old message IDs to prevent memory leaks
    if (processedMessages.current.size > 100) {
      const oldMessages = Array.from(processedMessages.current).slice(0, 50);
      oldMessages.forEach(id => processedMessages.current.delete(id));
    }

    console.log('Processing real-time update:', update);

    switch (update.entity) {
      case 'kanban':
        handleKanbanUpdate(update);
        break;
      case 'memory':
        handleMemoryUpdate(update);
        break;
      case 'wiki':
        handleWikiUpdate(update);
        break;
      case 'user':
        handleUserUpdate(update);
        break;
    }
  }, [queryClient, toast]);

  const handleKanbanUpdate = useCallback((update: RealtimeUpdate) => {
    switch (update.action) {
      case 'created':
        if (update.data?.type === 'board') {
          queryClient.invalidateQueries({ queryKey: queryKeys.kanban.boards() });
          toast({
            title: 'New board created',
            description: `"${update.data.name}" was added`,
          });
        } else if (update.data?.type === 'card') {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.kanban.board(update.boardId!) 
          });
          toast({
            title: 'New card added',
            description: `"${update.data.title}" was created`,
          });
        }
        break;

      case 'updated':
        if (update.data?.type === 'board') {
          queryClient.invalidateQueries({ queryKey: queryKeys.kanban.boards() });
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.kanban.board(update.id) 
          });
        } else if (update.data?.type === 'card') {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.kanban.board(update.boardId!) 
          });
        }
        break;

      case 'moved':
        if (update.data?.type === 'card') {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.kanban.board(update.boardId!) 
          });
          toast({
            title: 'Card moved',
            description: `"${update.data.title}" was moved to ${update.data.columnName}`,
          });
        }
        break;

      case 'deleted':
        if (update.data?.type === 'board') {
          queryClient.invalidateQueries({ queryKey: queryKeys.kanban.boards() });
          toast({
            title: 'Board deleted',
            description: 'A board was removed',
            variant: 'destructive',
          });
        } else if (update.data?.type === 'card') {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.kanban.board(update.boardId!) 
          });
          toast({
            title: 'Card deleted',
            description: 'A card was removed',
            variant: 'destructive',
          });
        }
        break;
    }
  }, [queryClient, toast]);

  const handleMemoryUpdate = useCallback((update: RealtimeUpdate) => {
    switch (update.action) {
      case 'created':
        queryClient.invalidateQueries({ queryKey: queryKeys.memory.all });
        toast({
          title: 'New memory created',
          description: `"${update.data?.title}" was added`,
        });
        break;

      case 'updated':
        queryClient.invalidateQueries({ queryKey: queryKeys.memory.all });
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.memory.memory(update.id) 
        });
        break;

      case 'deleted':
        queryClient.invalidateQueries({ queryKey: queryKeys.memory.all });
        toast({
          title: 'Memory deleted',
          description: 'A memory was removed',
          variant: 'destructive',
        });
        break;
    }
  }, [queryClient, toast]);

  const handleWikiUpdate = useCallback((update: RealtimeUpdate) => {
    switch (update.action) {
      case 'created':
        queryClient.invalidateQueries({ queryKey: queryKeys.wiki.all });
        toast({
          title: 'New wiki page created',
          description: `"${update.data?.title}" was added`,
        });
        break;

      case 'updated':
        queryClient.invalidateQueries({ queryKey: queryKeys.wiki.all });
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.wiki.page(update.id) 
        });
        break;

      case 'deleted':
        queryClient.invalidateQueries({ queryKey: queryKeys.wiki.all });
        toast({
          title: 'Wiki page deleted',
          description: 'A page was removed',
          variant: 'destructive',
        });
        break;
    }
  }, [queryClient, toast]);

  const handleUserUpdate = useCallback((update: RealtimeUpdate) => {
    switch (update.action) {
      case 'updated':
        // Handle user profile updates, presence changes, etc.
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.user });
        break;
    }
  }, [queryClient, toast]);

  const websocket = useWebSocketSubscription('realtime_update', handleRealtimeUpdate);

  return websocket;
}

// Hook for real-time kanban updates
export function useRealtimeKanban(boardId?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleKanbanUpdate = useCallback((update: any) => {
    if (boardId && update.boardId === boardId) {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.kanban.board(boardId) 
      });

      if (update.action === 'card_moved') {
        toast({
          title: 'Card moved',
          description: `"${update.data.title}" was moved by ${update.data.movedBy || 'another user'}`,
        });
      }
    }
  }, [boardId, queryClient, toast]);

  return useWebSocketSubscription('kanban_update', handleKanbanUpdate);
}

// Hook for real-time memory updates
export function useRealtimeMemory() {
  const queryClient = useQueryClient();

  const handleMemoryUpdate = useCallback((update: any) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.memory.all });
    
    if (update.id) {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.memory.memory(update.id) 
      });
    }
  }, [queryClient]);

  return useWebSocketSubscription('memory_update', handleMemoryUpdate);
}

// Hook for real-time wiki updates
export function useRealtimeWiki() {
  const queryClient = useQueryClient();

  const handleWikiUpdate = useCallback((update: any) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.wiki.all });
    
    if (update.id) {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.wiki.page(update.id) 
      });
    }
  }, [queryClient]);

  return useWebSocketSubscription('wiki_update', handleWikiUpdate);
}

// Hook for user presence/activity updates
export function useRealtimePresence() {
  const { toast } = useToast();

  const handlePresenceUpdate = useCallback((update: any) => {
    if (update.type === 'user_joined') {
      toast({
        title: 'User joined',
        description: `${update.data.name} is now online`,
      });
    } else if (update.type === 'user_left') {
      toast({
        title: 'User left',
        description: `${update.data.name} went offline`,
      });
    }
  }, [toast]);

  return useWebSocketSubscription('presence_update', handlePresenceUpdate);
}

// General useRealtime hook that components are trying to import
export function useRealtime() {
  return {
    useConnection: useRealtimeConnection,
    useUpdates: useRealtimeUpdates,
    useKanban: useRealtimeKanban,
    useMemory: useRealtimeMemory,
    useWiki: useRealtimeWiki,
    usePresence: useRealtimePresence,
  };
}