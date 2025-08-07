/**
 * WebSocket Connection Resilience Demonstration Component
 * Shows the various states and configurations available
 */

'use client';

import React from 'react';
import { useWebSocket, ConnectionStatus } from '@/lib/websocket';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function ConnectionResilienceDemo() {
  // Demonstrate various configuration options
  const connection = useWebSocket({
    url: 'ws://demo-server.com/websocket', // This will fail, which is perfect for demo
    reconnectAttempts: 3,
    reconnectInterval: 1000,          // Start with 1 second
    maxReconnectDelay: 10000,         // Cap at 10 seconds
    circuitBreakerThreshold: 3,       // Open circuit after 3 failures
    circuitBreakerTimeout: 15000,     // Stay open for 15 seconds
    enableReconnect: true,
  });

  const getStatusDescription = (status: ConnectionStatus) => {
    switch (status) {
      case 'connecting':
        return 'Attempting initial connection...';
      case 'connected':
        return 'Successfully connected - real-time updates active';
      case 'reconnecting':
        return `Reconnecting... (attempt ${connection.reconnectAttempt + 1})`;
      case 'disconnected':
        return 'Disconnected - manual disconnect or reconnection disabled';
      case 'error':
        return 'Connection error occurred';
      case 'failed':
        return 'Connection failed after maximum retry attempts';
      case 'circuit-open':
        return 'Circuit breaker open - too many failures, will retry automatically';
      default:
        return 'Unknown status';
    }
  };

  const getStatusColor = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'connecting':
      case 'reconnecting':
        return 'text-blue-700 bg-blue-50 border-blue-200';
      case 'disconnected':
        return 'text-gray-700 bg-gray-50 border-gray-200';
      case 'error':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'failed':
        return 'text-red-800 bg-red-100 border-red-300';
      case 'circuit-open':
        return 'text-orange-700 bg-orange-50 border-orange-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-bold mb-4">WebSocket Connection Resilience Demo</h2>
      
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-3">Connection Status</h3>
        
        <div className={`p-3 rounded-lg border ${getStatusColor(connection.connectionStatus)}`}>
          <div className="font-medium">{connection.connectionStatus.toUpperCase()}</div>
          <div className="text-sm mt-1">{getStatusDescription(connection.connectionStatus)}</div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Reconnection Attempt:</span> {connection.reconnectAttempt}
          </div>
          <div>
            <span className="font-medium">Consecutive Failures:</span> {connection.consecutiveFailures}
          </div>
          <div>
            <span className="font-medium">Circuit Breaker:</span> {connection.isCircuitOpen ? 'Open' : 'Closed'}
          </div>
          <div>
            <span className="font-medium">Connected:</span> {connection.isConnected ? 'Yes' : 'No'}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-3">Manual Controls</h3>
        <div className="flex gap-2">
          <Button 
            onClick={connection.connect}
            disabled={connection.isConnecting || connection.isCircuitOpen}
          >
            Retry Connection
          </Button>
          <Button 
            onClick={connection.disconnect}
            variant="outline"
          >
            Disconnect
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-3">Resilience Features</h3>
        <div className="space-y-2 text-sm">
          <div>
            <strong>Exponential Backoff:</strong> Starts at 1s, doubles each attempt, caps at 10s
          </div>
          <div>
            <strong>Circuit Breaker:</strong> Opens after 3 consecutive failures, stays open for 15s
          </div>
          <div>
            <strong>Smart Logging:</strong> Reduces toast notification spam after first few attempts
          </div>
          <div>
            <strong>Jitter:</strong> Adds randomization to prevent thundering herd problems
          </div>
          <div>
            <strong>State Management:</strong> Comprehensive connection state tracking
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-3">Configuration Used</h3>
        <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
{`{
  reconnectAttempts: 3,
  reconnectInterval: 1000,
  maxReconnectDelay: 10000,
  circuitBreakerThreshold: 3,
  circuitBreakerTimeout: 15000,
  enableReconnect: true
}`}
        </pre>
      </Card>
    </div>
  );
}