import { z } from 'zod';

/**
 * Core filter tree structure supporting nested boolean logic
 */
export const FilterOperatorSchema = z.enum([
  'equals', 'not_equals',
  'contains', 'not_contains',
  'starts_with', 'ends_with',
  'greater_than', 'less_than', 'greater_equal', 'less_equal',
  'between', 'in', 'not_in',
  'is_null', 'is_not_null',
  'matches_regex', 'fuzzy_match'
]);

export type FilterOperator = z.infer<typeof FilterOperatorSchema>;

export const FilterDataTypeSchema = z.enum([
  'string', 'number', 'date', 'boolean', 'array', 'object'
]);

export type FilterDataType = z.infer<typeof FilterDataTypeSchema>;

export const BooleanOperatorSchema = z.enum(['AND', 'OR', 'NOT']);
export type BooleanOperator = z.infer<typeof BooleanOperatorSchema>;

export const FilterConditionSchema = z.object({
  id: z.string().uuid(),
  field: z.string(),
  operator: FilterOperatorSchema,
  value: z.any(),
  dataType: FilterDataTypeSchema,
  label: z.string().optional(),
  description: z.string().optional(),
  isRequired: z.boolean().default(false),
  caseSensitive: z.boolean().default(false)
});

export type FilterCondition = z.infer<typeof FilterConditionSchema>;

export const FilterMetadataSchema = z.object({
  label: z.string().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  collapsed: z.boolean().default(false),
  position: z.object({
    x: z.number(),
    y: z.number()
  }).optional()
});

export type FilterMetadata = z.infer<typeof FilterMetadataSchema>;

// Recursive filter tree schema
export const FilterTreeSchema: z.ZodType<FilterTree> = z.lazy(() => z.object({
  id: z.string().uuid(),
  type: z.enum(['group', 'condition']),
  operator: BooleanOperatorSchema.optional(),
  children: z.array(FilterTreeSchema).optional(),
  condition: FilterConditionSchema.optional(),
  metadata: FilterMetadataSchema.optional()
}));

export type FilterTree = {
  id: string;
  type: 'group' | 'condition';
  operator?: BooleanOperator;
  children?: FilterTree[];
  condition?: FilterCondition;
  metadata?: FilterMetadata;
};

/**
 * Filter templates and presets
 */
export const FilterTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  filterTree: FilterTreeSchema,
  category: z.string().max(100).optional(),
  tags: z.array(z.string()).default([]),
  isPublic: z.boolean().default(false),
  ownerId: z.string().uuid(),
  usageCount: z.number().int().min(0).default(0),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type FilterTemplate = z.infer<typeof FilterTemplateSchema>;

export const FilterPresetSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(200),
  filterTree: FilterTreeSchema,
  shortcutKey: z.string().max(20).optional(),
  isDefault: z.boolean().default(false),
  usageCount: z.number().int().min(0).default(0),
  createdAt: z.date()
});

export type FilterPreset = z.infer<typeof FilterPresetSchema>;

/**
 * Shared filters and collaboration
 */
export const SharePermissionSchema = z.enum(['view', 'edit', 'admin']);
export type SharePermission = z.infer<typeof SharePermissionSchema>;

export const SharedFilterSchema = z.object({
  id: z.string().uuid(),
  filterTree: FilterTreeSchema,
  shareToken: z.string().min(1).max(100),
  createdBy: z.string().uuid(),
  permissions: SharePermissionSchema.default('view'),
  expiresAt: z.date().optional(),
  accessCount: z.number().int().min(0).default(0),
  createdAt: z.date()
});

export type SharedFilter = z.infer<typeof SharedFilterSchema>;

/**
 * Filter history and analytics
 */
export const FilterHistorySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  filterTree: FilterTreeSchema,
  queryGenerated: z.string().optional(),
  executionTimeMs: z.number().int().min(0).optional(),
  resultCount: z.number().int().min(0).optional(),
  isSaved: z.boolean().default(false),
  createdAt: z.date()
});

export type FilterHistory = z.infer<typeof FilterHistorySchema>;

export const FilterAnalyticsActionSchema = z.enum([
  'create', 'apply', 'share', 'save_template', 'load_template', 'delete'
]);
export type FilterAnalyticsAction = z.infer<typeof FilterAnalyticsActionSchema>;

export const FilterBuilderAnalyticsSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().optional(),
  actionType: FilterAnalyticsActionSchema,
  filterComplexity: z.number().int().min(0),
  operatorUsage: z.record(z.string(), z.number()).optional(),
  executionTimeMs: z.number().int().min(0).optional(),
  createdAt: z.date()
});

export type FilterBuilderAnalytics = z.infer<typeof FilterBuilderAnalyticsSchema>;

/**
 * Query building and validation
 */
export const QueryValidationSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(z.object({
    path: z.string(),
    message: z.string(),
    severity: z.enum(['error', 'warning', 'info'])
  })),
  suggestions: z.array(z.object({
    type: z.enum(['optimize', 'simplify', 'alternative']),
    message: z.string(),
    proposedChange: FilterTreeSchema.optional()
  })),
  estimatedPerformance: z.object({
    complexity: z.number().int().min(1).max(10),
    estimatedExecutionTimeMs: z.number().int().min(0),
    indexUsage: z.array(z.string())
  }).optional()
});

export type QueryValidation = z.infer<typeof QueryValidationSchema>;

export const SearchQuerySchema = z.object({
  sql: z.string(),
  elasticsearch: z.record(z.any()).optional(),
  mongodb: z.record(z.any()).optional(),
  parameters: z.record(z.any()).default({}),
  metadata: z.object({
    complexity: z.number().int().min(1).max(10),
    indexHints: z.array(z.string()),
    optimizationNotes: z.array(z.string())
  }).optional()
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

/**
 * UI state and drag-and-drop
 */
export const FilterBuilderStateSchema = z.object({
  filterTree: FilterTreeSchema,
  selectedNodeId: z.string().uuid().optional(),
  draggedNodeId: z.string().uuid().optional(),
  clipboard: FilterTreeSchema.optional(),
  undoStack: z.array(FilterTreeSchema).max(50).default([]),
  redoStack: z.array(FilterTreeSchema).max(50).default([]),
  isValidating: z.boolean().default(false),
  lastValidation: QueryValidationSchema.optional()
});

export type FilterBuilderState = z.infer<typeof FilterBuilderStateSchema>;

export const DragItemSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['filter-node', 'filter-group', 'template']),
  data: z.any(),
  sourceParentId: z.string().uuid().optional(),
  sourceIndex: z.number().int().min(0).optional()
});

export type DragItem = z.infer<typeof DragItemSchema>;

/**
 * Field metadata for building conditions
 */
export const FieldMetadataSchema = z.object({
  name: z.string(),
  label: z.string(),
  dataType: FilterDataTypeSchema,
  operators: z.array(FilterOperatorSchema),
  description: z.string().optional(),
  examples: z.array(z.any()).optional(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    enum: z.array(z.any()).optional()
  }).optional(),
  isIndexed: z.boolean().default(false),
  isFaceted: z.boolean().default(false)
});

export type FieldMetadata = z.infer<typeof FieldMetadataSchema>;

/**
 * API request/response schemas
 */
export const CreateFilterTemplateRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  filterTree: FilterTreeSchema,
  category: z.string().max(100).optional(),
  tags: z.array(z.string()).default([]),
  isPublic: z.boolean().default(false)
});

export type CreateFilterTemplateRequest = z.infer<typeof CreateFilterTemplateRequestSchema>;

export const ShareFilterRequestSchema = z.object({
  filterTree: FilterTreeSchema,
  permissions: SharePermissionSchema.default('view'),
  expiresIn: z.number().int().positive().optional() // hours
});

export type ShareFilterRequest = z.infer<typeof ShareFilterRequestSchema>;

export const SaveFilterPresetRequestSchema = z.object({
  name: z.string().min(1).max(200),
  filterTree: FilterTreeSchema,
  shortcutKey: z.string().max(20).optional(),
  isDefault: z.boolean().default(false)
});

export type SaveFilterPresetRequest = z.infer<typeof SaveFilterPresetRequestSchema>;

export const BuildQueryRequestSchema = z.object({
  filterTree: FilterTreeSchema,
  targetFormat: z.enum(['sql', 'elasticsearch', 'mongodb']).default('sql'),
  options: z.object({
    optimize: z.boolean().default(true),
    includeMetadata: z.boolean().default(false)
  }).optional()
});

export type BuildQueryRequest = z.infer<typeof BuildQueryRequestSchema>;

/**
 * Template categories for organization
 */
export const TEMPLATE_CATEGORIES = [
  'general',
  'search',
  'analytics',
  'reports',
  'automation',
  'custom'
] as const;

export type TemplateCategory = typeof TEMPLATE_CATEGORIES[number];

/**
 * Predefined operator groups for UI organization
 */
export const OPERATOR_GROUPS = {
  comparison: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_equal', 'less_equal'],
  text: ['contains', 'not_contains', 'starts_with', 'ends_with', 'matches_regex', 'fuzzy_match'],
  set: ['in', 'not_in', 'between'],
  existence: ['is_null', 'is_not_null']
} as const;

/**
 * UI theme colors for different operators
 */
export const OPERATOR_COLORS = {
  AND: '#3b82f6', // blue
  OR: '#10b981',  // green
  NOT: '#ef4444'  // red
} as const;

/**
 * Export all schemas for validation
 */
export const FilterBuilderSchemas = {
  FilterOperator: FilterOperatorSchema,
  FilterDataType: FilterDataTypeSchema,
  BooleanOperator: BooleanOperatorSchema,
  FilterCondition: FilterConditionSchema,
  FilterTree: FilterTreeSchema,
  FilterTemplate: FilterTemplateSchema,
  FilterPreset: FilterPresetSchema,
  SharedFilter: SharedFilterSchema,
  FilterHistory: FilterHistorySchema,
  FilterBuilderAnalytics: FilterBuilderAnalyticsSchema,
  QueryValidation: QueryValidationSchema,
  SearchQuery: SearchQuerySchema,
  FilterBuilderState: FilterBuilderStateSchema,
  DragItem: DragItemSchema,
  FieldMetadata: FieldMetadataSchema,
  CreateFilterTemplateRequest: CreateFilterTemplateRequestSchema,
  ShareFilterRequest: ShareFilterRequestSchema,
  SaveFilterPresetRequest: SaveFilterPresetRequestSchema,
  BuildQueryRequest: BuildQueryRequestSchema
} as const;