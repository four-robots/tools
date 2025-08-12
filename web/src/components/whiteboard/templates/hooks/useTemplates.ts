import { useState, useEffect, useCallback, useRef } from 'react';
import { WhiteboardTemplate } from '@/types/whiteboard';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAuth } from '@/hooks/useAuth';

interface UseTemplatesOptions {
  initialLimit?: number;
  autoRefresh?: boolean;
}

interface UseTemplatesReturn {
  templates: WhiteboardTemplate[];
  loading: boolean;
  error: Error | null;
  total: number;
  hasMore: boolean;
  favorites: Set<string>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  toggleFavorite: (templateId: string, isFavorite: boolean) => Promise<void>;
  createTemplate: (templateData: any) => Promise<WhiteboardTemplate>;
  updateTemplate: (templateId: string, updateData: any) => Promise<WhiteboardTemplate>;
  deleteTemplate: (templateId: string) => Promise<void>;
}

export function useTemplates(
  workspaceId?: string,
  options: UseTemplatesOptions = {}
): UseTemplatesReturn {
  const { initialLimit = 20, autoRefresh = true } = options;
  
  // State
  const [templates, setTemplates] = useState<WhiteboardTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  
  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Hooks
  const { user } = useAuth();
  const { socket, isConnected } = useWebSocket();

  // Computed values
  const hasMore = templates.length < total;

  // Fetch templates from API
  const fetchTemplates = useCallback(async (
    reset: boolean = false,
    limit: number = initialLimit,
    currentOffset: number = 0
  ) => {
    if (!user) return;

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: currentOffset.toString(),
        ...(workspaceId && { workspaceId }),
      });

      const response = await fetch(`/api/whiteboard/templates?${params}`, {
        signal: abortControllerRef.current.signal,
        headers: {
          'Authorization': `Bearer ${user.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch templates: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (reset) {
        setTemplates(data.items);
        setOffset(data.limit);
      } else {
        setTemplates(prev => [...prev, ...data.items]);
        setOffset(prev => prev + data.limit);
      }
      
      setTotal(data.total);

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // Request was cancelled, ignore
      }
      console.error('Failed to fetch templates:', error);
      setError(error instanceof Error ? error : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [user, workspaceId, initialLimit]);

  // Load favorites
  const loadFavorites = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch('/api/user/template-favorites', {
        headers: {
          'Authorization': `Bearer ${user.token}`,
        },
      });

      if (response.ok) {
        const favoriteIds = await response.json();
        setFavorites(new Set(favoriteIds));
      }
    } catch (error) {
      console.error('Failed to load favorites:', error);
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    if (user) {
      fetchTemplates(true);
      loadFavorites();
    }
  }, [user, fetchTemplates, loadFavorites]);

  // WebSocket event handlers
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleTemplateCreated = (data: any) => {
      if (autoRefresh) {
        setTemplates(prev => [data.template, ...prev]);
        setTotal(prev => prev + 1);
      }
    };

    const handleTemplateUpdated = (data: any) => {
      if (autoRefresh) {
        setTemplates(prev => 
          prev.map(template => 
            template.id === data.templateId 
              ? { ...template, ...data.template }
              : template
          )
        );
      }
    };

    const handleTemplateDeleted = (data: any) => {
      if (autoRefresh) {
        setTemplates(prev => prev.filter(template => template.id !== data.templateId));
        setTotal(prev => Math.max(0, prev - 1));
      }
    };

    // Subscribe to template events
    socket.on('template:created', handleTemplateCreated);
    socket.on('template:updated', handleTemplateUpdated);
    socket.on('template:deleted', handleTemplateDeleted);

    // Subscribe to workspace templates if workspaceId provided
    if (workspaceId) {
      socket.emit('workspace:subscribe_templates', { workspaceId });
    }

    return () => {
      socket.off('template:created', handleTemplateCreated);
      socket.off('template:updated', handleTemplateUpdated);
      socket.off('template:deleted', handleTemplateDeleted);
      
      if (workspaceId) {
        socket.emit('workspace:unsubscribe_templates', { workspaceId });
      }
    };
  }, [socket, isConnected, autoRefresh, workspaceId]);

  // Load more templates
  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    await fetchTemplates(false, initialLimit, offset);
  }, [loading, hasMore, fetchTemplates, initialLimit, offset]);

  // Refresh templates
  const refresh = useCallback(async () => {
    setOffset(0);
    await fetchTemplates(true);
  }, [fetchTemplates]);

  // Toggle favorite status
  const toggleFavorite = useCallback(async (templateId: string, isFavorite: boolean) => {
    if (!user) return;

    try {
      const method = isFavorite ? 'POST' : 'DELETE';
      const response = await fetch(`/api/user/template-favorites/${templateId}`, {
        method,
        headers: {
          'Authorization': `Bearer ${user.token}`,
        },
      });

      if (response.ok) {
        setFavorites(prev => {
          const newFavorites = new Set(prev);
          if (isFavorite) {
            newFavorites.add(templateId);
          } else {
            newFavorites.delete(templateId);
          }
          return newFavorites;
        });
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      throw error;
    }
  }, [user]);

  // Create new template
  const createTemplate = useCallback(async (templateData: any): Promise<WhiteboardTemplate> => {
    if (!user) throw new Error('User not authenticated');

    try {
      setLoading(true);
      
      const response = await fetch('/api/whiteboard/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          ...templateData,
          workspaceId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create template: ${response.statusText}`);
      }

      const template = await response.json();
      
      // Add to local state
      setTemplates(prev => [template, ...prev]);
      setTotal(prev => prev + 1);
      
      return template;
    } catch (error) {
      console.error('Failed to create template:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [user, workspaceId]);

  // Update existing template
  const updateTemplate = useCallback(async (templateId: string, updateData: any): Promise<WhiteboardTemplate> => {
    if (!user) throw new Error('User not authenticated');

    try {
      setLoading(true);
      
      const response = await fetch(`/api/whiteboard/templates/${templateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          ...updateData,
          workspaceId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update template: ${response.statusText}`);
      }

      const updatedTemplate = await response.json();
      
      // Update local state
      setTemplates(prev => 
        prev.map(template => 
          template.id === templateId 
            ? updatedTemplate 
            : template
        )
      );
      
      return updatedTemplate;
    } catch (error) {
      console.error('Failed to update template:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [user, workspaceId]);

  // Delete template
  const deleteTemplate = useCallback(async (templateId: string): Promise<void> => {
    if (!user) throw new Error('User not authenticated');

    try {
      setLoading(true);
      
      const response = await fetch(`/api/whiteboard/templates/${templateId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${user.token}`,
        },
        ...(workspaceId && {
          body: JSON.stringify({ workspaceId }),
          headers: {
            'Authorization': `Bearer ${user.token}`,
            'Content-Type': 'application/json',
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to delete template: ${response.statusText}`);
      }
      
      // Remove from local state
      setTemplates(prev => prev.filter(template => template.id !== templateId));
      setTotal(prev => Math.max(0, prev - 1));
      
      // Remove from favorites if present
      setFavorites(prev => {
        const newFavorites = new Set(prev);
        newFavorites.delete(templateId);
        return newFavorites;
      });
      
    } catch (error) {
      console.error('Failed to delete template:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [user, workspaceId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    templates,
    loading,
    error,
    total,
    hasMore,
    favorites,
    loadMore,
    refresh,
    toggleFavorite,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}