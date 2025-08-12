import React, { useState, useCallback, useMemo } from 'react';
import {
  FunnelIcon,
  XMarkIcon,
  CalendarIcon,
  UserIcon,
  TagIcon,
  DocumentIcon,
  RectangleStackIcon,
  ChatBubbleLeftIcon,
  EyeIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { 
  SearchSyntaxType,
  WhiteboardElementType,
  WhiteboardVisibility,
  WhiteboardStatus 
} from '@shared/types/whiteboard';

interface FilterPanelProps {
  filters: Record<string, any>;
  onFilterChange: (filterType: string, value: any) => void;
  syntaxType: SearchSyntaxType;
  onSyntaxChange: (syntaxType: SearchSyntaxType) => void;
  workspaceId: string;
  userId: string;
  className?: string;
}

interface FilterSection {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
  isExpanded: boolean;
  content: React.ReactNode;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  onFilterChange,
  syntaxType,
  onSyntaxChange,
  workspaceId,
  userId,
  className = '',
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['search_fields', 'date_range'])
  );

  // Toggle section expansion
  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  }, []);

  // Handle multi-select filter changes
  const handleMultiSelectChange = useCallback((filterType: string, value: string, checked: boolean) => {
    const currentValues = filters[filterType] || [];
    let newValues;
    
    if (checked) {
      newValues = [...currentValues, value];
    } else {
      newValues = currentValues.filter((v: string) => v !== value);
    }
    
    onFilterChange(filterType, newValues.length > 0 ? newValues : undefined);
  }, [filters, onFilterChange]);

  // Handle single select filter changes
  const handleSingleSelectChange = useCallback((filterType: string, value: string) => {
    onFilterChange(filterType, value || undefined);
  }, [onFilterChange]);

  // Handle date range changes
  const handleDateRangeChange = useCallback((field: 'start' | 'end', value: string) => {
    const currentRange = filters.dateRange || { field: 'modified' };
    const newRange = {
      ...currentRange,
      [field]: value || undefined,
    };
    
    // Remove empty fields
    if (!newRange.start && !newRange.end) {
      onFilterChange('dateRange', undefined);
    } else {
      onFilterChange('dateRange', newRange);
    }
  }, [filters.dateRange, onFilterChange]);

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    Object.keys(filters).forEach(filterType => {
      onFilterChange(filterType, undefined);
    });
  }, [filters, onFilterChange]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return Object.values(filters).some(value => 
      value !== undefined && value !== null && 
      (!Array.isArray(value) || value.length > 0)
    );
  }, [filters]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    return Object.values(filters).filter(value => 
      value !== undefined && value !== null && 
      (!Array.isArray(value) || value.length > 0)
    ).length;
  }, [filters]);

  // Render section header
  const renderSectionHeader = (section: FilterSection) => (
    <button
      onClick={() => toggleSection(section.id)}
      className="flex items-center justify-between w-full p-3 text-left text-sm font-medium text-gray-900 bg-gray-50 border border-gray-200 rounded-t-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <div className="flex items-center space-x-2">
        <section.icon className="h-4 w-4 text-gray-500" />
        <span>{section.title}</span>
      </div>
      {section.isExpanded ? (
        <ChevronUpIcon className="h-4 w-4 text-gray-500" />
      ) : (
        <ChevronDownIcon className="h-4 w-4 text-gray-500" />
      )}
    </button>
  );

  // Render checkbox group
  const renderCheckboxGroup = (
    filterType: string,
    options: { value: string; label: string; description?: string }[]
  ) => {
    const selectedValues = filters[filterType] || [];
    
    return (
      <div className="space-y-2">
        {options.map(option => (
          <label key={option.value} className="flex items-start space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedValues.includes(option.value)}
              onChange={(e) => handleMultiSelectChange(filterType, option.value, e.target.checked)}
              className="mt-0.5 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-900">{option.label}</div>
              {option.description && (
                <div className="text-xs text-gray-500">{option.description}</div>
              )}
            </div>
          </label>
        ))}
      </div>
    );
  };

  // Render radio group
  const renderRadioGroup = (
    filterType: string,
    options: { value: string; label: string; description?: string }[]
  ) => {
    const selectedValue = filters[filterType];
    
    return (
      <div className="space-y-2">
        <label className="flex items-start space-x-2 cursor-pointer">
          <input
            type="radio"
            checked={!selectedValue}
            onChange={() => onFilterChange(filterType, undefined)}
            className="mt-0.5 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
          />
          <div className="text-sm text-gray-900">Any</div>
        </label>
        {options.map(option => (
          <label key={option.value} className="flex items-start space-x-2 cursor-pointer">
            <input
              type="radio"
              checked={selectedValue === option.value}
              onChange={() => handleSingleSelectChange(filterType, option.value)}
              className="mt-0.5 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-900">{option.label}</div>
              {option.description && (
                <div className="text-xs text-gray-500">{option.description}</div>
              )}
            </div>
          </label>
        ))}
      </div>
    );
  };

  // Define filter sections
  const filterSections: FilterSection[] = [
    {
      id: 'search_syntax',
      title: 'Search Type',
      icon: MagnifyingGlassIcon,
      isExpanded: expandedSections.has('search_syntax'),
      content: (
        <div className="space-y-3">
          <div className="text-sm text-gray-600 mb-3">
            Choose how your search query should be interpreted
          </div>
          {renderRadioGroup('syntaxType', [
            {
              value: 'natural',
              label: 'Natural Language',
              description: 'Search using everyday language'
            },
            {
              value: 'boolean',
              label: 'Boolean',
              description: 'Use AND, OR, NOT operators'
            },
            {
              value: 'field_specific',
              label: 'Field Specific',
              description: 'Search specific fields like title:design'
            },
            {
              value: 'regex',
              label: 'Regular Expression',
              description: 'Advanced pattern matching'
            },
          ])}
        </div>
      ),
    },
    {
      id: 'search_fields',
      title: 'Search Fields',
      icon: DocumentIcon,
      isExpanded: expandedSections.has('search_fields'),
      content: (
        <div className="space-y-3">
          <div className="text-sm text-gray-600 mb-3">
            Choose which content to search through
          </div>
          {renderCheckboxGroup('searchFields', [
            { value: 'title', label: 'Titles', description: 'Whiteboard and element titles' },
            { value: 'description', label: 'Descriptions', description: 'Whiteboard descriptions' },
            { value: 'content', label: 'Content', description: 'Element content and text' },
            { value: 'comments', label: 'Comments', description: 'All comments and discussions' },
            { value: 'elements', label: 'Elements', description: 'Element metadata' },
            { value: 'tags', label: 'Tags', description: 'All tags and labels' },
          ])}
        </div>
      ),
    },
    {
      id: 'date_range',
      title: 'Date Range',
      icon: CalendarIcon,
      isExpanded: expandedSections.has('date_range'),
      content: (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Filter by</label>
            <select
              value={filters.dateRange?.field || 'modified'}
              onChange={(e) => {
                const currentRange = filters.dateRange || {};
                onFilterChange('dateRange', { ...currentRange, field: e.target.value });
              }}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="created">Date Created</option>
              <option value="modified">Date Modified</option>
              <option value="accessed">Last Accessed</option>
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
              <input
                type="date"
                value={filters.dateRange?.start || ''}
                onChange={(e) => handleDateRangeChange('start', e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
              <input
                type="date"
                value={filters.dateRange?.end || ''}
                onChange={(e) => handleDateRangeChange('end', e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                onFilterChange('dateRange', { field: 'modified', start: today, end: today });
              }}
              className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
            >
              Today
            </button>
            <button
              onClick={() => {
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                onFilterChange('dateRange', { 
                  field: 'modified', 
                  start: weekAgo.toISOString().split('T')[0], 
                  end: new Date().toISOString().split('T')[0] 
                });
              }}
              className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
            >
              Last Week
            </button>
            <button
              onClick={() => {
                const monthAgo = new Date();
                monthAgo.setMonth(monthAgo.getMonth() - 1);
                onFilterChange('dateRange', { 
                  field: 'modified', 
                  start: monthAgo.toISOString().split('T')[0], 
                  end: new Date().toISOString().split('T')[0] 
                });
              }}
              className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
            >
              Last Month
            </button>
          </div>
        </div>
      ),
    },
    {
      id: 'element_types',
      title: 'Element Types',
      icon: RectangleStackIcon,
      isExpanded: expandedSections.has('element_types'),
      content: (
        <div className="space-y-3">
          <div className="text-sm text-gray-600 mb-3">
            Filter by specific element types
          </div>
          {renderCheckboxGroup('elementTypes', [
            { value: 'rectangle', label: 'Rectangles', description: 'Rectangle shapes' },
            { value: 'ellipse', label: 'Ellipses', description: 'Circle and oval shapes' },
            { value: 'text', label: 'Text', description: 'Text elements' },
            { value: 'sticky_note', label: 'Sticky Notes', description: 'Note elements' },
            { value: 'image', label: 'Images', description: 'Image elements' },
            { value: 'line', label: 'Lines', description: 'Line elements' },
            { value: 'arrow', label: 'Arrows', description: 'Arrow elements' },
            { value: 'freehand', label: 'Drawings', description: 'Freehand drawings' },
            { value: 'frame', label: 'Frames', description: 'Frame containers' },
          ])}
        </div>
      ),
    },
    {
      id: 'visibility',
      title: 'Visibility',
      icon: EyeIcon,
      isExpanded: expandedSections.has('visibility'),
      content: (
        <div className="space-y-3">
          <div className="text-sm text-gray-600 mb-3">
            Filter by whiteboard visibility
          </div>
          {renderCheckboxGroup('visibility', [
            { value: 'workspace', label: 'Workspace', description: 'Visible to workspace members' },
            { value: 'members', label: 'Members', description: 'Visible to specific members' },
            { value: 'public', label: 'Public', description: 'Publicly accessible' },
          ])}
        </div>
      ),
    },
    {
      id: 'content_filters',
      title: 'Content',
      icon: ChatBubbleLeftIcon,
      isExpanded: expandedSections.has('content_filters'),
      content: (
        <div className="space-y-4">
          <div className="space-y-3">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.hasElements === true}
                onChange={(e) => onFilterChange('hasElements', e.target.checked ? true : undefined)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-900">Has Elements</span>
            </label>
            
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.hasComments === true}
                onChange={(e) => onFilterChange('hasComments', e.target.checked ? true : undefined)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-900">Has Comments</span>
            </label>
            
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.isCollaborating === true}
                onChange={(e) => onFilterChange('isCollaborating', e.target.checked ? true : undefined)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-900">Currently Collaborating</span>
            </label>
            
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.isTemplate === true}
                onChange={(e) => onFilterChange('isTemplate', e.target.checked ? true : undefined)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-900">Templates Only</span>
            </label>
          </div>
        </div>
      ),
    },
    {
      id: 'activity_level',
      title: 'Activity Level',
      icon: UserIcon,
      isExpanded: expandedSections.has('activity_level'),
      content: (
        <div className="space-y-3">
          <div className="text-sm text-gray-600 mb-3">
            Filter by collaboration activity
          </div>
          {renderRadioGroup('activityLevel', [
            { value: 'high', label: 'High Activity', description: 'Recently active with multiple users' },
            { value: 'medium', label: 'Medium Activity', description: 'Moderate recent activity' },
            { value: 'low', label: 'Low Activity', description: 'Minimal recent activity' },
            { value: 'dormant', label: 'Dormant', description: 'No recent activity' },
          ])}
        </div>
      ),
    },
  ];

  return (
    <div className={`filter-panel bg-white border border-gray-200 rounded-lg ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <FunnelIcon className="h-5 w-5 text-gray-500" />
          <h3 className="text-lg font-medium text-gray-900">Search Filters</h3>
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {activeFilterCount} active
            </span>
          )}
        </div>
        
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Filter Sections */}
      <div className="divide-y divide-gray-200">
        {filterSections.map(section => (
          <div key={section.id} className="border-b border-gray-200 last:border-b-0">
            {renderSectionHeader(section)}
            {section.isExpanded && (
              <div className="p-4 bg-white border-l border-r border-gray-200 rounded-b-lg">
                {section.content}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      {hasActiveFilters && (
        <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <div className="text-sm text-gray-600">
            {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} applied
          </div>
        </div>
      )}
    </div>
  );
};

export default FilterPanel;