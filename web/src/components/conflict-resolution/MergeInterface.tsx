/**
 * Merge Interface Component
 * 
 * Interactive interface for manual conflict resolution with drag-and-drop
 * merge capabilities, strategy selection, and real-time preview.
 * Supports multiple merge strategies with visual feedback and validation.
 */

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Merge,
  ArrowDown,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Wand2,
  Copy,
  Undo2,
  Eye,
  Save
} from 'lucide-react';

interface ConflictDetection {
  id: string;
  conflictType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  baseVersion: ContentVersion;
  versionA: ContentVersion;
  versionB: ContentVersion;
  conflictRegions: ConflictRegion[];
}

interface ContentVersion {
  id: string;
  content: string;
  userId: string;
  createdAt: string;
  contentType: string;
}

interface ConflictRegion {
  start: number;
  end: number;
  type: string;
  description: string;
}

interface MergeStrategy {
  id: string;
  name: string;
  description: string;
  confidence: number;
  automated: boolean;
}

interface MergeSection {
  id: string;
  type: 'unchanged' | 'conflict' | 'addition' | 'deletion';
  baseContent: string;
  versionAContent: string;
  versionBContent: string;
  selectedSource: 'base' | 'versionA' | 'versionB' | 'custom' | 'none';
  customContent?: string;
  conflictRegion?: ConflictRegion;
}

interface MergeInterfaceProps {
  conflict: ConflictDetection;
  onStrategySelect: (strategy: string) => void;
  onMergePropose: (strategy: string, content: string, rationale: string) => Promise<string | undefined>;
  disabled?: boolean;
}

export const MergeInterface: React.FC<MergeInterfaceProps> = ({
  conflict,
  onStrategySelect,
  onMergePropose,
  disabled = false
}) => {
  const [selectedStrategy, setSelectedStrategy] = useState<string>('manual_resolution');
  const [mergeSections, setMergeSections] = useState<MergeSection[]>([]);
  const [mergedContent, setMergedContent] = useState<string>('');
  const [rationale, setRationale] = useState<string>('');
  const [isProposing, setIsProposing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Available merge strategies
  const availableStrategies: MergeStrategy[] = [
    {
      id: 'manual_resolution',
      name: 'Manual Resolution',
      description: 'Manually select and combine content from different versions',
      confidence: 0.0,
      automated: false
    },
    {
      id: 'three_way_merge',
      name: 'Three-Way Merge',
      description: 'Automatically merge non-conflicting changes from both versions',
      confidence: 0.75,
      automated: true
    },
    {
      id: 'last_writer_wins',
      name: 'Last Writer Wins',
      description: 'Accept the most recently modified version',
      confidence: 0.6,
      automated: true
    },
    {
      id: 'user_priority_based',
      name: 'User Priority',
      description: 'Choose version from higher-priority user',
      confidence: 0.8,
      automated: true
    }
  ];

  // Initialize merge sections when conflict changes
  React.useEffect(() => {
    if (conflict) {
      initializeMergeSections();
    }
  }, [conflict]);

  // Update merged content when sections change
  React.useEffect(() => {
    updateMergedContent();
  }, [mergeSections]);

  // Initialize merge sections based on conflict analysis
  const initializeMergeSections = useCallback(() => {
    const sections: MergeSection[] = [];
    const baseLines = conflict.baseVersion.content.split('\n');
    const aLines = conflict.versionA.content.split('\n');
    const bLines = conflict.versionB.content.split('\n');
    
    const maxLength = Math.max(baseLines.length, aLines.length, bLines.length);
    let currentCharPosition = 0;
    
    for (let i = 0; i < maxLength; i++) {
      const baseLine = baseLines[i] || '';
      const aLine = aLines[i] || '';
      const bLine = bLines[i] || '';
      
      // Find conflict region for this line
      const conflictRegion = conflict.conflictRegions.find(region => 
        currentCharPosition >= region.start && currentCharPosition <= region.end
      );
      
      let sectionType: MergeSection['type'] = 'unchanged';
      let selectedSource: MergeSection['selectedSource'] = 'base';
      
      if (conflictRegion) {
        sectionType = 'conflict';
        selectedSource = 'none';
      } else if (baseLine !== aLine || baseLine !== bLine) {
        if (aLine === bLine) {
          sectionType = 'unchanged';
          selectedSource = 'versionA';
        } else if (baseLine === aLine) {
          sectionType = 'addition';
          selectedSource = 'versionB';
        } else if (baseLine === bLine) {
          sectionType = 'addition';
          selectedSource = 'versionA';
        } else {
          sectionType = 'conflict';
          selectedSource = 'none';
        }
      }
      
      sections.push({
        id: `section-${i}`,
        type: sectionType,
        baseContent: baseLine,
        versionAContent: aLine,
        versionBContent: bLine,
        selectedSource,
        conflictRegion
      });
      
      currentCharPosition += baseLine.length + 1; // +1 for newline
    }
    
    setMergeSections(sections);
  }, [conflict]);

  // Update merged content from selected sections
  const updateMergedContent = useCallback(() => {
    const content = mergeSections.map(section => {
      switch (section.selectedSource) {
        case 'base':
          return section.baseContent;
        case 'versionA':
          return section.versionAContent;
        case 'versionB':
          return section.versionBContent;
        case 'custom':
          return section.customContent || '';
        default:
          return ''; // Unresolved conflict
      }
    }).join('\n');
    
    setMergedContent(content);
    validateMergeResult(content);
  }, [mergeSections]);

  // Validate merge result
  const validateMergeResult = useCallback((content: string) => {
    const errors: string[] = [];
    
    // Check for unresolved conflicts
    const unresolvedSections = mergeSections.filter(s => s.selectedSource === 'none');
    if (unresolvedSections.length > 0) {
      errors.push(`${unresolvedSections.length} conflict(s) remain unresolved`);
    }
    
    // Check content completeness
    if (content.trim().length === 0) {
      errors.push('Merged content cannot be empty');
    }
    
    // Check for syntax issues based on content type
    if (conflict.baseVersion.contentType === 'search_query') {
      if (!content.trim()) {
        errors.push('Search query cannot be empty');
      }
    }
    
    setValidationErrors(errors);
  }, [mergeSections, conflict.baseVersion.contentType]);

  // Handle section selection change
  const handleSectionChange = (sectionId: string, source: MergeSection['selectedSource'], customContent?: string) => {
    setMergeSections(prev => prev.map(section => 
      section.id === sectionId 
        ? { ...section, selectedSource: source, customContent }
        : section
    ));
  };

  // Handle strategy change
  const handleStrategyChange = (strategyId: string) => {
    setSelectedStrategy(strategyId);
    onStrategySelect(strategyId);
    
    // For automated strategies, auto-resolve conflicts
    const strategy = availableStrategies.find(s => s.id === strategyId);
    if (strategy?.automated) {
      applyAutomatedStrategy(strategyId);
    }
  };

  // Apply automated merge strategy
  const applyAutomatedStrategy = (strategyId: string) => {
    setMergeSections(prev => prev.map(section => {
      if (section.type !== 'conflict') return section;
      
      let selectedSource: MergeSection['selectedSource'] = 'base';
      
      switch (strategyId) {
        case 'last_writer_wins':
          // Choose the version with the latest timestamp
          selectedSource = new Date(conflict.versionA.createdAt) > new Date(conflict.versionB.createdAt) 
            ? 'versionA' : 'versionB';
          break;
          
        case 'three_way_merge':
          // Attempt to merge non-conflicting changes
          if (section.baseContent === section.versionAContent) {
            selectedSource = 'versionB';
          } else if (section.baseContent === section.versionBContent) {
            selectedSource = 'versionA';
          } else if (section.versionAContent === section.versionBContent) {
            selectedSource = 'versionA';
          } else {
            selectedSource = 'none'; // Still conflicting
          }
          break;
          
        case 'user_priority_based':
          // For now, default to version A (could be enhanced with actual user priority)
          selectedSource = 'versionA';
          break;
      }
      
      return { ...section, selectedSource };
    }));
  };

  // Accept entire version
  const acceptVersion = (version: 'base' | 'versionA' | 'versionB') => {
    setMergeSections(prev => prev.map(section => ({
      ...section,
      selectedSource: version
    })));
  };

  // Propose the merge solution
  const handleProposeMerge = async () => {
    if (validationErrors.length > 0) {
      return;
    }
    
    setIsProposing(true);
    try {
      const strategy = availableStrategies.find(s => s.id === selectedStrategy);
      const defaultRationale = strategy ? 
        `Applied ${strategy.name}: ${strategy.description}` : 
        'Manual resolution with selective content merging';
      
      const finalRationale = rationale.trim() || defaultRationale;
      
      await onMergePropose(selectedStrategy, mergedContent, finalRationale);
      
      // Reset form
      setRationale('');
    } catch (error) {
      console.error('Failed to propose merge:', error);
    } finally {
      setIsProposing(false);
    }
  };

  // Render merge section
  const renderMergeSection = (section: MergeSection, index: number) => {
    const isConflict = section.type === 'conflict';
    const hasChanges = section.baseContent !== section.versionAContent || 
                      section.baseContent !== section.versionBContent;
    
    if (!hasChanges && !isConflict) {
      return null; // Skip unchanged sections in compact view
    }

    return (
      <Card key={section.id} className={`${isConflict ? 'border-orange-200' : ''}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Line {index + 1}</span>
              {isConflict && (
                <Badge variant="destructive" className="text-xs">
                  Conflict
                </Badge>
              )}
              {section.conflictRegion && (
                <Badge variant="outline" className="text-xs">
                  {section.conflictRegion.type}
                </Badge>
              )}
            </div>
            
            {isConflict && (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSectionChange(section.id, 'versionA')}
                  className={section.selectedSource === 'versionA' ? 'bg-green-50' : ''}
                >
                  Use A
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSectionChange(section.id, 'versionB')}
                  className={section.selectedSource === 'versionB' ? 'bg-green-50' : ''}
                >
                  Use B
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSectionChange(section.id, 'custom', '')}
                  className={section.selectedSource === 'custom' ? 'bg-blue-50' : ''}
                >
                  Custom
                </Button>
              </div>
            )}
          </div>
          
          {section.conflictRegion && (
            <p className="text-xs text-gray-600">{section.conflictRegion.description}</p>
          )}
        </CardHeader>
        
        <CardContent className="space-y-3">
          <div className="grid gap-3">
            {/* Base Version */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">Base</Badge>
                <span className="text-xs text-gray-500">Original content</span>
              </div>
              <div className="font-mono text-sm p-2 bg-gray-50 rounded border">
                {section.baseContent || <span className="text-gray-400">Empty line</span>}
              </div>
            </div>
            
            {/* Version A */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Version A</Badge>
                <span className="text-xs text-gray-500">User {conflict.versionA.userId}</span>
                {section.selectedSource === 'versionA' && <CheckCircle className="w-3 h-3 text-green-600" />}
              </div>
              <div className="font-mono text-sm p-2 bg-blue-50 rounded border">
                {section.versionAContent || <span className="text-gray-400">Empty line</span>}
              </div>
            </div>
            
            {/* Version B */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Version B</Badge>
                <span className="text-xs text-gray-500">User {conflict.versionB.userId}</span>
                {section.selectedSource === 'versionB' && <CheckCircle className="w-3 h-3 text-green-600" />}
              </div>
              <div className="font-mono text-sm p-2 bg-green-50 rounded border">
                {section.versionBContent || <span className="text-gray-400">Empty line</span>}
              </div>
            </div>
            
            {/* Custom Content */}
            {section.selectedSource === 'custom' && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Custom</Badge>
                  <span className="text-xs text-gray-500">Your content</span>
                </div>
                <Textarea
                  value={section.customContent || ''}
                  onChange={(e) => handleSectionChange(section.id, 'custom', e.target.value)}
                  placeholder="Enter custom content..."
                  className="font-mono text-sm"
                  rows={2}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const conflictCount = mergeSections.filter(s => s.type === 'conflict').length;
  const unresolvedCount = mergeSections.filter(s => s.selectedSource === 'none').length;

  return (
    <div className="space-y-4">
      {/* Strategy Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Merge className="w-5 h-5" />
            Merge Strategy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedStrategy} onValueChange={handleStrategyChange} disabled={disabled}>
            <SelectTrigger>
              <SelectValue placeholder="Select merge strategy" />
            </SelectTrigger>
            <SelectContent>
              {availableStrategies.map((strategy) => (
                <SelectItem key={strategy.id} value={strategy.id}>
                  <div className="flex items-center justify-between w-full">
                    <div>
                      <div className="font-medium">{strategy.name}</div>
                      <div className="text-sm text-gray-500">{strategy.description}</div>
                    </div>
                    {strategy.automated && (
                      <Badge variant="secondary" className="ml-2">
                        <Wand2 className="w-3 h-3 mr-1" />
                        Auto
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Quick Actions */}
          {selectedStrategy === 'manual_resolution' && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => acceptVersion('versionA')}
                disabled={disabled}
              >
                Accept All A
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => acceptVersion('versionB')}
                disabled={disabled}
              >
                Accept All B
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => acceptVersion('base')}
                disabled={disabled}
              >
                Revert to Base
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conflict Summary */}
      {conflictCount > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {conflictCount} conflicts detected. {unresolvedCount > 0 ? `${unresolvedCount} still need resolution.` : 'All conflicts resolved!'}
          </AlertDescription>
        </Alert>
      )}

      {/* Merge Sections */}
      {selectedStrategy === 'manual_resolution' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Merge Content</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
            >
              <Eye className="w-4 h-4 mr-2" />
              {showPreview ? 'Hide' : 'Show'} Preview
            </Button>
          </div>

          <ScrollArea className="h-96">
            <div className="space-y-4">
              {mergeSections.map((section, index) => renderMergeSection(section, index))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Merge Preview */}
      {showPreview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Merge Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-sm p-4 bg-gray-50 rounded border max-h-40 overflow-y-auto">
              <pre>{mergedContent}</pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside">
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Rationale */}
      <Card>
        <CardHeader>
          <CardTitle>Rationale</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Explain your merge decisions and reasoning..."
            rows={3}
            disabled={disabled}
          />
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex items-center justify-end gap-2">
        <Button
          onClick={handleProposeMerge}
          disabled={disabled || isProposing || validationErrors.length > 0}
          className="flex items-center gap-2"
        >
          {isProposing ? (
            <>Proposing...</>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Propose Solution
            </>
          )}
        </Button>
      </div>
    </div>
  );
};