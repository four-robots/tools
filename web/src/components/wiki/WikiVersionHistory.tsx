'use client';

import React, { useState, useEffect } from 'react';
import { sanitizeHtml, SanitizationProfiles } from '../../lib/sanitization';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';
import { Clock, User, RotateCcw, Eye, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface HistoryEntry {
  id: number;
  page_id: number;
  title: string;
  content: string;
  summary?: string;
  changed_by?: string;
  change_reason?: string;
  created_at: string;
}

interface WikiVersionHistoryProps {
  pageId: number;
  onVersionRestore?: (entry: HistoryEntry) => void;
}

export function WikiVersionHistory({ pageId, onVersionRestore }: WikiVersionHistoryProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  const { toast } = useToast();
  const api = useApi();

  useEffect(() => {
    loadHistory();
  }, [pageId]);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const response = await api.get(`/api/wiki/pages/${pageId}/history`);
      setHistory(response.data || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load version history',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreVersion = async (entry: HistoryEntry) => {
    setIsRestoring(true);
    try {
      const response = await api.post(`/api/wiki/pages/${pageId}/restore/${entry.id}`, {
        restored_by: 'Current User' // This should come from auth context
      });
      
      toast({
        title: 'Success',
        description: `Page restored to version from ${formatDistanceToNow(new Date(entry.created_at))} ago`
      });
      
      setShowRestoreConfirm(false);
      setSelectedEntry(null);
      onVersionRestore?.(entry);
      
      // Reload history to show the new entry
      await loadHistory();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to restore version',
        variant: 'destructive'
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const formatContent = (content: string) => {
    // Escape HTML first, then apply safe markdown formatting
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const html = escaped
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
    return sanitizeHtml(html, SanitizationProfiles.RICH_TEXT);
  };

  const getChangeTypeColor = (changeReason?: string) => {
    if (!changeReason) return 'bg-gray-100';
    if (changeReason.includes('Created')) return 'bg-green-100';
    if (changeReason.includes('Restored')) return 'bg-blue-100';
    return 'bg-yellow-100';
  };

  const getChangeTypeIcon = (changeReason?: string) => {
    if (!changeReason) return <Clock className="h-4 w-4" />;
    if (changeReason.includes('Created')) return <Plus className="h-4 w-4" />;
    if (changeReason.includes('Restored')) return <RotateCcw className="h-4 w-4" />;
    return <Clock className="h-4 w-4" />;
  };

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 bg-gray-200 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (history.length === 0) {
    return (
      <Card className="p-4 text-center">
        <Clock className="h-8 w-8 mx-auto text-gray-400 mb-2" />
        <p className="text-gray-500">No version history available</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-4 w-4" />
        <h3 className="font-medium">Version History</h3>
        <Badge variant="secondary">{history.length} versions</Badge>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {history.map((entry, index) => (
          <div
            key={entry.id}
            className={`border rounded-lg p-3 hover:shadow-sm transition-shadow ${
              index === 0 ? 'border-blue-200 bg-blue-50' : 'border-gray-200'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1 rounded-full ${getChangeTypeColor(entry.change_reason)}`}>
                    {getChangeTypeIcon(entry.change_reason)}
                  </div>
                  {index === 0 && (
                    <Badge variant="default" className="text-xs">
                      Current
                    </Badge>
                  )}
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-3 w-3 text-gray-400" />
                    <span className="text-gray-600">
                      {entry.changed_by || 'Unknown user'}
                    </span>
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-500">
                      {formatDistanceToNow(new Date(entry.created_at))} ago
                    </span>
                  </div>
                  
                  {entry.change_reason && (
                    <p className="text-sm text-gray-600">{entry.change_reason}</p>
                  )}
                  
                  {entry.title !== history[0]?.title && (
                    <p className="text-sm text-blue-600">
                      Title: "{entry.title}"
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedEntry(entry);
                    setShowPreview(true);
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                
                {index !== 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedEntry(entry);
                      setShowRestoreConfirm(true);
                    }}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Version Preview - {selectedEntry?.title}
            </DialogTitle>
            <div className="text-sm text-gray-500">
              {selectedEntry && (
                <>
                  By {selectedEntry.changed_by || 'Unknown user'} • {' '}
                  {formatDistanceToNow(new Date(selectedEntry.created_at))} ago
                </>
              )}
            </div>
          </DialogHeader>
          
          {selectedEntry && (
            <div className="space-y-4">
              {selectedEntry.change_reason && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">{selectedEntry.change_reason}</p>
                </div>
              )}
              
              <div className="prose prose-sm max-w-none">
                <div 
                  dangerouslySetInnerHTML={{ 
                    __html: formatContent(selectedEntry.content) 
                  }} 
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog open={showRestoreConfirm} onOpenChange={setShowRestoreConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Restore Version
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-gray-600">
              Are you sure you want to restore this version? This will:
            </p>
            
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
              <li>Replace the current page content</li>
              <li>Create a new history entry</li>
              <li>Cannot be undone (but you can restore to the current version later)</li>
            </ul>
            
            {selectedEntry && (
              <div className="p-3 border rounded-lg bg-gray-50">
                <div className="text-sm">
                  <strong>Version from:</strong> {formatDistanceToNow(new Date(selectedEntry.created_at))} ago
                </div>
                {selectedEntry.changed_by && (
                  <div className="text-sm">
                    <strong>Changed by:</strong> {selectedEntry.changed_by}
                  </div>
                )}
                {selectedEntry.change_reason && (
                  <div className="text-sm">
                    <strong>Reason:</strong> {selectedEntry.change_reason}
                  </div>
                )}
              </div>
            )}
            
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowRestoreConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => selectedEntry && handleRestoreVersion(selectedEntry)}
                disabled={isRestoring}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {isRestoring ? 'Restoring...' : 'Restore Version'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}