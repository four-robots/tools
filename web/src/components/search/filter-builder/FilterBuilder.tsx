'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { DndContext, DragEndEvent, DragOverEvent, DragStartEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { 
  FilterTree, 
  FilterBuilderState, 
  QueryValidation,
  FilterTemplate,
  FilterPreset,
  BooleanOperator 
} from '@mcp-tools/core';
import { FilterNode } from './FilterNode';
import { FilterGroup } from './FilterGroup';
import { FilterPreview } from './FilterPreview';
import { FilterTemplates } from './FilterTemplates';
import { FilterShareDialog } from './FilterShareDialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Select } from '../../ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Badge } from '../../ui/badge';
import { 
  Plus, 
  Save, 
  Share2, 
  Undo, 
  Redo, 
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';

interface FilterBuilderProps {
  initialFilter?: FilterTree;
  availableFields?: Array<{
    name: string;
    label: string;
    type: 'string' | 'number' | 'date' | 'boolean' | 'array';
    operators: string[];
  }>;
  onFilterChange?: (filter: FilterTree) => void;
  onFilterApply?: (filter: FilterTree) => void;
  templates?: FilterTemplate[];
  presets?: FilterPreset[];
  className?: string;
}

export const FilterBuilder: React.FC<FilterBuilderProps> = ({
  initialFilter,
  availableFields = [],
  onFilterChange,
  onFilterApply,
  templates = [],
  presets = [],
  className = ''
}) => {
  const [state, setState] = useState<FilterBuilderState>(() => ({
    filterTree: initialFilter || createEmptyFilter(),
    selectedNodeId: undefined,
    draggedNodeId: undefined,
    clipboard: undefined,
    undoStack: [],
    redoStack: [],
    isValidating: false,
    lastValidation: undefined
  }));

  const [showPreview, setShowPreview] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const validationTimer = useRef<NodeJS.Timeout>();
  const builderRef = useRef<HTMLDivElement>(null);

  // Validation and change handling
  useEffect(() => {
    // Debounced validation
    if (validationTimer.current) {
      clearTimeout(validationTimer.current);
    }

    validationTimer.current = setTimeout(() => {
      validateFilter(state.filterTree);
    }, 500);

    return () => {
      if (validationTimer.current) {
        clearTimeout(validationTimer.current);
      }
    };
  }, [state.filterTree]);

  useEffect(() => {
    onFilterChange?.(state.filterTree);
  }, [state.filterTree, onFilterChange]);

  // Create empty filter
  function createEmptyFilter(): FilterTree {
    return {
      id: crypto.randomUUID(),
      type: 'group',
      operator: 'AND',
      children: [],
      metadata: {
        label: 'Root Filter',
        collapsed: false
      }
    };
  }

  // Update state with undo support
  const updateState = useCallback((updates: Partial<FilterBuilderState>) => {
    setState(prevState => {
      if (updates.filterTree && updates.filterTree !== prevState.filterTree) {
        const newUndoStack = [...prevState.undoStack, prevState.filterTree].slice(-50);
        return {
          ...prevState,
          ...updates,
          undoStack: newUndoStack,
          redoStack: [] // Clear redo stack on new changes
        };
      }
      return { ...prevState, ...updates };
    });
  }, []);

  // Undo/Redo operations
  const undo = useCallback(() => {
    if (state.undoStack.length === 0) return;
    
    const previousState = state.undoStack[state.undoStack.length - 1];
    const newUndoStack = state.undoStack.slice(0, -1);
    const newRedoStack = [...state.redoStack, state.filterTree].slice(-50);
    
    setState({
      ...state,
      filterTree: previousState,
      undoStack: newUndoStack,
      redoStack: newRedoStack
    });
  }, [state]);

  const redo = useCallback(() => {
    if (state.redoStack.length === 0) return;
    
    const nextState = state.redoStack[state.redoStack.length - 1];
    const newRedoStack = state.redoStack.slice(0, -1);
    const newUndoStack = [...state.undoStack, state.filterTree].slice(-50);
    
    setState({
      ...state,
      filterTree: nextState,
      undoStack: newUndoStack,
      redoStack: newRedoStack
    });
  }, [state]);

  // Filter validation
  const validateFilter = async (filter: FilterTree) => {
    updateState({ isValidating: true });
    
    try {
      // Here you would call your validation service
      // For now, we'll do basic validation
      const validation: QueryValidation = {
        isValid: true,
        errors: [],
        suggestions: [],
        estimatedPerformance: {
          complexity: calculateComplexity(filter),
          estimatedExecutionTimeMs: 50,
          indexUsage: []
        }
      };

      updateState({ 
        isValidating: false, 
        lastValidation: validation 
      });
    } catch (error) {
      updateState({ 
        isValidating: false,
        lastValidation: {
          isValid: false,
          errors: [{ path: 'root', message: 'Validation failed', severity: 'error' }],
          suggestions: []
        }
      });
    }
  };

  // Calculate filter complexity (simple version)
  const calculateComplexity = (filter: FilterTree): number => {
    let complexity = 0;
    
    const traverse = (node: FilterTree, depth = 0): void => {
      if (node.type === 'condition') {
        complexity += 1 + (depth * 0.2);
      } else if (node.children) {
        complexity += 0.1;
        node.children.forEach(child => traverse(child, depth + 1));
      }
    };
    
    traverse(filter);
    return Math.min(10, Math.max(1, Math.ceil(complexity)));
  };

  // Drag and Drop Handlers
  const handleDragStart = (event: DragStartEvent) => {
    updateState({ draggedNodeId: event.active.id as string });
  };

  const handleDragOver = (event: DragOverEvent) => {
    setDragOverId(event.over?.id as string || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    updateState({ draggedNodeId: undefined });
    setDragOverId(null);

    if (!over || active.id === over.id) return;

    // Handle the drop logic here
    const draggedId = active.id as string;
    const targetId = over.id as string;

    // Move the dragged node to the new position
    const updatedTree = moveNodeInTree(state.filterTree, draggedId, targetId);
    if (updatedTree) {
      updateState({ filterTree: updatedTree });
    }
  };

  // Move node in tree - complete implementation
  const moveNodeInTree = (tree: FilterTree, draggedId: string, targetId: string): FilterTree | null => {
    const cloned = structuredClone(tree);
    
    // Find source node and its parent
    const { node: sourceNode, parent: sourceParent, index: sourceIndex } = findNodeWithParent(cloned, draggedId);
    if (!sourceNode) return null;
    
    // Prevent moving a node into itself or its descendants
    if (isDescendant(sourceNode, targetId)) return null;
    
    // Find target node
    const targetNode = findNodeById(cloned, targetId);
    if (!targetNode) return null;
    
    // Remove from source location
    if (sourceParent?.children && sourceIndex !== -1) {
      sourceParent.children.splice(sourceIndex, 1);
    }
    
    // Add to target location
    if (targetNode.type === 'group') {
      // If target is a group, add as child
      targetNode.children = targetNode.children || [];
      targetNode.children.push(sourceNode);
    } else {
      // If target is a condition, add to its parent group
      const { parent: targetParent } = findNodeWithParent(cloned, targetId);
      if (targetParent?.children) {
        const targetIndex = targetParent.children.findIndex(n => n.id === targetId);
        targetParent.children.splice(targetIndex + 1, 0, sourceNode);
      }
    }
    
    return cloned;
  };

  // Helper function to find node with its parent
  const findNodeWithParent = (tree: FilterTree, targetId: string, parent: FilterTree | null = null): { node: FilterTree | null, parent: FilterTree | null, index: number } => {
    if (tree.id === targetId) {
      return { node: tree, parent, index: parent?.children?.findIndex(child => child.id === targetId) ?? -1 };
    }
    
    if (tree.children) {
      for (let i = 0; i < tree.children.length; i++) {
        const result = findNodeWithParent(tree.children[i], targetId, tree);
        if (result.node) {
          return { ...result, index: result.parent === tree ? i : result.index };
        }
      }
    }
    
    return { node: null, parent: null, index: -1 };
  };

  // Helper function to find node by ID
  const findNodeById = (tree: FilterTree, targetId: string): FilterTree | null => {
    if (tree.id === targetId) return tree;
    
    if (tree.children) {
      for (const child of tree.children) {
        const found = findNodeById(child, targetId);
        if (found) return found;
      }
    }
    
    return null;
  };

  // Helper function to check if a node is a descendant of another
  const isDescendant = (ancestorNode: FilterTree, targetId: string): boolean => {
    if (ancestorNode.id === targetId) return true;
    
    if (ancestorNode.children) {
      for (const child of ancestorNode.children) {
        if (isDescendant(child, targetId)) return true;
      }
    }
    
    return false;
  };

  // Node operations
  const addCondition = () => {
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

    const updatedTree = addChildToGroup(state.filterTree, newCondition);
    updateState({ filterTree: updatedTree });
  };

  const addGroup = (operator: BooleanOperator = 'AND') => {
    const newGroup: FilterTree = {
      id: crypto.randomUUID(),
      type: 'group',
      operator,
      children: [],
      metadata: {
        label: `${operator} Group`,
        collapsed: false
      }
    };

    const updatedTree = addChildToGroup(state.filterTree, newGroup);
    updateState({ filterTree: updatedTree });
  };

  // Add child to group (simplified)
  const addChildToGroup = (tree: FilterTree, child: FilterTree): FilterTree => {
    const newTree = JSON.parse(JSON.stringify(tree));
    if (!newTree.children) newTree.children = [];
    newTree.children.push(child);
    return newTree;
  };

  // Clear filter
  const clearFilter = () => {
    updateState({ filterTree: createEmptyFilter() });
  };

  // Apply filter
  const applyFilter = () => {
    onFilterApply?.(state.filterTree);
  };

  return (
    <div className={`filter-builder ${className}`} ref={builderRef}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Filter Builder
              {state.isValidating && (
                <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              )}
              {state.lastValidation && (
                <Badge variant={state.lastValidation.isValid ? 'default' : 'destructive'}>
                  {state.lastValidation.isValid ? (
                    <CheckCircle className="w-3 h-3 mr-1" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 mr-1" />
                  )}
                  {state.lastValidation.isValid ? 'Valid' : 'Invalid'}
                </Badge>
              )}
            </CardTitle>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={undo}
                disabled={state.undoStack.length === 0}
              >
                <Undo className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={redo}
                disabled={state.redoStack.length === 0}
              >
                <Redo className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShareDialogOpen(true)}
              >
                <Share2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="builder" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="builder">Builder</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="builder" className="space-y-4">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <Button onClick={addCondition} size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Condition
                </Button>
                
                <Select
                  value="AND"
                  onValueChange={(value) => addGroup(value as BooleanOperator)}
                >
                  <Button variant="outline" size="sm">
                    <Plus className="w-4 h-4 mr-1" />
                    Add Group
                  </Button>
                </Select>

                <div className="flex-1" />

                <Button onClick={clearFilter} variant="outline" size="sm">
                  <Trash2 className="w-4 h-4 mr-1" />
                  Clear
                </Button>

                <Button onClick={applyFilter} className="bg-blue-600 hover:bg-blue-700">
                  Apply Filter
                </Button>
              </div>

              {/* Filter Tree */}
              <div className="border rounded-lg p-4 min-h-[300px] bg-white">
                <DndContext
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis]}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                >
                  <FilterGroup
                    node={state.filterTree}
                    availableFields={availableFields}
                    isRoot={true}
                    selectedNodeId={state.selectedNodeId}
                    dragOverId={dragOverId}
                    onNodeUpdate={(nodeId, updates) => {
                      // Handle node updates
                    }}
                    onNodeDelete={(nodeId) => {
                      // Handle node deletion
                    }}
                    onNodeSelect={(nodeId) => {
                      updateState({ selectedNodeId: nodeId });
                    }}
                  />
                </DndContext>
              </div>

              {/* Preview */}
              {showPreview && (
                <FilterPreview
                  filterTree={state.filterTree}
                  validation={state.lastValidation}
                />
              )}
            </TabsContent>

            <TabsContent value="templates">
              <FilterTemplates
                templates={templates}
                presets={presets}
                onTemplateApply={(template) => {
                  updateState({ filterTree: template.filterTree });
                }}
                onPresetApply={(preset) => {
                  updateState({ filterTree: preset.filterTree });
                }}
                onTemplateSave={async (name, description, category, tags) => {
                  try {
                    const response = await fetch('/api/filter-builder/templates', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      credentials: 'include',
                      body: JSON.stringify({
                        name,
                        description,
                        category,
                        tags,
                        filterTree: state.filterTree,
                        isPublic: false
                      })
                    });

                    if (response.ok) {
                      const template = await response.json();
                      console.log('Template saved successfully:', template);
                      // Optionally refresh templates list or show success message
                    } else {
                      const error = await response.json();
                      console.error('Failed to save template:', error);
                      alert('Failed to save template: ' + (error.message || 'Unknown error'));
                    }
                  } catch (error) {
                    console.error('Error saving template:', error);
                    alert('Error saving template: ' + error.message);
                  }
                }}
              />
            </TabsContent>

            <TabsContent value="settings">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Filter Builder Settings</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Auto-save drafts
                    </label>
                    <input type="checkbox" defaultChecked className="rounded" />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Show keyboard shortcuts
                    </label>
                    <input type="checkbox" defaultChecked className="rounded" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Default operator for new groups
                  </label>
                  <Select defaultValue="AND">
                    <option value="AND">AND</option>
                    <option value="OR">OR</option>
                  </Select>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Share Dialog */}
      {shareDialogOpen && (
        <FilterShareDialog
          filterTree={state.filterTree}
          onClose={() => setShareDialogOpen(false)}
          onShare={(shareUrl) => {
            // Handle sharing
          }}
        />
      )}
    </div>
  );
};

export default FilterBuilder;