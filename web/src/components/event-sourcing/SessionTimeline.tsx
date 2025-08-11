import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { 
  Clock, 
  Users, 
  AlertTriangle, 
  MessageSquare, 
  Search, 
  CheckCircle,
  XCircle,
  Play,
  Pause,
  SkipBack,
  MemoryStick,
  Zap
} from 'lucide-react';

// Virtual scrolling configuration
const VIRTUALIZATION_CONFIG = {
  ITEM_HEIGHT: 100, // Fixed height per timeline entry
  CONTAINER_HEIGHT: 600, // Height of virtualized container
  OVERSCAN_COUNT: 5, // Extra items to render for smooth scrolling
  ENABLE_THRESHOLD: 100 // Enable virtualization when more than 100 items
};

interface VirtualizedTimelineProps {
  entries: SessionTimelineEntry[];
  containerHeight: number;
  itemHeight: number;
  onEntryClick: (entry: SessionTimelineEntry) => void;
  selectedEventId: string | null;
  currentReplayTime?: Date;
  isReplaying: boolean;
  getEventIcon: (eventType: string, impact: string) => React.ReactNode;
  formatTimestamp: (timestamp: string) => {
    time: string;
    date: string;
    relative: string;
  };
}

const VirtualizedTimeline: React.FC<VirtualizedTimelineProps> = ({
  entries,
  containerHeight,
  itemHeight,
  onEntryClick,
  selectedEventId,
  currentReplayTime,
  isReplaying,
  getEventIcon,
  formatTimestamp
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Calculate visible range
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - VIRTUALIZATION_CONFIG.OVERSCAN_COUNT);
  const endIndex = Math.min(
    entries.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + VIRTUALIZATION_CONFIG.OVERSCAN_COUNT
  );

  const visibleItems = entries.slice(startIndex, endIndex + 1);
  const totalHeight = entries.length * itemHeight;
  const offsetY = startIndex * itemHeight;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative overflow-auto"
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((entry, virtualIndex) => {
            const actualIndex = startIndex + virtualIndex;
            const timestamps = formatTimestamp(entry.timestamp);
            const isSelected = entry.eventId === selectedEventId;
            const isPastReplayTime = currentReplayTime && 
              new Date(entry.timestamp) <= currentReplayTime;

            return (
              <div
                key={`${entry.eventId}-${actualIndex}`}
                onClick={() => onEntryClick(entry)}
                className={`
                  flex items-start gap-3 p-3 cursor-pointer transition-colors absolute w-full
                  ${isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50'}
                  ${isPastReplayTime && currentReplayTime ? 'opacity-50' : ''}
                  ${isReplaying && isSelected ? 'ring-2 ring-blue-500' : ''}
                `}
                style={{
                  height: itemHeight,
                  top: virtualIndex * itemHeight
                }}
              >
                {/* Event Icon */}
                <div className="flex-shrink-0 mt-1">
                  {getEventIcon(entry.eventType, entry.impact)}
                </div>

                {/* Event Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {entry.description}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{timestamps.time}</span>
                      {entry.impact !== 'low' && (
                        <span className={`
                          px-2 py-1 rounded-full text-xs font-medium
                          ${entry.impact === 'high' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}
                        `}>
                          {entry.impact}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                    <span>{entry.eventType}</span>
                    <span>{timestamps.relative}</span>
                    {entry.userId && (
                      <span className="bg-gray-100 px-2 py-1 rounded">
                        User: {entry.userId.slice(0, 8)}...
                      </span>
                    )}
                  </div>

                  {/* Event Details - only show for selected items to save memory */}
                  {isSelected && entry.details && Object.keys(entry.details).length > 0 && (
                    <div className="mt-2 p-2 bg-gray-100 rounded text-xs max-h-16 overflow-y-auto">
                      <strong>Event Details:</strong>
                      <pre className="mt-1 whitespace-pre-wrap text-gray-700">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Causation Chain */}
                  {isSelected && entry.causationChain && entry.causationChain.length > 0 && (
                    <div className="mt-2 text-xs text-gray-600">
                      <strong>Related Events:</strong>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {entry.causationChain.map((causeId, i) => (
                          <span key={i} className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {causeId.slice(0, 8)}...
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface SessionTimelineEntry {
  timestamp: string;
  eventType: string;
  eventId: string;
  userId?: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  details: Record<string, unknown>;
  causationChain?: string[];
}

interface DomainEvent {
  id: string;
  eventType: string;
  timestamp: string;
  sequenceNumber: number;
  streamId: string;
  correlationId: string;
  eventData: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

interface SessionTimelineProps {
  sessionId: string;
  events: DomainEvent[];
  timeline: SessionTimelineEntry[];
  onTimeSelection: (timestamp: Date) => void;
  isReplaying?: boolean;
  currentReplayTime?: Date;
  className?: string;
}

export const SessionTimeline: React.FC<SessionTimelineProps> = ({
  sessionId,
  events,
  timeline,
  onTimeSelection,
  isReplaying = false,
  currentReplayTime,
  className = ''
}) => {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [filterEventType, setFilterEventType] = useState<string>('all');
  const [filterImpact, setFilterImpact] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<'all' | 'hour' | 'day'>('all');
  const [isPlaying, setIsPlaying] = useState(false);
  const [virtualizationEnabled, setVirtualizationEnabled] = useState(false);

  // Process and filter timeline entries
  const filteredTimeline = useMemo(() => {
    let filtered = [...timeline];

    // Filter by event type
    if (filterEventType !== 'all') {
      filtered = filtered.filter(entry => 
        entry.eventType.includes(filterEventType) ||
        entry.eventType.toLowerCase().includes(filterEventType.toLowerCase())
      );
    }

    // Filter by impact
    if (filterImpact !== 'all') {
      filtered = filtered.filter(entry => entry.impact === filterImpact);
    }

    // Filter by time range
    if (timeRange !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      
      if (timeRange === 'hour') {
        cutoff.setHours(cutoff.getHours() - 1);
      } else if (timeRange === 'day') {
        cutoff.setDate(cutoff.getDate() - 1);
      }
      
      filtered = filtered.filter(entry => 
        new Date(entry.timestamp) >= cutoff
      );
    }

    // Sort by timestamp (newest first)
    return filtered.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [timeline, filterEventType, filterImpact, timeRange]);

  // Get event type categories for filtering
  const eventTypeCategories = useMemo(() => {
    const types = new Set<string>();
    timeline.forEach(entry => {
      const category = entry.eventType.split('.')[1] || entry.eventType;
      types.add(category);
    });
    return Array.from(types).sort();
  }, [timeline]);

  // Determine if virtualization should be enabled
  const shouldUseVirtualization = useMemo(() => {
    return filteredTimeline.length >= VIRTUALIZATION_CONFIG.ENABLE_THRESHOLD || virtualizationEnabled;
  }, [filteredTimeline.length, virtualizationEnabled]);

  // Get icon for event type
  const getEventIcon = useCallback((eventType: string, impact: string) => {
    const iconClass = `h-4 w-4 ${
      impact === 'high' ? 'text-red-500' :
      impact === 'medium' ? 'text-yellow-500' :
      'text-gray-500'
    }`;

    if (eventType.includes('session')) {
      return <Play className={iconClass} />;
    } else if (eventType.includes('participant')) {
      return <Users className={iconClass} />;
    } else if (eventType.includes('conflict')) {
      return <AlertTriangle className={iconClass} />;
    } else if (eventType.includes('annotation')) {
      return <MessageSquare className={iconClass} />;
    } else if (eventType.includes('search')) {
      return <Search className={iconClass} />;
    } else if (eventType.includes('resolved')) {
      return <CheckCircle className={iconClass} />;
    } else if (eventType.includes('failed') || eventType.includes('error')) {
      return <XCircle className={iconClass} />;
    }
    
    return <Clock className={iconClass} />;
  }, []);

  // Format timestamp for display
  const formatTimestamp = useCallback((timestamp: string) => {
    const date = new Date(timestamp);
    return {
      time: format(date, 'HH:mm:ss'),
      date: format(date, 'MMM dd, yyyy'),
      relative: formatRelativeTime(date)
    };
  }, []);

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    return `${diffDay}d ago`;
  };

  // Handle timeline entry selection
  const handleEntryClick = useCallback((entry: SessionTimelineEntry) => {
    setSelectedEventId(entry.eventId);
    onTimeSelection(new Date(entry.timestamp));
  }, [onTimeSelection]);

  // Auto-play functionality
  const startAutoPlay = useCallback(() => {
    setIsPlaying(true);
    // Implementation would advance through timeline automatically
  }, []);

  const stopAutoPlay = useCallback(() => {
    setIsPlaying(false);
  }, []);

  return (
    <div className={`bg-white rounded-lg shadow-sm border p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Session Timeline</h3>
          <p className="text-sm text-gray-600">
            {filteredTimeline.length} events
            {currentReplayTime && (
              <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                Replaying to {format(currentReplayTime, 'HH:mm:ss')}
              </span>
            )}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={isPlaying ? stopAutoPlay : startAutoPlay}
            disabled={isReplaying}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          
          <button
            onClick={() => onTimeSelection(new Date(0))}
            disabled={isReplaying}
            className="flex items-center gap-2 px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
          >
            <SkipBack className="h-4 w-4" />
            Reset
          </button>

          <button
            onClick={() => setVirtualizationEnabled(!virtualizationEnabled)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
              shouldUseVirtualization 
                ? 'bg-green-600 text-white hover:bg-green-700' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            title={shouldUseVirtualization ? 'Virtualization enabled' : 'Virtualization disabled'}
          >
            <Zap className="h-4 w-4" />
            {shouldUseVirtualization ? 'Virtual' : 'Standard'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Event Type:</label>
          <select
            value={filterEventType}
            onChange={(e) => setFilterEventType(e.target.value)}
            className="px-3 py-1 border rounded-md text-sm"
          >
            <option value="all">All Types</option>
            {eventTypeCategories.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Impact:</label>
          <select
            value={filterImpact}
            onChange={(e) => setFilterImpact(e.target.value)}
            className="px-3 py-1 border rounded-md text-sm"
          >
            <option value="all">All Impact</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Time Range:</label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="px-3 py-1 border rounded-md text-sm"
          >
            <option value="all">All Time</option>
            <option value="hour">Last Hour</option>
            <option value="day">Last Day</option>
          </select>
        </div>
      </div>

      {/* Performance indicator */}
      {shouldUseVirtualization && (
        <div className="mb-4 p-2 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2 text-green-800 text-sm">
            <MemoryStick className="h-4 w-4" />
            <span>
              Virtualization active for {filteredTimeline.length} events 
              (rendering ~{Math.ceil(VIRTUALIZATION_CONFIG.CONTAINER_HEIGHT / VIRTUALIZATION_CONFIG.ITEM_HEIGHT)} visible items)
            </span>
          </div>
        </div>
      )}

      {/* Timeline */}
      {filteredTimeline.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No events found matching the current filters</p>
        </div>
      ) : shouldUseVirtualization ? (
        <VirtualizedTimeline
          entries={filteredTimeline}
          containerHeight={VIRTUALIZATION_CONFIG.CONTAINER_HEIGHT}
          itemHeight={VIRTUALIZATION_CONFIG.ITEM_HEIGHT}
          onEntryClick={handleEntryClick}
          selectedEventId={selectedEventId}
          currentReplayTime={currentReplayTime}
          isReplaying={isReplaying}
          getEventIcon={getEventIcon}
          formatTimestamp={formatTimestamp}
        />
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {filteredTimeline.map((entry, index) => {
            const timestamps = formatTimestamp(entry.timestamp);
            const isSelected = entry.eventId === selectedEventId;
            const isPastReplayTime = currentReplayTime && 
              new Date(entry.timestamp) <= currentReplayTime;

            return (
              <div
                key={`${entry.eventId}-${index}`}
                onClick={() => handleEntryClick(entry)}
                className={`
                  flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors
                  ${isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50'}
                  ${isPastReplayTime && currentReplayTime ? 'opacity-50' : ''}
                  ${isReplaying && isSelected ? 'ring-2 ring-blue-500' : ''}
                `}
              >
                {/* Event Icon */}
                <div className="flex-shrink-0 mt-1">
                  {getEventIcon(entry.eventType, entry.impact)}
                </div>

                {/* Event Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {entry.description}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{timestamps.time}</span>
                      {entry.impact !== 'low' && (
                        <span className={`
                          px-2 py-1 rounded-full text-xs font-medium
                          ${entry.impact === 'high' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}
                        `}>
                          {entry.impact}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                    <span>{entry.eventType}</span>
                    <span>{timestamps.relative}</span>
                    {entry.userId && (
                      <span className="bg-gray-100 px-2 py-1 rounded">
                        User: {entry.userId.slice(0, 8)}...
                      </span>
                    )}
                  </div>

                  {/* Event Details */}
                  {isSelected && entry.details && Object.keys(entry.details).length > 0 && (
                    <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
                      <strong>Event Details:</strong>
                      <pre className="mt-1 whitespace-pre-wrap text-gray-700">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Causation Chain */}
                  {isSelected && entry.causationChain && entry.causationChain.length > 0 && (
                    <div className="mt-2 text-xs text-gray-600">
                      <strong>Related Events:</strong>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {entry.causationChain.map((causeId, i) => (
                          <span key={i} className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {causeId.slice(0, 8)}...
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary Statistics */}
      <div className="mt-6 pt-4 border-t">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-700">High Impact:</span>
            <span className="ml-2 text-red-600">
              {filteredTimeline.filter(e => e.impact === 'high').length}
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Medium Impact:</span>
            <span className="ml-2 text-yellow-600">
              {filteredTimeline.filter(e => e.impact === 'medium').length}
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Low Impact:</span>
            <span className="ml-2 text-gray-600">
              {filteredTimeline.filter(e => e.impact === 'low').length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};