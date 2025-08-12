/**
 * SelectionHighlightTest Component
 * 
 * Test component for validating multi-user selection highlighting functionality.
 * This component simulates multiple users and selection conflicts for testing purposes.
 */

'use client';

import React, { useState, useCallback, useRef } from 'react';
import { SelectionManager } from '../SelectionManager';
import { SelectionHighlightData, SelectionConflictData, SelectionOwnership } from '../SelectionHighlight';
import { SelectionState } from '../SelectionManager';

// Mock data for testing
const mockUsers = [
  { id: 'user-1', name: 'Alice Johnson', color: '#FF6B6B' },
  { id: 'user-2', name: 'Bob Smith', color: '#4ECDC4' },
  { id: 'user-3', name: 'Carol Davis', color: '#45B7D1' },
  { id: 'user-4', name: 'David Wilson', color: '#96CEB4' },
];

const mockElements = [
  { id: 'element-1', bounds: { x: 100, y: 100, width: 150, height: 100 } },
  { id: 'element-2', bounds: { x: 300, y: 150, width: 200, height: 80 } },
  { id: 'element-3', bounds: { x: 200, y: 300, width: 120, height: 120 } },
  { id: 'element-4', bounds: { x: 400, y: 400, width: 180, height: 60 } },
  { id: 'element-5', bounds: { x: 150, y: 500, width: 100, height: 200 } },
];

interface TestScenario {
  name: string;
  description: string;
  selections: SelectionState[];
  conflicts: SelectionConflictData[];
  ownerships: SelectionOwnership[];
}

const testScenarios: TestScenario[] = [
  {
    name: 'Basic Multi-User Selection',
    description: 'Multiple users selecting different elements without conflicts',
    selections: [
      {
        userId: 'user-1',
        userName: 'Alice Johnson',
        userColor: '#FF6B6B',
        whiteboardId: 'test-whiteboard',
        sessionId: 'session-1',
        elementIds: ['element-1'],
        timestamp: Date.now(),
        isMultiSelect: false,
        priority: 100,
        isActive: true,
        lastSeen: Date.now(),
      },
      {
        userId: 'user-2',
        userName: 'Bob Smith',
        userColor: '#4ECDC4',
        whiteboardId: 'test-whiteboard',
        sessionId: 'session-2',
        elementIds: ['element-2', 'element-3'],
        timestamp: Date.now() - 1000,
        isMultiSelect: true,
        priority: 90,
        isActive: true,
        lastSeen: Date.now() - 500,
      },
    ],
    conflicts: [],
    ownerships: [],
  },
  {
    name: 'Selection Conflicts',
    description: 'Multiple users selecting the same element with conflict resolution',
    selections: [
      {
        userId: 'user-1',
        userName: 'Alice Johnson',
        userColor: '#FF6B6B',
        whiteboardId: 'test-whiteboard',
        sessionId: 'session-1',
        elementIds: ['element-2'],
        timestamp: Date.now(),
        isMultiSelect: false,
        priority: 100,
        isActive: true,
        lastSeen: Date.now(),
      },
      {
        userId: 'user-2',
        userName: 'Bob Smith',
        userColor: '#4ECDC4',
        whiteboardId: 'test-whiteboard',
        sessionId: 'session-2',
        elementIds: ['element-2'],
        timestamp: Date.now() - 500,
        isMultiSelect: false,
        priority: 90,
        isActive: true,
        lastSeen: Date.now() - 200,
      },
    ],
    conflicts: [
      {
        conflictId: 'conflict-1',
        elementId: 'element-2',
        conflictingUsers: [
          {
            userId: 'user-1',
            userName: 'Alice Johnson',
            priority: 100,
            timestamp: Date.now(),
          },
          {
            userId: 'user-2',
            userName: 'Bob Smith',
            priority: 90,
            timestamp: Date.now() - 500,
          },
        ],
        resolution: 'ownership',
      },
    ],
    ownerships: [],
  },
  {
    name: 'Element Ownership',
    description: 'Users with ownership of specific elements',
    selections: [
      {
        userId: 'user-3',
        userName: 'Carol Davis',
        userColor: '#45B7D1',
        whiteboardId: 'test-whiteboard',
        sessionId: 'session-3',
        elementIds: ['element-4'],
        timestamp: Date.now(),
        isMultiSelect: false,
        priority: 110,
        isActive: true,
        lastSeen: Date.now(),
      },
    ],
    conflicts: [],
    ownerships: [
      {
        elementId: 'element-4',
        ownerId: 'user-3',
        ownerName: 'Carol Davis',
        ownerColor: '#45B7D1',
        acquiredAt: Date.now() - 10000,
        expiresAt: Date.now() + 50000,
        isLocked: false,
      },
    ],
  },
  {
    name: 'High Load Scenario',
    description: 'Many users with multiple selections and conflicts',
    selections: mockUsers.map((user, index) => ({
      userId: user.id,
      userName: user.name,
      userColor: user.color,
      whiteboardId: 'test-whiteboard',
      sessionId: `session-${index + 1}`,
      elementIds: [`element-${(index % mockElements.length) + 1}`, `element-${((index + 1) % mockElements.length) + 1}`],
      timestamp: Date.now() - (index * 1000),
      isMultiSelect: true,
      priority: 100 - (index * 10),
      isActive: true,
      lastSeen: Date.now() - (index * 100),
    })),
    conflicts: [
      {
        conflictId: 'conflict-high-load',
        elementId: 'element-1',
        conflictingUsers: mockUsers.slice(0, 2).map((user, index) => ({
          userId: user.id,
          userName: user.name,
          priority: 100 - (index * 10),
          timestamp: Date.now() - (index * 1000),
        })),
        resolution: 'priority',
      },
    ],
    ownerships: [
      {
        elementId: 'element-5',
        ownerId: 'user-4',
        ownerName: 'David Wilson',
        ownerColor: '#96CEB4',
        acquiredAt: Date.now() - 5000,
        expiresAt: Date.now() + 25000,
        isLocked: true,
        lockReason: 'editing',
      },
    ],
  },
];

export const SelectionHighlightTest: React.FC = () => {
  const [currentScenario, setCurrentScenario] = useState(0);
  const [currentUserId, setCurrentUserId] = useState('user-1');
  const [viewport, setViewport] = useState({
    x: 0,
    y: 0,
    width: 800,
    height: 600,
  });
  const [canvasTransform, setCanvasTransform] = useState({
    x: 0,
    y: 0,
    zoom: 1,
  });
  
  const canvasRef = useRef<HTMLDivElement>(null);

  const scenario = testScenarios[currentScenario];

  // Mock function to get element bounds
  const getElementBounds = useCallback((elementId: string) => {
    const element = mockElements.find(el => el.id === elementId);
    return element ? element.bounds : null;
  }, []);

  // Handle selection click
  const handleSelectionClick = useCallback((highlight: SelectionHighlightData) => {
    console.log('Selection clicked:', highlight);
  }, []);

  // Handle conflict resolution
  const handleConflictResolve = useCallback((conflictId: string, resolution: 'ownership' | 'shared' | 'cancel') => {
    console.log('Conflict resolved:', { conflictId, resolution });
  }, []);

  // Handle viewport changes
  const handleViewportChange = useCallback((changes: Partial<typeof viewport>) => {
    setViewport(prev => ({ ...prev, ...changes }));
  }, []);

  const handleTransformChange = useCallback((changes: Partial<typeof canvasTransform>) => {
    setCanvasTransform(prev => ({ ...prev, ...changes }));
  }, []);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Selection Highlighting Test
          </h1>
          <p className="text-gray-600">
            Test multi-user selection highlighting with conflict resolution and ownership management
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Scenario Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Test Scenario
              </label>
              <select
                value={currentScenario}
                onChange={(e) => setCurrentScenario(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {testScenarios.map((scenario, index) => (
                  <option key={index} value={index}>
                    {scenario.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {scenario.description}
              </p>
            </div>

            {/* Current User */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current User
              </label>
              <select
                value={currentUserId}
                onChange={(e) => setCurrentUserId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {mockUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Viewport Controls */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Zoom Level
              </label>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={canvasTransform.zoom}
                onChange={(e) => handleTransformChange({ zoom: Number(e.target.value) })}
                className="w-full"
              />
              <div className="text-xs text-gray-500 mt-1">
                {Math.round(canvasTransform.zoom * 100)}%
              </div>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="text-2xl font-bold text-blue-600">
              {scenario.selections.length}
            </div>
            <div className="text-sm text-gray-600">Active Selections</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="text-2xl font-bold text-red-600">
              {scenario.conflicts.length}
            </div>
            <div className="text-sm text-gray-600">Conflicts</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="text-2xl font-bold text-green-600">
              {scenario.ownerships.length}
            </div>
            <div className="text-sm text-gray-600">Owned Elements</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="text-2xl font-bold text-purple-600">
              {mockElements.length}
            </div>
            <div className="text-sm text-gray-600">Total Elements</div>
          </div>
        </div>

        {/* Canvas */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Canvas Preview
            </h3>
            <div className="flex gap-4 text-sm text-gray-600">
              <span>Transform: x={canvasTransform.x}, y={canvasTransform.y}, zoom={canvasTransform.zoom}</span>
              <span>Viewport: {viewport.width}×{viewport.height}</span>
            </div>
          </div>

          <div
            ref={canvasRef}
            className="relative border-2 border-gray-200 bg-gray-50"
            style={{
              width: viewport.width,
              height: viewport.height,
              overflow: 'hidden',
            }}
          >
            {/* Mock Elements */}
            {mockElements.map((element) => (
              <div
                key={element.id}
                className="absolute bg-blue-100 border-2 border-blue-300 rounded"
                style={{
                  left: (element.bounds.x + canvasTransform.x) * canvasTransform.zoom,
                  top: (element.bounds.y + canvasTransform.y) * canvasTransform.zoom,
                  width: element.bounds.width * canvasTransform.zoom,
                  height: element.bounds.height * canvasTransform.zoom,
                }}
              >
                <div className="p-2 text-xs font-mono text-blue-800">
                  {element.id}
                </div>
              </div>
            ))}

            {/* Selection Manager */}
            <SelectionManager
              whiteboardId="test-whiteboard"
              currentUserId={currentUserId}
              selections={scenario.selections}
              conflicts={scenario.conflicts}
              ownerships={scenario.ownerships}
              canvasTransform={canvasTransform}
              viewportBounds={viewport}
              getElementBounds={getElementBounds}
              onSelectionClick={handleSelectionClick}
              onConflictResolve={handleConflictResolve}
              performanceMode="high"
              maxVisibleSelections={25}
              enableVirtualization={false} // Disabled for test visibility
            />
          </div>
        </div>

        {/* Debug Info */}
        <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Debug Information</h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Selections */}
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Active Selections</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {scenario.selections.map((selection, index) => (
                  <div key={index} className="text-xs bg-gray-50 p-2 rounded">
                    <div className="font-medium" style={{ color: selection.userColor }}>
                      {selection.userName}
                    </div>
                    <div className="text-gray-600">
                      Elements: {selection.elementIds.join(', ')}
                    </div>
                    <div className="text-gray-500">
                      Priority: {selection.priority}, Active: {selection.isActive ? 'Yes' : 'No'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Conflicts */}
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Conflicts</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {scenario.conflicts.map((conflict, index) => (
                  <div key={index} className="text-xs bg-red-50 p-2 rounded border border-red-200">
                    <div className="font-medium text-red-800">
                      Element: {conflict.elementId}
                    </div>
                    <div className="text-red-600">
                      Users: {conflict.conflictingUsers.map(u => u.userName).join(', ')}
                    </div>
                    <div className="text-red-500">
                      Resolution: {conflict.resolution}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ownerships */}
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Element Ownership</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {scenario.ownerships.map((ownership, index) => (
                  <div key={index} className="text-xs bg-green-50 p-2 rounded border border-green-200">
                    <div className="font-medium text-green-800">
                      Element: {ownership.elementId}
                    </div>
                    <div className="text-green-600">
                      Owner: {ownership.ownerName}
                    </div>
                    <div className="text-green-500">
                      Locked: {ownership.isLocked ? 'Yes' : 'No'}
                      {ownership.lockReason && ` (${ownership.lockReason})`}
                    </div>
                    <div className="text-green-400">
                      Expires: {Math.round((ownership.expiresAt - Date.now()) / 1000)}s
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectionHighlightTest;