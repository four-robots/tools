/**
 * SearchAnnotations Component
 * 
 * Manages collaborative annotations on search results including highlights,
 * notes, bookmarks, and flags with real-time synchronization.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  MessageSquare,
  Highlight,
  Bookmark,
  Flag,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  AlertCircle,
  User,
  Clock,
  Filter,
  Search
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Badge } from '../../ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '../../ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { toast } from '../../ui/toast';
import styles from './SearchAnnotations.module.css';

export interface SearchAnnotation {
  id: string;
  search_session_id: string;
  user_id: string;
  result_id: string;
  result_type: string;
  result_url?: string;
  annotation_type: 'highlight' | 'note' | 'bookmark' | 'flag' | 'question' | 'suggestion';
  annotation_text?: string;
  annotation_data: Record<string, any>;
  text_selection: Record<string, any>;
  selected_text?: string;
  is_shared: boolean;
  is_resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
  parent_annotation_id?: string;
  mentions: string[];
  // User info (would be populated from user service)
  user_name?: string;
  user_email?: string;
  user_avatar?: string;
}

export interface SearchResult {
  id: string;
  title: string;
  type: string;
  url?: string;
  preview?: {
    text: string;
    highlights?: Array<{
      start: number;
      end: number;
      match: string;
    }>;
  };
}

export interface SearchAnnotationsProps {
  annotations: SearchAnnotation[];
  searchResults: SearchResult[];
  onCreateAnnotation?: (annotation: Partial<SearchAnnotation>) => Promise<SearchAnnotation>;
  onUpdateAnnotation?: (id: string, updates: Partial<SearchAnnotation>) => Promise<SearchAnnotation>;
  onDeleteAnnotation?: (id: string) => Promise<void>;
  readOnly?: boolean;
  className?: string;
}

export function SearchAnnotations({
  annotations,
  searchResults,
  onCreateAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  readOnly = false,
  className = ''
}: SearchAnnotationsProps) {

  // ========================================================================
  // State Management
  // ========================================================================

  const [selectedResult, setSelectedResult] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [isCreating, setIsCreating] = useState(false);
  const [editingAnnotation, setEditingAnnotation] = useState<SearchAnnotation | null>(null);
  const [newAnnotation, setNewAnnotation] = useState({
    type: 'note' as SearchAnnotation['annotation_type'],
    text: '',
    resultId: '',
    isShared: true
  });

  // ========================================================================
  // Filtering and Grouping
  // ========================================================================

  const filteredAnnotations = useMemo(() => {
    let filtered = annotations;

    // Filter by result
    if (selectedResult !== 'all') {
      filtered = filtered.filter(a => a.result_id === selectedResult);
    }

    // Filter by type
    if (selectedType !== 'all') {
      filtered = filtered.filter(a => a.annotation_type === selectedType);
    }

    // Sort by creation date (newest first)
    return filtered.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [annotations, selectedResult, selectedType]);

  const groupedAnnotations = useMemo(() => {
    const groups: Record<string, SearchAnnotation[]> = {};
    
    filteredAnnotations.forEach(annotation => {
      const resultId = annotation.result_id;
      if (!groups[resultId]) {
        groups[resultId] = [];
      }
      groups[resultId].push(annotation);
    });

    return groups;
  }, [filteredAnnotations]);

  const annotationCounts = useMemo(() => {
    const counts = {
      all: annotations.length,
      highlight: 0,
      note: 0,
      bookmark: 0,
      flag: 0,
      question: 0,
      suggestion: 0
    };

    annotations.forEach(a => {
      counts[a.annotation_type]++;
    });

    return counts;
  }, [annotations]);

  // ========================================================================
  // Helper Functions
  // ========================================================================

  const getAnnotationIcon = (type: SearchAnnotation['annotation_type']) => {
    switch (type) {
      case 'highlight':
        return <Highlight size={14} />;
      case 'note':
        return <MessageSquare size={14} />;
      case 'bookmark':
        return <Bookmark size={14} />;
      case 'flag':
        return <Flag size={14} />;
      case 'question':
        return <AlertCircle size={14} />;
      case 'suggestion':
        return <CheckCircle size={14} />;
      default:
        return <MessageSquare size={14} />;
    }
  };

  const getAnnotationColor = (type: SearchAnnotation['annotation_type']) => {
    switch (type) {
      case 'highlight':
        return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      case 'note':
        return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'bookmark':
        return 'bg-green-100 border-green-300 text-green-800';
      case 'flag':
        return 'bg-red-100 border-red-300 text-red-800';
      case 'question':
        return 'bg-purple-100 border-purple-300 text-purple-800';
      case 'suggestion':
        return 'bg-indigo-100 border-indigo-300 text-indigo-800';
      default:
        return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  };

  const getUserInitials = (name?: string, email?: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const timeDiff = now.getTime() - date.getTime();
    const minutesAgo = Math.floor(timeDiff / (1000 * 60));
    
    if (minutesAgo < 1) return 'just now';
    if (minutesAgo < 60) return `${minutesAgo}m ago`;
    
    const hoursAgo = Math.floor(minutesAgo / 60);
    if (hoursAgo < 24) return `${hoursAgo}h ago`;
    
    return date.toLocaleDateString();
  };

  const getResultTitle = (resultId: string) => {
    const result = searchResults.find(r => r.id === resultId);
    return result?.title || `Result ${resultId.slice(0, 8)}...`;
  };

  // ========================================================================
  // Event Handlers
  // ========================================================================

  const handleCreateAnnotation = useCallback(async () => {
    if (!newAnnotation.text.trim() || !newAnnotation.resultId) return;

    try {
      const annotation = await onCreateAnnotation?.({
        result_id: newAnnotation.resultId,
        result_type: 'search_result',
        annotation_type: newAnnotation.type,
        annotation_text: newAnnotation.text,
        is_shared: newAnnotation.isShared,
        annotation_data: {},
        text_selection: {},
        mentions: []
      });

      if (annotation) {
        setNewAnnotation({ type: 'note', text: '', resultId: '', isShared: true });
        setIsCreating(false);
        
        toast({
          title: 'Annotation created',
          description: 'Your annotation has been added to the search session',
        });
      }
    } catch (error) {
      toast({
        title: 'Failed to create annotation',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive'
      });
    }
  }, [newAnnotation, onCreateAnnotation]);

  const handleUpdateAnnotation = useCallback(async (id: string, updates: Partial<SearchAnnotation>) => {
    try {
      await onUpdateAnnotation?.(id, updates);
      setEditingAnnotation(null);
      
      toast({
        title: 'Annotation updated',
        description: 'Your changes have been saved',
      });
    } catch (error) {
      toast({
        title: 'Failed to update annotation',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive'
      });
    }
  }, [onUpdateAnnotation]);

  const handleDeleteAnnotation = useCallback(async (id: string) => {
    if (!confirm('Are you sure you want to delete this annotation?')) return;

    try {
      await onDeleteAnnotation?.(id);
      
      toast({
        title: 'Annotation deleted',
        description: 'The annotation has been removed',
      });
    } catch (error) {
      toast({
        title: 'Failed to delete annotation',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive'
      });
    }
  }, [onDeleteAnnotation]);

  const handleResolveAnnotation = useCallback(async (annotation: SearchAnnotation) => {
    await handleUpdateAnnotation(annotation.id, {
      is_resolved: !annotation.is_resolved,
      resolved_at: annotation.is_resolved ? undefined : new Date().toISOString()
    });
  }, [handleUpdateAnnotation]);

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <div className={`${styles.annotationsContainer} ${className}`}>
      {/* Header */}
      <div className={styles.annotationsHeader}>
        <div className={styles.headerTitle}>
          <MessageSquare size={16} />
          <span>Annotations ({annotations.length})</span>
        </div>
        
        {!readOnly && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCreating(true)}
            className={styles.addButton}
          >
            <Plus size={14} />
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className={styles.filtersSection}>
        <Select value={selectedResult} onValueChange={setSelectedResult}>
          <SelectTrigger className={styles.filterSelect}>
            <SelectValue placeholder="Filter by result" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Results</SelectItem>
            {searchResults.map(result => (
              <SelectItem key={result.id} value={result.id}>
                {result.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className={styles.filterSelect}>
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types ({annotationCounts.all})</SelectItem>
            <SelectItem value="note">Notes ({annotationCounts.note})</SelectItem>
            <SelectItem value="highlight">Highlights ({annotationCounts.highlight})</SelectItem>
            <SelectItem value="bookmark">Bookmarks ({annotationCounts.bookmark})</SelectItem>
            <SelectItem value="flag">Flags ({annotationCounts.flag})</SelectItem>
            <SelectItem value="question">Questions ({annotationCounts.question})</SelectItem>
            <SelectItem value="suggestion">Suggestions ({annotationCounts.suggestion})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Annotations List */}
      <div className={styles.annotationsList}>
        {Object.entries(groupedAnnotations).map(([resultId, resultAnnotations]) => (
          <div key={resultId} className={styles.resultGroup}>
            {/* Result Header */}
            <div className={styles.resultHeader}>
              <Search size={12} />
              <span className={styles.resultTitle}>{getResultTitle(resultId)}</span>
              <Badge variant="secondary" className={styles.countBadge}>
                {resultAnnotations.length}
              </Badge>
            </div>

            {/* Annotations for this result */}
            <div className={styles.resultAnnotations}>
              {resultAnnotations.map(annotation => (
                <div
                  key={annotation.id}
                  className={`${styles.annotationCard} ${annotation.is_resolved ? styles.resolved : ''}`}
                >
                  {/* Annotation Header */}
                  <div className={styles.annotationHeader}>
                    <div className={styles.annotationMeta}>
                      <div className={styles.userInfo}>
                        <Avatar className={styles.userAvatar}>
                          <AvatarImage 
                            src={annotation.user_avatar} 
                            alt={annotation.user_name || annotation.user_email} 
                          />
                          <AvatarFallback>
                            {getUserInitials(annotation.user_name, annotation.user_email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className={styles.userName}>
                          {annotation.user_name || annotation.user_email || 'Anonymous'}
                        </span>
                      </div>

                      <div className={styles.annotationInfo}>
                        <Badge 
                          className={`${styles.typeBadge} ${getAnnotationColor(annotation.annotation_type)}`}
                        >
                          {getAnnotationIcon(annotation.annotation_type)}
                          {annotation.annotation_type}
                        </Badge>
                        
                        <span className={styles.timestamp}>
                          <Clock size={10} />
                          {formatDate(annotation.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    {!readOnly && (
                      <div className={styles.annotationActions}>
                        {annotation.annotation_type === 'flag' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResolveAnnotation(annotation)}
                            title={annotation.is_resolved ? 'Mark as unresolved' : 'Mark as resolved'}
                          >
                            <CheckCircle size={12} />
                          </Button>
                        )}
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingAnnotation(annotation)}
                        >
                          <Edit2 size={12} />
                        </Button>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteAnnotation(annotation.id)}
                          className={styles.deleteButton}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Annotation Content */}
                  <div className={styles.annotationContent}>
                    {annotation.selected_text && (
                      <div className={styles.selectedText}>
                        <Highlight size={12} />
                        <em>"{annotation.selected_text}"</em>
                      </div>
                    )}
                    
                    {annotation.annotation_text && (
                      <div className={styles.annotationText}>
                        {annotation.annotation_text}
                      </div>
                    )}

                    {annotation.is_resolved && (
                      <div className={styles.resolvedBadge}>
                        <CheckCircle size={12} />
                        Resolved
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredAnnotations.length === 0 && (
        <div className={styles.emptyState}>
          <MessageSquare size={32} className={styles.emptyIcon} />
          <p>No annotations yet</p>
          {!readOnly && (
            <Button onClick={() => setIsCreating(true)} size="sm" variant="outline">
              <Plus size={14} className="mr-2" />
              Add First Annotation
            </Button>
          )}
        </div>
      )}

      {/* Create Annotation Dialog */}
      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Annotation</DialogTitle>
            <DialogDescription>
              Add a note, highlight, bookmark, or flag to share with other participants
            </DialogDescription>
          </DialogHeader>

          <div className={styles.createForm}>
            <div className={styles.formRow}>
              <label>Type</label>
              <Select
                value={newAnnotation.type}
                onValueChange={(value) => 
                  setNewAnnotation(prev => ({ ...prev, type: value as any }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="highlight">Highlight</SelectItem>
                  <SelectItem value="bookmark">Bookmark</SelectItem>
                  <SelectItem value="flag">Flag Issue</SelectItem>
                  <SelectItem value="question">Question</SelectItem>
                  <SelectItem value="suggestion">Suggestion</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className={styles.formRow}>
              <label>Search Result</label>
              <Select
                value={newAnnotation.resultId}
                onValueChange={(value) => 
                  setNewAnnotation(prev => ({ ...prev, resultId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a result to annotate" />
                </SelectTrigger>
                <SelectContent>
                  {searchResults.map(result => (
                    <SelectItem key={result.id} value={result.id}>
                      {result.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className={styles.formRow}>
              <label>Annotation</label>
              <Textarea
                value={newAnnotation.text}
                onChange={(e) => 
                  setNewAnnotation(prev => ({ ...prev, text: e.target.value }))
                }
                placeholder="Enter your annotation..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreating(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateAnnotation}>
              Add Annotation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Annotation Dialog */}
      <Dialog 
        open={editingAnnotation !== null} 
        onOpenChange={(open) => !open && setEditingAnnotation(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Annotation</DialogTitle>
            <DialogDescription>
              Update your annotation
            </DialogDescription>
          </DialogHeader>

          {editingAnnotation && (
            <div className={styles.createForm}>
              <div className={styles.formRow}>
                <label>Annotation</label>
                <Textarea
                  value={editingAnnotation.annotation_text || ''}
                  onChange={(e) => 
                    setEditingAnnotation(prev => prev ? {
                      ...prev,
                      annotation_text: e.target.value
                    } : null)
                  }
                  placeholder="Enter your annotation..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAnnotation(null)}>
              Cancel
            </Button>
            <Button onClick={() => editingAnnotation && handleUpdateAnnotation(editingAnnotation.id, {
              annotation_text: editingAnnotation.annotation_text
            })}>
              Update Annotation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}