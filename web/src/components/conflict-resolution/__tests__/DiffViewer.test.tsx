/**
 * Tests for DiffViewer Component
 * 
 * Tests the Myers' diff algorithm implementation, conflict highlighting,
 * and interactive navigation features of the diff viewer.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock the UI components
jest.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: any) => <div data-testid="card" {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div data-testid="card-content" {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div data-testid="card-header" {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <h2 data-testid="card-title" {...props}>{children}</h2>
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  )
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: any) => <span data-testid="badge" {...props}>{children}</span>
}));

jest.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, ...props }: any) => <div data-testid="tabs" {...props}>{children}</div>,
  TabsContent: ({ children, ...props }: any) => <div data-testid="tabs-content" {...props}>{children}</div>,
  TabsList: ({ children, ...props }: any) => <div data-testid="tabs-list" {...props}>{children}</div>,
  TabsTrigger: ({ children, ...props }: any) => <button data-testid="tabs-trigger" {...props}>{children}</button>
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, ...props }: any) => <div data-testid="scroll-area" {...props}>{children}</div>
}));

// Mock Lucide icons
jest.mock('lucide-react', () => ({
  Eye: () => <span data-testid="eye-icon">👁</span>,
  EyeOff: () => <span data-testid="eye-off-icon">👁‍🗨</span>,
  GitBranch: () => <span data-testid="git-branch-icon">🌿</span>,
  AlertTriangle: () => <span data-testid="alert-triangle-icon">⚠</span>,
  ArrowRight: () => <span data-testid="arrow-right-icon">→</span>,
  ArrowLeft: () => <span data-testid="arrow-left-icon">←</span>,
  RotateCcw: () => <span data-testid="rotate-ccw-icon">↺</span>
}));

// Mock the diff library to ensure consistent behavior
jest.mock('diff', () => ({
  diffLines: jest.fn((oldText, newText) => {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const changes: any[] = [];
    
    // Simple mock diff implementation
    let oldIndex = 0;
    let newIndex = 0;
    
    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      if (oldIndex < oldLines.length && newIndex < newLines.length) {
        if (oldLines[oldIndex] === newLines[newIndex]) {
          changes.push({ value: oldLines[oldIndex] + '\n', added: false, removed: false });
          oldIndex++;
          newIndex++;
        } else {
          changes.push({ value: oldLines[oldIndex] + '\n', added: false, removed: true });
          changes.push({ value: newLines[newIndex] + '\n', added: true, removed: false });
          oldIndex++;
          newIndex++;
        }
      } else if (oldIndex < oldLines.length) {
        changes.push({ value: oldLines[oldIndex] + '\n', added: false, removed: true });
        oldIndex++;
      } else {
        changes.push({ value: newLines[newIndex] + '\n', added: true, removed: false });
        newIndex++;
      }
    }
    
    return changes;
  }),
  diffChars: jest.fn((oldText, newText) => [
    { value: newText, added: true, removed: false }
  ])
}));

import { DiffViewer } from '../DiffViewer';

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

describe('DiffViewer', () => {
  const baseContent = 'Line 1\nLine 2\nLine 3\nLine 4';
  
  const versionA: ContentVersion = {
    id: '1',
    content: 'Line 1\nModified Line 2\nLine 3\nLine 4',
    userId: 'user1',
    createdAt: '2023-01-01T00:00:00Z',
    contentType: 'text/plain'
  };

  const versionB: ContentVersion = {
    id: '2',
    content: 'Line 1\nLine 2\nInserted Line\nLine 3\nLine 4',
    userId: 'user2',
    createdAt: '2023-01-01T00:01:00Z',
    contentType: 'text/plain'
  };

  const conflictRegions: ConflictRegion[] = [
    {
      start: 7,
      end: 20,
      type: 'overlap',
      description: 'Concurrent modification of line 2'
    }
  ];

  it('renders diff viewer with side-by-side view by default', () => {
    render(
      <DiffViewer
        baseContent={baseContent}
        versionA={versionA}
        versionB={versionB}
        conflictRegions={conflictRegions}
      />
    );

    expect(screen.getByText('Content Differences')).toBeInTheDocument();
    expect(screen.getByText('Version A (User user1)')).toBeInTheDocument();
    expect(screen.getByText('Version B (User user2)')).toBeInTheDocument();
  });

  it('switches between unified and side-by-side view modes', () => {
    render(
      <DiffViewer
        baseContent={baseContent}
        versionA={versionA}
        versionB={versionB}
        conflictRegions={conflictRegions}
      />
    );

    const viewModeButton = screen.getByRole('button', { name: /unified/i });
    fireEvent.click(viewModeButton);

    expect(screen.getByText('Unified Diff View')).toBeInTheDocument();
    expect(screen.getByText('Showing changes from both versions')).toBeInTheDocument();
  });

  it('toggles whitespace visibility', () => {
    render(
      <DiffViewer
        baseContent={baseContent}
        versionA={versionA}
        versionB={versionB}
        conflictRegions={conflictRegions}
      />
    );

    const whitespaceButton = screen.getByRole('button', { name: /whitespace/i });
    fireEvent.click(whitespaceButton);

    // Whitespace should now be visible
    expect(whitespaceButton).toHaveTextContent('Whitespace');
  });

  it('displays conflict navigation when conflicts exist', () => {
    render(
      <DiffViewer
        baseContent={baseContent}
        versionA={versionA}
        versionB={versionB}
        conflictRegions={conflictRegions}
      />
    );

    expect(screen.getByText('Conflicts (1)')).toBeInTheDocument();
    expect(screen.getByText('1 of 1')).toBeInTheDocument();
    expect(screen.getByText('overlap conflict')).toBeInTheDocument();
    expect(screen.getByText('Concurrent modification of line 2')).toBeInTheDocument();
  });

  it('navigates through conflicts correctly', () => {
    const multipleConflicts: ConflictRegion[] = [
      ...conflictRegions,
      {
        start: 25,
        end: 35,
        type: 'semantic',
        description: 'Semantic conflict in line 4'
      }
    ];

    render(
      <DiffViewer
        baseContent={baseContent}
        versionA={versionA}
        versionB={versionB}
        conflictRegions={multipleConflicts}
      />
    );

    expect(screen.getByText('Conflicts (2)')).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();

    const nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);

    expect(screen.getByText('2 of 2')).toBeInTheDocument();
  });

  it('correctly identifies added lines using Myers algorithm', () => {
    const simpleBase = 'Line 1\nLine 2';
    const simpleVersion: ContentVersion = {
      id: '3',
      content: 'Line 1\nNew Line\nLine 2',
      userId: 'user3',
      createdAt: '2023-01-01T00:02:00Z',
      contentType: 'text/plain'
    };

    render(
      <DiffViewer
        baseContent={simpleBase}
        versionA={simpleVersion}
        versionB={versionA}
        conflictRegions={[]}
      />
    );

    // Should detect the insertion properly
    expect(screen.getByText('New Line')).toBeInTheDocument();
  });

  it('correctly identifies deleted lines using Myers algorithm', () => {
    const extendedBase = 'Line 1\nTo Delete\nLine 2\nLine 3';
    const deletedVersion: ContentVersion = {
      id: '4',
      content: 'Line 1\nLine 2\nLine 3',
      userId: 'user4',
      createdAt: '2023-01-01T00:03:00Z',
      contentType: 'text/plain'
    };

    render(
      <DiffViewer
        baseContent={extendedBase}
        versionA={deletedVersion}
        versionB={versionA}
        conflictRegions={[]}
      />
    );

    // Should detect the deletion properly
    expect(screen.getByText('To Delete')).toBeInTheDocument();
  });

  it('handles empty content gracefully', () => {
    const emptyVersion: ContentVersion = {
      id: '5',
      content: '',
      userId: 'user5',
      createdAt: '2023-01-01T00:04:00Z',
      contentType: 'text/plain'
    };

    render(
      <DiffViewer
        baseContent=""
        versionA={emptyVersion}
        versionB={emptyVersion}
        conflictRegions={[]}
      />
    );

    expect(screen.getByText('Content Differences')).toBeInTheDocument();
  });

  it('highlights conflict regions properly', () => {
    render(
      <DiffViewer
        baseContent={baseContent}
        versionA={versionA}
        versionB={versionB}
        conflictRegions={conflictRegions}
        highlightConflicts={true}
      />
    );

    // Should have conflict styling applied
    const conflictElements = document.querySelectorAll('.ring-2.ring-orange-200');
    expect(conflictElements.length).toBeGreaterThan(0);
  });

  it('displays line numbers when enabled', () => {
    render(
      <DiffViewer
        baseContent={baseContent}
        versionA={versionA}
        versionB={versionB}
        conflictRegions={conflictRegions}
        showLineNumbers={true}
      />
    );

    // Line numbers should be visible in the content
    expect(document.querySelector('.w-20')).toBeInTheDocument();
  });

  it('handles large content efficiently', () => {
    const largeContent = Array.from({ length: 1000 }, (_, i) => `Line ${i + 1}`).join('\n');
    const largeVersionA: ContentVersion = {
      id: '6',
      content: largeContent + '\nExtra line A',
      userId: 'user6',
      createdAt: '2023-01-01T00:05:00Z',
      contentType: 'text/plain'
    };

    const startTime = performance.now();
    
    render(
      <DiffViewer
        baseContent={largeContent}
        versionA={largeVersionA}
        versionB={versionA}
        conflictRegions={[]}
      />
    );

    const endTime = performance.now();
    const renderTime = endTime - startTime;

    // Should render within reasonable time (less than 1 second)
    expect(renderTime).toBeLessThan(1000);
    expect(screen.getByText('Content Differences')).toBeInTheDocument();
  });

  it('creates unified diff correctly', () => {
    render(
      <DiffViewer
        baseContent={baseContent}
        versionA={versionA}
        versionB={versionB}
        conflictRegions={conflictRegions}
      />
    );

    // Switch to unified view
    const viewModeButton = screen.getByRole('button', { name: /unified/i });
    fireEvent.click(viewModeButton);

    expect(screen.getByText('Unified Diff View')).toBeInTheDocument();
    expect(screen.getByText('Modified Line 2')).toBeInTheDocument();
    expect(screen.getByText('Inserted Line')).toBeInTheDocument();
  });
});