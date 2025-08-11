'use client';

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { 
  MagnifyingGlassIcon, 
  XMarkIcon, 
  DocumentTextIcon,
  Square3Stack3DIcon,
  CubeIcon,
  ClockIcon,
  UserIcon,
  TagIcon,
  PlusIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { useDebounce } from '@/hooks/useDebounce';
import { useUnifiedSearch } from '../hooks/useUnifiedSearch';
import type { 
  UnifiedSearchResult, 
  ResourceType, 
  UnifiedSearchRequest 
} from '@shared/types/whiteboard';

interface UnifiedSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  whiteboardId: string;
  onAttachResource: (result: UnifiedSearchResult, elementId: string) => Promise<void>;
  currentElementId?: string; // Pre-selected element for attachment
}

interface SearchFilters {
  services: string[];
  dateRange?: 'week' | 'month' | 'all';
  resourceTypes: ResourceType[];
  tags: string[];
}

const SERVICE_CONFIG = {
  kanban: {
    name: 'Kanban Cards',
    icon: Square3Stack3DIcon,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  wiki: {
    name: 'Wiki Pages',
    icon: DocumentTextIcon,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
  memory: {
    name: 'Memory Nodes',
    icon: CubeIcon,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
};

const RESOURCE_TYPE_ICONS: Record<ResourceType, any> = {
  kanban_card: Square3Stack3DIcon,
  wiki_page: DocumentTextIcon,
  memory_node: CubeIcon,
};

export default function UnifiedSearchModal({
  isOpen,
  onClose,
  whiteboardId,
  onAttachResource,
  currentElementId,
}: UnifiedSearchModalProps) {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | string>('all');
  const [selectedResult, setSelectedResult] = useState<UnifiedSearchResult | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [filters, setFilters] = useState<SearchFilters>({
    services: ['kanban', 'wiki', 'memory'],
    dateRange: 'all',
    resourceTypes: ['kanban_card', 'wiki_page', 'memory_node'],
    tags: [],
  });

  const debouncedQuery = useDebounce(query, 300);
  
  const searchRequest: UnifiedSearchRequest = useMemo(() => ({
    query: debouncedQuery,
    services: activeTab === 'all' ? filters.services : [activeTab],
    filters: {
      dateRange: filters.dateRange,
      resourceTypes: filters.resourceTypes,
      tags: filters.tags,
    },
    limit: 20,
    includeContent: false,
  }), [debouncedQuery, activeTab, filters]);

  const {
    results,
    isLoading,
    error,
    totalResults,
    cached,
  } = useUnifiedSearch(whiteboardId, searchRequest);

  // Filter results by active tab
  const filteredResults = useMemo(() => {
    if (activeTab === 'all') {
      return results;
    }
    
    const typeMap: Record<string, ResourceType> = {
      kanban: 'kanban_card',
      wiki: 'wiki_page', 
      memory: 'memory_node',
    };
    
    const targetType = typeMap[activeTab];
    return results.filter(result => result.type === targetType);
  }, [results, activeTab]);

  // Group results by service for better organization
  const groupedResults = useMemo(() => {
    const groups: Record<string, UnifiedSearchResult[]> = {
      kanban: [],
      wiki: [],
      memory: [],
    };
    
    filteredResults.forEach(result => {
      const service = result.service || result.type.split('_')[0];
      if (groups[service]) {
        groups[service].push(result);
      }
    });
    
    return groups;
  }, [filteredResults]);

  const handleAttach = useCallback(async (result: UnifiedSearchResult) => {
    if (!currentElementId || isAttaching) {
      return;
    }

    setIsAttaching(true);
    try {
      await onAttachResource(result, currentElementId);
      onClose();
    } catch (error) {
      console.error('Failed to attach resource:', error);
      // TODO: Show error toast
    } finally {
      setIsAttaching(false);
    }
  }, [currentElementId, onAttachResource, onClose, isAttaching]);

  const handleResultSelect = useCallback((result: UnifiedSearchResult) => {
    setSelectedResult(result);
  }, []);

  const resetAndClose = useCallback(() => {
    setQuery('');
    setSelectedResult(null);
    setActiveTab('all');
    onClose();
  }, [onClose]);

  // Auto-focus search input when modal opens
  React.useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const renderResultCard = useCallback((result: UnifiedSearchResult) => {
    const IconComponent = RESOURCE_TYPE_ICONS[result.type];
    const serviceConfig = SERVICE_CONFIG[result.service as keyof typeof SERVICE_CONFIG];
    
    return (
      <div
        key={result.id}
        className={`group cursor-pointer rounded-lg border-2 p-4 transition-all duration-200 hover:shadow-md ${
          selectedResult?.id === result.id
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 bg-white hover:border-gray-300'
        }`}
        onClick={() => handleResultSelect(result)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3 flex-1 min-w-0">
            <div className={`flex-shrink-0 rounded-lg p-2 ${serviceConfig?.bgColor || 'bg-gray-100'}`}>
              <IconComponent className={`h-5 w-5 ${serviceConfig?.color || 'text-gray-600'}`} />
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-gray-900 truncate">
                {result.title}
              </h3>
              
              {result.description && (
                <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                  {result.description}
                </p>
              )}
              
              <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                <div className="flex items-center">
                  <ClockIcon className="h-3 w-3 mr-1" />
                  {new Date(result.lastModified).toLocaleDateString()}
                </div>
                
                {result.author && (
                  <div className="flex items-center">
                    <UserIcon className="h-3 w-3 mr-1" />
                    {result.author}
                  </div>
                )}
                
                {result.tags.length > 0 && (
                  <div className="flex items-center">
                    <TagIcon className="h-3 w-3 mr-1" />
                    {result.tags.slice(0, 2).join(', ')}
                    {result.tags.length > 2 && ` +${result.tags.length - 2}`}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {currentElementId && result.attachable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAttach(result);
              }}
              disabled={isAttaching}
              className="ml-3 flex-shrink-0 rounded-full bg-blue-600 p-1.5 text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
              title="Attach to whiteboard"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          )}
        </div>
        
        {selectedResult?.id === result.id && result.content && (
          <div className="mt-3 border-t pt-3">
            <p className="text-sm text-gray-700 line-clamp-3">
              {result.content}
            </p>
          </div>
        )}
      </div>
    );
  }, [selectedResult, currentElementId, isAttaching, handleResultSelect, handleAttach]);

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={resetAndClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="border-b border-gray-200 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <Dialog.Title
                      as="h3"
                      className="text-lg font-semibold leading-6 text-gray-900"
                    >
                      Search Across MCP Tools
                    </Dialog.Title>
                    <button
                      type="button"
                      className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      onClick={resetAndClose}
                    >
                      <span className="sr-only">Close</span>
                      <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>
                  
                  {/* Search Input */}
                  <div className="mt-4 relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                    </div>
                    <input
                      ref={inputRef}
                      type="text"
                      className="block w-full rounded-md border-0 py-2 pl-10 pr-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                      placeholder="Search cards, pages, and memory nodes..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  
                  {/* Service Tabs */}
                  <div className="mt-4 flex space-x-1">
                    <button
                      onClick={() => setActiveTab('all')}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-200 ${
                        activeTab === 'all'
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      All Results
                    </button>
                    {Object.entries(SERVICE_CONFIG).map(([key, config]) => {
                      const Icon = config.icon;
                      return (
                        <button
                          key={key}
                          onClick={() => setActiveTab(key)}
                          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-200 flex items-center space-x-1 ${
                            activeTab === key
                              ? `${config.bgColor} ${config.color}`
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{config.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Results Area */}
                <div className="px-6 py-4 max-h-96 overflow-y-auto">
                  {/* Search Status */}
                  {query.length >= 1 && (
                    <div className="mb-4 flex items-center justify-between text-sm text-gray-600">
                      <div className="flex items-center space-x-2">
                        {isLoading && (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        )}
                        <span>
                          {isLoading 
                            ? 'Searching...' 
                            : `Found ${totalResults} results`
                          }
                        </span>
                        {cached && (
                          <div className="flex items-center space-x-1 text-green-600">
                            <SparklesIcon className="h-4 w-4" />
                            <span>Cached</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Error State */}
                  {error && (
                    <div className="text-center py-8">
                      <div className="text-red-600 text-sm">
                        Error: {error}
                      </div>
                    </div>
                  )}

                  {/* Empty State */}
                  {query.length === 0 && (
                    <div className="text-center py-12">
                      <MagnifyingGlassIcon className="mx-auto h-12 w-12 text-gray-400" />
                      <h3 className="mt-2 text-sm font-medium text-gray-900">
                        Search across your workspace
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Find Kanban cards, Wiki pages, and Memory nodes to attach to your whiteboard
                      </p>
                    </div>
                  )}

                  {/* No Results */}
                  {query.length > 0 && !isLoading && filteredResults.length === 0 && (
                    <div className="text-center py-12">
                      <MagnifyingGlassIcon className="mx-auto h-12 w-12 text-gray-400" />
                      <h3 className="mt-2 text-sm font-medium text-gray-900">
                        No results found
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Try adjusting your search query or check a different service
                      </p>
                    </div>
                  )}

                  {/* Results */}
                  {filteredResults.length > 0 && (
                    <div className="space-y-3">
                      {activeTab === 'all' ? (
                        // Show grouped results
                        Object.entries(groupedResults).map(([service, serviceResults]) => {
                          if (serviceResults.length === 0) return null;
                          
                          const serviceConfig = SERVICE_CONFIG[service as keyof typeof SERVICE_CONFIG];
                          const Icon = serviceConfig?.icon;
                          
                          return (
                            <div key={service} className="space-y-3">
                              <div className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                                {Icon && <Icon className={`h-4 w-4 ${serviceConfig.color}`} />}
                                <span>{serviceConfig?.name} ({serviceResults.length})</span>
                              </div>
                              <div className="space-y-2 pl-6">
                                {serviceResults.map(renderResultCard)}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        // Show flat results for specific service
                        <div className="space-y-2">
                          {filteredResults.map(renderResultCard)}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                {currentElementId && (
                  <div className="border-t border-gray-200 px-6 py-3 bg-gray-50">
                    <p className="text-xs text-gray-600">
                      Tip: Click the + button to attach a result to your selected element, or select a result and click "Attach Selected" below.
                    </p>
                    {selectedResult && (
                      <div className="mt-2 flex items-center justify-between">
                        <div className="text-sm">
                          <span className="font-medium text-gray-900">Selected:</span>
                          <span className="ml-1 text-gray-600">{selectedResult.title}</span>
                        </div>
                        <button
                          onClick={() => handleAttach(selectedResult)}
                          disabled={isAttaching}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                          {isAttaching ? 'Attaching...' : 'Attach Selected'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}