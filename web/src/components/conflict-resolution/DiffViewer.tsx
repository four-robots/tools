/**
 * Diff Viewer Component
 * 
 * Visual diff interface for comparing conflicting content versions with
 * syntax highlighting, conflict region marking, and interactive navigation.
 * Provides side-by-side and unified diff views with conflict-specific features.
 */

'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Eye, 
  EyeOff, 
  GitBranch, 
  AlertTriangle, 
  ArrowRight,
  ArrowLeft,
  RotateCcw
} from 'lucide-react';
import { diffLines, diffChars, Change } from 'diff';

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
  type: 'overlap' | 'adjacent' | 'dependent' | 'semantic';
  description: string;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'conflict';
  content: string;
  lineNumber?: number;
  originalLineNumber?: number;
  conflictRegion?: ConflictRegion;
}

interface DiffViewerProps {
  baseContent: string;
  versionA: ContentVersion;
  versionB: ContentVersion;
  conflictRegions: ConflictRegion[];
  showLineNumbers?: boolean;
  highlightConflicts?: boolean;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  baseContent,
  versionA,
  versionB,
  conflictRegions,
  showLineNumbers = true,
  highlightConflicts = true
}) => {
  const [viewMode, setViewMode] = useState<'unified' | 'side-by-side'>('side-by-side');
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [activeConflictIndex, setActiveConflictIndex] = useState(0);
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());

  // Calculate diff between base and each version
  const { diffA, diffB, unifiedDiff } = useMemo(() => {
    const diffA = calculateDiff(baseContent, versionA.content, conflictRegions);
    const diffB = calculateDiff(baseContent, versionB.content, conflictRegions);
    const unifiedDiff = createUnifiedDiff(diffA, diffB);
    
    return { diffA, diffB, unifiedDiff };
  }, [baseContent, versionA.content, versionB.content, conflictRegions]);

  // Calculate diff lines using Myers' algorithm with conflict highlighting
  // Added: Memory monitoring for large diffs
  function calculateDiff(base: string, target: string, conflicts: ConflictRegion[]): DiffLine[] {
    // Memory management: Check content size and warn for large diffs
    const totalSize = base.length + target.length;
    const totalLines = base.split('\n').length + target.split('\n').length;
    
    if (totalLines > 1000) {
      console.warn('Large diff detected, consider virtualization', { 
        totalLines, 
        totalSize, 
        baseLines: base.split('\n').length, 
        targetLines: target.split('\n').length 
      });
    }
    
    if (totalSize > 1024 * 1024) { // 1MB
      console.warn('Very large diff content detected', { 
        totalSize: `${Math.round(totalSize / 1024)}KB`,
        recommendation: 'Consider splitting content or using streaming diff'
      });
    }
    const diff: DiffLine[] = [];
    
    // Use Myers' algorithm for accurate diff calculation
    const changes: Change[] = diffLines(base, target);
    
    let baseLineNum = 1;
    let targetLineNum = 1;
    
    for (const change of changes) {
      const lines = change.value.split('\n');
      // Remove empty line at the end if it exists
      // Fixed: More robust empty line handling
      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }
      
      // Memory management: Skip processing if lines array is too large
      if (lines.length > 10000) {
        console.warn('Extremely large change detected, truncating for performance', {
          originalLines: lines.length,
          truncatedTo: 10000
        });
        lines.splice(10000); // Keep only first 10,000 lines
      }
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let diffLine: DiffLine;
        
        if (change.added) {
          // Safe conflict region lookup with error handling
          let conflictRegion: ConflictRegion | undefined;
          try {
            conflictRegion = findConflictForLine(targetLineNum, conflicts, target);
          } catch (error) {
            console.warn('Error finding conflict region for line', { 
              lineNumber: targetLineNum, 
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
          
          diffLine = {
            type: conflictRegion ? 'conflict' : 'added',
            content: line,
            lineNumber: targetLineNum,
            conflictRegion
          };
          targetLineNum++;
        } else if (change.removed) {
          // Safe conflict region lookup with error handling
          let conflictRegion: ConflictRegion | undefined;
          try {
            conflictRegion = findConflictForLine(baseLineNum, conflicts, base);
          } catch (error) {
            console.warn('Error finding conflict region for line', { 
              lineNumber: baseLineNum, 
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
          
          diffLine = {
            type: conflictRegion ? 'conflict' : 'removed',
            content: line,
            originalLineNumber: baseLineNum,
            conflictRegion
          };
          baseLineNum++;
        } else {
          // Unchanged line
          diffLine = {
            type: 'unchanged',
            content: line,
            lineNumber: targetLineNum,
            originalLineNumber: baseLineNum
          };
          baseLineNum++;
          targetLineNum++;
        }
        
        diff.push(diffLine);
      }
    }
    
    return diff;
  }

  // Find conflict region that contains a specific line
  // Fixed: Edge case where line numbers could cause off-by-one errors
  function findConflictForLine(lineNumber: number, conflicts: ConflictRegion[], content: string): ConflictRegion | undefined {
    // Input validation and boundary checks
    if (!conflicts.length || lineNumber < 1 || !content) {
      return undefined;
    }
    
    const lines = content.split('\n');
    let charPosition = 0;
    
    // Fixed: Use < instead of <= and proper boundary checking
    // Convert 1-based line number to 0-based index
    const targetLineIndex = lineNumber - 1;
    
    // Ensure we don't exceed array bounds
    if (targetLineIndex >= lines.length) {
      return undefined;
    }
    
    // Calculate character position up to the target line
    for (let i = 0; i < targetLineIndex && i < lines.length; i++) {
      charPosition += lines[i].length + 1; // +1 for newline character
    }
    
    // Find conflict region that contains this character position
    // Fixed: Use < instead of <= for end boundary to prevent overlap
    return conflicts.find(region => 
      charPosition >= region.start && charPosition < region.end
    );
  }

  // Create unified diff view combining both versions
  function createUnifiedDiff(diffA: DiffLine[], diffB: DiffLine[]): DiffLine[] {
    const unified: DiffLine[] = [];
    
    // Merge both diffs intelligently, showing context and changes
    const contextLines = 3; // Lines of context to show around changes
    const allLines = new Map<number, { a?: DiffLine, b?: DiffLine }>();
    
    // Group lines by original line numbers
    diffA.forEach(line => {
      const key = line.originalLineNumber || line.lineNumber || 0;
      if (!allLines.has(key)) allLines.set(key, {});
      allLines.get(key)!.a = line;
    });
    
    diffB.forEach(line => {
      const key = line.originalLineNumber || line.lineNumber || 0;
      if (!allLines.has(key)) allLines.set(key, {});
      allLines.get(key)!.b = line;
    });
    
    // Sort by line numbers
    const sortedKeys = Array.from(allLines.keys()).sort((a, b) => a - b);
    
    for (const key of sortedKeys) {
      const { a, b } = allLines.get(key)!;
      
      // Add unchanged lines that appear in both or are unchanged
      if (a && a.type === 'unchanged') {
        unified.push(a);
      } else {
        // Add removed lines from version A
        if (a && a.type !== 'unchanged') {
          unified.push({ ...a, type: a.type === 'conflict' ? 'conflict' : 'removed' });
        }
        // Add added lines from version B
        if (b && b.type !== 'unchanged') {
          unified.push({ ...b, type: b.type === 'conflict' ? 'conflict' : 'added' });
        }
      }
    }
    
    return unified;
  }

  // Navigate to specific conflict
  const navigateToConflict = (index: number) => {
    if (index >= 0 && index < conflictRegions.length) {
      setActiveConflictIndex(index);
      // Scroll to conflict region
      const conflictElement = document.getElementById(`conflict-${index}`);
      if (conflictElement) {
        conflictElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  // Toggle section collapse
  const toggleSectionCollapse = (sectionIndex: number) => {
    const newCollapsed = new Set(collapsedSections);
    if (newCollapsed.has(sectionIndex)) {
      newCollapsed.delete(sectionIndex);
    } else {
      newCollapsed.add(sectionIndex);
    }
    setCollapsedSections(newCollapsed);
  };

  // Render line with appropriate styling
  const renderLine = (line: DiffLine, index: number) => {
    const baseClasses = "font-mono text-sm leading-relaxed px-3 py-1 border-l-4";
    let lineClasses = baseClasses;
    let borderColor = "border-gray-200";
    let bgColor = "";
    
    switch (line.type) {
      case 'added':
        borderColor = "border-green-500";
        bgColor = "bg-green-50 hover:bg-green-100";
        break;
      case 'removed':
        borderColor = "border-red-500";
        bgColor = "bg-red-50 hover:bg-red-100";
        break;
      case 'conflict':
        borderColor = "border-orange-500";
        bgColor = "bg-orange-50 hover:bg-orange-100";
        break;
      default:
        bgColor = "hover:bg-gray-50";
    }
    
    lineClasses += ` ${borderColor} ${bgColor}`;
    
    if (line.conflictRegion && highlightConflicts) {
      lineClasses += " ring-2 ring-orange-200";
    }

    // Handle whitespace visualization
    let displayContent = line.content;
    if (showWhitespace) {
      displayContent = displayContent.replace(/ /g, '·').replace(/\t/g, '→');
    }

    return (
      <div
        key={index}
        className={lineClasses}
        id={line.conflictRegion ? `conflict-${conflictRegions.indexOf(line.conflictRegion)}` : undefined}
      >
        <div className="flex items-center">
          {showLineNumbers && (
            <div className="flex-shrink-0 w-20 text-xs text-gray-500 mr-3">
              <span className="inline-block w-8 text-right">
                {line.originalLineNumber || ''}
              </span>
              <span className="inline-block w-8 text-right ml-1">
                {line.lineNumber || ''}
              </span>
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            {line.type === 'added' && <span className="text-green-600 mr-2">+</span>}
            {line.type === 'removed' && <span className="text-red-600 mr-2">-</span>}
            {line.type === 'conflict' && <span className="text-orange-600 mr-2">!</span>}
            
            <span className={displayContent.trim() === '' ? 'bg-gray-200' : ''}>
              {displayContent || ' '}
            </span>
          </div>
          
          {line.conflictRegion && (
            <Badge variant="outline" className="ml-2 text-xs">
              {line.conflictRegion.type}
            </Badge>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <GitBranch className="w-5 h-5" />
              Content Differences
            </CardTitle>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowWhitespace(!showWhitespace)}
              >
                {showWhitespace ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                Whitespace
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode(viewMode === 'unified' ? 'side-by-side' : 'unified')}
              >
                {viewMode === 'unified' ? 'Side by Side' : 'Unified'}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Conflict Navigation */}
      {conflictRegions.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                Conflicts ({conflictRegions.length})
              </h4>
              
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateToConflict(activeConflictIndex - 1)}
                  disabled={activeConflictIndex === 0}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                
                <span className="text-sm text-gray-500 px-2">
                  {activeConflictIndex + 1} of {conflictRegions.length}
                </span>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateToConflict(activeConflictIndex + 1)}
                  disabled={activeConflictIndex === conflictRegions.length - 1}
                >
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div className="grid gap-2 max-h-32 overflow-y-auto">
              {conflictRegions.map((region, index) => (
                <div
                  key={index}
                  className={`p-2 rounded border cursor-pointer transition-colors ${
                    index === activeConflictIndex ? 'bg-orange-50 border-orange-200' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => navigateToConflict(index)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{region.type} conflict</span>
                    <Badge variant="secondary" className="text-xs">
                      {region.start}-{region.end}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{region.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Diff Content */}
      <Card>
        <CardContent className="p-0">
          {viewMode === 'side-by-side' ? (
            <div className="grid grid-cols-2 divide-x">
              {/* Version A */}
              <div>
                <div className="bg-gray-50 p-3 border-b">
                  <h4 className="text-sm font-semibold text-gray-700">
                    Version A (User {versionA.userId})
                  </h4>
                  <p className="text-xs text-gray-500">
                    {new Date(versionA.createdAt).toLocaleString()}
                  </p>
                </div>
                <ScrollArea className="h-96">
                  <div>
                    {diffA.map((line, index) => renderLine(line, index))}
                  </div>
                </ScrollArea>
              </div>

              {/* Version B */}
              <div>
                <div className="bg-gray-50 p-3 border-b">
                  <h4 className="text-sm font-semibold text-gray-700">
                    Version B (User {versionB.userId})
                  </h4>
                  <p className="text-xs text-gray-500">
                    {new Date(versionB.createdAt).toLocaleString()}
                  </p>
                </div>
                <ScrollArea className="h-96">
                  <div>
                    {diffB.map((line, index) => renderLine(line, index))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          ) : (
            /* Unified View */
            <div>
              <div className="bg-gray-50 p-3 border-b">
                <h4 className="text-sm font-semibold text-gray-700">
                  Unified Diff View
                </h4>
                <p className="text-xs text-gray-500">
                  Showing changes from both versions
                </p>
              </div>
              <ScrollArea className="h-96">
                <div>
                  {unifiedDiff.map((line, index) => renderLine(line, index))}
                </div>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className="pt-4">
          <h4 className="text-sm font-semibold mb-3">Legend</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-100 border-l-4 border-green-500 rounded"></div>
              <span>Added</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-100 border-l-4 border-red-500 rounded"></div>
              <span>Removed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-orange-100 border-l-4 border-orange-500 rounded"></div>
              <span>Conflict</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-50 border-l-4 border-gray-200 rounded"></div>
              <span>Unchanged</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};