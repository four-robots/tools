/**
 * Kanban Types and Schemas
 */

import { z } from 'zod';

// Priority levels for cards
export const PrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export type Priority = z.infer<typeof PrioritySchema>;

// Database entity interfaces
export interface Board {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface Column {
  id: string;
  board_id: string;
  name: string;
  position: number;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface Card {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  slug: string;
  description: string | null;
  position: number;
  priority: Priority;
  assigned_to: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  card_id: string;
  content: string;
  author: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeEntry {
  id: string;
  card_id: string;
  user_name: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  is_billable: boolean;
  hourly_rate: number | null;
  created_at: string;
  updated_at: string;
}

// Custom Fields
export const CustomFieldTypeSchema = z.enum(['text', 'number', 'date', 'dropdown', 'checkbox', 'multi_select']);
export type CustomFieldType = z.infer<typeof CustomFieldTypeSchema>;

export interface CustomField {
  id: string;
  board_id: string;
  name: string;
  field_type: CustomFieldType;
  is_required: boolean;
  position: number;
  options: string | null; // JSON string for dropdown/multi_select options
  validation_rules: string | null; // JSON string for validation rules
  created_at: string;
  updated_at: string;
}

export interface CustomFieldValue {
  id: string;
  card_id: string;
  custom_field_id: string;
  value: string | null;
  created_at: string;
  updated_at: string;
}

// Milestones
export interface Milestone {
  id: string;
  board_id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  is_completed: boolean;
  completion_date: string | null;
  position: number;
  color: string;
  created_at: string;
  updated_at: string;
}

// Subtasks
export interface Subtask {
  id: string;
  card_id: string;
  parent_subtask_id: string | null;
  title: string;
  description: string | null;
  is_completed: boolean;
  position: number;
  assigned_to: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Card Links
export const CardLinkTypeSchema = z.enum(['blocks', 'relates_to', 'duplicate', 'parent_child']);
export type CardLinkType = z.infer<typeof CardLinkTypeSchema>;

export interface CardLink {
  id: string;
  source_card_id: string;
  target_card_id: string;
  link_type: CardLinkType;
  description: string | null;
  created_at: string;
  created_by: string | null;
}

// Input schemas
export const CreateBoardSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).optional(), // Optional, will be auto-generated if not provided
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#6366f1'),
});

export const UpdateBoardSchema = CreateBoardSchema.partial();

export const CreateColumnSchema = z.object({
  board_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  position: z.number().int().min(0).default(0),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#64748b'),
});

export const UpdateColumnSchema = CreateColumnSchema.partial().omit({ board_id: true });

export const CreateCardSchema = z.object({
  board_id: z.string().uuid(),
  column_id: z.string().uuid().optional(),
  column_name: z.string().min(1).max(255).optional(),
  column_position: z.number().int().min(0).optional(),
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).optional(), // Optional, will be auto-generated if not provided
  description: z.string().optional(),
  position: z.number().int().min(0).default(0),
  priority: PrioritySchema.default('medium'),
  assigned_to: z.string().max(255).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const UpdateCardSchema = CreateCardSchema.partial().omit({ board_id: true });

export const MoveCardSchema = z.object({
  column_id: z.string().uuid().optional(),
  column_name: z.string().min(1).max(255).optional(),
  column_position: z.number().int().min(0).optional(),
  position: z.number().int().min(0),
});

export const CreateTagSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#64748b'),
});

export const CreateCommentSchema = z.object({
  card_id: z.string().uuid(),
  content: z.string().min(1),
  author: z.string().max(255).optional(),
});

export const SearchCardsSchema = z.object({
  query: z.string().min(1),
  board_id: z.string().uuid().optional(),
  priority: PrioritySchema.optional(),
  assigned_to: z.string().max(255).optional(),
});

// Custom Fields schemas
export const CreateCustomFieldSchema = z.object({
  board_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  field_type: CustomFieldTypeSchema,
  is_required: z.boolean().default(false),
  position: z.number().int().min(0).default(0),
  options: z.string().optional(), // JSON string for dropdown/multi_select options
  validation_rules: z.string().optional(), // JSON string for validation rules
});

export const UpdateCustomFieldSchema = CreateCustomFieldSchema.partial().omit({ board_id: true });

export const SetCustomFieldValueSchema = z.object({
  card_id: z.string().uuid(),
  custom_field_id: z.string().uuid(),
  value: z.string().optional(),
});

// Milestones schemas
export const CreateMilestoneSchema = z.object({
  board_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  position: z.number().int().min(0).default(0),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#6366f1'),
});

export const UpdateMilestoneSchema = CreateMilestoneSchema.partial().omit({ board_id: true });

export const CompleteMilestoneSchema = z.object({
  milestone_id: z.string().uuid(),
  is_completed: z.boolean(),
  completion_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const AssignCardToMilestoneSchema = z.object({
  card_id: z.string().uuid(),
  milestone_id: z.string().uuid(),
});

// Subtasks schemas
export const CreateSubtaskSchema = z.object({
  card_id: z.string().uuid(),
  parent_subtask_id: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  position: z.number().int().min(0).default(0),
  assigned_to: z.string().max(255).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const UpdateSubtaskSchema = CreateSubtaskSchema.partial().omit({ card_id: true });

export const CompleteSubtaskSchema = z.object({
  subtask_id: z.string().uuid(),
  is_completed: z.boolean(),
});

// Card Links schemas
export const CreateCardLinkSchema = z.object({
  source_card_id: z.string().uuid(),
  target_card_id: z.string().uuid(),
  link_type: CardLinkTypeSchema,
  description: z.string().optional(),
  created_by: z.string().max(255).optional(),
});

export const UpdateCardLinkSchema = CreateCardLinkSchema.partial().omit({ source_card_id: true, target_card_id: true });

// Time Tracking schemas
export const CreateTimeEntrySchema = z.object({
  card_id: z.string().uuid(),
  user_name: z.string().max(255).optional(),
  description: z.string().optional(),
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().optional(),
  duration_minutes: z.number().int().min(0).optional(),
  is_billable: z.boolean().default(false),
  hourly_rate: z.number().min(0).optional(),
});

export const UpdateTimeEntrySchema = CreateTimeEntrySchema.partial().omit({ card_id: true });

export const StartTimeTrackingSchema = z.object({
  card_id: z.string().uuid(),
  user_name: z.string().max(255).optional(),
  description: z.string().optional(),
});

export const StopTimeTrackingSchema = z.object({
  time_entry_id: z.string().uuid(),
  end_time: z.string().datetime().optional(),
});

export const UpdateCardTimeEstimateSchema = z.object({
  card_id: z.string().uuid(),
  estimated_hours: z.number().min(0).optional(),
});

// Input types
export type CreateBoardInput = z.infer<typeof CreateBoardSchema>;
export type UpdateBoardInput = z.infer<typeof UpdateBoardSchema>;
export type CreateColumnInput = z.infer<typeof CreateColumnSchema>;
export type UpdateColumnInput = z.infer<typeof UpdateColumnSchema>;
export type CreateCardInput = z.infer<typeof CreateCardSchema>;
export type UpdateCardInput = z.infer<typeof UpdateCardSchema>;
export type MoveCardInput = z.infer<typeof MoveCardSchema>;
export type CreateTagInput = z.infer<typeof CreateTagSchema>;
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;
export type SearchCardsInput = z.infer<typeof SearchCardsSchema>;

// New feature input types
export type CreateCustomFieldInput = z.infer<typeof CreateCustomFieldSchema>;
export type UpdateCustomFieldInput = z.infer<typeof UpdateCustomFieldSchema>;
export type SetCustomFieldValueInput = z.infer<typeof SetCustomFieldValueSchema>;

export type CreateMilestoneInput = z.infer<typeof CreateMilestoneSchema>;
export type UpdateMilestoneInput = z.infer<typeof UpdateMilestoneSchema>;
export type CompleteMilestoneInput = z.infer<typeof CompleteMilestoneSchema>;
export type AssignCardToMilestoneInput = z.infer<typeof AssignCardToMilestoneSchema>;

export type CreateSubtaskInput = z.infer<typeof CreateSubtaskSchema>;
export type UpdateSubtaskInput = z.infer<typeof UpdateSubtaskSchema>;
export type CompleteSubtaskInput = z.infer<typeof CompleteSubtaskSchema>;

export type CreateCardLinkInput = z.infer<typeof CreateCardLinkSchema>;
export type UpdateCardLinkInput = z.infer<typeof UpdateCardLinkSchema>;

export type CreateTimeEntryInput = z.infer<typeof CreateTimeEntrySchema>;
export type UpdateTimeEntryInput = z.infer<typeof UpdateTimeEntrySchema>;
export type StartTimeTrackingInput = z.infer<typeof StartTimeTrackingSchema>;
export type StopTimeTrackingInput = z.infer<typeof StopTimeTrackingSchema>;
export type UpdateCardTimeEstimateInput = z.infer<typeof UpdateCardTimeEstimateSchema>;

// Response types
export interface BoardWithColumns extends Board {
  columns: ColumnWithCards[];
}

export interface ColumnWithCards extends Column {
  cards: CardWithTags[];
}

export interface CardWithTags extends Card {
  tags: Tag[];
  custom_field_values?: CustomFieldValueWithField[];
  milestones?: Milestone[];
  subtasks?: SubtaskWithChildren[];
  time_entries?: TimeEntry[];
  estimated_hours?: number;
  actual_hours?: number;
}

export interface CustomFieldWithValues extends CustomField {
  values?: CustomFieldValue[];
}

export interface CustomFieldValueWithField extends CustomFieldValue {
  custom_field?: CustomField;
}

export interface MilestoneWithCards extends Milestone {
  cards?: Card[];
  progress?: {
    total_cards: number;
    completed_cards: number;
    completion_percentage: number;
  };
}

export interface SubtaskWithChildren extends Subtask {
  children?: SubtaskWithChildren[];
}

export interface CardLinkWithCards extends CardLink {
  source_card?: Card;
  target_card?: Card;
}

export interface TimeEntryWithCard extends TimeEntry {
  card?: Card;
}

export interface KanbanStats {
  total_boards: number;
  total_cards: number;
  cards_by_priority: Record<Priority, number>;
  cards_by_status: Record<string, number>;
  overdue_cards: number;
  recent_activity: Array<{
    type: 'card_created' | 'card_moved' | 'card_updated' | 'comment_added';
    card_id: string;
    card_title: string;
    timestamp: string;
    details?: string;
  }>;
}

// Error types
export class KanbanError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'KanbanError';
  }
}

export class NotFoundError extends KanbanError {
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends KanbanError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}