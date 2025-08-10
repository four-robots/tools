'use client';

import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { 
  FilterTree, 
  BooleanOperator 
} from '@mcp-tools/core';
import { FilterNode } from './FilterNode';
import { Button } from '../../ui/button';
import { Select } from '../../ui/select';
import { Badge } from '../../ui/badge';
import { 
  Plus, 
  GripVertical, 
  X, 
  Copy, 
  ChevronDown, 
  ChevronRight,
  Layers,
  AlertCircle
} from 'lucide-react';

interface FieldMetadata {
  name: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'array';
  operators: string[];
}

interface FilterGroupProps {
  node: FilterTree;
  availableFields: FieldMetadata[];
  depth?: number;
  isRoot?: boolean;
  selectedNodeId?: string;
  dragOverId?: string | null;
  onNodeUpdate?: (nodeId: string, updates: Partial<FilterTree>) => void;
  onNodeDelete?: (nodeId: string) => void;
  onNodeSelect?: (nodeId: string) => void;
  onAddCondition?: (parentId: string) => void;
  onAddGroup?: (parentId: string, operator: BooleanOperator) => void;
}

export const FilterGroup: React.FC<FilterGroupProps> = ({
  node,
  availableFields,
  depth = 0,
  isRoot = false,
  selectedNodeId,
  dragOverId,
  onNodeUpdate,
  onNodeDelete,
  onNodeSelect,
  onAddCondition,
  onAddGroup
}) => {
  const [collapsed, setCollapsed] = useState(node.metadata?.collapsed || false);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const { setNodeRef, isOver } = useDroppable({
    id: node.id
  });

  if (node.type !== 'group') {
    return null;
  }

  const children = node.children || [];
  const operator = node.operator || 'AND';
  const isSelected = selectedNodeId === node.id;
  const isDraggedOver = dragOverId === node.id;

  // Handle operator change
  const handleOperatorChange = (newOperator: BooleanOperator) => {
    onNodeUpdate?.(node.id, {
      operator: newOperator,
      metadata: {
        ...node.metadata,
        label: `${newOperator} Group`
      }
    });
  };

  // Add condition
  const handleAddCondition = () => {
    const newCondition: FilterTree = {
      id: crypto.randomUUID(),
      type: 'condition',
      condition: {
        id: crypto.randomUUID(),
        field: availableFields[0]?.name || 'title',
        operator: 'contains',
        value: '',
        dataType: 'string',
        isRequired: false,
        caseSensitive: false
      },
      metadata: {
        label: 'New Condition',
        collapsed: false
      }
    };

    const updatedChildren = [...children, newCondition];
    onNodeUpdate?.(node.id, { children: updatedChildren });
    setShowAddMenu(false);
  };

  // Add group
  const handleAddGroup = (groupOperator: BooleanOperator) => {
    const newGroup: FilterTree = {
      id: crypto.randomUUID(),
      type: 'group',
      operator: groupOperator,
      children: [],
      metadata: {
        label: `${groupOperator} Group`,
        collapsed: false
      }
    };

    const updatedChildren = [...children, newGroup];
    onNodeUpdate?.(node.id, { children: updatedChildren });
    setShowAddMenu(false);
  };

  // Delete child
  const handleDeleteChild = (childId: string) => {
    const updatedChildren = children.filter(child => child.id !== childId);
    onNodeUpdate?.(node.id, { children: updatedChildren });
  };

  // Duplicate child
  const handleDuplicateChild = (childId: string) => {
    const childToDuplicate = children.find(child => child.id === childId);
    if (!childToDuplicate) return;

    const duplicated = JSON.parse(JSON.stringify(childToDuplicate));
    duplicated.id = crypto.randomUUID();
    
    // Assign new IDs recursively
    const assignNewIds = (tree: FilterTree): void => {
      tree.id = crypto.randomUUID();
      if (tree.condition) {
        tree.condition.id = crypto.randomUUID();
      }
      if (tree.children) {
        tree.children.forEach(assignNewIds);
      }
    };
    assignNewIds(duplicated);

    const childIndex = children.findIndex(child => child.id === childId);
    const updatedChildren = [
      ...children.slice(0, childIndex + 1),
      duplicated,
      ...children.slice(childIndex + 1)
    ];
    
    onNodeUpdate?.(node.id, { children: updatedChildren });
  };

  // Get operator color
  const getOperatorColor = (op: BooleanOperator) => {
    switch (op) {
      case 'AND': return 'bg-blue-100 text-blue-800';
      case 'OR': return 'bg-green-100 text-green-800';
      case 'NOT': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={`
        filter-group border rounded-lg
        ${isRoot ? 'border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'}
        ${isSelected ? 'border-blue-500 bg-blue-50' : ''}
        ${isDraggedOver ? 'border-dashed border-blue-400 bg-blue-50' : ''}
        ${isOver ? 'ring-2 ring-blue-200' : ''}
        transition-all duration-200
      `}
      style={{ marginLeft: isRoot ? 0 : `${depth * 16}px` }}
      onClick={(e) => {
        e.stopPropagation();
        onNodeSelect?.(node.id);
      }}
    >
      {/* Group Header */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 bg-white rounded-t-lg">
        {!isRoot && (
          <div className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
            <GripVertical size={16} />
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed(!collapsed);
          }}
          className="text-gray-400 hover:text-gray-600"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>

        <Layers size={16} className="text-gray-500" />

        {/* Operator Badge */}
        <Badge className={`${getOperatorColor(operator)} font-medium`}>
          {operator}
        </Badge>

        {!isRoot && (
          <Select
            value={operator}
            onValueChange={(value) => handleOperatorChange(value as BooleanOperator)}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="AND">AND</option>
            <option value="OR">OR</option>
            <option value="NOT">NOT</option>
          </Select>
        )}

        <div className="flex-1">
          <span className="text-sm text-gray-600">
            {node.metadata?.label || (isRoot ? 'Filter' : `${operator} Group`)}
          </span>
          <div className="text-xs text-gray-500">
            {children.length} condition{children.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setShowAddMenu(!showAddMenu);
              }}
            >
              <Plus size={14} />
            </Button>

            {showAddMenu && (
              <div className="absolute top-8 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[160px]">
                <button
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddCondition();
                  }}
                >
                  Add Condition
                </button>
                <hr className="my-1" />
                <button
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddGroup('AND');
                  }}
                >
                  Add AND Group
                </button>
                <button
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddGroup('OR');
                  }}
                >
                  Add OR Group
                </button>
                <button
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddGroup('NOT');
                  }}
                >
                  Add NOT Group
                </button>
              </div>
            )}
          </div>

          {!isRoot && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDuplicateChild(node.id);
                }}
              >
                <Copy size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onNodeDelete?.(node.id);
                }}
                className="text-red-600 hover:text-red-700"
              >
                <X size={14} />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Group Content */}
      {!collapsed && (
        <div className="p-3 space-y-3">
          {children.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Layers size={24} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No conditions in this group</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={handleAddCondition}
              >
                <Plus size={14} className="mr-1" />
                Add First Condition
              </Button>
            </div>
          ) : (
            <SortableContext
              items={children.map(child => child.id)}
              strategy={verticalListSortingStrategy}
            >
              {children.map((child, index) => (
                <div key={child.id} className="relative">
                  {/* Operator Connector */}
                  {index > 0 && (
                    <div className="flex items-center justify-center py-2">
                      <Badge 
                        variant="outline" 
                        className={`${getOperatorColor(operator)} px-2 py-1 text-xs`}
                      >
                        {operator}
                      </Badge>
                    </div>
                  )}

                  {/* Child Node */}
                  {child.type === 'condition' ? (
                    <FilterNode
                      node={child}
                      availableFields={availableFields}
                      depth={depth + 1}
                      isSelected={selectedNodeId === child.id}
                      onUpdate={onNodeUpdate}
                      onDelete={() => handleDeleteChild(child.id)}
                      onDuplicate={() => handleDuplicateChild(child.id)}
                      onSelect={onNodeSelect}
                    />
                  ) : (
                    <FilterGroup
                      node={child}
                      availableFields={availableFields}
                      depth={depth + 1}
                      selectedNodeId={selectedNodeId}
                      dragOverId={dragOverId}
                      onNodeUpdate={onNodeUpdate}
                      onNodeDelete={() => handleDeleteChild(child.id)}
                      onNodeSelect={onNodeSelect}
                      onAddCondition={onAddCondition}
                      onAddGroup={onAddGroup}
                    />
                  )}
                </div>
              ))}
            </SortableContext>
          )}
        </div>
      )}

      {/* Drop Zone Indicator */}
      {isDraggedOver && (
        <div className="absolute inset-0 border-2 border-dashed border-blue-400 bg-blue-50 bg-opacity-50 rounded-lg pointer-events-none">
          <div className="flex items-center justify-center h-full">
            <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded text-sm font-medium">
              Drop here to add to {operator} group
            </div>
          </div>
        </div>
      )}

      {/* Click outside handler */}
      {showAddMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowAddMenu(false)}
        />
      )}
    </div>
  );
};

export default FilterGroup;