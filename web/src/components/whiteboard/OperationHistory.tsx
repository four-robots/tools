/**
 * OperationHistory Component
 * 
 * Undo/redo functionality with conflict awareness for whiteboard operations.
 * Handles operation history management and conflict-aware state restoration.
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Undo2, 
  Redo2, 
  History, 
  AlertTriangle,
  Eye,
  Clock,
  Users,
  Zap,
  GitBranch,
  RotateCcw,
  Play,
  Pause,
  StepBack,
  StepForward
} from 'lucide-react';

// Types
interface HistoryOperation {
  id: string;
  type: 'create' | 'update' | 'delete' | 'move' | 'style' | 'reorder' | 'compound' | 'batch';
  elementId: string;
  elementType?: string;
  data?: any;
  position?: { x: number; y: number };
  bounds?: { x: number; y: number; width: number; height: number };
  style?: any;
  timestamp: string;
  version: number;
  userId: string;
  userName?: string;
  conflicted: boolean;
  conflictId?: string;
  conflictResolution?: {
    strategy: string;
    resolvedBy: string;
    confidence: number;
  };
  metadata?: {
    processingTime?: number;
    networkLatency?: number;
    clientId?: string;
  };
}

interface ConflictInfo {
  id: string;
  type: string;
  severity: string;
  resolved: boolean;
  operations: string[]; // Operation IDs
}

interface OperationHistoryProps {
  operations: HistoryOperation[];
  conflicts: ConflictInfo[];
  currentIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRestoreToPoint: (operationId: string) => void;
  onViewConflict: (conflictId: string) => void;
  userColors?: Record<string, string>;
  maxHistorySize?: number;
  showMetadata?: boolean;
}

export const OperationHistory: React.FC<OperationHistoryProps> = ({
  operations,
  conflicts,
  currentIndex,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onRestoreToPoint,
  onViewConflict,
  userColors = {},
  maxHistorySize = 100,
  showMetadata = false
}) => {
  const [showHistory, setShowHistory] = useState(false);
  const [selectedOperation, setSelectedOperation] = useState<HistoryOperation | null>(null);
  const [playbackMode, setPlaybackMode] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000); // ms per operation

  // Auto-save history to localStorage
  useEffect(() => {
    const historyData = {
      operations: operations.slice(-maxHistorySize),
      currentIndex,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('whiteboard_operation_history', JSON.stringify(historyData));
  }, [operations, currentIndex, maxHistorySize]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'z':
            if (e.shiftKey) {
              e.preventDefault();
              if (canRedo) onRedo();
            } else {
              e.preventDefault();
              if (canUndo) onUndo();
            }
            break;
          case 'y':
            e.preventDefault();
            if (canRedo) onRedo();
            break;
          case 'h':
            e.preventDefault();
            setShowHistory(!showHistory);
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, onUndo, onRedo, showHistory]);

  // Playback functionality
  const startPlayback = useCallback(() => {
    setPlaybackMode(true);
    setPlaybackIndex(0);
  }, []);

  const stopPlayback = useCallback(() => {
    setPlaybackMode(false);
    setPlaybackIndex(0);
  }, []);

  useEffect(() => {
    if (!playbackMode) return;

    const interval = setInterval(() => {
      setPlaybackIndex(prev => {
        if (prev >= operations.length - 1) {
          setPlaybackMode(false);
          return prev;
        }
        return prev + 1;
      });
    }, playbackSpeed);

    return () => clearInterval(interval);
  }, [playbackMode, playbackSpeed, operations.length]);

  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'create': return <Plus className="w-3 h-3" />;
      case 'update': return <Edit className="w-3 h-3" />;
      case 'delete': return <Trash className="w-3 h-3" />;
      case 'move': return <Move className="w-3 h-3" />;
      case 'style': return <Palette className="w-3 h-3" />;
      case 'compound': return <Zap className="w-3 h-3" />;
      case 'batch': return <GitBranch className="w-3 h-3" />;
      default: return <Circle className="w-3 h-3" />;
    }
  };

  const getUserColor = (userId: string) => {
    return userColors[userId] || '#94a3b8';
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getConflictForOperation = (operationId: string) => {
    return conflicts.find(c => c.operations.includes(operationId));
  };

  const getOperationsByConflict = (conflictId: string) => {
    const conflict = conflicts.find(c => c.id === conflictId);
    if (!conflict) return [];
    
    return operations.filter(op => conflict.operations.includes(op.id));
  };

  const conflictedOperations = operations.filter(op => op.conflicted);
  const conflictStats = {
    total: conflicts.length,
    resolved: conflicts.filter(c => c.resolved).length,
    pending: conflicts.filter(c => !c.resolved).length
  };

  return (
    <>
      {/* History Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-4 h-4" />
        </Button>

        <Separator orientation="vertical" className="h-6" />

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowHistory(!showHistory)}
          title="Show History (Ctrl+H)"
          className={showHistory ? 'bg-blue-50' : ''}
        >
          <History className="w-4 h-4" />
          {operations.length > 0 && (
            <Badge variant="outline" className="ml-1 text-xs">
              {operations.length}
            </Badge>
          )}
        </Button>

        {conflictedOperations.length > 0 && (
          <Badge variant="destructive" className="text-xs">
            {conflictedOperations.length} conflicted
          </Badge>
        )}
      </div>

      {/* History Panel */}
      {showHistory && (
        <Card className="absolute top-full left-0 mt-2 w-96 max-h-96 shadow-lg z-50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span>Operation History</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{operations.length}</Badge>
                {!playbackMode ? (
                  <Button size="sm" variant="outline" onClick={startPlayback}>
                    <Play className="w-3 h-3" />
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={stopPlayback}>
                    <Pause className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>

          {/* Conflict Summary */}
          {conflicts.length > 0 && (
            <div className="px-4 pb-2">
              <Alert className="py-2">
                <AlertTriangle className="h-3 w-3" />
                <AlertDescription className="text-xs">
                  {conflictStats.total} conflicts: {conflictStats.resolved} resolved, {conflictStats.pending} pending
                </AlertDescription>
              </Alert>
            </div>
          )}

          <ScrollArea className="max-h-80">
            <CardContent className="p-0">
              {operations.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  No operations in history
                </div>
              ) : (
                <div className="space-y-1">
                  {operations
                    .slice()
                    .reverse()
                    .map((operation, index) => {
                      const actualIndex = operations.length - 1 - index;
                      const isSelected = selectedOperation?.id === operation.id;
                      const isCurrent = actualIndex === currentIndex;
                      const isPlaybackCurrent = playbackMode && actualIndex === playbackIndex;
                      const conflict = getConflictForOperation(operation.id);

                      return (
                        <div
                          key={operation.id}
                          className={`p-3 border-b hover:bg-gray-50 cursor-pointer relative ${
                            isSelected ? 'bg-blue-50 border-blue-200' : ''
                          } ${isCurrent ? 'bg-green-50 border-green-200' : ''} ${
                            isPlaybackCurrent ? 'bg-yellow-50 border-yellow-200' : ''
                          } ${operation.conflicted ? 'border-l-4 border-l-red-500' : ''}`}
                          onClick={() => setSelectedOperation(operation)}
                          onDoubleClick={() => onRestoreToPoint(operation.id)}
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {getOperationIcon(operation.type)}
                              <div 
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: getUserColor(operation.userId) }}
                              />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium capitalize">
                                  {operation.type}
                                </span>
                                <span className="text-xs text-gray-500 truncate">
                                  {operation.elementId}
                                </span>
                                {conflict && (
                                  <Badge 
                                    variant={conflict.resolved ? "outline" : "destructive"}
                                    className="text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onViewConflict(conflict.id);
                                    }}
                                  >
                                    <AlertTriangle className="w-2 h-2 mr-1" />
                                    {conflict.resolved ? 'Resolved' : 'Conflict'}
                                  </Badge>
                                )}
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">
                                  {operation.userName || `User ${operation.userId.slice(0, 8)}`}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {formatTimestamp(operation.timestamp)}
                                </span>
                              </div>

                              {operation.conflictResolution && (
                                <div className="text-xs text-green-600 mt-1">
                                  Resolved via {operation.conflictResolution.strategy} 
                                  ({(operation.conflictResolution.confidence * 100).toFixed(0)}% confidence)
                                </div>
                              )}

                              {showMetadata && operation.metadata && (
                                <div className="text-xs text-gray-500 mt-1 space-y-1">
                                  {operation.metadata.processingTime && (
                                    <div>Processing: {operation.metadata.processingTime}ms</div>
                                  )}
                                  {operation.metadata.networkLatency && (
                                    <div>Latency: {operation.metadata.networkLatency}ms</div>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col items-center gap-1 flex-shrink-0">
                              <span className="text-xs text-gray-400">#{operation.version}</span>
                              {isCurrent && (
                                <div className="w-2 h-2 bg-green-500 rounded-full" title="Current state" />
                              )}
                              {isPlaybackCurrent && (
                                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" title="Playback position" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </ScrollArea>

          {/* History Actions */}
          <div className="p-3 border-t bg-gray-50">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>Double-click to restore to point</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowMetadata(!showMetadata)}
                  className="text-xs"
                >
                  {showMetadata ? 'Hide' : 'Show'} Metadata
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Operation Detail Panel */}
      {selectedOperation && (
        <Card className="absolute top-full right-0 mt-2 w-80 shadow-lg z-50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span>Operation Details</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedOperation(null)}
              >
                <X className="w-3 h-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500">Type:</span>
                <div className="font-medium capitalize">{selectedOperation.type}</div>
              </div>
              <div>
                <span className="text-gray-500">Element:</span>
                <div className="font-medium truncate">{selectedOperation.elementId}</div>
              </div>
              <div>
                <span className="text-gray-500">User:</span>
                <div className="font-medium">
                  {selectedOperation.userName || `User ${selectedOperation.userId.slice(0, 8)}`}
                </div>
              </div>
              <div>
                <span className="text-gray-500">Version:</span>
                <div className="font-medium">#{selectedOperation.version}</div>
              </div>
            </div>

            {selectedOperation.position && (
              <div>
                <span className="text-gray-500 text-xs">Position:</span>
                <div className="text-xs font-mono">
                  ({selectedOperation.position.x.toFixed(0)}, {selectedOperation.position.y.toFixed(0)})
                </div>
              </div>
            )}

            {selectedOperation.bounds && (
              <div>
                <span className="text-gray-500 text-xs">Bounds:</span>
                <div className="text-xs font-mono">
                  {selectedOperation.bounds.width.toFixed(0)} × {selectedOperation.bounds.height.toFixed(0)}
                </div>
              </div>
            )}

            {selectedOperation.conflicted && (
              <Alert>
                <AlertTriangle className="h-3 w-3" />
                <AlertDescription className="text-xs">
                  This operation was involved in a conflict
                  {selectedOperation.conflictResolution && (
                    <div className="mt-1 text-green-600">
                      Resolved via {selectedOperation.conflictResolution.strategy}
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRestoreToPoint(selectedOperation.id)}
                className="flex-1"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Restore to Here
              </Button>
              {selectedOperation.conflictId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onViewConflict(selectedOperation.conflictId!);
                    setSelectedOperation(null);
                  }}
                >
                  <Eye className="w-3 h-3 mr-1" />
                  View Conflict
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Playback Controls */}
      {playbackMode && (
        <Card className="fixed bottom-4 left-1/2 transform -translate-x-1/2 shadow-lg z-50">
          <CardContent className="p-3">
            <div className="flex items-center gap-4">
              <Button size="sm" variant="outline" onClick={stopPlayback}>
                <Pause className="w-3 h-3" />
              </Button>
              
              <div className="flex items-center gap-2">
                <StepBack 
                  className="w-4 h-4 cursor-pointer" 
                  onClick={() => setPlaybackIndex(Math.max(0, playbackIndex - 1))}
                />
                <span className="text-sm font-mono">
                  {playbackIndex + 1} / {operations.length}
                </span>
                <StepForward 
                  className="w-4 h-4 cursor-pointer" 
                  onClick={() => setPlaybackIndex(Math.min(operations.length - 1, playbackIndex + 1))}
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs">Speed:</span>
                <select 
                  value={playbackSpeed} 
                  onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                  className="text-xs border rounded px-1"
                >
                  <option value={2000}>0.5x</option>
                  <option value={1000}>1x</option>
                  <option value={500}>2x</option>
                  <option value={250}>4x</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
};

export default OperationHistory;