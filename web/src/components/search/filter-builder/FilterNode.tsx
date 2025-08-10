'use client';

import React, { useState, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  FilterTree, 
  FilterCondition, 
  FilterOperator, 
  FilterDataType 
} from '@mcp-tools/core';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Select } from '../../ui/select';
import { Badge } from '../../ui/badge';
import { 
  GripVertical, 
  X, 
  Copy, 
  Settings,
  ChevronDown,
  ChevronRight,
  AlertCircle 
} from 'lucide-react';

interface FieldMetadata {
  name: string;
  label: string;
  type: FilterDataType;
  operators: FilterOperator[];
  description?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
  };
}

interface FilterNodeProps {
  node: FilterTree;
  availableFields: FieldMetadata[];
  depth?: number;
  isSelected?: boolean;
  hasError?: boolean;
  onUpdate?: (nodeId: string, updates: Partial<FilterTree>) => void;
  onDelete?: (nodeId: string) => void;
  onDuplicate?: (nodeId: string) => void;
  onSelect?: (nodeId: string) => void;
}

export const FilterNode: React.FC<FilterNodeProps> = ({
  node,
  availableFields,
  depth = 0,
  isSelected = false,
  hasError = false,
  onUpdate,
  onDelete,
  onDuplicate,
  onSelect
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(node.metadata?.collapsed || false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: node.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (node.type !== 'condition' || !node.condition) {
    return null;
  }

  const condition = node.condition;
  const selectedField = availableFields.find(f => f.name === condition.field);
  const availableOperators = selectedField?.operators || [];

  // Handle field change
  const handleFieldChange = (fieldName: string) => {
    const field = availableFields.find(f => f.name === fieldName);
    if (!field) return;

    const defaultOperator = field.operators[0];
    const defaultValue = getDefaultValueForType(field.type);

    const updatedCondition: FilterCondition = {
      ...condition,
      field: fieldName,
      operator: defaultOperator,
      value: defaultValue,
      dataType: field.type
    };

    onUpdate?.(node.id, {
      condition: updatedCondition,
      metadata: {
        ...node.metadata,
        label: generateConditionLabel(updatedCondition)
      }
    });
  };

  // Handle operator change
  const handleOperatorChange = (operator: FilterOperator) => {
    const updatedCondition: FilterCondition = {
      ...condition,
      operator,
      value: needsValueReset(condition.operator, operator) 
        ? getDefaultValueForOperator(operator, condition.dataType)
        : condition.value
    };

    onUpdate?.(node.id, {
      condition: updatedCondition,
      metadata: {
        ...node.metadata,
        label: generateConditionLabel(updatedCondition)
      }
    });
  };

  // Handle value change
  const handleValueChange = (value: any) => {
    const updatedCondition: FilterCondition = {
      ...condition,
      value
    };

    onUpdate?.(node.id, {
      condition: updatedCondition,
      metadata: {
        ...node.metadata,
        label: generateConditionLabel(updatedCondition)
      }
    });
  };

  // Generate condition label
  const generateConditionLabel = (cond: FilterCondition): string => {
    const field = availableFields.find(f => f.name === cond.field);
    const fieldLabel = field?.label || cond.field;
    const value = Array.isArray(cond.value) ? cond.value.join(', ') : String(cond.value);
    return `${fieldLabel} ${cond.operator} ${value}`;
  };

  // Get default value for data type
  const getDefaultValueForType = (type: FilterDataType): any => {
    switch (type) {
      case 'string': return '';
      case 'number': return 0;
      case 'boolean': return false;
      case 'date': return new Date().toISOString().split('T')[0];
      case 'array': return [];
      default: return '';
    }
  };

  // Get default value for operator
  const getDefaultValueForOperator = (operator: FilterOperator, type: FilterDataType): any => {
    if (['is_null', 'is_not_null'].includes(operator)) {
      return null;
    }
    if (['in', 'not_in', 'between'].includes(operator)) {
      return [];
    }
    return getDefaultValueForType(type);
  };

  // Check if value needs reset when operator changes
  const needsValueReset = (oldOp: FilterOperator, newOp: FilterOperator): boolean => {
    const arrayOps = ['in', 'not_in', 'between'];
    const nullOps = ['is_null', 'is_not_null'];
    
    return (
      (arrayOps.includes(oldOp) !== arrayOps.includes(newOp)) ||
      (nullOps.includes(oldOp) !== nullOps.includes(newOp))
    );
  };

  // Render value input based on operator and data type
  const renderValueInput = () => {
    const { operator, dataType, value } = condition;

    // No value needed for null checks
    if (['is_null', 'is_not_null'].includes(operator)) {
      return <span className="text-sm text-gray-500 italic">No value required</span>;
    }

    // Array inputs for multi-value operators
    if (['in', 'not_in'].includes(operator)) {
      return (
        <div className="space-y-2">
          <Input
            placeholder="Enter values separated by commas"
            value={Array.isArray(value) ? value.join(', ') : ''}
            onChange={(e) => {
              const values = e.target.value.split(',').map(v => v.trim()).filter(Boolean);
              handleValueChange(values);
            }}
          />
          <p className="text-xs text-gray-500">Separate multiple values with commas</p>
        </div>
      );
    }

    // Between operator needs two values
    if (operator === 'between') {
      const [min, max] = Array.isArray(value) ? value : [0, 0];
      return (
        <div className="flex gap-2 items-center">
          <Input
            type={dataType === 'number' ? 'number' : dataType === 'date' ? 'date' : 'text'}
            placeholder="Min"
            value={min}
            onChange={(e) => {
              const newValue = dataType === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
              handleValueChange([newValue, max]);
            }}
          />
          <span className="text-sm text-gray-500">to</span>
          <Input
            type={dataType === 'number' ? 'number' : dataType === 'date' ? 'date' : 'text'}
            placeholder="Max"
            value={max}
            onChange={(e) => {
              const newValue = dataType === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
              handleValueChange([min, newValue]);
            }}
          />
        </div>
      );
    }

    // Boolean inputs
    if (dataType === 'boolean') {
      return (
        <Select
          value={String(value)}
          onValueChange={(val) => handleValueChange(val === 'true')}
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </Select>
      );
    }

    // Enum values
    if (selectedField?.validation?.enum) {
      return (
        <Select
          value={String(value)}
          onValueChange={handleValueChange}
        >
          {selectedField.validation.enum.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </Select>
      );
    }

    // Default input
    return (
      <Input
        type={
          dataType === 'number' ? 'number' : 
          dataType === 'date' ? 'date' : 
          'text'
        }
        placeholder={`Enter ${dataType} value`}
        value={value}
        onChange={(e) => {
          const newValue = dataType === 'number' 
            ? (e.target.value ? parseFloat(e.target.value) : '') 
            : e.target.value;
          handleValueChange(newValue);
        }}
      />
    );
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        filter-node bg-white border rounded-lg p-3 shadow-sm
        ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}
        ${hasError ? 'border-red-500 bg-red-50' : ''}
        ${isDragging ? 'shadow-lg' : ''}
        transition-all duration-200
      `}
      onClick={() => onSelect?.(node.id)}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </div>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed(!collapsed);
          }}
          className="text-gray-400 hover:text-gray-600"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              Condition
            </Badge>
            {hasError && <AlertCircle size={14} className="text-red-500" />}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {node.metadata?.label || generateConditionLabel(condition)}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setShowAdvanced(!showAdvanced);
            }}
          >
            <Settings size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate?.(node.id);
            }}
          >
            <Copy size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(node.id);
            }}
            className="text-red-600 hover:text-red-700"
          >
            <X size={14} />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      {!collapsed && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {/* Field Selection */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Field
              </label>
              <Select
                value={condition.field}
                onValueChange={handleFieldChange}
              >
                {availableFields.map(field => (
                  <option key={field.name} value={field.name}>
                    {field.label}
                  </option>
                ))}
              </Select>
            </div>

            {/* Operator Selection */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Operator
              </label>
              <Select
                value={condition.operator}
                onValueChange={(value) => handleOperatorChange(value as FilterOperator)}
              >
                {availableOperators.map(op => (
                  <option key={op} value={op}>
                    {op.replace(/_/g, ' ').toUpperCase()}
                  </option>
                ))}
              </Select>
            </div>

            {/* Value Input */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Value
              </label>
              {renderValueInput()}
            </div>
          </div>

          {/* Advanced Options */}
          {showAdvanced && (
            <div className="border-t pt-3 space-y-3">
              <h4 className="text-sm font-medium text-gray-700">Advanced Options</h4>
              
              <div className="grid grid-cols-2 gap-3">
                {condition.dataType === 'string' && (
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={condition.caseSensitive}
                      onChange={(e) => {
                        const updatedCondition = {
                          ...condition,
                          caseSensitive: e.target.checked
                        };
                        onUpdate?.(node.id, { condition: updatedCondition });
                      }}
                    />
                    <span className="text-sm">Case sensitive</span>
                  </label>
                )}

                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={condition.isRequired}
                    onChange={(e) => {
                      const updatedCondition = {
                        ...condition,
                        isRequired: e.target.checked
                      };
                      onUpdate?.(node.id, { condition: updatedCondition });
                    }}
                  />
                  <span className="text-sm">Required condition</span>
                </label>
              </div>

              {/* Custom Label */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Custom Label
                </label>
                <Input
                  placeholder="Enter custom label"
                  value={condition.label || ''}
                  onChange={(e) => {
                    const updatedCondition = {
                      ...condition,
                      label: e.target.value
                    };
                    onUpdate?.(node.id, { condition: updatedCondition });
                  }}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Description
                </label>
                <Input
                  placeholder="Enter description"
                  value={condition.description || ''}
                  onChange={(e) => {
                    const updatedCondition = {
                      ...condition,
                      description: e.target.value
                    };
                    onUpdate?.(node.id, { condition: updatedCondition });
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FilterNode;