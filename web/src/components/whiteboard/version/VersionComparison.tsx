import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeftRight,
  Eye,
  EyeOff,
  Plus,
  Minus,
  Edit,
  Move,
  Palette,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Info,
  Settings,
  Layers,
  Square,
  Circle,
  Type,
  Image,
  ArrowLeft,
  ArrowRight,
  Maximize2,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { WhiteboardVersion, WhiteboardVersionComparison } from '@shared/types/whiteboard';

interface VersionComparisonProps {
  whiteboardId: string;
  versionA: WhiteboardVersion;
  versionB: WhiteboardVersion;
  onClose?: () => void;
  className?: string;
  socket?: any;
}

interface DiffElement {
  id: string;
  type: 'added' | 'removed' | 'modified';
  elementType: string;
  old?: any;
  new?: any;
  changes?: {
    position?: boolean;
    size?: boolean;
    style?: boolean;
    content?: boolean;
  };
}

interface ComparisonData {
  canvasChanges: boolean;
  elementChanges: {
    added: any[];
    removed: any[];
    modified: Array<{
      id: string;
      old: any;
      new: any;
    }>;
  };
  statistics: {
    totalChanges: number;
    elementsAdded: number;
    elementsRemoved: number;
    elementsModified: number;
    hasCanvasChanges: boolean;
    similarityScore: number;
  };
}

type ViewMode = 'side-by-side' | 'unified' | 'onion-skin';
type FilterType = 'all' | 'added' | 'removed' | 'modified';

const ELEMENT_TYPE_ICONS = {
  rectangle: Square,
  circle: Circle,
  text: Type,
  image: Image,
  line: ArrowRight,
  freehand: Edit,
  default: Square,
};

export const VersionComparison: React.FC<VersionComparisonProps> = ({
  whiteboardId,
  versionA,
  versionB,
  onClose,
  className = '',
  socket,
}) => {
  const [comparison, setComparison] = useState<WhiteboardVersionComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [filter, setFilter] = useState<FilterType>('all');
  const [showDetails, setShowDetails] = useState(true);
  const [highlightedElement, setHighlightedElement] = useState<string | null>(null);
  const [visibilitySettings, setVisibilitySettings] = useState({
    showAdded: true,
    showRemoved: true,
    showModified: true,
    showUnchanged: false,
  });

  // Load comparison data
  useEffect(() => {
    if (!socket) return;

    setLoading(true);
    setError(null);

    socket.emit('whiteboard:compare_versions', {
      whiteboardId,
      versionAId: versionA.id,
      versionBId: versionB.id,
      comparisonType: 'full',
    });

    const handleComparison = (data: { comparison: WhiteboardVersionComparison }) => {
      setComparison(data.comparison);
      setLoading(false);
    };

    const handleError = (data: { message: string }) => {
      setError(data.message);
      setLoading(false);
    };

    socket.on('whiteboard:version_comparison', handleComparison);
    socket.on('whiteboard:version_comparison_error', handleError);

    return () => {
      socket.off('whiteboard:version_comparison', handleComparison);
      socket.off('whiteboard:version_comparison_error', handleError);
    };
  }, [socket, whiteboardId, versionA.id, versionB.id]);

  // Process comparison data into diff elements
  const diffElements = useMemo((): DiffElement[] => {
    if (!comparison?.detailedDiff?.elementChanges) return [];

    const elements: DiffElement[] = [];
    const changes = comparison.detailedDiff.elementChanges;

    // Added elements
    changes.added?.forEach((element: any) => {
      elements.push({
        id: element.id,
        type: 'added',
        elementType: element.elementType,
        new: element,
      });
    });

    // Removed elements
    changes.removed?.forEach((element: any) => {
      elements.push({
        id: element.id,
        type: 'removed',
        elementType: element.elementType,
        old: element,
      });
    });

    // Modified elements
    changes.modified?.forEach((change: any) => {
      const elementChanges = detectElementChanges(change.old, change.new);
      elements.push({
        id: change.id,
        type: 'modified',
        elementType: change.new.elementType,
        old: change.old,
        new: change.new,
        changes: elementChanges,
      });
    });

    return elements;
  }, [comparison]);

  // Filter elements based on current filter
  const filteredElements = useMemo(() => {
    return diffElements.filter(element => {
      if (filter === 'all') return true;
      return element.type === filter;
    });
  }, [diffElements, filter]);

  // Statistics
  const statistics = useMemo((): ComparisonData['statistics'] => {
    if (!comparison) {
      return {
        totalChanges: 0,
        elementsAdded: 0,
        elementsRemoved: 0,
        elementsModified: 0,
        hasCanvasChanges: false,
        similarityScore: 1,
      };
    }

    const added = diffElements.filter(e => e.type === 'added').length;
    const removed = diffElements.filter(e => e.type === 'removed').length;
    const modified = diffElements.filter(e => e.type === 'modified').length;

    return {
      totalChanges: added + removed + modified,
      elementsAdded: added,
      elementsRemoved: removed,
      elementsModified: modified,
      hasCanvasChanges: comparison.detailedDiff?.canvasChanges || false,
      similarityScore: comparison.similarityScore,
    };
  }, [comparison, diffElements]);

  // Detect what changed in an element
  function detectElementChanges(oldElement: any, newElement: any) {
    const changes = {
      position: false,
      size: false,
      style: false,
      content: false,
    };

    // Check position changes
    const oldPos = oldElement.elementData?.position;
    const newPos = newElement.elementData?.position;
    if (oldPos && newPos) {
      changes.position = oldPos.x !== newPos.x || oldPos.y !== newPos.y;
    }

    // Check size changes
    const oldBounds = oldElement.elementData?.bounds;
    const newBounds = newElement.elementData?.bounds;
    if (oldBounds && newBounds) {
      changes.size = oldBounds.width !== newBounds.width || oldBounds.height !== newBounds.height;
    }

    // Check style changes
    changes.style = JSON.stringify(oldElement.styleData) !== JSON.stringify(newElement.styleData);

    // Check content changes (for text elements, etc.)
    const oldContent = oldElement.elementData?.content || oldElement.elementData?.text;
    const newContent = newElement.elementData?.content || newElement.elementData?.text;
    changes.content = oldContent !== newContent;

    return changes;
  }

  // Get element icon
  const getElementIcon = (elementType: string) => {
    const IconComponent = ELEMENT_TYPE_ICONS[elementType as keyof typeof ELEMENT_TYPE_ICONS] || ELEMENT_TYPE_ICONS.default;
    return IconComponent;
  };

  // Get change type color
  const getChangeColor = (type: 'added' | 'removed' | 'modified') => {
    switch (type) {
      case 'added':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'removed':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'modified':
        return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  // Get change icon
  const getChangeIcon = (type: 'added' | 'removed' | 'modified') => {
    switch (type) {
      case 'added':
        return Plus;
      case 'removed':
        return Minus;
      case 'modified':
        return Edit;
    }
  };

  if (loading) {
    return (
      <div className={`p-6 bg-white border border-gray-200 rounded-lg ${className}`}>
        <div className="flex items-center justify-center">
          <RefreshCw className="animate-spin h-6 w-6 text-gray-500" />
          <span className="ml-2 text-gray-600">Comparing versions...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 bg-white border border-gray-200 rounded-lg ${className}`}>
        <div className="flex items-center text-red-600">
          <AlertCircle className="h-5 w-5 mr-2" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <ArrowLeftRight className="h-5 w-5 text-gray-500 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Version Comparison</h3>
          </div>
          
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
            >
              ×
            </button>
          )}
        </div>

        {/* Version info */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="text-sm">
              <span className="font-medium">Version {versionA.versionNumber}</span>
              <span className="text-gray-500 ml-2">{new Date(versionA.createdAt).toLocaleDateString()}</span>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-400" />
            <div className="text-sm">
              <span className="font-medium">Version {versionB.versionNumber}</span>
              <span className="text-gray-500 ml-2">{new Date(versionB.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Similarity score */}
          {comparison && (
            <div className="flex items-center text-sm">
              <span className="text-gray-600">Similarity: </span>
              <span className="font-medium ml-1">
                {(comparison.similarityScore * 100).toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* View mode */}
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">View:</label>
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as ViewMode)}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="side-by-side">Side by Side</option>
                <option value="unified">Unified</option>
                <option value="onion-skin">Onion Skin</option>
              </select>
            </div>

            {/* Filter */}
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Filter:</label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as FilterType)}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="all">All Changes</option>
                <option value="added">Added ({statistics.elementsAdded})</option>
                <option value="removed">Removed ({statistics.elementsRemoved})</option>
                <option value="modified">Modified ({statistics.elementsModified})</option>
              </select>
            </div>
          </div>

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center text-sm text-gray-600 hover:text-gray-800"
          >
            {showDetails ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            {showDetails ? 'Hide Details' : 'Show Details'}
          </button>
        </div>
      </div>

      <div className="flex h-96">
        {/* Statistics Panel */}
        {showDetails && (
          <div className="w-80 border-r border-gray-200 p-4 overflow-y-auto">
            <h4 className="font-medium text-gray-900 mb-3">Change Summary</h4>
            
            <div className="space-y-3">
              {/* Overall stats */}
              <div className="p-3 bg-gray-50 rounded-md">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Total Changes</span>
                  <span className="font-medium">{statistics.totalChanges}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-gray-600">Similarity</span>
                  <span className="font-medium">{(statistics.similarityScore * 100).toFixed(1)}%</span>
                </div>
              </div>

              {/* Change breakdown */}
              <div className="space-y-2">
                {statistics.elementsAdded > 0 && (
                  <div className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded">
                    <div className="flex items-center text-green-700">
                      <Plus className="h-4 w-4 mr-2" />
                      <span className="text-sm">Added</span>
                    </div>
                    <span className="text-sm font-medium text-green-700">{statistics.elementsAdded}</span>
                  </div>
                )}

                {statistics.elementsRemoved > 0 && (
                  <div className="flex items-center justify-between p-2 bg-red-50 border border-red-200 rounded">
                    <div className="flex items-center text-red-700">
                      <Minus className="h-4 w-4 mr-2" />
                      <span className="text-sm">Removed</span>
                    </div>
                    <span className="text-sm font-medium text-red-700">{statistics.elementsRemoved}</span>
                  </div>
                )}

                {statistics.elementsModified > 0 && (
                  <div className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded">
                    <div className="flex items-center text-blue-700">
                      <Edit className="h-4 w-4 mr-2" />
                      <span className="text-sm">Modified</span>
                    </div>
                    <span className="text-sm font-medium text-blue-700">{statistics.elementsModified}</span>
                  </div>
                )}

                {statistics.hasCanvasChanges && (
                  <div className="flex items-center justify-between p-2 bg-purple-50 border border-purple-200 rounded">
                    <div className="flex items-center text-purple-700">
                      <Settings className="h-4 w-4 mr-2" />
                      <span className="text-sm">Canvas Settings</span>
                    </div>
                    <CheckCircle className="h-4 w-4 text-purple-700" />
                  </div>
                )}
              </div>

              {/* Element list */}
              <div className="mt-4">
                <h5 className="font-medium text-gray-700 mb-2">Changed Elements</h5>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {filteredElements.map((element) => {
                    const IconComponent = getElementIcon(element.elementType);
                    const ChangeIcon = getChangeIcon(element.type);
                    const colorClasses = getChangeColor(element.type);

                    return (
                      <div
                        key={element.id}
                        className={`p-2 border rounded cursor-pointer hover:bg-opacity-75 ${colorClasses} ${
                          highlightedElement === element.id ? 'ring-2 ring-blue-500' : ''
                        }`}
                        onClick={() => setHighlightedElement(
                          highlightedElement === element.id ? null : element.id
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <IconComponent className="h-4 w-4 mr-2" />
                            <span className="text-sm font-medium capitalize">
                              {element.elementType}
                            </span>
                          </div>
                          <ChangeIcon className="h-4 w-4" />
                        </div>

                        {element.type === 'modified' && element.changes && (
                          <div className="mt-1 text-xs space-y-0.5">
                            {element.changes.position && (
                              <div className="flex items-center">
                                <Move className="h-3 w-3 mr-1" />
                                <span>Position changed</span>
                              </div>
                            )}
                            {element.changes.size && (
                              <div className="flex items-center">
                                <Maximize2 className="h-3 w-3 mr-1" />
                                <span>Size changed</span>
                              </div>
                            )}
                            {element.changes.style && (
                              <div className="flex items-center">
                                <Palette className="h-3 w-3 mr-1" />
                                <span>Style changed</span>
                              </div>
                            )}
                            {element.changes.content && (
                              <div className="flex items-center">
                                <Type className="h-3 w-3 mr-1" />
                                <span>Content changed</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Comparison Viewer */}
        <div className="flex-1 p-4">
          {statistics.totalChanges === 0 && !statistics.hasCanvasChanges ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <CheckCircle className="h-12 w-12 mb-3 text-green-500" />
              <h3 className="text-lg font-medium text-gray-700">No Changes Found</h3>
              <p className="text-sm mt-1">These versions are identical</p>
            </div>
          ) : (
            <div className="h-full">
              {viewMode === 'side-by-side' && (
                <div className="grid grid-cols-2 gap-4 h-full">
                  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <h4 className="font-medium text-gray-700 mb-3">
                      Version {versionA.versionNumber} (Before)
                    </h4>
                    <div className="text-sm text-gray-600">
                      {/* This would contain the visual representation of version A */}
                      <p>Visual representation of the whiteboard state in version {versionA.versionNumber}</p>
                      <div className="mt-2 space-y-1">
                        <div>Elements: {versionA.elementCount}</div>
                        <div>Created: {new Date(versionA.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <h4 className="font-medium text-gray-700 mb-3">
                      Version {versionB.versionNumber} (After)
                    </h4>
                    <div className="text-sm text-gray-600">
                      {/* This would contain the visual representation of version B */}
                      <p>Visual representation of the whiteboard state in version {versionB.versionNumber}</p>
                      <div className="mt-2 space-y-1">
                        <div>Elements: {versionB.elementCount}</div>
                        <div>Created: {new Date(versionB.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {viewMode === 'unified' && (
                <div className="h-full border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-700 mb-3">Unified Diff View</h4>
                  <div className="text-sm text-gray-600">
                    <p>Unified view showing changes between versions</p>
                    <div className="mt-4 space-y-2">
                      {filteredElements.slice(0, 5).map((element) => {
                        const colorClasses = getChangeColor(element.type);
                        return (
                          <div key={element.id} className={`p-2 border rounded ${colorClasses}`}>
                            <div className="font-medium capitalize">
                              {element.type} {element.elementType}
                            </div>
                            {element.type === 'modified' && element.changes && (
                              <div className="text-xs mt-1">
                                Changes: {Object.entries(element.changes)
                                  .filter(([, changed]) => changed)
                                  .map(([type]) => type)
                                  .join(', ')}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {viewMode === 'onion-skin' && (
                <div className="h-full border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-700 mb-3">Onion Skin View</h4>
                  <div className="text-sm text-gray-600">
                    <p>Overlay view showing both versions simultaneously</p>
                    <div className="mt-4 text-center">
                      <Info className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                      <p>Canvas visualization would be implemented here</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VersionComparison;