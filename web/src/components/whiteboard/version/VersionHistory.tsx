import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Clock, 
  GitBranch, 
  RotateCcw, 
  Compare, 
  Tag, 
  Calendar, 
  User, 
  ChevronDown, 
  ChevronUp,
  Filter,
  Search,
  Archive,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Eye,
  GitCommit
} from 'lucide-react';
import { formatDistance } from 'date-fns';
import { WhiteboardVersion, WhiteboardVersionFilter, PaginatedVersions } from '@shared/types/whiteboard';

interface VersionHistoryProps {
  whiteboardId: string;
  onVersionSelect?: (version: WhiteboardVersion) => void;
  onVersionCompare?: (versionA: WhiteboardVersion, versionB: WhiteboardVersion) => void;
  onVersionRollback?: (version: WhiteboardVersion) => void;
  onVersionPreview?: (version: WhiteboardVersion) => void;
  className?: string;
  socket?: any; // WebSocket connection
}

interface VersionTimelineItem extends WhiteboardVersion {
  isExpanded?: boolean;
  isSelected?: boolean;
  canRollback?: boolean;
  isComparing?: boolean;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  whiteboardId,
  onVersionSelect,
  onVersionCompare,
  onVersionRollback,
  onVersionPreview,
  className = '',
  socket,
}) => {
  const [versions, setVersions] = useState<VersionTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  const [selectedVersions, setSelectedVersions] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<WhiteboardVersionFilter>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [rollbackInProgress, setRollbackInProgress] = useState<string | null>(null);

  const ITEMS_PER_PAGE = 20;

  // Load version history
  const loadVersionHistory = useCallback(async (offset = 0, append = false) => {
    try {
      if (!append) setLoading(true);
      else setIsLoadingMore(true);
      
      if (socket) {
        socket.emit('whiteboard:get_version_history', {
          whiteboardId,
          filters: {
            ...filters,
            ...(searchQuery && { commitMessage: searchQuery }),
          },
          limit: ITEMS_PER_PAGE,
          offset,
        });
      }
    } catch (err) {
      setError('Failed to load version history');
      console.error('Version history load error:', err);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [whiteboardId, filters, searchQuery, socket]);

  // Initialize and load data
  useEffect(() => {
    loadVersionHistory(0, false);
  }, [loadVersionHistory]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const handleVersionHistory = (data: { versions: PaginatedVersions }) => {
      const newVersions = data.versions.items.map(v => ({
        ...v,
        isExpanded: false,
        isSelected: false,
        canRollback: true,
        isComparing: false,
      }));

      if (currentOffset === 0) {
        setVersions(newVersions);
      } else {
        setVersions(prev => [...prev, ...newVersions]);
      }
      
      setTotalCount(data.versions.total);
      setCurrentOffset(data.versions.offset + data.versions.items.length);
      setLoading(false);
      setIsLoadingMore(false);
    };

    const handleVersionCreated = (data: { version: WhiteboardVersion }) => {
      const newVersion: VersionTimelineItem = {
        ...data.version,
        isExpanded: false,
        isSelected: false,
        canRollback: true,
        isComparing: false,
      };
      
      setVersions(prev => [newVersion, ...prev]);
      setTotalCount(prev => prev + 1);
    };

    const handleAutoVersionCreated = (data: { versionId: string; versionNumber: number }) => {
      // Silently update the UI to show auto-version indicator
      setVersions(prev => prev.map(v => 
        v.id === data.versionId 
          ? { ...v, isAutomatic: true }
          : v
      ));
    };

    const handleRollbackCompleted = (data: { rollback: any }) => {
      setRollbackInProgress(null);
      // Refresh version history after rollback
      loadVersionHistory(0, false);
    };

    const handleRollbackFailed = (data: { error: string }) => {
      setRollbackInProgress(null);
      setError(`Rollback failed: ${data.error}`);
    };

    // Register event listeners
    socket.on('whiteboard:version_history', handleVersionHistory);
    socket.on('whiteboard:version_created', handleVersionCreated);
    socket.on('whiteboard:auto_version_created', handleAutoVersionCreated);
    socket.on('whiteboard:rollback_completed', handleRollbackCompleted);
    socket.on('whiteboard:rollback_failed', handleRollbackFailed);
    socket.on('whiteboard:version_history_error', (data: { message: string }) => {
      setError(data.message);
      setLoading(false);
      setIsLoadingMore(false);
    });

    return () => {
      socket.off('whiteboard:version_history', handleVersionHistory);
      socket.off('whiteboard:version_created', handleVersionCreated);
      socket.off('whiteboard:auto_version_created', handleAutoVersionCreated);
      socket.off('whiteboard:rollback_completed', handleRollbackCompleted);
      socket.off('whiteboard:rollback_failed', handleRollbackFailed);
      socket.off('whiteboard:version_history_error');
    };
  }, [socket, currentOffset, loadVersionHistory]);

  // Handle version expansion
  const toggleVersionExpansion = (versionId: string) => {
    setExpandedVersions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(versionId)) {
        newSet.delete(versionId);
      } else {
        newSet.add(versionId);
      }
      return newSet;
    });
  };

  // Handle version selection for comparison
  const handleVersionSelection = (versionId: string) => {
    setSelectedVersions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(versionId)) {
        newSet.delete(versionId);
      } else if (newSet.size < 2) {
        newSet.add(versionId);
      } else {
        // Replace oldest selection with new one
        const [oldest] = Array.from(newSet);
        newSet.delete(oldest);
        newSet.add(versionId);
      }
      return newSet;
    });
  };

  // Handle version rollback
  const handleRollback = async (version: WhiteboardVersion) => {
    if (!socket || rollbackInProgress) return;

    setRollbackInProgress(version.id);
    setError(null);

    socket.emit('whiteboard:rollback_to_version', {
      whiteboardId,
      targetVersionId: version.id,
      rollbackType: 'full',
      conflictResolution: 'overwrite',
    });
  };

  // Handle version comparison
  const handleCompare = () => {
    const selectedArray = Array.from(selectedVersions);
    if (selectedArray.length === 2 && onVersionCompare) {
      const versionA = versions.find(v => v.id === selectedArray[0]);
      const versionB = versions.find(v => v.id === selectedArray[1]);
      if (versionA && versionB) {
        onVersionCompare(versionA, versionB);
      }
    }
  };

  // Load more versions
  const loadMore = () => {
    if (!isLoadingMore && versions.length < totalCount) {
      loadVersionHistory(currentOffset, true);
    }
  };

  // Get version type icon and color
  const getVersionTypeDisplay = (version: WhiteboardVersion) => {
    const isAutomatic = version.isAutomatic;
    const isMilestone = version.isMilestone;
    const changeType = version.changeType;

    if (isMilestone) {
      return { icon: Tag, color: 'text-amber-600', label: 'Milestone' };
    }
    if (isAutomatic) {
      return { icon: RefreshCw, color: 'text-gray-500', label: 'Auto-save' };
    }
    
    switch (changeType) {
      case 'major':
        return { icon: GitCommit, color: 'text-red-600', label: 'Major' };
      case 'minor':
        return { icon: GitCommit, color: 'text-blue-600', label: 'Minor' };
      case 'patch':
        return { icon: GitCommit, color: 'text-green-600', label: 'Patch' };
      case 'rollback':
        return { icon: RotateCcw, color: 'text-purple-600', label: 'Rollback' };
      default:
        return { icon: GitCommit, color: 'text-gray-600', label: 'Manual' };
    }
  };

  // Filtered and sorted versions
  const filteredVersions = useMemo(() => {
    let filtered = versions;
    
    if (searchQuery) {
      filtered = filtered.filter(v => 
        v.commitMessage?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        `v${v.versionNumber}`.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  }, [versions, searchQuery]);

  if (loading && versions.length === 0) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="flex items-center justify-center">
          <RefreshCw className="animate-spin h-6 w-6 text-gray-500" />
          <span className="ml-2 text-gray-600">Loading version history...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="flex items-center text-red-600">
          <AlertTriangle className="h-5 w-5 mr-2" />
          <span>{error}</span>
        </div>
        <button
          onClick={() => loadVersionHistory(0, false)}
          className="mt-2 px-4 py-2 text-sm bg-red-50 text-red-700 rounded-md hover:bg-red-100"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Clock className="h-5 w-5 text-gray-500 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Version History</h3>
            <span className="ml-2 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
              {totalCount} versions
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            {selectedVersions.size === 2 && (
              <button
                onClick={handleCompare}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
              >
                <Compare className="h-4 w-4 mr-1" />
                Compare Selected
              </button>
            )}
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
            >
              <Filter className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search versions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {showFilters && (
          <div className="mt-3 p-3 bg-gray-50 rounded-md">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Change Type
                </label>
                <select
                  value={filters.changeType?.[0] || ''}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    changeType: e.target.value ? [e.target.value] : undefined
                  }))}
                  className="w-full text-sm border border-gray-300 rounded-md px-2 py-1"
                >
                  <option value="">All Types</option>
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
                  <option value="patch">Patch</option>
                  <option value="manual">Manual</option>
                  <option value="auto_save">Auto-save</option>
                  <option value="rollback">Rollback</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Branch
                </label>
                <select
                  value={filters.branchName || ''}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    branchName: e.target.value || undefined
                  }))}
                  className="w-full text-sm border border-gray-300 rounded-md px-2 py-1"
                >
                  <option value="">All Branches</option>
                  <option value="main">main</option>
                </select>
              </div>

              <div>
                <label className="flex items-center text-xs font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={filters.isMilestone || false}
                    onChange={(e) => setFilters(prev => ({
                      ...prev,
                      isMilestone: e.target.checked || undefined
                    }))}
                    className="mr-2"
                  />
                  Milestones Only
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Version Timeline */}
      <div className="max-h-96 overflow-y-auto">
        {filteredVersions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Archive className="h-12 w-12 mx-auto mb-3 text-gray-400" />
            <p>No versions found</p>
            <p className="text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="space-y-0">
            {filteredVersions.map((version, index) => {
              const typeDisplay = getVersionTypeDisplay(version);
              const isExpanded = expandedVersions.has(version.id);
              const isSelected = selectedVersions.has(version.id);
              const TypeIcon = typeDisplay.icon;
              const isRollingBack = rollbackInProgress === version.id;

              return (
                <div
                  key={version.id}
                  className={`border-b border-gray-100 hover:bg-gray-50 ${
                    isSelected ? 'bg-blue-50 border-blue-200' : ''
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start flex-1">
                        {/* Timeline connector */}
                        <div className="flex flex-col items-center mr-4">
                          <div className={`p-1.5 rounded-full bg-white border-2 ${
                            version.isMilestone ? 'border-amber-500' : 
                            version.isAutomatic ? 'border-gray-300' :
                            'border-blue-500'
                          }`}>
                            <TypeIcon className={`h-3 w-3 ${typeDisplay.color}`} />
                          </div>
                          {index < filteredVersions.length - 1 && (
                            <div className="w-0.5 h-12 bg-gray-200 mt-2" />
                          )}
                        </div>

                        {/* Version info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-3">
                            <button
                              onClick={() => handleVersionSelection(version.id)}
                              className={`w-4 h-4 border-2 rounded ${
                                isSelected 
                                  ? 'bg-blue-600 border-blue-600' 
                                  : 'border-gray-300 hover:border-blue-500'
                              }`}
                            >
                              {isSelected && (
                                <CheckCircle className="w-3 h-3 text-white" />
                              )}
                            </button>
                            
                            <span className="text-sm font-medium text-gray-900">
                              Version {version.versionNumber}
                            </span>
                            
                            <span className={`px-2 py-0.5 text-xs rounded-full ${typeDisplay.color} bg-opacity-10`}>
                              {typeDisplay.label}
                            </span>

                            {version.tags && version.tags.length > 0 && (
                              <div className="flex space-x-1">
                                {version.tags.map((tag, tagIndex) => (
                                  <span key={tagIndex} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="mt-1">
                            <p className="text-sm text-gray-600">
                              {version.commitMessage || 'No commit message'}
                            </p>
                          </div>

                          <div className="mt-2 flex items-center text-xs text-gray-500 space-x-4">
                            <span className="flex items-center">
                              <User className="h-3 w-3 mr-1" />
                              {version.createdBy}
                            </span>
                            <span className="flex items-center">
                              <Calendar className="h-3 w-3 mr-1" />
                              {formatDistance(new Date(version.createdAt), new Date(), { addSuffix: true })}
                            </span>
                            <span className="flex items-center">
                              <GitBranch className="h-3 w-3 mr-1" />
                              {version.branchName || 'main'}
                            </span>
                          </div>

                          {isExpanded && (
                            <div className="mt-3 p-3 bg-gray-50 rounded-md text-xs">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="font-medium">Changes:</span>
                                  <div className="mt-1 space-y-1">
                                    {version.elementsAdded > 0 && (
                                      <div className="text-green-600">+{version.elementsAdded} added</div>
                                    )}
                                    {version.elementsModified > 0 && (
                                      <div className="text-blue-600">{version.elementsModified} modified</div>
                                    )}
                                    {version.elementsDeleted > 0 && (
                                      <div className="text-red-600">-{version.elementsDeleted} deleted</div>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <span className="font-medium">Stats:</span>
                                  <div className="mt-1 space-y-1">
                                    <div>Total elements: {version.elementCount}</div>
                                    <div>Storage: {version.versionType}</div>
                                    {version.creationTimeMs && (
                                      <div>Created in: {version.creationTimeMs}ms</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center space-x-1 ml-4">
                        <button
                          onClick={() => toggleVersionExpansion(version.id)}
                          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>

                        {onVersionPreview && (
                          <button
                            onClick={() => onVersionPreview(version)}
                            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Preview version"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}

                        {version.canRollback && index > 0 && (
                          <button
                            onClick={() => handleRollback(version)}
                            disabled={isRollingBack}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                            title="Rollback to this version"
                          >
                            {isRollingBack ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Load more button */}
            {versions.length < totalCount && (
              <div className="p-4 border-t border-gray-200">
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md disabled:opacity-50"
                >
                  {isLoadingMore ? (
                    <RefreshCw className="inline h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Load {Math.min(ITEMS_PER_PAGE, totalCount - versions.length)} more versions
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VersionHistory;