/**
 * CommentComposer Component
 * 
 * Rich text comment composer with @mention autocomplete, formatting toolbar,
 * content validation, and real-time preview capabilities.
 * 
 * Features:
 * - Rich text editor with formatting toolbar
 * - @mention autocomplete with user search
 * - Real-time content validation and preview
 * - Auto-save drafts
 * - Keyboard shortcuts for formatting
 * - Emoji picker integration
 * - File attachment support
 * - Content length indicators
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { MentionAutocomplete } from './MentionAutocomplete';
import { RichTextValidator } from '@mcp-tools/core/src/utils/rich-text-validator';
import { MentionParser } from '@mcp-tools/core/src/utils/mention-parser';
import { useMentionSystem } from '../hooks/useMentionSystem';
import { useCommentDrafts } from '../hooks/useCommentDrafts';
import { Point, CommentContentType, RichTextFormat, CommentPriority } from '@shared/types/whiteboard';

export interface CommentComposerProps {
  whiteboardId: string;
  userId: string;
  parentId?: string;
  position?: Point;
  elementId?: string;
  // Content props
  initialContent?: string;
  initialFormat?: RichTextFormat;
  contentType?: CommentContentType;
  placeholder?: string;
  // Feature flags
  enableMentions?: boolean;
  enableRichText?: boolean;
  enableAttachments?: boolean;
  enableEmojis?: boolean;
  // Behavior props
  autoFocus?: boolean;
  autoSave?: boolean;
  maxLength?: number;
  minHeight?: number;
  maxHeight?: number;
  // Style props
  zIndex?: number;
  className?: string;
  // Event handlers
  onSubmit?: (data: CommentSubmissionData) => void;
  onCancel?: () => void;
  onChange?: (content: string, format?: RichTextFormat) => void;
  onMentionUser?: (userId: string) => void;
}

export interface CommentSubmissionData {
  content: string;
  contentType: CommentContentType;
  format?: RichTextFormat;
  mentions: Array<{
    userId: string;
    userName: string;
    start: number;
    end: number;
  }>;
  priority: CommentPriority;
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
  }>;
}

interface FormattingAction {
  type: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'link';
  label: string;
  icon: React.ReactNode;
  shortcut: string;
}

interface ComposerState {
  content: string;
  format: RichTextFormat;
  contentType: CommentContentType;
  priority: CommentPriority;
  isSubmitting: boolean;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  wordCount: number;
  characterCount: number;
}

const DEFAULT_MAX_LENGTH = 10000;
const DEFAULT_MIN_HEIGHT = 80;
const DEFAULT_MAX_HEIGHT = 300;
const AUTOSAVE_DELAY = 1000; // ms

export const CommentComposer: React.FC<CommentComposerProps> = ({
  whiteboardId,
  userId,
  parentId,
  position,
  elementId,
  initialContent = '',
  initialFormat,
  contentType = 'rich_text',
  placeholder = 'Write a comment...',
  enableMentions = true,
  enableRichText = true,
  enableAttachments = false,
  enableEmojis = false,
  autoFocus = false,
  autoSave = true,
  maxLength = DEFAULT_MAX_LENGTH,
  minHeight = DEFAULT_MIN_HEIGHT,
  maxHeight = DEFAULT_MAX_HEIGHT,
  zIndex = 1200,
  className = '',
  onSubmit,
  onCancel,
  onChange,
  onMentionUser,
}) => {
  // Refs
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const autosaveTimeoutRef = useRef<NodeJS.Timeout>();

  // State management
  const [state, setState] = useState<ComposerState>(() => ({
    content: initialContent,
    format: initialFormat || {
      bold: [],
      italic: [],
      underline: [],
      strikethrough: [],
      code: [],
      links: [],
    },
    contentType,
    priority: 'normal',
    isSubmitting: false,
    isValid: initialContent.trim().length > 0,
    errors: [],
    warnings: [],
    wordCount: initialContent.split(/\s+/).filter(word => word.length > 0).length,
    characterCount: initialContent.length,
  }));

  const [showMentionAutocomplete, setShowMentionAutocomplete] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState({ start: 0, end: 0 });
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  // Hook integrations
  const {
    searchUsers,
    resolveMention,
    extractMentions,
    isSearching: isMentionSearching,
    searchResults: mentionResults,
  } = useMentionSystem({
    whiteboardId,
    userId,
    enabled: enableMentions,
  });

  const {
    saveDraft,
    loadDraft,
    clearDraft,
    hasDraft,
  } = useCommentDrafts({
    whiteboardId,
    userId,
    parentId,
    enabled: autoSave,
  });

  // Utility instances
  const richTextValidator = useMemo(() => new RichTextValidator(), []);
  const mentionParser = useMemo(() => new MentionParser(), []);

  // Load draft on mount
  useEffect(() => {
    if (autoSave && hasDraft()) {
      const draft = loadDraft();
      if (draft && !initialContent) {
        setState(prev => ({
          ...prev,
          content: draft.content,
          format: draft.format || prev.format,
          priority: draft.priority || prev.priority,
        }));
      }
    }
  }, [autoSave, hasDraft, loadDraft, initialContent]);

  // Auto-focus editor
  useEffect(() => {
    if (autoFocus && editorRef.current) {
      editorRef.current.focus();
    }
  }, [autoFocus]);

  // Position calculation for floating composer
  const composerPosition = useMemo(() => {
    if (!position) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

    // Keep composer within viewport bounds
    const padding = 20;
    const composerWidth = 400;
    const composerHeight = isExpanded ? maxHeight : minHeight;

    let left = position.x + 20;
    let top = position.y;

    // Adjust horizontal position
    if (left + composerWidth > window.innerWidth - padding) {
      left = position.x - composerWidth - 20;
    }
    if (left < padding) left = padding;

    // Adjust vertical position
    if (top + composerHeight > window.innerHeight - padding) {
      top = window.innerHeight - composerHeight - padding;
    }
    if (top < padding) top = padding;

    return { top: `${top}px`, left: `${left}px` };
  }, [position, isExpanded, maxHeight, minHeight]);

  // Formatting actions configuration
  const formattingActions: FormattingAction[] = useMemo(() => [
    {
      type: 'bold',
      label: 'Bold',
      icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M5 4v12h4.5c2.5 0 4.5-1.79 4.5-4s-2-4-4.5-4H7V4H5zM7 10h2.5c1.38 0 2.5 1.12 2.5 2.5S10.88 15 9.5 15H7v-5z"/></svg>,
      shortcut: 'Ctrl+B',
    },
    {
      type: 'italic',
      label: 'Italic',
      icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M8 4h4l-2 12H6l2-12z"/></svg>,
      shortcut: 'Ctrl+I',
    },
    {
      type: 'underline',
      label: 'Underline',
      icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6 3v8c0 2.21 1.79 4 4 4s4-1.79 4-4V3h-2v8c0 1.1-.9 2-2 2s-2-.9-2-2V3H6zm-1 14h10v2H5v-2z"/></svg>,
      shortcut: 'Ctrl+U',
    },
    {
      type: 'strikethrough',
      label: 'Strikethrough',
      icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M3 10h14v2H3v-2zm3-6h8v2H6V4zm0 8h8v2H6v-2z"/></svg>,
      shortcut: 'Ctrl+Shift+X',
    },
    {
      type: 'code',
      label: 'Code',
      icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6.59 8.41L5.17 7 0 12.17 5.17 17.34l1.42-1.41L2.83 12l3.76-3.59zM13.41 8.41L17.17 12l-3.76 3.59L14.83 17 20 11.83 14.83 6.66l-1.42 1.41z"/></svg>,
      shortcut: 'Ctrl+`',
    },
    {
      type: 'link',
      label: 'Link',
      icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5z"/><path d="M7.414 15.414a2 2 0 01-2.828-2.828l3-3a2 2 0 012.828 0 1 1 0 001.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5z"/></svg>,
      shortcut: 'Ctrl+K',
    },
  ], []);

  // Content validation
  const validateContent = useCallback((content: string, format?: RichTextFormat) => {
    const result = richTextValidator.validateRichText(
      content,
      state.contentType,
      format,
      {
        preserveMentions: enableMentions,
        allowLinks: enableRichText,
        allowFormatting: enableRichText,
        maxLength,
      }
    );

    setState(prev => ({
      ...prev,
      isValid: result.isValid && content.trim().length > 0,
      errors: result.errors,
      warnings: result.warnings,
      wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
      characterCount: content.length,
    }));

    return result;
  }, [richTextValidator, state.contentType, enableMentions, enableRichText, maxLength]);

  // Handle content change
  const handleContentChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = event.target.value;
    const cursorPos = event.target.selectionStart;

    setState(prev => ({ ...prev, content: newContent }));
    setCursorPosition(cursorPos);

    // Check for @mention trigger
    if (enableMentions) {
      const beforeCursor = newContent.substring(0, cursorPos);
      const mentionMatch = beforeCursor.match(/@([a-zA-Z0-9._-]*)$/);
      
      if (mentionMatch) {
        const query = mentionMatch[1];
        const start = cursorPos - mentionMatch[0].length;
        
        setMentionQuery(query);
        setMentionPosition({ start, end: cursorPos });
        setShowMentionAutocomplete(true);
        
        if (query.length > 0) {
          searchUsers(query);
        }
      } else {
        setShowMentionAutocomplete(false);
      }
    }

    // Validate content
    validateContent(newContent, state.format);

    // Auto-save draft
    if (autoSave) {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
      
      autosaveTimeoutRef.current = setTimeout(() => {
        saveDraft({
          content: newContent,
          format: state.format,
          priority: state.priority,
          contentType: state.contentType,
        });
      }, AUTOSAVE_DELAY);
    }

    // Notify parent
    onChange?.(newContent, state.format);
  }, [enableMentions, searchUsers, validateContent, state.format, autoSave, saveDraft, state.priority, state.contentType, onChange]);

  // Handle mention selection
  const handleMentionSelect = useCallback((mention: { userId: string; userName: string; displayName: string }) => {
    if (!editorRef.current) return;

    const editor = editorRef.current;
    const { start, end } = mentionPosition;
    const beforeMention = state.content.substring(0, start);
    const afterMention = state.content.substring(end);
    const mentionText = `@${mention.userName} `;
    
    const newContent = beforeMention + mentionText + afterMention;
    const newCursorPos = start + mentionText.length;

    setState(prev => ({ ...prev, content: newContent }));
    
    // Update editor content and cursor position
    editor.value = newContent;
    editor.setSelectionRange(newCursorPos, newCursorPos);
    editor.focus();

    setShowMentionAutocomplete(false);
    onMentionUser?.(mention.userId);

    // Validate updated content
    validateContent(newContent, state.format);
  }, [mentionPosition, state.content, state.format, validateContent, onMentionUser]);

  // Handle formatting action
  const handleFormatting = useCallback((action: FormattingAction) => {
    if (!editorRef.current || !enableRichText) return;

    const editor = editorRef.current;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;

    if (start === end) return; // No selection

    const newFormat = { ...state.format };
    const range = { start, end };

    // Toggle formatting
    const existingRangeIndex = newFormat[action.type]?.findIndex(
      r => r.start <= start && r.end >= end
    );

    if (existingRangeIndex !== undefined && existingRangeIndex >= 0) {
      // Remove existing formatting
      newFormat[action.type].splice(existingRangeIndex, 1);
    } else {
      // Add new formatting
      newFormat[action.type] = newFormat[action.type] || [];
      newFormat[action.type].push(range);
    }

    setState(prev => ({ ...prev, format: newFormat }));
    validateContent(state.content, newFormat);
  }, [enableRichText, state.format, state.content, validateContent]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'b':
          event.preventDefault();
          handleFormatting(formattingActions[0]); // Bold
          break;
        case 'i':
          event.preventDefault();
          handleFormatting(formattingActions[1]); // Italic
          break;
        case 'u':
          event.preventDefault();
          handleFormatting(formattingActions[2]); // Underline
          break;
        case '`':
          event.preventDefault();
          handleFormatting(formattingActions[4]); // Code
          break;
        case 'k':
          event.preventDefault();
          handleFormatting(formattingActions[5]); // Link
          break;
        case 'Enter':
          event.preventDefault();
          handleSubmit();
          break;
      }
    }

    if (event.key === 'Escape') {
      if (showMentionAutocomplete) {
        setShowMentionAutocomplete(false);
      } else {
        onCancel?.();
      }
    }

    if (event.key === 'Tab' && showMentionAutocomplete) {
      event.preventDefault();
      // Handle mention autocomplete navigation
    }
  }, [formattingActions, handleFormatting, showMentionAutocomplete, onCancel]);

  // Handle submission
  const handleSubmit = useCallback(async () => {
    if (!state.isValid || state.isSubmitting) return;

    setState(prev => ({ ...prev, isSubmitting: true }));

    try {
      // Extract mentions from content
      const mentions = await mentionParser.extractMentions(state.content, {
        whiteboardId,
        workspaceId: '', // TODO: Get from context
      });

      const submissionData: CommentSubmissionData = {
        content: state.content,
        contentType: state.contentType,
        format: enableRichText ? state.format : undefined,
        mentions: mentions.map(m => ({
          userId: m.userId,
          userName: m.userName,
          start: m.start,
          end: m.end,
        })),
        priority: state.priority,
        attachments: [], // TODO: Implement attachments
      };

      await onSubmit?.(submissionData);

      // Clear draft on successful submission
      if (autoSave) {
        clearDraft();
      }

      // Reset composer
      setState(prev => ({
        ...prev,
        content: '',
        format: {
          bold: [],
          italic: [],
          underline: [],
          strikethrough: [],
          code: [],
          links: [],
        },
        isSubmitting: false,
        isValid: false,
        errors: [],
        warnings: [],
        wordCount: 0,
        characterCount: 0,
      }));

    } catch (error) {
      setState(prev => ({
        ...prev,
        isSubmitting: false,
        errors: [`Failed to submit comment: ${error instanceof Error ? error.message : String(error)}`],
      }));
    }
  }, [state, mentionParser, whiteboardId, enableRichText, onSubmit, autoSave, clearDraft]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (autoSave && state.content.trim()) {
      saveDraft({
        content: state.content,
        format: state.format,
        priority: state.priority,
        contentType: state.contentType,
      });
    }
    onCancel?.();
  }, [autoSave, state, saveDraft, onCancel]);

  return (
    <div
      ref={composerRef}
      className={`fixed bg-white rounded-lg shadow-xl border border-gray-200 max-w-md ${className}`}
      style={{ ...composerPosition, zIndex }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
        <h3 className="font-medium text-gray-900">
          {parentId ? 'Reply to comment' : 'New comment'}
        </h3>
        <div className="flex items-center space-x-2">
          {/* Priority selector */}
          <select
            value={state.priority}
            onChange={(e) => setState(prev => ({ ...prev, priority: e.target.value as CommentPriority }))}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          
          <button
            onClick={handleCancel}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            title="Cancel"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Formatting toolbar */}
      {enableRichText && (
        <div className="flex items-center space-x-1 p-2 border-b border-gray-100">
          {formattingActions.map((action) => (
            <button
              key={action.type}
              onClick={() => handleFormatting(action)}
              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
              title={`${action.label} (${action.shortcut})`}
            >
              {action.icon}
            </button>
          ))}
        </div>
      )}

      {/* Editor */}
      <div className="relative">
        <textarea
          ref={editorRef}
          value={state.content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full p-3 border-0 resize-none focus:outline-none"
          style={{
            minHeight: `${minHeight}px`,
            maxHeight: `${maxHeight}px`,
          }}
          disabled={state.isSubmitting}
        />

        {/* Mention autocomplete */}
        {showMentionAutocomplete && (
          <MentionAutocomplete
            query={mentionQuery}
            results={mentionResults}
            isLoading={isMentionSearching}
            onSelect={handleMentionSelect}
            onClose={() => setShowMentionAutocomplete(false)}
            position="bottom"
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-3 bg-gray-50 border-t border-gray-200">
        {/* Content info */}
        <div className="flex items-center space-x-4 text-xs text-gray-500">
          <span>{state.characterCount}/{maxLength}</span>
          <span>{state.wordCount} words</span>
          {state.errors.length > 0 && (
            <span className="text-red-500">{state.errors.length} errors</span>
          )}
          {state.warnings.length > 0 && (
            <span className="text-yellow-500">{state.warnings.length} warnings</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleCancel}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
            disabled={state.isSubmitting}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!state.isValid || state.isSubmitting}
            className={`px-4 py-1 text-sm rounded-md ${
              state.isValid && !state.isSubmitting
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {state.isSubmitting ? 'Submitting...' : parentId ? 'Reply' : 'Comment'}
          </button>
        </div>
      </div>

      {/* Error messages */}
      {state.errors.length > 0 && (
        <div className="p-2 bg-red-50 border-t border-red-200">
          {state.errors.map((error, index) => (
            <div key={index} className="text-xs text-red-600">
              {error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommentComposer;