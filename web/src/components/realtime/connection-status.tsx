'use client';

import { useState } from 'react';
import { ConnectionStatus } from '@/lib/websocket';
import { Button } from '@/components/ui/button';
import { 
  Wifi, 
  WifiOff, 
  Loader2, 
  AlertTriangle,
  CheckCircle2,
  XCircle
} from 'lucide-react';

interface ConnectionStatusProps {
  status: ConnectionStatus;
  onReconnect?: () => void;
  className?: string;
  showText?: boolean;
}

export function ConnectionStatusIndicator({ 
  status, 
  onReconnect, 
  className = '',
  showText = true 
}: ConnectionStatusProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusIcon = () => {
    switch (status) {
      case 'connected':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'connecting':
      case 'reconnecting':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'disconnected':
        return <WifiOff className="w-4 h-4 text-gray-400" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'circuit-open':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      default:
        return <WifiOff className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'disconnected':
        return 'Disconnected';
      case 'error':
        return 'Connection Error';
      case 'failed':
        return 'Connection Failed';
      case 'circuit-open':
        return 'Connection Paused';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'connecting':
      case 'reconnecting':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'disconnected':
        return 'text-gray-600 bg-gray-50 border-gray-200';
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'failed':
        return 'text-red-700 bg-red-100 border-red-300';
      case 'circuit-open':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  if (!showText) {
    return (
      <div className={`inline-flex items-center ${className}`}>
        {getStatusIcon()}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center ${className}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center space-x-2 px-3 py-1 rounded-full border text-sm font-medium transition-colors ${getStatusColor()}`}
      >
        {getStatusIcon()}
        <span>{getStatusText()}</span>
      </button>

      {isExpanded && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white border rounded-lg shadow-lg z-10 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-900">Connection Status</h3>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              {getStatusIcon()}
              <span className="text-sm text-gray-700">{getStatusText()}</span>
            </div>

            {status === 'connected' && (
              <div className="text-xs text-gray-500">
                Real-time updates are active. You&apos;ll receive live notifications for changes.
              </div>
            )}

            {status === 'disconnected' && (
              <div className="text-xs text-gray-500">
                Real-time updates are disabled. Changes may not appear immediately.
              </div>
            )}

            {status === 'error' && (
              <div>
                <div className="text-xs text-gray-500 mb-2">
                  Unable to establish real-time connection. Some features may be limited.
                </div>
                {onReconnect && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onReconnect}
                    className="w-full"
                  >
                    Try Reconnecting
                  </Button>
                )}
              </div>
            )}

            {status === 'failed' && (
              <div>
                <div className="text-xs text-gray-500 mb-2">
                  Connection failed after multiple attempts. Real-time features are unavailable.
                </div>
                {onReconnect && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onReconnect}
                    className="w-full"
                  >
                    Retry Connection
                  </Button>
                )}
              </div>
            )}

            {status === 'circuit-open' && (
              <div>
                <div className="text-xs text-gray-500 mb-2">
                  Connection attempts are temporarily paused due to repeated failures. 
                  The system will automatically retry shortly.
                </div>
              </div>
            )}

            {(status === 'connecting' || status === 'reconnecting') && (
              <div className="text-xs text-gray-500">
                Establishing connection to enable real-time features...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ConnectionStatusBanner({ status, onReconnect }: ConnectionStatusProps) {
  if (status === 'connected') {
    return null;
  }

  return (
    <div className={`w-full px-4 py-2 border-b ${getStatusColor()}`}>
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          <span className="text-sm font-medium">{getStatusText()}</span>
        </div>
        
        {(status === 'error' || status === 'failed') && onReconnect && (
          <Button
            size="sm"
            variant="outline"
            onClick={onReconnect}
          >
            {status === 'failed' ? 'Retry' : 'Reconnect'}
          </Button>
        )}
      </div>
    </div>
  );

  function getStatusIcon() {
    switch (status) {
      case 'connecting':
      case 'reconnecting':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'disconnected':
        return <WifiOff className="w-4 h-4" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4" />;
      case 'failed':
        return <XCircle className="w-4 h-4" />;
      case 'circuit-open':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <WifiOff className="w-4 h-4" />;
    }
  }

  function getStatusText() {
    switch (status) {
      case 'connecting':
        return 'Connecting to real-time updates...';
      case 'reconnecting':
        return 'Reconnecting to real-time updates...';
      case 'disconnected':
        return 'Real-time updates are disabled';
      case 'error':
        return 'Unable to connect for real-time updates';
      case 'failed':
        return 'Real-time connection failed';
      case 'circuit-open':
        return 'Connection attempts paused - will retry automatically';
      default:
        return 'Connection status unknown';
    }
  }

  function getStatusColor() {
    switch (status) {
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
  }
}