/**
 * ConflictResolver Component
 * 
 * Manual conflict resolution interface for complex whiteboard conflicts.
 * Provides UI for users to resolve conflicts when automatic resolution fails.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  AlertTriangle, 
  Users, 
  Clock, 
  Zap, 
  Check, 
  X, 
  Merge,
  Eye,
  AlertCircle,
  TrendingUp,
  Activity
} from 'lucide-react';

// Types
interface ConflictOperation {
  id: string;
  type: string;
  elementId: string;
  userId: string;
  userName?: string;
  timestamp: string;
  data: any;
  position?: { x: number; y: number };
  bounds?: { x: number; y: number; width: number; height: number };
  style?: any;
}

interface ConflictInfo {
  id: string;
  type: 'spatial' | 'temporal' | 'semantic' | 'ordering' | 'dependency' | 'compound';
  severity: 'low' | 'medium' | 'high' | 'critical';
  operations: ConflictOperation[];
  affectedElements: string[];
  detectedAt: string;
  spatialOverlap?: {
    area: number;
    percentage: number;
  };
  temporalProximity?: {
    timeDiffMs: number;
    isSimultaneous: boolean;
  };
  semanticConflict?: {
    incompatibleChanges: string[];
    dataConflicts: Record<string, any>;
  };
}

interface ConflictResolverProps {
  conflict: ConflictInfo | null;
  isOpen: boolean;
  onClose: () => void;
  onResolve: (conflictId: string, resolution: 'accept' | 'reject' | 'merge', selectedOperation?: ConflictOperation, mergeData?: any) => void;
  userColors?: Record<string, string>;
}

export const ConflictResolver: React.FC<ConflictResolverProps> = ({
  conflict,
  isOpen,
  onClose,
  onResolve,
  userColors = {}
}) => {
  const [selectedTab, setSelectedTab] = useState('overview');
  const [selectedOperation, setSelectedOperation] = useState<ConflictOperation | null>(null);
  const [mergeData, setMergeData] = useState<any>(null);
  const [resolution, setResolution] = useState<'accept' | 'reject' | 'merge' | null>(null);

  useEffect(() => {
    if (conflict) {
      setSelectedOperation(null);
      setMergeData(null);
      setResolution(null);
      setSelectedTab('overview');
    }
  }, [conflict]);

  if (!conflict) return null;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'spatial': return <Users className="w-4 h-4" />;
      case 'temporal': return <Clock className="w-4 h-4" />;
      case 'semantic': return <AlertTriangle className="w-4 h-4" />;
      case 'compound': return <Zap className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatTimeDiff = (timeDiffMs: number) => {
    if (timeDiffMs < 1000) return `${timeDiffMs}ms`;
    if (timeDiffMs < 60000) return `${(timeDiffMs / 1000).toFixed(1)}s`;
    return `${(timeDiffMs / 60000).toFixed(1)}m`;
  };

  const getUserColor = (userId: string) => {
    return userColors[userId] || '#94a3b8';
  };

  const handleResolve = () => {
    if (!resolution || !conflict) return;

    switch (resolution) {
      case 'accept':
        if (selectedOperation) {
          onResolve(conflict.id, 'accept', selectedOperation);
        }
        break;
      case 'reject':
        onResolve(conflict.id, 'reject');
        break;
      case 'merge':
        onResolve(conflict.id, 'merge', undefined, mergeData);
        break;
    }
    onClose();
  };

  const prepareAutoMerge = () => {
    if (conflict.operations.length !== 2) return;

    const [op1, op2] = conflict.operations;
    const merged = {
      ...op1.data,
      ...op2.data,
      position: op2.position || op1.position,
      bounds: op2.bounds || op1.bounds,
      style: { ...op1.style, ...op2.style }
    };

    setMergeData(merged);
    setResolution('merge');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getTypeIcon(conflict.type)}
            <span>Conflict Resolution Required</span>
            <Badge className={getSeverityColor(conflict.severity)}>
              {conflict.severity.toUpperCase()}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="h-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="operations">Operations</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="resolution">Resolution</TabsTrigger>
          </TabsList>

          <div className="max-h-[60vh] overflow-y-auto">
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Conflict Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Type:</span>
                      <div className="flex items-center gap-1">
                        {getTypeIcon(conflict.type)}
                        <span className="text-sm font-medium capitalize">{conflict.type}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Severity:</span>
                      <Badge className={getSeverityColor(conflict.severity)}>
                        {conflict.severity}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Detected:</span>
                      <span className="text-sm">{formatTimestamp(conflict.detectedAt)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Operations:</span>
                      <span className="text-sm font-medium">{conflict.operations.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Elements:</span>
                      <span className="text-sm font-medium">{conflict.affectedElements.length}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Affected Users</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Array.from(new Set(conflict.operations.map(op => op.userId))).map(userId => {
                        const userOps = conflict.operations.filter(op => op.userId === userId);
                        const userName = userOps[0]?.userName || `User ${userId.slice(0, 8)}`;
                        
                        return (
                          <div key={userId} className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: getUserColor(userId) }}
                            />
                            <span className="text-sm font-medium">{userName}</span>
                            <Badge variant="outline" className="text-xs">
                              {userOps.length} ops
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Conflict-specific details */}
              {conflict.spatialOverlap && (
                <Alert>
                  <TrendingUp className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Spatial Conflict:</strong> Elements overlap by {(conflict.spatialOverlap.percentage * 100).toFixed(1)}% 
                    ({conflict.spatialOverlap.area.toFixed(0)} px²)
                  </AlertDescription>
                </Alert>
              )}

              {conflict.temporalProximity && (
                <Alert>
                  <Clock className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Temporal Conflict:</strong> Operations occurred within {formatTimeDiff(conflict.temporalProximity.timeDiffMs)}
                    {conflict.temporalProximity.isSimultaneous && ' (simultaneous)'}
                  </AlertDescription>
                </Alert>
              )}

              {conflict.semanticConflict && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Semantic Conflict:</strong> {conflict.semanticConflict.incompatibleChanges.length} incompatible changes detected
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="operations" className="space-y-4">
              <div className="space-y-3">
                {conflict.operations.map((operation, index) => (
                  <Card 
                    key={operation.id}
                    className={`cursor-pointer transition-colors ${
                      selectedOperation?.id === operation.id ? 'ring-2 ring-blue-500' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedOperation(operation)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: getUserColor(operation.userId) }}
                            />
                            <span className="font-medium">
                              {operation.userName || `User ${operation.userId.slice(0, 8)}`}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {operation.type}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-600">
                            Element: {operation.elementId}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatTimestamp(operation.timestamp)}
                          </div>
                          {operation.position && (
                            <div className="text-xs text-gray-500">
                              Position: ({operation.position.x.toFixed(0)}, {operation.position.y.toFixed(0)})
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">Operation #{index + 1}</div>
                          {selectedOperation?.id === operation.id && (
                            <Check className="w-4 h-4 text-green-600 mt-1" />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="details" className="space-y-4">
              {conflict.semanticConflict?.dataConflicts && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Data Conflicts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(conflict.semanticConflict.dataConflicts).map(([key, values]) => (
                        <div key={key} className="border rounded p-2">
                          <div className="font-medium text-sm">{key}</div>
                          <div className="text-xs text-gray-600 mt-1">
                            Operation 1: <code>{JSON.stringify(values.op1)}</code>
                          </div>
                          <div className="text-xs text-gray-600">
                            Operation 2: <code>{JSON.stringify(values.op2)}</code>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Affected Elements</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {conflict.affectedElements.map(elementId => (
                      <Badge key={elementId} variant="outline" className="text-xs">
                        {elementId}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="resolution" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card 
                  className={`cursor-pointer transition-colors ${
                    resolution === 'accept' ? 'ring-2 ring-green-500' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setResolution('accept')}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      Accept Operation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-gray-600 mb-2">
                      Choose one operation to keep and discard the others.
                    </p>
                    {resolution === 'accept' && !selectedOperation && (
                      <Alert>
                        <AlertDescription className="text-xs">
                          Please select an operation to accept.
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>

                <Card 
                  className={`cursor-pointer transition-colors ${
                    resolution === 'reject' ? 'ring-2 ring-red-500' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setResolution('reject')}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <X className="w-4 h-4 text-red-600" />
                      Reject All
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-gray-600">
                      Discard all conflicting operations and maintain the current state.
                    </p>
                  </CardContent>
                </Card>

                <Card 
                  className={`cursor-pointer transition-colors ${
                    resolution === 'merge' ? 'ring-2 ring-blue-500' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setResolution('merge')}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Merge className="w-4 h-4 text-blue-600" />
                      Merge Operations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-gray-600 mb-2">
                      Combine compatible changes from all operations.
                    </p>
                    {conflict.operations.length === 2 && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          prepareAutoMerge();
                        }}
                      >
                        Auto-merge
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>

              {resolution === 'merge' && mergeData && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Merge Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                      {JSON.stringify(mergeData, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </div>
        </Tabs>

        <Separator />

        <div className="flex justify-between">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setSelectedTab('overview')}
              className="flex items-center gap-1"
            >
              <Eye className="w-4 h-4" />
              Review
            </Button>
            <Button 
              onClick={handleResolve}
              disabled={!resolution || (resolution === 'accept' && !selectedOperation)}
              className="flex items-center gap-1"
            >
              <Activity className="w-4 h-4" />
              Resolve Conflict
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConflictResolver;