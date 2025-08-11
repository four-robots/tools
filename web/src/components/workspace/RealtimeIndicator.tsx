'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

interface RealtimeIndicatorProps {
  connected: boolean;
  connecting?: boolean;
  className?: string;
}

export function RealtimeIndicator({ connected, connecting = false, className }: RealtimeIndicatorProps) {
  if (connecting) {
    return (
      <Badge variant="secondary" className={`flex items-center space-x-1 ${className}`}>
        <Loader2 size={12} className="animate-spin" />
        <span>Connecting...</span>
      </Badge>
    );
  }

  if (connected) {
    return (
      <Badge variant="default" className={`flex items-center space-x-1 bg-green-600 hover:bg-green-700 ${className}`}>
        <Wifi size={12} />
        <span>Live</span>
      </Badge>
    );
  }

  return (
    <Badge variant="destructive" className={`flex items-center space-x-1 ${className}`}>
      <WifiOff size={12} />
      <span>Offline</span>
    </Badge>
  );
}