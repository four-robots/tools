'use client';

import { useState, useCallback, useEffect } from 'react';
import { useApi } from '@/hooks/use-api';
import type { 
  UnifiedSearchResult,
  ResourceAttachment,
  AttachResourceRequest,
  ResourceType 
} from '@shared/types/whiteboard';

interface UseWhiteboardIntegrationResult {
  // Resource attachments
  attachments: ResourceAttachment[];
  isLoadingAttachments: boolean;
  attachmentsError: string | null;
  
  // Actions
  attachResource: (result: UnifiedSearchResult, elementId: string) => Promise<ResourceAttachment>;
  detachResource: (attachmentId: string) => Promise<void>;
  syncResources: () => Promise<{ synced: number; failed: number; conflicts: number }>;
  refreshAttachments: () => Promise<void>;
  
  // States
  isAttaching: boolean;
  isDetaching: boolean;
  isSyncing: boolean;
}

export function useWhiteboardIntegration(whiteboardId: string): UseWhiteboardIntegrationResult {
  const [attachments, setAttachments] = useState<ResourceAttachment[]>([]);
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  
  const [isAttaching, setIsAttaching] = useState(false);
  const [isDetaching, setIsDetaching] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const { client } = useApi();

  // Load all attachments for the whiteboard
  const loadAttachments = useCallback(async () => {
    setIsLoadingAttachments(true);
    setAttachmentsError(null);

    try {
      const response = await client.get<{
        success: boolean;
        data: {
          whiteboardId: string;
          attachments: ResourceAttachment[];
          total: number;
        };
        message: string;
      }>(`/api/v1/whiteboards/${whiteboardId}/attachments`);

      if (response.data.success) {
        setAttachments(response.data.data.attachments);
      } else {
        throw new Error('Failed to load attachments');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load attachments';
      setAttachmentsError(errorMessage);
      console.error('Load attachments error:', err);
    } finally {
      setIsLoadingAttachments(false);
    }
  }, [client, whiteboardId]);

  // Attach a search result to a whiteboard element
  const attachResource = useCallback(async (
    result: UnifiedSearchResult, 
    elementId: string
  ): Promise<ResourceAttachment> => {
    setIsAttaching(true);

    try {
      const attachRequest: AttachResourceRequest = {
        resourceType: result.type,
        resourceId: result.id,
        elementId,
        attachmentMetadata: {
          title: result.title,
          description: result.description,
          service: result.service,
          tags: result.tags,
        },
        syncEnabled: true,
      };

      const response = await client.post<{
        success: boolean;
        data: ResourceAttachment;
        message: string;
      }>(`/api/v1/whiteboards/${whiteboardId}/attachments`, attachRequest);

      if (response.data.success) {
        const newAttachment = response.data.data;
        setAttachments(prev => [newAttachment, ...prev]);
        return newAttachment;
      } else {
        throw new Error('Failed to attach resource');
      }
    } catch (err) {
      console.error('Attach resource error:', err);
      throw err;
    } finally {
      setIsAttaching(false);
    }
  }, [client, whiteboardId]);

  // Detach a resource from the whiteboard
  const detachResource = useCallback(async (attachmentId: string): Promise<void> => {
    setIsDetaching(true);

    try {
      const response = await client.delete<{
        success: boolean;
        message: string;
      }>(`/api/v1/whiteboards/${whiteboardId}/attachments/${attachmentId}`);

      if (response.data.success) {
        setAttachments(prev => prev.filter(attachment => attachment.id !== attachmentId));
      } else {
        throw new Error('Failed to detach resource');
      }
    } catch (err) {
      console.error('Detach resource error:', err);
      throw err;
    } finally {
      setIsDetaching(false);
    }
  }, [client, whiteboardId]);

  // Sync all resources with their source services
  const syncResources = useCallback(async (): Promise<{ synced: number; failed: number; conflicts: number }> => {
    setIsSyncing(true);

    try {
      const response = await client.post<{
        success: boolean;
        data: {
          whiteboardId: string;
          synced: number;
          failed: number;
          conflicts: number;
        };
        message: string;
      }>(`/api/v1/whiteboards/${whiteboardId}/sync`);

      if (response.data.success) {
        // Refresh attachments after sync to get updated data
        await loadAttachments();
        return {
          synced: response.data.data.synced,
          failed: response.data.data.failed,
          conflicts: response.data.data.conflicts,
        };
      } else {
        throw new Error('Failed to sync resources');
      }
    } catch (err) {
      console.error('Sync resources error:', err);
      throw err;
    } finally {
      setIsSyncing(false);
    }
  }, [client, whiteboardId, loadAttachments]);

  // Convenience methods for specific service types
  const attachKanbanCard = useCallback(async (
    cardId: string,
    elementId: string,
    position: { x: number; y: number },
    size?: { width: number; height: number }
  ): Promise<ResourceAttachment> => {
    try {
      const response = await client.post<{
        success: boolean;
        data: ResourceAttachment;
        message: string;
      }>(`/api/v1/whiteboards/${whiteboardId}/kanban/cards`, {
        cardId,
        elementId,
        position,
        size,
      });

      if (response.data.success) {
        const newAttachment = response.data.data;
        setAttachments(prev => [newAttachment, ...prev]);
        return newAttachment;
      } else {
        throw new Error('Failed to attach Kanban card');
      }
    } catch (err) {
      console.error('Attach Kanban card error:', err);
      throw err;
    }
  }, [client, whiteboardId]);

  const attachWikiPage = useCallback(async (
    pageId: string,
    elementId: string,
    position: { x: number; y: number },
    showFullContent = false,
    size?: { width: number; height: number }
  ): Promise<ResourceAttachment> => {
    try {
      const response = await client.post<{
        success: boolean;
        data: ResourceAttachment;
        message: string;
      }>(`/api/v1/whiteboards/${whiteboardId}/wiki/pages`, {
        pageId,
        elementId,
        showFullContent,
        position,
        size,
      });

      if (response.data.success) {
        const newAttachment = response.data.data;
        setAttachments(prev => [newAttachment, ...prev]);
        return newAttachment;
      } else {
        throw new Error('Failed to attach Wiki page');
      }
    } catch (err) {
      console.error('Attach Wiki page error:', err);
      throw err;
    }
  }, [client, whiteboardId]);

  const attachMemoryNode = useCallback(async (
    nodeId: string,
    elementId: string,
    position: { x: number; y: number },
    showConnections = true,
    size?: { width: number; height: number }
  ): Promise<ResourceAttachment> => {
    try {
      const response = await client.post<{
        success: boolean;
        data: ResourceAttachment;
        message: string;
      }>(`/api/v1/whiteboards/${whiteboardId}/memory/nodes`, {
        nodeId,
        elementId,
        showConnections,
        position,
        size,
      });

      if (response.data.success) {
        const newAttachment = response.data.data;
        setAttachments(prev => [newAttachment, ...prev]);
        return newAttachment;
      } else {
        throw new Error('Failed to attach Memory node');
      }
    } catch (err) {
      console.error('Attach Memory node error:', err);
      throw err;
    }
  }, [client, whiteboardId]);

  // Load attachments on mount
  useEffect(() => {
    loadAttachments();
  }, [loadAttachments]);

  return {
    // Resource attachments
    attachments,
    isLoadingAttachments,
    attachmentsError,
    
    // Actions
    attachResource,
    detachResource,
    syncResources,
    refreshAttachments: loadAttachments,
    
    // Convenience methods
    attachKanbanCard,
    attachWikiPage,
    attachMemoryNode,
    
    // States
    isAttaching,
    isDetaching,
    isSyncing,
  };
}