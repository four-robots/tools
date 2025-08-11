import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { 
  Info, 
  ChevronDown, 
  ChevronRight, 
  Copy, 
  ExternalLink,
  Clock,
  Hash,
  User,
  Layers
} from 'lucide-react';

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

interface EventInspectorProps {
  event: DomainEvent;
  context?: 'session' | 'user' | 'workspace';
  relatedEvents?: DomainEvent[];
  onNavigateToEvent?: (eventId: string) => void;
  onViewCausation?: (correlationId: string) => void;
  className?: string;
}

export const EventInspector: React.FC<EventInspectorProps> = ({
  event,
  context = 'session',
  relatedEvents = [],
  onNavigateToEvent,
  onViewCausation,
  className = ''
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['overview'])
  );
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // Toggle section expansion
  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  // Copy text to clipboard
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(label);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  // Format event data for display
  const formatEventData = (data: Record<string, unknown>, depth = 0): React.ReactNode => {
    if (depth > 3) return JSON.stringify(data, null, 2); // Prevent infinite recursion

    return (
      <div className={`${depth > 0 ? 'ml-4' : ''}`}>
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="mb-2">
            <span className="font-medium text-gray-700">{key}:</span>
            <span className="ml-2">
              {typeof value === 'object' && value !== null ? (
                Array.isArray(value) ? (
                  <div className="ml-2">
                    <span className="text-gray-600">[{value.length} items]</span>
                    {value.length <= 10 && (
                      <div className="ml-2 text-sm">
                        {value.map((item, index) => (
                          <div key={index}>
                            {index}: {typeof item === 'object' ? 
                              JSON.stringify(item) : 
                              String(item)
                            }
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  formatEventData(value as Record<string, unknown>, depth + 1)
                )
              ) : (
                <span className={`
                  ${typeof value === 'string' ? 'text-green-700' : ''}
                  ${typeof value === 'number' ? 'text-blue-700' : ''}
                  ${typeof value === 'boolean' ? 'text-purple-700' : ''}
                `}>
                  {String(value)}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    );
  };

  // Get event impact assessment
  const getEventImpact = useMemo(() => {
    if (event.eventType.includes('conflict') || 
        event.eventType.includes('error') || 
        event.eventType.includes('failed')) {
      return { level: 'high', color: 'red', description: 'High impact - requires attention' };
    }
    
    if (event.eventType.includes('session') ||
        event.eventType.includes('workflow') ||
        event.eventType.includes('escalated')) {
      return { level: 'medium', color: 'yellow', description: 'Medium impact - affects session flow' };
    }
    
    return { level: 'low', color: 'gray', description: 'Low impact - routine event' };
  }, [event.eventType]);

  // Get related events by correlation ID
  const correlatedEvents = useMemo(() => {
    return relatedEvents.filter(e => 
      e.correlationId === event.correlationId && e.id !== event.id
    );
  }, [relatedEvents, event]);

  // Render collapsible section
  const renderSection = (
    id: string, 
    title: string, 
    content: React.ReactNode,
    defaultExpanded = false
  ) => {
    const isExpanded = expandedSections.has(id);
    
    return (
      <div className="border-b border-gray-200 last:border-b-0">
        <button
          onClick={() => toggleSection(id)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
        >
          <span className="font-medium text-gray-900">{title}</span>
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-500" />
          )}
        </button>
        {isExpanded && (
          <div className="px-4 pb-4">
            {content}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Event Inspector</h3>
            <p className="text-sm text-gray-600">{event.eventType}</p>
          </div>
          
          {/* Impact Badge */}
          <div className={`
            px-3 py-1 rounded-full text-xs font-medium
            ${getEventImpact.color === 'red' ? 'bg-red-100 text-red-800' : ''}
            ${getEventImpact.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' : ''}
            ${getEventImpact.color === 'gray' ? 'bg-gray-100 text-gray-800' : ''}
          `}>
            {getEventImpact.level.toUpperCase()} IMPACT
          </div>
        </div>
        
        <p className="text-xs text-gray-500 mt-1">{getEventImpact.description}</p>
      </div>

      {/* Event Overview */}
      {renderSection('overview', 'Event Overview', (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Event ID:</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                  {event.id}
                </code>
                <button
                  onClick={() => copyToClipboard(event.id, 'Event ID')}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  <Copy className="h-3 w-3 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Timestamp:</span>
              </div>
              <div className="text-sm text-gray-900">
                {format(new Date(event.timestamp), 'MMM dd, yyyy HH:mm:ss.SSS')}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Sequence:</span>
              </div>
              <div className="text-sm text-gray-900">#{event.sequenceNumber}</div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Stream ID:</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                  {event.streamId}
                </code>
                <button
                  onClick={() => copyToClipboard(event.streamId, 'Stream ID')}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  <Copy className="h-3 w-3 text-gray-500" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Event Data */}
      {renderSection('eventData', 'Event Data', (
        <div className="space-y-3">
          {Object.keys(event.eventData).length > 0 ? (
            <div className="bg-gray-50 rounded-lg p-3">
              {formatEventData(event.eventData)}
            </div>
          ) : (
            <p className="text-gray-500 italic">No event data available</p>
          )}
          
          <div className="flex justify-end">
            <button
              onClick={() => copyToClipboard(JSON.stringify(event.eventData, null, 2), 'Event Data')}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <Copy className="h-3 w-3" />
              Copy JSON
            </button>
          </div>
        </div>
      ))}

      {/* Metadata */}
      {renderSection('metadata', 'Metadata', (
        <div className="space-y-3">
          <div className="bg-gray-50 rounded-lg p-3">
            {formatEventData(event.metadata)}
          </div>
          
          <div className="flex justify-end">
            <button
              onClick={() => copyToClipboard(JSON.stringify(event.metadata, null, 2), 'Metadata')}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <Copy className="h-3 w-3" />
              Copy JSON
            </button>
          </div>
        </div>
      ))}

      {/* Correlation & Causation */}
      {renderSection('causation', 'Correlation & Causation', (
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-700">Correlation ID:</span>
              <code className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono">
                {event.correlationId}
              </code>
              {onViewCausation && (
                <button
                  onClick={() => onViewCausation(event.correlationId)}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  View Related
                </button>
              )}
            </div>
            
            {correlatedEvents.length > 0 && (
              <div className="mt-3">
                <span className="text-sm font-medium text-gray-700">
                  Related Events ({correlatedEvents.length}):
                </span>
                <div className="mt-2 space-y-1">
                  {correlatedEvents.slice(0, 5).map((relatedEvent) => (
                    <div key={relatedEvent.id} 
                         className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs">
                      <div>
                        <span className="font-medium">{relatedEvent.eventType}</span>
                        <span className="text-gray-500 ml-2">
                          {format(new Date(relatedEvent.timestamp), 'HH:mm:ss')}
                        </span>
                      </div>
                      {onNavigateToEvent && (
                        <button
                          onClick={() => onNavigateToEvent(relatedEvent.id)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  {correlatedEvents.length > 5 && (
                    <div className="text-xs text-gray-500 text-center py-1">
                      ... and {correlatedEvents.length - 5} more
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Context Information */}
      {renderSection('context', 'Context Information', (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-700">Context:</span>
              <span className="ml-2 capitalize">{context}</span>
            </div>
            
            {event.metadata.userId && (
              <div>
                <span className="font-medium text-gray-700">User ID:</span>
                <span className="ml-2 font-mono text-xs">{event.metadata.userId}</span>
              </div>
            )}
            
            {event.metadata.sessionId && (
              <div>
                <span className="font-medium text-gray-700">Session ID:</span>
                <span className="ml-2 font-mono text-xs">{event.metadata.sessionId}</span>
              </div>
            )}
            
            {event.metadata.workspaceId && (
              <div>
                <span className="font-medium text-gray-700">Workspace ID:</span>
                <span className="ml-2 font-mono text-xs">{event.metadata.workspaceId}</span>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Success Message */}
      {copySuccess && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          {copySuccess} copied to clipboard!
        </div>
      )}
    </div>
  );
};